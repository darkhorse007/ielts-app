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

const normalizeRecord = (row, columns) => JSON.stringify(columns.map((column) => row[column] ?? null));

const main = async () => {
  const args = parseArgs(process.argv.slice(2));
  const sqlitePath = resolve(args.sqlite_db_path ?? "data/release.db");
  const connectionString =
    args.connection_string ?? process.env.RELEASE_STORAGE_CONNECTION_STRING ?? process.env.DATABASE_URL;
  const schema = (args.schema ?? process.env.RELEASE_STORAGE_SCHEMA ?? "public").trim();
  const sampleLimit = Math.max(1, Number.parseInt(args.sample_limit ?? "20", 10) || 20);
  const strict = resolveBoolean(args.strict, true);

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

  const report = {
    sqlite_db_path: sqlitePath,
    schema,
    strict,
    sample_limit: sampleLimit,
    tables: {},
    ok: true
  };

  try {
    await pgClient.connect();

    for (const table of TABLES) {
      const sqliteRows = sqliteDb
        .prepare(`SELECT ${table.columns.join(", ")} FROM ${table.name} ORDER BY ${table.keyColumn}`)
        .all();
      const pgResult = await pgClient.query(
        `SELECT ${table.columns.join(", ")} FROM "${schema}"."${table.name}" ORDER BY ${table.keyColumn}`
      );
      const pgRows = pgResult.rows;

      const sqliteByKey = new Map();
      for (const row of sqliteRows) {
        sqliteByKey.set(String(row[table.keyColumn]), normalizeRecord(row, table.columns));
      }

      const pgByKey = new Map();
      for (const row of pgRows) {
        pgByKey.set(String(row[table.keyColumn]), normalizeRecord(row, table.columns));
      }

      const missingInTarget = [];
      const mismatched = [];
      for (const [key, sourceEncoded] of sqliteByKey.entries()) {
        if (!pgByKey.has(key)) {
          if (missingInTarget.length < sampleLimit) {
            missingInTarget.push(key);
          }
          continue;
        }
        const targetEncoded = pgByKey.get(key);
        if (targetEncoded !== sourceEncoded) {
          if (mismatched.length < sampleLimit) {
            mismatched.push(key);
          }
        }
      }

      const extraInTarget = [];
      for (const key of pgByKey.keys()) {
        if (!sqliteByKey.has(key) && extraInTarget.length < sampleLimit) {
          extraInTarget.push(key);
        }
      }

      const tableMatched =
        sqliteRows.length === pgRows.length &&
        missingInTarget.length === 0 &&
        extraInTarget.length === 0 &&
        (!strict || mismatched.length === 0);

      report.tables[table.name] = {
        source_count: sqliteRows.length,
        target_count: pgRows.length,
        missing_in_target: missingInTarget,
        extra_in_target: extraInTarget,
        mismatched_keys: mismatched,
        matched: tableMatched
      };

      if (!tableMatched) {
        report.ok = false;
      }
    }

    console.log(JSON.stringify(report, null, 2));
    if (!report.ok) {
      process.exit(1);
    }
  } finally {
    sqliteDb.close();
    await pgClient.end();
  }
};

main().catch((error) => {
  console.error(error instanceof Error ? error.stack || error.message : String(error));
  process.exit(1);
});
