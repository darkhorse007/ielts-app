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
  process.env.ANALYTICS_STORAGE_CONNECTION_STRING ??
  process.env.ANALYTICS_POSTGRES_URL ??
  process.env.DATABASE_URL;
const schema = (args.schema ?? process.env.ANALYTICS_STORAGE_SCHEMA ?? "public").trim();

if (!connectionString) {
  console.error(
    "missing connection string: use --connection_string or ANALYTICS_STORAGE_CONNECTION_STRING"
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
  `CREATE TABLE IF NOT EXISTS ${table("analytics_events")} (
    event_id TEXT PRIMARY KEY,
    user_id TEXT,
    event_type TEXT NOT NULL,
    created_at TEXT NOT NULL,
    payload_json TEXT NOT NULL
  )`,
  `CREATE INDEX IF NOT EXISTS analytics_events_user_created_idx ON ${table("analytics_events")} (user_id, created_at)`,
  `CREATE INDEX IF NOT EXISTS analytics_events_type_created_idx ON ${table("analytics_events")} (event_type, created_at)`
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
        table_count: 1
      },
      null,
      2
    )
  );
} finally {
  await client.end();
}
