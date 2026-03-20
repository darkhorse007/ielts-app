#!/usr/bin/env node
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

const args = parseArgs(process.argv.slice(2));
const connectionString = args.connection_string ?? process.env.RELEASE_STORAGE_CONNECTION_STRING ?? process.env.DATABASE_URL;
const schema = (args.schema ?? process.env.RELEASE_STORAGE_SCHEMA ?? "public").trim();

if (!connectionString) {
  console.error("missing connection string: use --connection_string or RELEASE_STORAGE_CONNECTION_STRING");
  process.exit(1);
}
if (!isValidIdentifier(schema)) {
  console.error(`invalid schema: ${schema}`);
  process.exit(1);
}

const table = (name) => `"${schema}"."${name}"`;

const statements = [
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

const client = new Client({
  connectionString
});

try {
  await client.connect();
  for (const statement of statements) {
    await client.query(statement);
  }
  const tableCountQuery = await client.query(
    "SELECT count(*)::int AS count FROM information_schema.tables WHERE table_schema = $1",
    [schema]
  );
  console.log(
    JSON.stringify(
      {
        ok: true,
        schema,
        table_count: Number(tableCountQuery.rows[0].count)
      },
      null,
      2
    )
  );
} finally {
  await client.end();
}
