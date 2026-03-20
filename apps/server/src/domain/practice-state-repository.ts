import { Pool } from "pg";
import type { PracticeSession, RetryQueueItem } from "./types.js";

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

const PRACTICE_STATE_SCHEMA_NAME_PATTERN = /^[A-Za-z_][A-Za-z0-9_]*$/;
const validateSchemaName = (schema: string): void => {
  if (!PRACTICE_STATE_SCHEMA_NAME_PATTERN.test(schema)) {
    throw new Error("PRACTICE_STATE_POSTGRES_SCHEMA_INVALID");
  }
};

export const PRACTICE_STATE_POSTGRES_SCHEMA = `
CREATE TABLE IF NOT EXISTS practice_sessions (
  session_id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  skill TEXT NOT NULL,
  status TEXT NOT NULL,
  payload_json TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS practice_retry_queue (
  queue_item_id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  skill TEXT NOT NULL,
  source_session_id TEXT NOT NULL,
  status TEXT NOT NULL,
  payload_json TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS practice_skill_proficiency (
  proficiency_key TEXT PRIMARY KEY,
  payload_json TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
`;

export interface PracticeStateRepository {
  readonly practiceSessionsById: Map<string, PracticeSession>;
  readonly retryQueueById: Map<string, RetryQueueItem>;
  readonly skillProficiencyByUserAndSkill: Map<string, number>;
  ready(): Promise<void>;
  flush(): Promise<void>;
  close(): Promise<void>;
}

export class InMemoryPracticeStateRepository implements PracticeStateRepository {
  readonly practiceSessionsById = new Map<string, PracticeSession>();
  readonly retryQueueById = new Map<string, RetryQueueItem>();
  readonly skillProficiencyByUserAndSkill = new Map<string, number>();

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

export class PostgresPracticeStateRepository implements PracticeStateRepository {
  readonly practiceSessionsById: PersistedMap<string, PracticeSession>;
  readonly retryQueueById: PersistedMap<string, RetryQueueItem>;
  readonly skillProficiencyByUserAndSkill: PersistedMap<string, number>;

  private readonly pool: Pool;
  private readonly schema: string;
  private readyPromise: Promise<void> | null = null;
  private writeChain: Promise<void> = Promise.resolve();
  private writeError: Error | null = null;
  private closed = false;

  constructor(options: { connectionString?: string; schema?: string }) {
    if (!options.connectionString) {
      throw new Error("PRACTICE_STATE_POSTGRES_CONNECTION_STRING_REQUIRED");
    }
    this.schema = options.schema ?? "public";
    validateSchemaName(this.schema);
    this.pool = new Pool({
      connectionString: options.connectionString
    });

    const sessionUpsert = upsertPgSql(this.table("practice_sessions"), "session_id", [
      "user_id",
      "skill",
      "status",
      "payload_json",
      "updated_at"
    ]);
    const queueUpsert = upsertPgSql(this.table("practice_retry_queue"), "queue_item_id", [
      "user_id",
      "skill",
      "source_session_id",
      "status",
      "payload_json",
      "updated_at"
    ]);
    const proficiencyUpsert = upsertPgSql(this.table("practice_skill_proficiency"), "proficiency_key", [
      "payload_json",
      "updated_at"
    ]);

    this.practiceSessionsById = new PersistedMap<string, PracticeSession>(
      (sessionId, session) => {
        this.queueQuery(sessionUpsert, [
          sessionId,
          session.userId,
          session.skill,
          session.status,
          stringifyJson(session),
          session.updatedAt
        ]);
      },
      (sessionId) => {
        this.queueQuery(`DELETE FROM ${this.table("practice_sessions")} WHERE session_id = $1`, [sessionId]);
      }
    );

    this.retryQueueById = new PersistedMap<string, RetryQueueItem>(
      (queueItemId, queueItem) => {
        this.queueQuery(queueUpsert, [
          queueItemId,
          queueItem.userId,
          queueItem.skill,
          queueItem.sourceSessionId,
          queueItem.status,
          stringifyJson(queueItem),
          queueItem.updatedAt
        ]);
      },
      (queueItemId) => {
        this.queueQuery(`DELETE FROM ${this.table("practice_retry_queue")} WHERE queue_item_id = $1`, [queueItemId]);
      }
    );

    this.skillProficiencyByUserAndSkill = new PersistedMap<string, number>(
      (key, value) => {
        this.queueQuery(proficiencyUpsert, [key, stringifyJson(value), new Date().toISOString()]);
      },
      (key) => {
        this.queueQuery(`DELETE FROM ${this.table("practice_skill_proficiency")} WHERE proficiency_key = $1`, [key]);
      }
    );
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
      throw new Error("PRACTICE_STATE_POSTGRES_FLUSH_FAILED");
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
    await this.pool.query(this.qualifySchemaSql(PRACTICE_STATE_POSTGRES_SCHEMA));

    this.practiceSessionsById.clear();
    this.retryQueueById.clear();
    this.skillProficiencyByUserAndSkill.clear();

    const [sessions, queue, proficiencies] = await Promise.all([
      this.pool.query<{ payload_json: string }>(`SELECT payload_json FROM ${this.table("practice_sessions")}`),
      this.pool.query<{ payload_json: string }>(`SELECT payload_json FROM ${this.table("practice_retry_queue")}`),
      this.pool.query<{ proficiency_key: string; payload_json: string }>(
        `SELECT proficiency_key, payload_json FROM ${this.table("practice_skill_proficiency")}`
      )
    ]);

    for (const row of sessions.rows) {
      const session = parseJson<PracticeSession>(row.payload_json);
      this.practiceSessionsById.setSilently(session.id, session);
    }

    for (const row of queue.rows) {
      const item = parseJson<RetryQueueItem>(row.payload_json);
      this.retryQueueById.setSilently(item.id, item);
    }

    for (const row of proficiencies.rows) {
      this.skillProficiencyByUserAndSkill.setSilently(row.proficiency_key, parseJson<number>(row.payload_json));
    }
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

  private table(name: string): string {
    return `${this.schema}.${name}`;
  }

  private qualifySchemaSql(sql: string): string {
    return sql.replaceAll("practice_", `${this.schema}.practice_`);
  }
}
