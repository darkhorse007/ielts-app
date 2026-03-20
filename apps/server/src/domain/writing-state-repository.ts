import { Pool } from "pg";
import type { WritingEvaluation, WritingRewriteArchiveItem, WritingTemplateUsage } from "./types.js";

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

const WRITING_STATE_SCHEMA_NAME_PATTERN = /^[A-Za-z_][A-Za-z0-9_]*$/;
const validateSchemaName = (schema: string): void => {
  if (!WRITING_STATE_SCHEMA_NAME_PATTERN.test(schema)) {
    throw new Error("WRITING_STATE_POSTGRES_SCHEMA_INVALID");
  }
};

export const WRITING_STATE_POSTGRES_SCHEMA = `
CREATE TABLE IF NOT EXISTS writing_evaluations (
  evaluation_id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  task_type TEXT NOT NULL,
  payload_json TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS writing_rewrite_archives (
  user_id TEXT PRIMARY KEY,
  payload_json TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS writing_template_usages (
  user_id TEXT PRIMARY KEY,
  payload_json TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
`;

export interface WritingStateRepository {
  readonly writingEvaluationsById: Map<string, WritingEvaluation>;
  readonly writingRewriteArchivesByUserId: Map<string, WritingRewriteArchiveItem[]>;
  readonly writingTemplateUsagesByUserId: Map<string, WritingTemplateUsage[]>;
  ready(): Promise<void>;
  flush(): Promise<void>;
  close(): Promise<void>;
}

export class InMemoryWritingStateRepository implements WritingStateRepository {
  readonly writingEvaluationsById = new Map<string, WritingEvaluation>();
  readonly writingRewriteArchivesByUserId = new Map<string, WritingRewriteArchiveItem[]>();
  readonly writingTemplateUsagesByUserId = new Map<string, WritingTemplateUsage[]>();

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

export class PostgresWritingStateRepository implements WritingStateRepository {
  readonly writingEvaluationsById: PersistedMap<string, WritingEvaluation>;
  readonly writingRewriteArchivesByUserId: PersistedMap<string, WritingRewriteArchiveItem[]>;
  readonly writingTemplateUsagesByUserId: PersistedMap<string, WritingTemplateUsage[]>;

  private readonly pool: Pool;
  private readonly schema: string;
  private readyPromise: Promise<void> | null = null;
  private writeChain: Promise<void> = Promise.resolve();
  private writeError: Error | null = null;
  private closed = false;

  constructor(options: { connectionString?: string; schema?: string }) {
    if (!options.connectionString) {
      throw new Error("WRITING_STATE_POSTGRES_CONNECTION_STRING_REQUIRED");
    }
    this.schema = options.schema ?? "public";
    validateSchemaName(this.schema);
    this.pool = new Pool({
      connectionString: options.connectionString
    });

    const evaluationUpsert = upsertPgSql(this.table("writing_evaluations"), "evaluation_id", [
      "user_id",
      "task_type",
      "payload_json",
      "updated_at"
    ]);
    const archivesUpsert = upsertPgSql(this.table("writing_rewrite_archives"), "user_id", ["payload_json", "updated_at"]);
    const templateUsageUpsert = upsertPgSql(this.table("writing_template_usages"), "user_id", ["payload_json", "updated_at"]);

    this.writingEvaluationsById = new PersistedMap<string, WritingEvaluation>(
      (evaluationId, evaluation) => {
        this.queueQuery(evaluationUpsert, [
          evaluationId,
          evaluation.userId,
          evaluation.taskType,
          stringifyJson(evaluation),
          evaluation.updatedAt
        ]);
      },
      (evaluationId) => {
        this.queueQuery(`DELETE FROM ${this.table("writing_evaluations")} WHERE evaluation_id = $1`, [evaluationId]);
      }
    );

    this.writingRewriteArchivesByUserId = new PersistedMap<string, WritingRewriteArchiveItem[]>(
      (userId, archives) => {
        this.queueQuery(archivesUpsert, [userId, stringifyJson(archives), new Date().toISOString()]);
      },
      (userId) => {
        this.queueQuery(`DELETE FROM ${this.table("writing_rewrite_archives")} WHERE user_id = $1`, [userId]);
      }
    );

    this.writingTemplateUsagesByUserId = new PersistedMap<string, WritingTemplateUsage[]>(
      (userId, usages) => {
        this.queueQuery(templateUsageUpsert, [userId, stringifyJson(usages), new Date().toISOString()]);
      },
      (userId) => {
        this.queueQuery(`DELETE FROM ${this.table("writing_template_usages")} WHERE user_id = $1`, [userId]);
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
      throw new Error("WRITING_STATE_POSTGRES_FLUSH_FAILED");
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
    await this.pool.query(this.qualifySchemaSql(WRITING_STATE_POSTGRES_SCHEMA));

    this.writingEvaluationsById.clear();
    this.writingRewriteArchivesByUserId.clear();
    this.writingTemplateUsagesByUserId.clear();

    const [evaluations, archives, usages] = await Promise.all([
      this.pool.query<{ payload_json: string }>(`SELECT payload_json FROM ${this.table("writing_evaluations")}`),
      this.pool.query<{ user_id: string; payload_json: string }>(
        `SELECT user_id, payload_json FROM ${this.table("writing_rewrite_archives")}`
      ),
      this.pool.query<{ user_id: string; payload_json: string }>(
        `SELECT user_id, payload_json FROM ${this.table("writing_template_usages")}`
      )
    ]);

    for (const row of evaluations.rows) {
      const evaluation = parseJson<WritingEvaluation>(row.payload_json);
      this.writingEvaluationsById.setSilently(evaluation.id, evaluation);
    }
    for (const row of archives.rows) {
      this.writingRewriteArchivesByUserId.setSilently(row.user_id, parseJson<WritingRewriteArchiveItem[]>(row.payload_json));
    }
    for (const row of usages.rows) {
      this.writingTemplateUsagesByUserId.setSilently(row.user_id, parseJson<WritingTemplateUsage[]>(row.payload_json));
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
    return sql.replaceAll("writing_", `${this.schema}.writing_`);
  }
}
