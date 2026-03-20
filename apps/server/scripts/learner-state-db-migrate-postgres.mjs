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
const connectionString =
  args.connection_string ??
  process.env.LEARNER_STATE_STORAGE_CONNECTION_STRING ??
  process.env.DATABASE_URL;
const schema = (args.schema ?? process.env.LEARNER_STATE_STORAGE_SCHEMA ?? "public").trim();

if (!connectionString) {
  console.error(
    "missing connection string: use --connection_string or LEARNER_STATE_STORAGE_CONNECTION_STRING"
  );
  process.exit(1);
}
if (!isValidIdentifier(schema)) {
  console.error(`invalid schema: ${schema}`);
  process.exit(1);
}

const table = (name) => `"${schema}"."${name}"`;

const statements = [
  `CREATE SCHEMA IF NOT EXISTS "${schema}"`,
  `CREATE TABLE IF NOT EXISTS ${table("learner_goal_profiles")} (
    goal_profile_id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL,
    assessment_id TEXT NOT NULL,
    plan_id TEXT NOT NULL,
    payload_json TEXT NOT NULL,
    updated_at TEXT NOT NULL
  )`,
  `CREATE TABLE IF NOT EXISTS ${table("learner_assessment_jobs")} (
    assessment_id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL,
    plan_id TEXT NOT NULL,
    status TEXT NOT NULL,
    payload_json TEXT NOT NULL,
    updated_at TEXT NOT NULL
  )`,
  `CREATE TABLE IF NOT EXISTS ${table("learner_study_plans")} (
    plan_id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL,
    assessment_id TEXT NOT NULL,
    status TEXT NOT NULL,
    payload_json TEXT NOT NULL,
    updated_at TEXT NOT NULL
  )`,
  `CREATE TABLE IF NOT EXISTS ${table("learner_user_progress")} (
    user_id TEXT PRIMARY KEY,
    payload_json TEXT NOT NULL,
    updated_at TEXT NOT NULL
  )`,
  `CREATE TABLE IF NOT EXISTS ${table("learner_progress_conflicts")} (
    conflict_id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL,
    created_at TEXT NOT NULL,
    payload_json TEXT NOT NULL
  )`
];

const client = new Client({
  connectionString
});

await client.connect();
try {
  for (const statement of statements) {
    await client.query(statement);
  }
  console.log(
    JSON.stringify(
      {
        ok: true,
        schema,
        table_count: 5
      },
      null,
      2
    )
  );
} finally {
  await client.end();
}
