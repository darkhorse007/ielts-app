import { mkdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { DatabaseSync } from "node:sqlite";
import type {
  BetaFeedback,
  BetaWhitelistEntry,
  CanaryRelease,
  ReleaseGateEvaluation,
  StabilityAlert,
  StabilityCheckpoint,
  StabilitySoakRun,
  SystemActionIdempotencyRecord
} from "./types.js";
import type { InMemoryStore } from "./store.js";

const parseJson = <T>(value: string): T => JSON.parse(value) as T;

const stringifyJson = (value: unknown): string => JSON.stringify(value);

const upsertSql = (table: string, keyColumn: string, updateColumns: string[]): string => {
  const columns = [keyColumn, ...updateColumns];
  const placeholders = columns.map(() => "?").join(", ");
  const updates = updateColumns.map((column) => `${column}=excluded.${column}`).join(", ");
  return `INSERT INTO ${table} (${columns.join(", ")}) VALUES (${placeholders}) ON CONFLICT(${keyColumn}) DO UPDATE SET ${updates}`;
};

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

  deleteSilently(key: K): boolean {
    return super.delete(key);
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

export const RELEASE_SQLITE_SCHEMA = `
CREATE TABLE IF NOT EXISTS release_gate_latest (
  release_id TEXT PRIMARY KEY,
  payload_json TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS canary_releases (
  canary_id TEXT PRIMARY KEY,
  payload_json TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS beta_whitelist_entries (
  whitelist_id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  release_id TEXT NOT NULL,
  payload_json TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  UNIQUE(user_id, release_id)
);

CREATE TABLE IF NOT EXISTS beta_whitelist_lookup (
  lookup_key TEXT PRIMARY KEY,
  whitelist_id TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS beta_feedbacks (
  feedback_id TEXT PRIMARY KEY,
  release_id TEXT NOT NULL,
  user_id TEXT NOT NULL,
  payload_json TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS stability_soak_runs (
  run_id TEXT PRIMARY KEY,
  release_id TEXT NOT NULL,
  status TEXT NOT NULL,
  payload_json TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS stability_checkpoints (
  checkpoint_id TEXT PRIMARY KEY,
  run_id TEXT NOT NULL,
  at_hour INTEGER NOT NULL,
  payload_json TEXT NOT NULL,
  created_at TEXT NOT NULL,
  UNIQUE(run_id, at_hour)
);

CREATE TABLE IF NOT EXISTS stability_alerts (
  alert_id TEXT PRIMARY KEY,
  run_id TEXT NOT NULL,
  release_id TEXT NOT NULL,
  checkpoint_id TEXT NOT NULL,
  level TEXT NOT NULL,
  status TEXT NOT NULL,
  payload_json TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS system_action_idempotency (
  idempotency_key TEXT PRIMARY KEY,
  action_name TEXT NOT NULL,
  resource_id TEXT NOT NULL,
  fingerprint TEXT NOT NULL,
  response_json TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
`;

export interface ReleaseRepository {
  readonly latestReleaseGateByReleaseId: Map<string, ReleaseGateEvaluation>;
  readonly canaryReleasesById: Map<string, CanaryRelease>;
  readonly betaWhitelistEntriesById: Map<string, BetaWhitelistEntry>;
  readonly betaWhitelistEntryIdByUserAndRelease: Map<string, string>;
  readonly betaFeedbacksById: Map<string, BetaFeedback>;
  readonly stabilitySoakRunsById: Map<string, StabilitySoakRun>;
  readonly stabilityCheckpointsByRunId: Map<string, StabilityCheckpoint[]>;
  readonly stabilityAlertsById: Map<string, StabilityAlert>;
  readonly systemActionIdempotencyByKey: Map<string, SystemActionIdempotencyRecord>;
  getWriteResilienceState(): ReleaseRepositoryWriteResilienceState;
  ready(): Promise<void>;
  flush(): Promise<void>;
  close(): Promise<void>;
}

export type ReleaseRepositoryWriteResilienceState = {
  backend: "memory" | "sqlite" | "postgres";
  mode: "synchronous" | "async_buffered";
  circuitOpen: boolean;
  circuitOpenUntil: string | null;
  consecutiveWriteFailures: number;
  maxAttempts: number;
  retryBaseDelayMs: number;
  retryMaxDelayMs: number;
  circuitFailureThreshold: number;
  circuitCooldownMs: number;
  lastError: string | null;
};

export class InMemoryReleaseRepository implements ReleaseRepository {
  readonly latestReleaseGateByReleaseId: Map<string, ReleaseGateEvaluation>;
  readonly canaryReleasesById: Map<string, CanaryRelease>;
  readonly betaWhitelistEntriesById: Map<string, BetaWhitelistEntry>;
  readonly betaWhitelistEntryIdByUserAndRelease: Map<string, string>;
  readonly betaFeedbacksById: Map<string, BetaFeedback>;
  readonly stabilitySoakRunsById: Map<string, StabilitySoakRun>;
  readonly stabilityCheckpointsByRunId: Map<string, StabilityCheckpoint[]>;
  readonly stabilityAlertsById: Map<string, StabilityAlert>;
  readonly systemActionIdempotencyByKey: Map<string, SystemActionIdempotencyRecord>;

  constructor(store: InMemoryStore) {
    this.latestReleaseGateByReleaseId = store.latestReleaseGateByReleaseId;
    this.canaryReleasesById = store.canaryReleasesById;
    this.betaWhitelistEntriesById = store.betaWhitelistEntriesById;
    this.betaWhitelistEntryIdByUserAndRelease = store.betaWhitelistEntryIdByUserAndRelease;
    this.betaFeedbacksById = store.betaFeedbacksById;
    this.stabilitySoakRunsById = store.stabilitySoakRunsById;
    this.stabilityCheckpointsByRunId = store.stabilityCheckpointsByRunId;
    this.stabilityAlertsById = store.stabilityAlertsById;
    this.systemActionIdempotencyByKey = store.systemActionIdempotencyByKey;
  }

  ready(): Promise<void> {
    return Promise.resolve();
  }

  flush(): Promise<void> {
    return Promise.resolve();
  }

  getWriteResilienceState(): ReleaseRepositoryWriteResilienceState {
    return {
      backend: "memory",
      mode: "synchronous",
      circuitOpen: false,
      circuitOpenUntil: null,
      consecutiveWriteFailures: 0,
      maxAttempts: 1,
      retryBaseDelayMs: 0,
      retryMaxDelayMs: 0,
      circuitFailureThreshold: 0,
      circuitCooldownMs: 0,
      lastError: null
    };
  }

  close(): Promise<void> {
    return Promise.resolve();
  }
}

export class SqliteReleaseRepository implements ReleaseRepository {
  readonly latestReleaseGateByReleaseId: PersistedMap<string, ReleaseGateEvaluation>;
  readonly canaryReleasesById: PersistedMap<string, CanaryRelease>;
  readonly betaWhitelistEntriesById: PersistedMap<string, BetaWhitelistEntry>;
  readonly betaWhitelistEntryIdByUserAndRelease: PersistedMap<string, string>;
  readonly betaFeedbacksById: PersistedMap<string, BetaFeedback>;
  readonly stabilitySoakRunsById: PersistedMap<string, StabilitySoakRun>;
  readonly stabilityCheckpointsByRunId: PersistedMap<string, StabilityCheckpoint[]>;
  readonly stabilityAlertsById: PersistedMap<string, StabilityAlert>;
  readonly systemActionIdempotencyByKey: PersistedMap<string, SystemActionIdempotencyRecord>;

  private readonly db: DatabaseSync;

  constructor(options?: { dbPath?: string }) {
    const dbPath = resolve(options?.dbPath ?? "data/release.db");
    mkdirSync(dirname(dbPath), { recursive: true });
    this.db = new DatabaseSync(dbPath);
    this.db.exec(RELEASE_SQLITE_SCHEMA);

    this.latestReleaseGateByReleaseId = new PersistedMap(
      (releaseId, gate) =>
        this.db
          .prepare(upsertSql("release_gate_latest", "release_id", ["payload_json", "updated_at"]))
          .run(releaseId, stringifyJson(gate), gate.createdAt),
      (releaseId) => this.db.prepare("DELETE FROM release_gate_latest WHERE release_id = ?").run(releaseId)
    );

    this.canaryReleasesById = new PersistedMap(
      (canaryId, canary) =>
        this.db
          .prepare(upsertSql("canary_releases", "canary_id", ["payload_json", "updated_at"]))
          .run(canaryId, stringifyJson(canary), canary.updatedAt),
      (canaryId) => this.db.prepare("DELETE FROM canary_releases WHERE canary_id = ?").run(canaryId)
    );

    this.betaWhitelistEntriesById = new PersistedMap(
      (entryId, entry) =>
        this.db
          .prepare(
            upsertSql("beta_whitelist_entries", "whitelist_id", [
              "user_id",
              "release_id",
              "payload_json",
              "updated_at"
            ])
          )
          .run(entryId, entry.userId, entry.releaseId, stringifyJson(entry), entry.updatedAt),
      (entryId) => this.db.prepare("DELETE FROM beta_whitelist_entries WHERE whitelist_id = ?").run(entryId)
    );

    this.betaWhitelistEntryIdByUserAndRelease = new PersistedMap(
      (lookupKey, entryId) =>
        this.db
          .prepare(upsertSql("beta_whitelist_lookup", "lookup_key", ["whitelist_id"]))
          .run(lookupKey, entryId),
      (lookupKey) => this.db.prepare("DELETE FROM beta_whitelist_lookup WHERE lookup_key = ?").run(lookupKey)
    );

    this.betaFeedbacksById = new PersistedMap(
      (feedbackId, feedback) =>
        this.db
          .prepare(upsertSql("beta_feedbacks", "feedback_id", ["release_id", "user_id", "payload_json", "updated_at"]))
          .run(feedbackId, feedback.releaseId, feedback.userId, stringifyJson(feedback), feedback.updatedAt),
      (feedbackId) => this.db.prepare("DELETE FROM beta_feedbacks WHERE feedback_id = ?").run(feedbackId)
    );

    this.stabilitySoakRunsById = new PersistedMap(
      (runId, run) =>
        this.db
          .prepare(upsertSql("stability_soak_runs", "run_id", ["release_id", "status", "payload_json", "updated_at"]))
          .run(runId, run.releaseId, run.status, stringifyJson(run), run.updatedAt),
      (runId) => this.db.prepare("DELETE FROM stability_soak_runs WHERE run_id = ?").run(runId)
    );

    this.stabilityCheckpointsByRunId = new PersistedMap(
      (runId, checkpoints) => {
        this.db.prepare("DELETE FROM stability_checkpoints WHERE run_id = ?").run(runId);
        const insert = this.db.prepare(
          upsertSql("stability_checkpoints", "checkpoint_id", ["run_id", "at_hour", "payload_json", "created_at"])
        );
        for (const checkpoint of checkpoints) {
          insert.run(
            checkpoint.id,
            runId,
            checkpoint.atHour,
            stringifyJson(checkpoint),
            checkpoint.createdAt
          );
        }
      },
      (runId) => this.db.prepare("DELETE FROM stability_checkpoints WHERE run_id = ?").run(runId)
    );

    this.stabilityAlertsById = new PersistedMap(
      (alertId, alert) =>
        this.db
          .prepare(
            upsertSql("stability_alerts", "alert_id", [
              "run_id",
              "release_id",
              "checkpoint_id",
              "level",
              "status",
              "payload_json",
              "updated_at"
            ])
          )
          .run(
            alertId,
            alert.runId,
            alert.releaseId,
            alert.checkpointId,
            alert.level,
            alert.status,
            stringifyJson(alert),
            alert.updatedAt
          ),
      (alertId) => this.db.prepare("DELETE FROM stability_alerts WHERE alert_id = ?").run(alertId)
    );

    this.systemActionIdempotencyByKey = new PersistedMap(
      (key, record) =>
        this.db
          .prepare(
            upsertSql("system_action_idempotency", "idempotency_key", [
              "action_name",
              "resource_id",
              "fingerprint",
              "response_json",
              "created_at",
              "updated_at"
            ])
          )
          .run(
            key,
            record.actionName,
            record.resourceId,
            record.fingerprint,
            record.responseJson,
            record.createdAt,
            record.updatedAt
          ),
      (key) => this.db.prepare("DELETE FROM system_action_idempotency WHERE idempotency_key = ?").run(key)
    );

    this.loadFromSqlite();
  }

  ready(): Promise<void> {
    return Promise.resolve();
  }

  flush(): Promise<void> {
    return Promise.resolve();
  }

  getWriteResilienceState(): ReleaseRepositoryWriteResilienceState {
    return {
      backend: "sqlite",
      mode: "synchronous",
      circuitOpen: false,
      circuitOpenUntil: null,
      consecutiveWriteFailures: 0,
      maxAttempts: 1,
      retryBaseDelayMs: 0,
      retryMaxDelayMs: 0,
      circuitFailureThreshold: 0,
      circuitCooldownMs: 0,
      lastError: null
    };
  }

  close(): Promise<void> {
    this.db.close();
    return Promise.resolve();
  }

  private loadFromSqlite(): void {
    for (const row of this.db.prepare("SELECT release_id, payload_json FROM release_gate_latest").all() as Array<{
      release_id: string;
      payload_json: string;
    }>) {
      this.latestReleaseGateByReleaseId.setSilently(row.release_id, parseJson<ReleaseGateEvaluation>(row.payload_json));
    }

    for (const row of this.db.prepare("SELECT canary_id, payload_json FROM canary_releases").all() as Array<{
      canary_id: string;
      payload_json: string;
    }>) {
      this.canaryReleasesById.setSilently(row.canary_id, parseJson<CanaryRelease>(row.payload_json));
    }

    for (const row of this.db
      .prepare("SELECT whitelist_id, payload_json FROM beta_whitelist_entries")
      .all() as Array<{ whitelist_id: string; payload_json: string }>) {
      this.betaWhitelistEntriesById.setSilently(row.whitelist_id, parseJson<BetaWhitelistEntry>(row.payload_json));
    }

    for (const row of this.db
      .prepare("SELECT lookup_key, whitelist_id FROM beta_whitelist_lookup")
      .all() as Array<{ lookup_key: string; whitelist_id: string }>) {
      this.betaWhitelistEntryIdByUserAndRelease.setSilently(row.lookup_key, row.whitelist_id);
    }

    for (const row of this.db.prepare("SELECT feedback_id, payload_json FROM beta_feedbacks").all() as Array<{
      feedback_id: string;
      payload_json: string;
    }>) {
      this.betaFeedbacksById.setSilently(row.feedback_id, parseJson<BetaFeedback>(row.payload_json));
    }

    for (const row of this.db.prepare("SELECT run_id, payload_json FROM stability_soak_runs").all() as Array<{
      run_id: string;
      payload_json: string;
    }>) {
      this.stabilitySoakRunsById.setSilently(row.run_id, parseJson<StabilitySoakRun>(row.payload_json));
    }

    const checkpointsByRunId = new Map<string, StabilityCheckpoint[]>();
    for (const row of this.db
      .prepare("SELECT run_id, payload_json FROM stability_checkpoints ORDER BY run_id, at_hour ASC")
      .all() as Array<{ run_id: string; payload_json: string }>) {
      const list = checkpointsByRunId.get(row.run_id) ?? [];
      list.push(parseJson<StabilityCheckpoint>(row.payload_json));
      checkpointsByRunId.set(row.run_id, list);
    }
    for (const [runId, checkpoints] of checkpointsByRunId.entries()) {
      this.stabilityCheckpointsByRunId.setSilently(runId, checkpoints);
    }

    for (const row of this.db.prepare("SELECT alert_id, payload_json FROM stability_alerts").all() as Array<{
      alert_id: string;
      payload_json: string;
    }>) {
      this.stabilityAlertsById.setSilently(row.alert_id, parseJson<StabilityAlert>(row.payload_json));
    }

    for (const row of this.db
      .prepare("SELECT idempotency_key, action_name, resource_id, fingerprint, response_json, created_at, updated_at FROM system_action_idempotency")
      .all() as Array<{
        idempotency_key: string;
        action_name: string;
        resource_id: string;
        fingerprint: string;
        response_json: string;
        created_at: string;
        updated_at: string;
      }>) {
      this.systemActionIdempotencyByKey.setSilently(row.idempotency_key, {
        idempotencyKey: row.idempotency_key,
        actionName: row.action_name,
        resourceId: row.resource_id,
        fingerprint: row.fingerprint,
        responseJson: row.response_json,
        createdAt: row.created_at,
        updatedAt: row.updated_at
      });
    }
  }
}

type PgPool = {
  query: (
    text: string,
    values?: Array<string | number | boolean | null>
  ) => Promise<{
    rows: Array<Record<string, unknown>>;
  }>;
  end: () => Promise<void>;
  on?: (event: string, listener: (error: unknown) => void) => void;
};

const isValidPostgresIdentifier = (value: string): boolean => /^[a-zA-Z_][a-zA-Z0-9_]*$/.test(value);

type PostgresWriteResilienceOptions = {
  maxAttempts: number;
  retryBaseDelayMs: number;
  retryMaxDelayMs: number;
  circuitFailureThreshold: number;
  circuitCooldownMs: number;
};

const DEFAULT_POSTGRES_WRITE_RESILIENCE_OPTIONS: PostgresWriteResilienceOptions = {
  maxAttempts: 3,
  retryBaseDelayMs: 60,
  retryMaxDelayMs: 800,
  circuitFailureThreshold: 5,
  circuitCooldownMs: 5000
};

const toPositiveInt = (value: string | undefined, fallback: number): number => {
  if (!value) {
    return fallback;
  }
  const parsed = Number.parseInt(value, 10);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    return fallback;
  }
  return parsed;
};

const toNonNegativeInt = (value: string | undefined, fallback: number): number => {
  if (!value) {
    return fallback;
  }
  const parsed = Number.parseInt(value, 10);
  if (!Number.isFinite(parsed) || parsed < 0) {
    return fallback;
  }
  return parsed;
};

const sleep = (ms: number): Promise<void> =>
  new Promise((resolveSleep) => {
    setTimeout(resolveSleep, ms);
  });

export class PostgresReleaseRepository implements ReleaseRepository {
  readonly latestReleaseGateByReleaseId: PersistedMap<string, ReleaseGateEvaluation>;
  readonly canaryReleasesById: PersistedMap<string, CanaryRelease>;
  readonly betaWhitelistEntriesById: PersistedMap<string, BetaWhitelistEntry>;
  readonly betaWhitelistEntryIdByUserAndRelease: PersistedMap<string, string>;
  readonly betaFeedbacksById: PersistedMap<string, BetaFeedback>;
  readonly stabilitySoakRunsById: PersistedMap<string, StabilitySoakRun>;
  readonly stabilityCheckpointsByRunId: PersistedMap<string, StabilityCheckpoint[]>;
  readonly stabilityAlertsById: PersistedMap<string, StabilityAlert>;
  readonly systemActionIdempotencyByKey: PersistedMap<string, SystemActionIdempotencyRecord>;

  private readonly schema: string;
  private readonly poolPromise: Promise<PgPool>;
  private readonly readyPromise: Promise<void>;
  private readonly resilienceOptions: PostgresWriteResilienceOptions;
  private writeQueue: Promise<void> = Promise.resolve();
  private lastWriteError: Error | null = null;
  private consecutiveWriteFailures = 0;
  private circuitOpenUntilEpochMs = 0;
  private recoveryPromise: Promise<void> | null = null;

  constructor(options?: {
    connectionString?: string;
    schema?: string;
    resilienceOptions?: Partial<PostgresWriteResilienceOptions>;
  }) {
    const connectionString =
      options?.connectionString ?? process.env.RELEASE_POSTGRES_URL ?? process.env.DATABASE_URL ?? "";
    if (!connectionString) {
      throw new Error("POSTGRES_CONNECTION_STRING_REQUIRED");
    }
    const schema = (options?.schema ?? process.env.RELEASE_POSTGRES_SCHEMA ?? "public").trim();
    if (!isValidPostgresIdentifier(schema)) {
      throw new Error("POSTGRES_SCHEMA_INVALID");
    }
    this.schema = schema;
    this.poolPromise = this.createPool(connectionString);
    this.resilienceOptions = {
      maxAttempts: Math.max(
        1,
        options?.resilienceOptions?.maxAttempts ??
          toPositiveInt(process.env.RELEASE_POSTGRES_WRITE_MAX_ATTEMPTS, DEFAULT_POSTGRES_WRITE_RESILIENCE_OPTIONS.maxAttempts)
      ),
      retryBaseDelayMs: Math.max(
        1,
        options?.resilienceOptions?.retryBaseDelayMs ??
          toPositiveInt(process.env.RELEASE_POSTGRES_WRITE_RETRY_BASE_MS, DEFAULT_POSTGRES_WRITE_RESILIENCE_OPTIONS.retryBaseDelayMs)
      ),
      retryMaxDelayMs: Math.max(
        1,
        options?.resilienceOptions?.retryMaxDelayMs ??
          toPositiveInt(process.env.RELEASE_POSTGRES_WRITE_RETRY_MAX_MS, DEFAULT_POSTGRES_WRITE_RESILIENCE_OPTIONS.retryMaxDelayMs)
      ),
      circuitFailureThreshold: Math.max(
        1,
        options?.resilienceOptions?.circuitFailureThreshold ??
          toPositiveInt(
            process.env.RELEASE_POSTGRES_WRITE_CIRCUIT_FAILURE_THRESHOLD,
            DEFAULT_POSTGRES_WRITE_RESILIENCE_OPTIONS.circuitFailureThreshold
          )
      ),
      circuitCooldownMs: Math.max(
        0,
        options?.resilienceOptions?.circuitCooldownMs ??
          toNonNegativeInt(process.env.RELEASE_POSTGRES_WRITE_CIRCUIT_COOLDOWN_MS, DEFAULT_POSTGRES_WRITE_RESILIENCE_OPTIONS.circuitCooldownMs)
      )
    };

    const releaseGateUpsert = upsertPgSql(this.table("release_gate_latest"), "release_id", ["payload_json", "updated_at"]);
    const canaryUpsert = upsertPgSql(this.table("canary_releases"), "canary_id", ["payload_json", "updated_at"]);
    const whitelistEntryUpsert = upsertPgSql(this.table("beta_whitelist_entries"), "whitelist_id", [
      "user_id",
      "release_id",
      "payload_json",
      "updated_at"
    ]);
    const whitelistLookupUpsert = upsertPgSql(this.table("beta_whitelist_lookup"), "lookup_key", ["whitelist_id"]);
    const feedbackUpsert = upsertPgSql(this.table("beta_feedbacks"), "feedback_id", [
      "release_id",
      "user_id",
      "payload_json",
      "updated_at"
    ]);
    const soakRunUpsert = upsertPgSql(this.table("stability_soak_runs"), "run_id", [
      "release_id",
      "status",
      "payload_json",
      "updated_at"
    ]);
    const checkpointUpsert = upsertPgSql(this.table("stability_checkpoints"), "checkpoint_id", [
      "run_id",
      "at_hour",
      "payload_json",
      "created_at"
    ]);
    const alertUpsert = upsertPgSql(this.table("stability_alerts"), "alert_id", [
      "run_id",
      "release_id",
      "checkpoint_id",
      "level",
      "status",
      "payload_json",
      "updated_at"
    ]);
    const idempotencyUpsert = upsertPgSql(this.table("system_action_idempotency"), "idempotency_key", [
      "action_name",
      "resource_id",
      "fingerprint",
      "response_json",
      "created_at",
      "updated_at"
    ]);

    this.latestReleaseGateByReleaseId = new PersistedMap(
      (releaseId, gate) => {
        this.queueQuery(releaseGateUpsert, [releaseId, stringifyJson(gate), gate.createdAt]);
      },
      (releaseId) => {
        this.queueQuery(`DELETE FROM ${this.table("release_gate_latest")} WHERE release_id = $1`, [releaseId]);
      }
    );

    this.canaryReleasesById = new PersistedMap(
      (canaryId, canary) => {
        this.queueQuery(canaryUpsert, [canaryId, stringifyJson(canary), canary.updatedAt]);
      },
      (canaryId) => {
        this.queueQuery(`DELETE FROM ${this.table("canary_releases")} WHERE canary_id = $1`, [canaryId]);
      }
    );

    this.betaWhitelistEntriesById = new PersistedMap(
      (entryId, entry) => {
        this.queueQuery(whitelistEntryUpsert, [entryId, entry.userId, entry.releaseId, stringifyJson(entry), entry.updatedAt]);
      },
      (entryId) => {
        this.queueQuery(`DELETE FROM ${this.table("beta_whitelist_entries")} WHERE whitelist_id = $1`, [entryId]);
      }
    );

    this.betaWhitelistEntryIdByUserAndRelease = new PersistedMap(
      (lookupKey, entryId) => {
        this.queueQuery(whitelistLookupUpsert, [lookupKey, entryId]);
      },
      (lookupKey) => {
        this.queueQuery(`DELETE FROM ${this.table("beta_whitelist_lookup")} WHERE lookup_key = $1`, [lookupKey]);
      }
    );

    this.betaFeedbacksById = new PersistedMap(
      (feedbackId, feedback) => {
        this.queueQuery(feedbackUpsert, [
          feedbackId,
          feedback.releaseId,
          feedback.userId,
          stringifyJson(feedback),
          feedback.updatedAt
        ]);
      },
      (feedbackId) => {
        this.queueQuery(`DELETE FROM ${this.table("beta_feedbacks")} WHERE feedback_id = $1`, [feedbackId]);
      }
    );

    this.stabilitySoakRunsById = new PersistedMap(
      (runId, run) => {
        this.queueQuery(soakRunUpsert, [runId, run.releaseId, run.status, stringifyJson(run), run.updatedAt]);
      },
      (runId) => {
        this.queueQuery(`DELETE FROM ${this.table("stability_soak_runs")} WHERE run_id = $1`, [runId]);
      }
    );

    this.stabilityCheckpointsByRunId = new PersistedMap(
      (runId, checkpoints) => {
        this.queueTask(async (pool) => {
          await pool.query("BEGIN");
          try {
            await pool.query(`DELETE FROM ${this.table("stability_checkpoints")} WHERE run_id = $1`, [runId]);
            for (const checkpoint of checkpoints) {
              await pool.query(checkpointUpsert, [
                checkpoint.id,
                runId,
                checkpoint.atHour,
                stringifyJson(checkpoint),
                checkpoint.createdAt
              ]);
            }
            await pool.query("COMMIT");
          } catch (error) {
            await pool.query("ROLLBACK");
            throw error;
          }
        });
      },
      (runId) => {
        this.queueQuery(`DELETE FROM ${this.table("stability_checkpoints")} WHERE run_id = $1`, [runId]);
      }
    );

    this.stabilityAlertsById = new PersistedMap(
      (alertId, alert) => {
        this.queueQuery(alertUpsert, [
          alertId,
          alert.runId,
          alert.releaseId,
          alert.checkpointId,
          alert.level,
          alert.status,
          stringifyJson(alert),
          alert.updatedAt
        ]);
      },
      (alertId) => {
        this.queueQuery(`DELETE FROM ${this.table("stability_alerts")} WHERE alert_id = $1`, [alertId]);
      }
    );

    this.systemActionIdempotencyByKey = new PersistedMap(
      (key, record) => {
        this.queueQuery(idempotencyUpsert, [
          key,
          record.actionName,
          record.resourceId,
          record.fingerprint,
          record.responseJson,
          record.createdAt,
          record.updatedAt
        ]);
      },
      (key) => {
        this.queueQuery(`DELETE FROM ${this.table("system_action_idempotency")} WHERE idempotency_key = $1`, [key]);
      }
    );

    this.readyPromise = this.initialize();
  }

  ready(): Promise<void> {
    return this.readyPromise;
  }

  async flush(): Promise<void> {
    await this.readyPromise;
    await this.writeQueue;
    if (this.lastWriteError) {
      const error = this.lastWriteError;
      await this.recoverInMemoryState();
      throw error;
    }
  }

  async close(): Promise<void> {
    await this.flush();
    const pool = await this.poolPromise;
    await pool.end();
  }

  private table(name: string): string {
    return `"${this.schema}"."${name}"`;
  }

  private async createPool(connectionString: string): Promise<PgPool> {
    const pgModule = (await import("pg")) as {
      Pool: new (options: { connectionString: string }) => PgPool;
    };
    const pool = new pgModule.Pool({
      connectionString
    });
    pool.on?.("error", (error) => {
      const normalized = error instanceof Error ? error : new Error(String(error));
      this.lastWriteError = normalized;
      this.consecutiveWriteFailures += 1;
      if (this.consecutiveWriteFailures >= this.resilienceOptions.circuitFailureThreshold) {
        this.circuitOpenUntilEpochMs = Date.now() + this.resilienceOptions.circuitCooldownMs;
      }
      console.error("[PostgresReleaseRepository] pool error", normalized);
    });
    return pool;
  }

  private queueQuery(text: string, values: Array<string | number | boolean | null>): void {
    this.queueTask(async (pool) => {
      await pool.query(text, values);
    });
  }

  private queueTask(task: (pool: PgPool) => Promise<void>): void {
    this.writeQueue = this.writeQueue
      .then(async () => {
        await this.readyPromise;
        if (Date.now() < this.circuitOpenUntilEpochMs) {
          throw new Error("POSTGRES_WRITE_CIRCUIT_OPEN");
        }
        const pool = await this.poolPromise;
        await this.executeTaskWithRetry(pool, task);
        this.lastWriteError = null;
      })
      .catch((error) => {
        this.lastWriteError = error instanceof Error ? error : new Error(String(error));
        console.error("[PostgresReleaseRepository] background write failed", error);
      });
  }

  private async executeTaskWithRetry(pool: PgPool, task: (pool: PgPool) => Promise<void>): Promise<void> {
    let attempt = 0;
    let lastError: Error | null = null;
    while (attempt < this.resilienceOptions.maxAttempts) {
      attempt += 1;
      try {
        await task(pool);
        this.consecutiveWriteFailures = 0;
        this.circuitOpenUntilEpochMs = 0;
        return;
      } catch (error) {
        const normalized = error instanceof Error ? error : new Error(String(error));
        lastError = normalized;
        this.consecutiveWriteFailures += 1;
        if (this.consecutiveWriteFailures >= this.resilienceOptions.circuitFailureThreshold) {
          this.circuitOpenUntilEpochMs = Date.now() + this.resilienceOptions.circuitCooldownMs;
        }
        const canRetry = attempt < this.resilienceOptions.maxAttempts && this.isRetriableWriteError(normalized);
        if (!canRetry) {
          throw normalized;
        }
        await sleep(this.resolveRetryDelayMs(attempt));
      }
    }
    throw lastError ?? new Error("POSTGRES_WRITE_FAILED");
  }

  private isRetriableWriteError(error: Error): boolean {
    const value = error as Error & {
      code?: unknown;
      cause?: unknown;
    };
    const code = typeof value.code === "string" ? value.code.toUpperCase() : "";
    if (
      code === "57P01" ||
      code === "57P02" ||
      code === "57P03" ||
      code === "08000" ||
      code === "08003" ||
      code === "08006" ||
      code === "53300" ||
      code === "ECONNRESET" ||
      code === "ECONNREFUSED" ||
      code === "ETIMEDOUT" ||
      code === "EPIPE"
    ) {
      return true;
    }
    const message = `${error.message} ${typeof value.cause === "string" ? value.cause : ""}`.toLowerCase();
    return (
      message.includes("connection") ||
      message.includes("timeout") ||
      message.includes("terminated") ||
      message.includes("disconnect") ||
      message.includes("socket") ||
      message.includes("econn")
    );
  }

  private resolveRetryDelayMs(attempt: number): number {
    const withExponent = this.resilienceOptions.retryBaseDelayMs * 2 ** Math.max(0, attempt - 1);
    return Math.min(withExponent, this.resilienceOptions.retryMaxDelayMs);
  }

  private async recoverInMemoryState(): Promise<void> {
    if (this.recoveryPromise) {
      await this.recoveryPromise;
      return;
    }
    this.recoveryPromise = this.performRecovery().finally(() => {
      this.recoveryPromise = null;
    });
    await this.recoveryPromise;
  }

  private async performRecovery(): Promise<void> {
    const pool = await this.poolPromise;
    const snapshot = this.snapshotInMemoryState();
    try {
      this.clearInMemoryState();
      await this.loadFromPostgres(pool);
      this.lastWriteError = null;
    } catch (error) {
      this.restoreInMemoryState(snapshot);
      const normalized = error instanceof Error ? error : new Error(String(error));
      this.lastWriteError = normalized;
      throw normalized;
    }
  }

  private async initialize(): Promise<void> {
    const pool = await this.poolPromise;
    await pool.query(`CREATE SCHEMA IF NOT EXISTS "${this.schema}"`);
    await this.createTables(pool);
    await this.loadFromPostgres(pool);
  }

  private async createTables(pool: PgPool): Promise<void> {
    const statements = [
      `CREATE TABLE IF NOT EXISTS ${this.table("release_gate_latest")} (
        release_id TEXT PRIMARY KEY,
        payload_json TEXT NOT NULL,
        updated_at TEXT NOT NULL
      )`,
      `CREATE TABLE IF NOT EXISTS ${this.table("canary_releases")} (
        canary_id TEXT PRIMARY KEY,
        payload_json TEXT NOT NULL,
        updated_at TEXT NOT NULL
      )`,
      `CREATE TABLE IF NOT EXISTS ${this.table("beta_whitelist_entries")} (
        whitelist_id TEXT PRIMARY KEY,
        user_id TEXT NOT NULL,
        release_id TEXT NOT NULL,
        payload_json TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        UNIQUE(user_id, release_id)
      )`,
      `CREATE TABLE IF NOT EXISTS ${this.table("beta_whitelist_lookup")} (
        lookup_key TEXT PRIMARY KEY,
        whitelist_id TEXT NOT NULL
      )`,
      `CREATE TABLE IF NOT EXISTS ${this.table("beta_feedbacks")} (
        feedback_id TEXT PRIMARY KEY,
        release_id TEXT NOT NULL,
        user_id TEXT NOT NULL,
        payload_json TEXT NOT NULL,
        updated_at TEXT NOT NULL
      )`,
      `CREATE TABLE IF NOT EXISTS ${this.table("stability_soak_runs")} (
        run_id TEXT PRIMARY KEY,
        release_id TEXT NOT NULL,
        status TEXT NOT NULL,
        payload_json TEXT NOT NULL,
        updated_at TEXT NOT NULL
      )`,
      `CREATE TABLE IF NOT EXISTS ${this.table("stability_checkpoints")} (
        checkpoint_id TEXT PRIMARY KEY,
        run_id TEXT NOT NULL,
        at_hour INTEGER NOT NULL,
        payload_json TEXT NOT NULL,
        created_at TEXT NOT NULL,
        UNIQUE(run_id, at_hour)
      )`,
      `CREATE TABLE IF NOT EXISTS ${this.table("stability_alerts")} (
        alert_id TEXT PRIMARY KEY,
        run_id TEXT NOT NULL,
        release_id TEXT NOT NULL,
        checkpoint_id TEXT NOT NULL,
        level TEXT NOT NULL,
        status TEXT NOT NULL,
        payload_json TEXT NOT NULL,
        updated_at TEXT NOT NULL
      )`,
      `CREATE TABLE IF NOT EXISTS ${this.table("system_action_idempotency")} (
        idempotency_key TEXT PRIMARY KEY,
        action_name TEXT NOT NULL,
        resource_id TEXT NOT NULL,
        fingerprint TEXT NOT NULL,
        response_json TEXT NOT NULL,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      )`
    ];
    for (const statement of statements) {
      await pool.query(statement);
    }
  }

  private async loadFromPostgres(pool: PgPool): Promise<void> {
    const releaseGates = await pool.query(
      `SELECT release_id, payload_json FROM ${this.table("release_gate_latest")}`
    );
    for (const row of releaseGates.rows) {
      this.latestReleaseGateByReleaseId.setSilently(
        String(row.release_id),
        parseJson<ReleaseGateEvaluation>(String(row.payload_json))
      );
    }

    const canaries = await pool.query(`SELECT canary_id, payload_json FROM ${this.table("canary_releases")}`);
    for (const row of canaries.rows) {
      this.canaryReleasesById.setSilently(String(row.canary_id), parseJson<CanaryRelease>(String(row.payload_json)));
    }

    const whitelistEntries = await pool.query(
      `SELECT whitelist_id, payload_json FROM ${this.table("beta_whitelist_entries")}`
    );
    for (const row of whitelistEntries.rows) {
      this.betaWhitelistEntriesById.setSilently(
        String(row.whitelist_id),
        parseJson<BetaWhitelistEntry>(String(row.payload_json))
      );
    }

    const whitelistLookup = await pool.query(
      `SELECT lookup_key, whitelist_id FROM ${this.table("beta_whitelist_lookup")}`
    );
    for (const row of whitelistLookup.rows) {
      this.betaWhitelistEntryIdByUserAndRelease.setSilently(String(row.lookup_key), String(row.whitelist_id));
    }

    const feedbacks = await pool.query(`SELECT feedback_id, payload_json FROM ${this.table("beta_feedbacks")}`);
    for (const row of feedbacks.rows) {
      this.betaFeedbacksById.setSilently(String(row.feedback_id), parseJson<BetaFeedback>(String(row.payload_json)));
    }

    const soakRuns = await pool.query(`SELECT run_id, payload_json FROM ${this.table("stability_soak_runs")}`);
    for (const row of soakRuns.rows) {
      this.stabilitySoakRunsById.setSilently(String(row.run_id), parseJson<StabilitySoakRun>(String(row.payload_json)));
    }

    const checkpointsByRunId = new Map<string, StabilityCheckpoint[]>();
    const checkpoints = await pool.query(
      `SELECT run_id, payload_json FROM ${this.table("stability_checkpoints")} ORDER BY run_id, at_hour ASC`
    );
    for (const row of checkpoints.rows) {
      const runId = String(row.run_id);
      const list = checkpointsByRunId.get(runId) ?? [];
      list.push(parseJson<StabilityCheckpoint>(String(row.payload_json)));
      checkpointsByRunId.set(runId, list);
    }
    for (const [runId, list] of checkpointsByRunId.entries()) {
      this.stabilityCheckpointsByRunId.setSilently(runId, list);
    }

    const alerts = await pool.query(`SELECT alert_id, payload_json FROM ${this.table("stability_alerts")}`);
    for (const row of alerts.rows) {
      this.stabilityAlertsById.setSilently(String(row.alert_id), parseJson<StabilityAlert>(String(row.payload_json)));
    }

    const idempotencyRecords = await pool.query(
      `SELECT idempotency_key, action_name, resource_id, fingerprint, response_json, created_at, updated_at FROM ${this.table("system_action_idempotency")}`
    );
    for (const row of idempotencyRecords.rows) {
      this.systemActionIdempotencyByKey.setSilently(String(row.idempotency_key), {
        idempotencyKey: String(row.idempotency_key),
        actionName: String(row.action_name),
        resourceId: String(row.resource_id),
        fingerprint: String(row.fingerprint),
        responseJson: String(row.response_json),
        createdAt: String(row.created_at),
        updatedAt: String(row.updated_at)
      });
    }
  }

  private clearInMemoryState(): void {
    this.latestReleaseGateByReleaseId.clear();
    this.canaryReleasesById.clear();
    this.betaWhitelistEntriesById.clear();
    this.betaWhitelistEntryIdByUserAndRelease.clear();
    this.betaFeedbacksById.clear();
    this.stabilitySoakRunsById.clear();
    this.stabilityCheckpointsByRunId.clear();
    this.stabilityAlertsById.clear();
    this.systemActionIdempotencyByKey.clear();
  }

  getWriteResilienceState(): ReleaseRepositoryWriteResilienceState {
    const circuitOpen = Date.now() < this.circuitOpenUntilEpochMs;
    return {
      backend: "postgres",
      mode: "async_buffered",
      circuitOpen,
      circuitOpenUntil: circuitOpen ? new Date(this.circuitOpenUntilEpochMs).toISOString() : null,
      consecutiveWriteFailures: this.consecutiveWriteFailures,
      maxAttempts: this.resilienceOptions.maxAttempts,
      retryBaseDelayMs: this.resilienceOptions.retryBaseDelayMs,
      retryMaxDelayMs: this.resilienceOptions.retryMaxDelayMs,
      circuitFailureThreshold: this.resilienceOptions.circuitFailureThreshold,
      circuitCooldownMs: this.resilienceOptions.circuitCooldownMs,
      lastError: this.lastWriteError?.message ?? null
    };
  }

  private snapshotInMemoryState(): {
    latestReleaseGateByReleaseId: Map<string, ReleaseGateEvaluation>;
    canaryReleasesById: Map<string, CanaryRelease>;
    betaWhitelistEntriesById: Map<string, BetaWhitelistEntry>;
    betaWhitelistEntryIdByUserAndRelease: Map<string, string>;
    betaFeedbacksById: Map<string, BetaFeedback>;
    stabilitySoakRunsById: Map<string, StabilitySoakRun>;
    stabilityCheckpointsByRunId: Map<string, StabilityCheckpoint[]>;
    stabilityAlertsById: Map<string, StabilityAlert>;
    systemActionIdempotencyByKey: Map<string, SystemActionIdempotencyRecord>;
  } {
    return {
      latestReleaseGateByReleaseId: new Map(this.latestReleaseGateByReleaseId),
      canaryReleasesById: new Map(this.canaryReleasesById),
      betaWhitelistEntriesById: new Map(this.betaWhitelistEntriesById),
      betaWhitelistEntryIdByUserAndRelease: new Map(this.betaWhitelistEntryIdByUserAndRelease),
      betaFeedbacksById: new Map(this.betaFeedbacksById),
      stabilitySoakRunsById: new Map(this.stabilitySoakRunsById),
      stabilityCheckpointsByRunId: new Map(this.stabilityCheckpointsByRunId),
      stabilityAlertsById: new Map(this.stabilityAlertsById),
      systemActionIdempotencyByKey: new Map(this.systemActionIdempotencyByKey)
    };
  }

  private restoreInMemoryState(snapshot: {
    latestReleaseGateByReleaseId: Map<string, ReleaseGateEvaluation>;
    canaryReleasesById: Map<string, CanaryRelease>;
    betaWhitelistEntriesById: Map<string, BetaWhitelistEntry>;
    betaWhitelistEntryIdByUserAndRelease: Map<string, string>;
    betaFeedbacksById: Map<string, BetaFeedback>;
    stabilitySoakRunsById: Map<string, StabilitySoakRun>;
    stabilityCheckpointsByRunId: Map<string, StabilityCheckpoint[]>;
    stabilityAlertsById: Map<string, StabilityAlert>;
    systemActionIdempotencyByKey: Map<string, SystemActionIdempotencyRecord>;
  }): void {
    this.clearInMemoryState();
    for (const [key, value] of snapshot.latestReleaseGateByReleaseId.entries()) {
      this.latestReleaseGateByReleaseId.setSilently(key, value);
    }
    for (const [key, value] of snapshot.canaryReleasesById.entries()) {
      this.canaryReleasesById.setSilently(key, value);
    }
    for (const [key, value] of snapshot.betaWhitelistEntriesById.entries()) {
      this.betaWhitelistEntriesById.setSilently(key, value);
    }
    for (const [key, value] of snapshot.betaWhitelistEntryIdByUserAndRelease.entries()) {
      this.betaWhitelistEntryIdByUserAndRelease.setSilently(key, value);
    }
    for (const [key, value] of snapshot.betaFeedbacksById.entries()) {
      this.betaFeedbacksById.setSilently(key, value);
    }
    for (const [key, value] of snapshot.stabilitySoakRunsById.entries()) {
      this.stabilitySoakRunsById.setSilently(key, value);
    }
    for (const [key, value] of snapshot.stabilityCheckpointsByRunId.entries()) {
      this.stabilityCheckpointsByRunId.setSilently(key, value);
    }
    for (const [key, value] of snapshot.stabilityAlertsById.entries()) {
      this.stabilityAlertsById.setSilently(key, value);
    }
    for (const [key, value] of snapshot.systemActionIdempotencyByKey.entries()) {
      this.systemActionIdempotencyByKey.setSilently(key, value);
    }
  }
}
