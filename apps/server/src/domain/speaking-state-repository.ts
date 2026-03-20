import { Pool } from "pg";
import type { SpeakingSession } from "./types.js";

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

const SPEAKING_STATE_SCHEMA_NAME_PATTERN = /^[A-Za-z_][A-Za-z0-9_]*$/;
const validateSchemaName = (schema: string): void => {
  if (!SPEAKING_STATE_SCHEMA_NAME_PATTERN.test(schema)) {
    throw new Error("SPEAKING_STATE_POSTGRES_SCHEMA_INVALID");
  }
};

export const SPEAKING_STATE_POSTGRES_SCHEMA = `
CREATE TABLE IF NOT EXISTS speaking_sessions (
  session_id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  status TEXT NOT NULL,
  task_type TEXT NOT NULL,
  payload_json TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
`;

export interface SpeakingStateRepository {
  readonly speakingSessionsById: Map<string, SpeakingSession>;
  ready(): Promise<void>;
  flush(): Promise<void>;
  close(): Promise<void>;
}

export class InMemorySpeakingStateRepository implements SpeakingStateRepository {
  readonly speakingSessionsById = new Map<string, SpeakingSession>();

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

export class PostgresSpeakingStateRepository implements SpeakingStateRepository {
  readonly speakingSessionsById: PersistedMap<string, SpeakingSession>;

  private readonly pool: Pool;
  private readonly schema: string;
  private readyPromise: Promise<void> | null = null;
  private writeChain: Promise<void> = Promise.resolve();
  private writeError: Error | null = null;
  private closed = false;

  constructor(options: { connectionString?: string; schema?: string }) {
    if (!options.connectionString) {
      throw new Error("SPEAKING_STATE_POSTGRES_CONNECTION_STRING_REQUIRED");
    }
    this.schema = options.schema ?? "public";
    validateSchemaName(this.schema);
    this.pool = new Pool({
      connectionString: options.connectionString
    });

    const sessionUpsert = upsertPgSql(this.table("speaking_sessions"), "session_id", [
      "user_id",
      "status",
      "task_type",
      "payload_json",
      "updated_at"
    ]);

    this.speakingSessionsById = new PersistedMap<string, SpeakingSession>(
      (sessionId, session) => {
        this.queueQuery(sessionUpsert, [
          sessionId,
          session.userId,
          session.status,
          session.taskType,
          stringifyJson(session),
          session.updatedAt
        ]);
      },
      (sessionId) => {
        this.queueQuery(`DELETE FROM ${this.table("speaking_sessions")} WHERE session_id = $1`, [sessionId]);
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
      throw new Error("SPEAKING_STATE_POSTGRES_FLUSH_FAILED");
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
    await this.pool.query(this.qualifySchemaSql(SPEAKING_STATE_POSTGRES_SCHEMA));

    this.speakingSessionsById.clear();
    const sessions = await this.pool.query<{ payload_json: string }>(`SELECT payload_json FROM ${this.table("speaking_sessions")}`);
    for (const row of sessions.rows) {
      const session = parseJson<SpeakingSession>(row.payload_json);
      this.speakingSessionsById.setSilently(session.id, session);
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
    return sql.replaceAll("speaking_", `${this.schema}.speaking_`);
  }
}
