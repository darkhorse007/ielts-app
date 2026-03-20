import { Pool } from "pg";
import type { FailedLoginCounter, RefreshBlacklistEntry, Session, User } from "./types.js";

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

const AUTH_ACCOUNT_SCHEMA_NAME_PATTERN = /^[A-Za-z_][A-Za-z0-9_]*$/;

const validateSchemaName = (schema: string): void => {
  if (!AUTH_ACCOUNT_SCHEMA_NAME_PATTERN.test(schema)) {
    throw new Error("AUTH_ACCOUNT_POSTGRES_SCHEMA_INVALID");
  }
};

export const AUTH_ACCOUNT_POSTGRES_SCHEMA = `
CREATE TABLE IF NOT EXISTS auth_users (
  user_id TEXT PRIMARY KEY,
  email TEXT UNIQUE,
  phone TEXT UNIQUE,
  payload_json TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS auth_sessions (
  session_id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  refresh_token_hash TEXT NOT NULL UNIQUE,
  payload_json TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS auth_refresh_blacklist (
  token_hash TEXT PRIMARY KEY,
  payload_json TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS auth_failed_login_counters (
  identifier TEXT PRIMARY KEY,
  payload_json TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
`;

export interface AuthAccountRepository {
  readonly usersById: Map<string, User>;
  readonly userIdByEmail: Map<string, string>;
  readonly userIdByPhone: Map<string, string>;
  readonly sessionsById: Map<string, Session>;
  readonly sessionIdByRefreshHash: Map<string, string>;
  readonly refreshBlacklist: Map<string, RefreshBlacklistEntry>;
  readonly failedLoginByIdentifier: Map<string, FailedLoginCounter>;
  ready(): Promise<void>;
  flush(): Promise<void>;
  close(): Promise<void>;
}

export class InMemoryAuthAccountRepository implements AuthAccountRepository {
  readonly usersById = new Map<string, User>();
  readonly userIdByEmail = new Map<string, string>();
  readonly userIdByPhone = new Map<string, string>();
  readonly sessionsById = new Map<string, Session>();
  readonly sessionIdByRefreshHash = new Map<string, string>();
  readonly refreshBlacklist = new Map<string, RefreshBlacklistEntry>();
  readonly failedLoginByIdentifier = new Map<string, FailedLoginCounter>();

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

export class PostgresAuthAccountRepository implements AuthAccountRepository {
  readonly usersById: PersistedMap<string, User>;
  readonly userIdByEmail = new Map<string, string>();
  readonly userIdByPhone = new Map<string, string>();
  readonly sessionsById: PersistedMap<string, Session>;
  readonly sessionIdByRefreshHash = new Map<string, string>();
  readonly refreshBlacklist: PersistedMap<string, RefreshBlacklistEntry>;
  readonly failedLoginByIdentifier: PersistedMap<string, FailedLoginCounter>;

  private readonly pool: Pool;
  private readonly schema: string;
  private readyPromise: Promise<void> | null = null;
  private writeChain: Promise<void> = Promise.resolve();
  private writeError: Error | null = null;
  private closed = false;

  constructor(options: { connectionString?: string; schema?: string }) {
    if (!options.connectionString) {
      throw new Error("AUTH_ACCOUNT_POSTGRES_CONNECTION_STRING_REQUIRED");
    }
    this.schema = options.schema ?? "public";
    validateSchemaName(this.schema);
    this.pool = new Pool({
      connectionString: options.connectionString
    });

    const userUpsert = upsertPgSql(this.table("auth_users"), "user_id", ["email", "phone", "payload_json", "updated_at"]);
    const sessionUpsert = upsertPgSql(
      this.table("auth_sessions"),
      "session_id",
      ["user_id", "refresh_token_hash", "payload_json", "updated_at"]
    );
    const blacklistUpsert = upsertPgSql(this.table("auth_refresh_blacklist"), "token_hash", ["payload_json", "updated_at"]);
    const failedLoginUpsert = upsertPgSql(
      this.table("auth_failed_login_counters"),
      "identifier",
      ["payload_json", "updated_at"]
    );

    this.usersById = new PersistedMap<string, User>(
      (userId, user) => {
        this.queueQuery(userUpsert, [
          userId,
          user.email ?? null,
          user.phone ?? null,
          stringifyJson(user),
          user.updatedAt
        ]);
      },
      (userId) => {
        this.queueQuery(`DELETE FROM ${this.table("auth_users")} WHERE user_id = $1`, [userId]);
      }
    );
    this.sessionsById = new PersistedMap<string, Session>(
      (sessionId, session) => {
        this.queueQuery(sessionUpsert, [
          sessionId,
          session.userId,
          session.refreshTokenHash,
          stringifyJson(session),
          session.updatedAt
        ]);
      },
      (sessionId) => {
        this.queueQuery(`DELETE FROM ${this.table("auth_sessions")} WHERE session_id = $1`, [sessionId]);
      }
    );
    this.refreshBlacklist = new PersistedMap<string, RefreshBlacklistEntry>(
      (tokenHash, entry) => {
        this.queueQuery(blacklistUpsert, [tokenHash, stringifyJson(entry), entry.expiresAt]);
      },
      (tokenHash) => {
        this.queueQuery(`DELETE FROM ${this.table("auth_refresh_blacklist")} WHERE token_hash = $1`, [tokenHash]);
      }
    );
    this.failedLoginByIdentifier = new PersistedMap<string, FailedLoginCounter>(
      (identifier, counter) => {
        this.queueQuery(failedLoginUpsert, [identifier, stringifyJson(counter), String(counter.firstFailedAt)]);
      },
      (identifier) => {
        this.queueQuery(`DELETE FROM ${this.table("auth_failed_login_counters")} WHERE identifier = $1`, [identifier]);
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
      throw new Error("AUTH_ACCOUNT_POSTGRES_FLUSH_FAILED");
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
    await this.pool.query(this.qualifySchemaSql(AUTH_ACCOUNT_POSTGRES_SCHEMA));

    this.usersById.clear();
    this.userIdByEmail.clear();
    this.userIdByPhone.clear();
    this.sessionsById.clear();
    this.sessionIdByRefreshHash.clear();
    this.refreshBlacklist.clear();
    this.failedLoginByIdentifier.clear();

    const [users, sessions, blacklist, failedCounters] = await Promise.all([
      this.pool.query<{ payload_json: string }>(`SELECT payload_json FROM ${this.table("auth_users")}`),
      this.pool.query<{ payload_json: string }>(`SELECT payload_json FROM ${this.table("auth_sessions")}`),
      this.pool.query<{ payload_json: string }>(`SELECT payload_json FROM ${this.table("auth_refresh_blacklist")}`),
      this.pool.query<{ identifier: string; payload_json: string }>(
        `SELECT identifier, payload_json FROM ${this.table("auth_failed_login_counters")}`
      )
    ]);

    for (const row of users.rows) {
      const user = parseJson<User>(row.payload_json);
      this.usersById.setSilently(user.id, user);
      if (user.email) {
        this.userIdByEmail.set(user.email, user.id);
      }
      if (user.phone) {
        this.userIdByPhone.set(user.phone, user.id);
      }
    }

    for (const row of sessions.rows) {
      const session = parseJson<Session>(row.payload_json);
      this.sessionsById.setSilently(session.id, session);
      if (!session.revokedAt) {
        this.sessionIdByRefreshHash.set(session.refreshTokenHash, session.id);
      }
    }

    for (const row of blacklist.rows) {
      const entry = parseJson<RefreshBlacklistEntry>(row.payload_json);
      this.refreshBlacklist.setSilently(entry.tokenHash, entry);
    }

    for (const row of failedCounters.rows) {
      this.failedLoginByIdentifier.setSilently(row.identifier, parseJson<FailedLoginCounter>(row.payload_json));
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
    return sql.replaceAll("auth_", `${this.schema}.auth_`);
  }
}
