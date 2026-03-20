import { Pool } from "pg";
import type {
  AssessmentJob,
  GoalProfile,
  ProgressConflict,
  StudyPlan,
  UserProgressSnapshot
} from "./types.js";

const parseJson = <T>(value: string): T => JSON.parse(value) as T;
const stringifyJson = (value: unknown): string => JSON.stringify(value);

const upsertPgSql = (table: string, keyColumn: string, updateColumns: string[]): string => {
  const columns = [keyColumn, ...updateColumns];
  const placeholders = columns.map((_, index) => `$${index + 1}`).join(", ");
  const updates = updateColumns.map((column) => `${column}=EXCLUDED.${column}`).join(", ");
  return `INSERT INTO ${table} (${columns.join(", ")}) VALUES (${placeholders}) ON CONFLICT(${keyColumn}) DO UPDATE SET ${updates}`;
};

class PersistedMap<K, V> extends Map<K, V> {
  constructor(
    private readonly onSet: (key: K, value: V) => void,
    private readonly onDelete?: (key: K) => void
  ) {
    super();
  }

  setSilently(key: K, value: V): this {
    super.set(key, value);
    return this;
  }

  override set(key: K, value: V): this {
    super.set(key, value);
    this.onSet(key, value);
    return this;
  }

  override delete(key: K): boolean {
    const existed = super.delete(key);
    if (existed) {
      this.onDelete?.(key);
    }
    return existed;
  }
}

class PersistedArray<T> extends Array<T> {
  constructor(private readonly onReplace: (items: T[]) => void) {
    super();
  }

  static get [Symbol.species](): ArrayConstructor {
    return Array;
  }

  replaceSilently(items: T[]): void {
    super.splice(0, super.length, ...items);
  }

  override push(...items: T[]): number {
    const result = super.push(...items);
    this.onReplace([...this]);
    return result;
  }

  override splice(start: number, deleteCount?: number, ...items: T[]): T[] {
    const result = super.splice(start, deleteCount ?? this.length - start, ...items);
    this.onReplace([...this]);
    return result;
  }
}

const LEARNER_STATE_SCHEMA_NAME_PATTERN = /^[A-Za-z_][A-Za-z0-9_]*$/;
const validateSchemaName = (schema: string): void => {
  if (!LEARNER_STATE_SCHEMA_NAME_PATTERN.test(schema)) {
    throw new Error("LEARNER_STATE_POSTGRES_SCHEMA_INVALID");
  }
};

export const LEARNER_STATE_POSTGRES_SCHEMA = `
CREATE TABLE IF NOT EXISTS learner_goal_profiles (
  goal_profile_id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  assessment_id TEXT NOT NULL,
  plan_id TEXT NOT NULL,
  payload_json TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS learner_assessment_jobs (
  assessment_id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  plan_id TEXT NOT NULL,
  status TEXT NOT NULL,
  payload_json TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS learner_study_plans (
  plan_id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  assessment_id TEXT NOT NULL,
  status TEXT NOT NULL,
  payload_json TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS learner_user_progress (
  user_id TEXT PRIMARY KEY,
  payload_json TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS learner_progress_conflicts (
  conflict_id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  created_at TEXT NOT NULL,
  payload_json TEXT NOT NULL
);
`;

export interface LearnerStateRepository {
  readonly goalProfilesById: Map<string, GoalProfile>;
  readonly goalProfileByUserAndIdempotency: Map<string, string>;
  readonly assessmentJobsById: Map<string, AssessmentJob>;
  readonly studyPlansById: Map<string, StudyPlan>;
  readonly activePlanIdByUserId: Map<string, string>;
  readonly userProgressByUserId: Map<string, UserProgressSnapshot>;
  readonly progressConflicts: ProgressConflict[];
  ready(): Promise<void>;
  flush(): Promise<void>;
  close(): Promise<void>;
}

export class InMemoryLearnerStateRepository implements LearnerStateRepository {
  readonly goalProfilesById = new Map<string, GoalProfile>();
  readonly goalProfileByUserAndIdempotency = new Map<string, string>();
  readonly assessmentJobsById = new Map<string, AssessmentJob>();
  readonly studyPlansById = new Map<string, StudyPlan>();
  readonly activePlanIdByUserId = new Map<string, string>();
  readonly userProgressByUserId = new Map<string, UserProgressSnapshot>();
  readonly progressConflicts: ProgressConflict[] = [];

  ready(): Promise<void> {
    return Promise.resolve();
  }

  flush(): Promise<void> {
    return Promise.resolve();
  }

  close(): Promise<void> {
    return Promise.resolve();
  }
}

export class PostgresLearnerStateRepository implements LearnerStateRepository {
  readonly goalProfilesById: PersistedMap<string, GoalProfile>;
  readonly goalProfileByUserAndIdempotency = new Map<string, string>();
  readonly assessmentJobsById: PersistedMap<string, AssessmentJob>;
  readonly studyPlansById: PersistedMap<string, StudyPlan>;
  readonly activePlanIdByUserId = new Map<string, string>();
  readonly userProgressByUserId: PersistedMap<string, UserProgressSnapshot>;
  readonly progressConflicts: PersistedArray<ProgressConflict>;

  private readonly pool: Pool;
  private readonly schema: string;
  private readyPromise: Promise<void> | null = null;
  private writeChain: Promise<void> = Promise.resolve();
  private writeError: Error | null = null;
  private closed = false;

  constructor(options: { connectionString?: string; schema?: string }) {
    if (!options.connectionString) {
      throw new Error("LEARNER_STATE_POSTGRES_CONNECTION_STRING_REQUIRED");
    }
    this.schema = options.schema ?? "public";
    validateSchemaName(this.schema);
    this.pool = new Pool({
      connectionString: options.connectionString
    });

    const goalProfileUpsert = upsertPgSql(this.table("learner_goal_profiles"), "goal_profile_id", [
      "user_id",
      "assessment_id",
      "plan_id",
      "payload_json",
      "updated_at"
    ]);
    const assessmentUpsert = upsertPgSql(this.table("learner_assessment_jobs"), "assessment_id", [
      "user_id",
      "plan_id",
      "status",
      "payload_json",
      "updated_at"
    ]);
    const planUpsert = upsertPgSql(this.table("learner_study_plans"), "plan_id", [
      "user_id",
      "assessment_id",
      "status",
      "payload_json",
      "updated_at"
    ]);
    const progressUpsert = upsertPgSql(this.table("learner_user_progress"), "user_id", ["payload_json", "updated_at"]);

    this.goalProfilesById = new PersistedMap<string, GoalProfile>(
      (goalProfileId, goalProfile) => {
        this.queueQuery(goalProfileUpsert, [
          goalProfileId,
          goalProfile.userId,
          goalProfile.assessmentId,
          goalProfile.planId,
          stringifyJson(goalProfile),
          goalProfile.updatedAt
        ]);
      },
      (goalProfileId) => {
        this.queueQuery(`DELETE FROM ${this.table("learner_goal_profiles")} WHERE goal_profile_id = $1`, [goalProfileId]);
      }
    );

    this.assessmentJobsById = new PersistedMap<string, AssessmentJob>(
      (assessmentId, assessment) => {
        this.queueQuery(assessmentUpsert, [
          assessmentId,
          assessment.userId,
          assessment.planId,
          assessment.status,
          stringifyJson(assessment),
          assessment.updatedAt
        ]);
      },
      (assessmentId) => {
        this.queueQuery(`DELETE FROM ${this.table("learner_assessment_jobs")} WHERE assessment_id = $1`, [assessmentId]);
      }
    );

    this.studyPlansById = new PersistedMap<string, StudyPlan>(
      (planId, plan) => {
        this.queueQuery(planUpsert, [
          planId,
          plan.userId,
          plan.assessmentId,
          plan.status,
          stringifyJson(plan),
          plan.updatedAt
        ]);
      },
      (planId) => {
        this.queueQuery(`DELETE FROM ${this.table("learner_study_plans")} WHERE plan_id = $1`, [planId]);
      }
    );

    this.userProgressByUserId = new PersistedMap<string, UserProgressSnapshot>(
      (userId, snapshot) => {
        this.queueQuery(progressUpsert, [userId, stringifyJson(snapshot), snapshot.updatedAt]);
      },
      (userId) => {
        this.queueQuery(`DELETE FROM ${this.table("learner_user_progress")} WHERE user_id = $1`, [userId]);
      }
    );

    this.progressConflicts = new PersistedArray<ProgressConflict>((items) => {
      this.queueReplaceProgressConflicts(items);
    });
  }

  ready(): Promise<void> {
    if (!this.readyPromise) {
      this.readyPromise = this.initialize();
    }
    return this.readyPromise;
  }

  async flush(): Promise<void> {
    try {
      await this.writeChain;
    } catch {
      if (this.writeError) {
        const error = this.writeError;
        this.writeError = null;
        throw error;
      }
      throw new Error("LEARNER_STATE_POSTGRES_FLUSH_FAILED");
    }
    if (this.writeError) {
      const error = this.writeError;
      this.writeError = null;
      throw error;
    }
  }

  async close(): Promise<void> {
    if (this.closed) {
      return;
    }
    this.closed = true;
    await this.flush();
    await this.pool.end();
  }

  private async initialize(): Promise<void> {
    if (this.schema !== "public") {
      await this.pool.query(`CREATE SCHEMA IF NOT EXISTS ${this.schema}`);
    }
    await this.pool.query(this.qualifySchemaSql(LEARNER_STATE_POSTGRES_SCHEMA));

    this.goalProfilesById.clear();
    this.goalProfileByUserAndIdempotency.clear();
    this.assessmentJobsById.clear();
    this.studyPlansById.clear();
    this.activePlanIdByUserId.clear();
    this.userProgressByUserId.clear();
    this.progressConflicts.replaceSilently([]);

    const [goalProfiles, assessments, plans, progress, conflicts] = await Promise.all([
      this.pool.query<{ payload_json: string }>(`SELECT payload_json FROM ${this.table("learner_goal_profiles")}`),
      this.pool.query<{ payload_json: string }>(`SELECT payload_json FROM ${this.table("learner_assessment_jobs")}`),
      this.pool.query<{ payload_json: string }>(`SELECT payload_json FROM ${this.table("learner_study_plans")}`),
      this.pool.query<{ payload_json: string }>(`SELECT payload_json FROM ${this.table("learner_user_progress")}`),
      this.pool.query<{ payload_json: string }>(
        `SELECT payload_json FROM ${this.table("learner_progress_conflicts")} ORDER BY created_at ASC`
      )
    ]);

    for (const row of goalProfiles.rows) {
      const goalProfile = parseJson<GoalProfile>(row.payload_json);
      this.goalProfilesById.setSilently(goalProfile.id, goalProfile);
      this.goalProfileByUserAndIdempotency.set(`${goalProfile.userId}:${goalProfile.idempotencyKey}`, goalProfile.id);
    }

    for (const row of assessments.rows) {
      const assessment = parseJson<AssessmentJob>(row.payload_json);
      this.assessmentJobsById.setSilently(assessment.id, assessment);
    }

    for (const row of plans.rows) {
      const plan = parseJson<StudyPlan>(row.payload_json);
      this.studyPlansById.setSilently(plan.id, plan);
      if (plan.status === "active") {
        const currentPlanId = this.activePlanIdByUserId.get(plan.userId);
        if (!currentPlanId) {
          this.activePlanIdByUserId.set(plan.userId, plan.id);
          continue;
        }
        const currentPlan = this.studyPlansById.get(currentPlanId);
        if (!currentPlan || currentPlan.updatedAt.localeCompare(plan.updatedAt) < 0) {
          this.activePlanIdByUserId.set(plan.userId, plan.id);
        }
      }
    }

    for (const row of progress.rows) {
      const snapshot = parseJson<UserProgressSnapshot>(row.payload_json);
      this.userProgressByUserId.setSilently(snapshot.userId, snapshot);
    }

    this.progressConflicts.replaceSilently(
      conflicts.rows.map((row) => parseJson<ProgressConflict>(row.payload_json))
    );
  }

  private queueQuery(text: string, values: Array<string | number | boolean | null>): void {
    const task = async () => {
      await this.pool.query(text, values);
    };
    this.writeChain = this.writeChain.then(task, task).catch((error: unknown) => {
      if (!this.writeError) {
        this.writeError = error instanceof Error ? error : new Error(String(error));
      }
      throw error;
    });
  }

  private queueReplaceProgressConflicts(items: ProgressConflict[]): void {
    const task = async () => {
      await this.pool.query(`DELETE FROM ${this.table("learner_progress_conflicts")}`);
      if (items.length === 0) {
        return;
      }
      const upsert = upsertPgSql(this.table("learner_progress_conflicts"), "conflict_id", [
        "user_id",
        "created_at",
        "payload_json"
      ]);
      for (const conflict of items) {
        await this.pool.query(upsert, [conflict.id, conflict.userId, conflict.createdAt, stringifyJson(conflict)]);
      }
    };
    this.writeChain = this.writeChain.then(task, task).catch((error: unknown) => {
      if (!this.writeError) {
        this.writeError = error instanceof Error ? error : new Error(String(error));
      }
      throw error;
    });
  }

  private table(name: string): string {
    return `${this.schema}.${name}`;
  }

  private qualifySchemaSql(sql: string): string {
    return sql.replaceAll("learner_", `${this.schema}.learner_`);
  }
}
