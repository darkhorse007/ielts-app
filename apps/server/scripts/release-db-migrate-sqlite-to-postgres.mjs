#!/usr/bin/env node
import { resolve } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { Client } from "pg";

const parseArgs = (argv) => {
  const result = {};
  for (const token of argv) {
    if (!token.startsWith("--")) {
      continue;
    }
    const index = token.indexOf("=");
    if (index < 0) {
      result[token.slice(2)] = "true";
      continue;
    }
    result[token.slice(2, index)] = token.slice(index + 1);
  }
  return result;
};

const isValidIdentifier = (value) => /^[a-zA-Z_][a-zA-Z0-9_]*$/.test(value);

const resolveBoolean = (value, fallback) => {
  if (value === undefined) {
    return fallback;
  }
  const normalized = String(value).trim().toLowerCase();
  if (normalized === "true" || normalized === "1" || normalized === "yes") {
    return true;
  }
  if (normalized === "false" || normalized === "0" || normalized === "no") {
    return false;
  }
  return fallback;
};

const TABLES = [
  {
    name: "release_gate_latest",
    keyColumn: "release_id",
    columns: ["release_id", "payload_json", "updated_at"]
  },
  {
    name: "canary_releases",
    keyColumn: "canary_id",
    columns: ["canary_id", "payload_json", "updated_at"]
  },
  {
    name: "beta_whitelist_entries",
    keyColumn: "whitelist_id",
    columns: ["whitelist_id", "user_id", "release_id", "payload_json", "updated_at"]
  },
  {
    name: "beta_whitelist_lookup",
    keyColumn: "lookup_key",
    columns: ["lookup_key", "whitelist_id"]
  },
  {
    name: "beta_feedbacks",
    keyColumn: "feedback_id",
    columns: ["feedback_id", "release_id", "user_id", "payload_json", "updated_at"]
  },
  {
    name: "stability_soak_runs",
    keyColumn: "run_id",
    columns: ["run_id", "release_id", "status", "payload_json", "updated_at"]
  },
  {
    name: "stability_checkpoints",
    keyColumn: "checkpoint_id",
    columns: ["checkpoint_id", "run_id", "at_hour", "payload_json", "created_at"]
  },
  {
    name: "stability_alerts",
    keyColumn: "alert_id",
    columns: [
      "alert_id",
      "run_id",
      "release_id",
      "checkpoint_id",
      "level",
      "status",
      "payload_json",
      "updated_at"
    ]
  },
  {
    name: "system_action_idempotency",
    keyColumn: "idempotency_key",
    columns: [
      "idempotency_key",
      "action_name",
      "resource_id",
      "fingerprint",
      "response_json",
      "created_at",
      "updated_at"
    ]
  }
];

const createSchemaStatements = (schema) => {
  const table = (name) => `"${schema}"."${name}"`;
  return [
    `CREATE SCHEMA IF NOT EXISTS "${schema}"`,
    `CREATE TABLE IF NOT EXISTS ${table("release_gate_latest")} (
      release_id TEXT PRIMARY KEY,
      payload_json TEXT NOT NULL,
      updated_at TEXT NOT NULL
    )`,
    `CREATE TABLE IF NOT EXISTS ${table("canary_releases")} (
      canary_id TEXT PRIMARY KEY,
      payload_json TEXT NOT NULL,
      updated_at TEXT NOT NULL
    )`,
    `CREATE TABLE IF NOT EXISTS ${table("beta_whitelist_entries")} (
      whitelist_id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      release_id TEXT NOT NULL,
      payload_json TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      UNIQUE(user_id, release_id)
    )`,
    `CREATE TABLE IF NOT EXISTS ${table("beta_whitelist_lookup")} (
      lookup_key TEXT PRIMARY KEY,
      whitelist_id TEXT NOT NULL
    )`,
    `CREATE TABLE IF NOT EXISTS ${table("beta_feedbacks")} (
      feedback_id TEXT PRIMARY KEY,
      release_id TEXT NOT NULL,
      user_id TEXT NOT NULL,
      payload_json TEXT NOT NULL,
      updated_at TEXT NOT NULL
    )`,
    `CREATE TABLE IF NOT EXISTS ${table("stability_soak_runs")} (
      run_id TEXT PRIMARY KEY,
      release_id TEXT NOT NULL,
      status TEXT NOT NULL,
      payload_json TEXT NOT NULL,
      updated_at TEXT NOT NULL
    )`,
    `CREATE TABLE IF NOT EXISTS ${table("stability_checkpoints")} (
      checkpoint_id TEXT PRIMARY KEY,
      run_id TEXT NOT NULL,
      at_hour INTEGER NOT NULL,
      payload_json TEXT NOT NULL,
      created_at TEXT NOT NULL,
      UNIQUE(run_id, at_hour)
    )`,
    `CREATE TABLE IF NOT EXISTS ${table("stability_alerts")} (
      alert_id TEXT PRIMARY KEY,
      run_id TEXT NOT NULL,
      release_id TEXT NOT NULL,
      checkpoint_id TEXT NOT NULL,
      level TEXT NOT NULL,
      status TEXT NOT NULL,
      payload_json TEXT NOT NULL,
      updated_at TEXT NOT NULL
    )`,
    `CREATE TABLE IF NOT EXISTS ${table("system_action_idempotency")} (
      idempotency_key TEXT PRIMARY KEY,
      action_name TEXT NOT NULL,
      resource_id TEXT NOT NULL,
      fingerprint TEXT NOT NULL,
      response_json TEXT NOT NULL,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    )`
  ];
};

const buildUpsertSql = (schema, tableName, keyColumn, columns) => {
  const placeholders = columns.map((_, index) => `$${index + 1}`).join(", ");
  const updateColumns = columns.filter((column) => column !== keyColumn);
  const updates = updateColumns.map((column) => `${column}=EXCLUDED.${column}`).join(", ");
  return `INSERT INTO "${schema}"."${tableName}" (${columns.join(", ")}) VALUES (${placeholders}) ON CONFLICT(${keyColumn}) DO UPDATE SET ${updates}`;
};

const main = async () => {
  const args = parseArgs(process.argv.slice(2));
  const sqlitePath = resolve(args.sqlite_db_path ?? "data/release.db");
  const connectionString =
    args.connection_string ?? process.env.RELEASE_STORAGE_CONNECTION_STRING ?? process.env.DATABASE_URL;
  const schema = (args.schema ?? process.env.RELEASE_STORAGE_SCHEMA ?? "public").trim();
  const truncateTarget = resolveBoolean(args.truncate_target, false);
  const verifyCounts = resolveBoolean(args.verify_counts, true);

  if (!connectionString) {
    console.error("missing connection string: use --connection_string or RELEASE_STORAGE_CONNECTION_STRING");
    process.exit(1);
  }
  if (!isValidIdentifier(schema)) {
    console.error(`invalid schema: ${schema}`);
    process.exit(1);
  }

  const sqliteDb = new DatabaseSync(sqlitePath, {
    readonly: true
  });
  const pgClient = new Client({
    connectionString
  });

  try {
    await pgClient.connect();
    for (const statement of createSchemaStatements(schema)) {
      await pgClient.query(statement);
    }

    await pgClient.query("BEGIN");
    const summary = {
      sqlite_db_path: sqlitePath,
      schema,
      truncate_target: truncateTarget,
      migrated: {}
    };

    for (const table of TABLES) {
      if (truncateTarget) {
        await pgClient.query(`DELETE FROM "${schema}"."${table.name}"`);
      }

      const sqliteRows = sqliteDb.prepare(`SELECT ${table.columns.join(", ")} FROM ${table.name}`).all();
      if (sqliteRows.length === 0) {
        summary.migrated[table.name] = {
          source_count: 0,
          upserted: 0
        };
        continue;
      }

      const upsertSql = buildUpsertSql(schema, table.name, table.keyColumn, table.columns);
      for (const row of sqliteRows) {
        const values = table.columns.map((column) => row[column] ?? null);
        await pgClient.query(upsertSql, values);
      }

      summary.migrated[table.name] = {
        source_count: sqliteRows.length,
        upserted: sqliteRows.length
      };
    }

    await pgClient.query("COMMIT");

    if (verifyCounts) {
      const verification = {};
      for (const table of TABLES) {
        const sourceCount = Number(sqliteDb.prepare(`SELECT count(*) AS c FROM ${table.name}`).get().c);
        const targetResult = await pgClient.query(`SELECT count(*)::int AS c FROM "${schema}"."${table.name}"`);
        const targetCount = Number(targetResult.rows[0].c);
        verification[table.name] = {
          source_count: sourceCount,
          target_count: targetCount,
          matched: sourceCount === targetCount
        };
      }
      summary.verification = verification;
      summary.verified = Object.values(verification).every((item) => item.matched);
      if (!summary.verified) {
        console.error(JSON.stringify(summary, null, 2));
        process.exitCode = 1;
        return;
      }
    }

    summary.ok = true;
    console.log(JSON.stringify(summary, null, 2));
  } finally {
    sqliteDb.close();
    await pgClient.end();
  }
};

main().catch((error) => {
  console.error(error instanceof Error ? error.stack || error.message : String(error));
  process.exit(1);
});
