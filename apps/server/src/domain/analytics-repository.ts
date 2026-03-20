import { Pool } from "pg";
import type { AnalyticsEvent } from "./types.js";

const parseJson = <T>(value: string): T => JSON.parse(value) as T;

const stringifyJson = (value: unknown): string => JSON.stringify(value);

const ANALYTICS_SCHEMA_NAME_PATTERN = /^[A-Za-z_][A-Za-z0-9_]*$/;

const validateSchemaName = (schema: string): void => {
  if (!ANALYTICS_SCHEMA_NAME_PATTERN.test(schema)) {
    throw new Error("ANALYTICS_POSTGRES_SCHEMA_INVALID");
  }
};

export const ANALYTICS_POSTGRES_SCHEMA = `
CREATE TABLE IF NOT EXISTS analytics_events (
  event_id TEXT PRIMARY KEY,
  user_id TEXT,
  event_type TEXT NOT NULL,
  created_at TEXT NOT NULL,
  payload_json TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS analytics_events_user_created_idx
  ON analytics_events (user_id, created_at);

CREATE INDEX IF NOT EXISTS analytics_events_type_created_idx
  ON analytics_events (event_type, created_at);
`;

export interface AnalyticsRepository {
  readonly analyticsEvents: AnalyticsEvent[];
  append(event: AnalyticsEvent): void;
  deleteOldest(count: number): void;
  ready(): Promise<void>;
  flush(): Promise<void>;
  close(): Promise<void>;
}

export class InMemoryAnalyticsRepository implements AnalyticsRepository {
  readonly analyticsEvents: AnalyticsEvent[];

  constructor(seed?: AnalyticsEvent[]) {
    this.analyticsEvents = seed ?? [];
  }

  append(event: AnalyticsEvent): void {
    this.analyticsEvents.push(event);
  }

  deleteOldest(count: number): void {
    if (count <= 0) {
      return;
    }
    this.analyticsEvents.splice(0, count);
  }

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

export class PostgresAnalyticsRepository implements AnalyticsRepository {
  readonly analyticsEvents: AnalyticsEvent[] = [];

  private readonly pool: Pool;
  private readonly schema: string;
  private readyPromise: Promise<void> | null = null;
  private writeChain: Promise<void> = Promise.resolve();
  private writeError: Error | null = null;
  private closed = false;

  constructor(options: { connectionString?: string; schema?: string }) {
    if (!options.connectionString) {
      throw new Error("ANALYTICS_POSTGRES_CONNECTION_STRING_REQUIRED");
    }
    this.schema = options.schema ?? "public";
    validateSchemaName(this.schema);
    this.pool = new Pool({
      connectionString: options.connectionString
    });
  }

  append(event: AnalyticsEvent): void {
    this.analyticsEvents.push(event);
    this.queueQuery(
      `INSERT INTO ${this.table("analytics_events")} (event_id, user_id, event_type, created_at, payload_json)
       VALUES ($1, $2, $3, $4, $5)
       ON CONFLICT (event_id) DO UPDATE SET
         user_id = EXCLUDED.user_id,
         event_type = EXCLUDED.event_type,
         created_at = EXCLUDED.created_at,
         payload_json = EXCLUDED.payload_json`,
      [event.id, event.userId ?? null, event.eventType, event.createdAt, stringifyJson(event)]
    );
  }

  deleteOldest(count: number): void {
    if (count <= 0) {
      return;
    }
    const removed = this.analyticsEvents.splice(0, count);
    if (removed.length === 0) {
      return;
    }
    const ids = removed.map((item) => item.id);
    this.queueQuery(`DELETE FROM ${this.table("analytics_events")} WHERE event_id = ANY($1::text[])`, [ids]);
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
      throw new Error("ANALYTICS_POSTGRES_FLUSH_FAILED");
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
    await this.pool.query(this.qualifySchemaSql(ANALYTICS_POSTGRES_SCHEMA));

    this.analyticsEvents.splice(0, this.analyticsEvents.length);
    const result = await this.pool.query<{ payload_json: string }>(
      `SELECT payload_json FROM ${this.table("analytics_events")} ORDER BY created_at ASC, event_id ASC`
    );
    for (const row of result.rows) {
      this.analyticsEvents.push(parseJson<AnalyticsEvent>(row.payload_json));
    }
  }

  private queueQuery(sql: string, values: unknown[]): void {
    this.writeChain = this.writeChain
      .then(async () => {
        if (this.closed) {
          return;
        }
        await this.pool.query(sql, values);
      })
      .catch((error) => {
        this.writeError = error instanceof Error ? error : new Error(String(error));
        throw this.writeError;
      });
  }

  private table(name: string): string {
    return this.schema === "public" ? name : `"${this.schema}"."${name}"`;
  }

  private qualifySchemaSql(sql: string): string {
    if (this.schema === "public") {
      return sql;
    }
    return sql.replace(/\banalytics_events\b/g, `"${this.schema}"."analytics_events"`);
  }
}
