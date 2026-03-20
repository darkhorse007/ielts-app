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
  process.env.AUTH_ACCOUNT_STORAGE_CONNECTION_STRING ??
  process.env.AUTH_ACCOUNT_POSTGRES_URL ??
  process.env.DATABASE_URL;
const schema = (args.schema ?? process.env.AUTH_ACCOUNT_STORAGE_SCHEMA ?? "public").trim();

if (!connectionString) {
  console.error(
    "missing connection string: use --connection_string or AUTH_ACCOUNT_STORAGE_CONNECTION_STRING"
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
  `CREATE TABLE IF NOT EXISTS ${table("auth_users")} (
    user_id TEXT PRIMARY KEY,
    email TEXT,
    phone TEXT,
    payload_json TEXT NOT NULL,
    updated_at TEXT NOT NULL
  )`,
  `CREATE UNIQUE INDEX IF NOT EXISTS auth_users_email_unique ON ${table("auth_users")} (email) WHERE email IS NOT NULL`,
  `CREATE UNIQUE INDEX IF NOT EXISTS auth_users_phone_unique ON ${table("auth_users")} (phone) WHERE phone IS NOT NULL`,
  `CREATE TABLE IF NOT EXISTS ${table("auth_sessions")} (
    session_id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL,
    refresh_token_hash TEXT NOT NULL,
    payload_json TEXT NOT NULL,
    updated_at TEXT NOT NULL
  )`,
  `CREATE UNIQUE INDEX IF NOT EXISTS auth_sessions_refresh_hash_unique ON ${table("auth_sessions")} (refresh_token_hash)`,
  `CREATE TABLE IF NOT EXISTS ${table("auth_refresh_blacklist")} (
    token_hash TEXT PRIMARY KEY,
    expires_at TEXT NOT NULL,
    payload_json TEXT NOT NULL
  )`,
  `CREATE TABLE IF NOT EXISTS ${table("auth_failed_login_counters")} (
    identifier TEXT PRIMARY KEY,
    payload_json TEXT NOT NULL,
    updated_at TEXT NOT NULL
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
        table_count: 4
      },
      null,
      2
    )
  );
} finally {
  await client.end();
}
