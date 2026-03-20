#!/usr/bin/env node
import { mkdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { DatabaseSync } from "node:sqlite";

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

const args = parseArgs(process.argv.slice(2));
const dbPath = resolve(args.db_path ?? "data/release.db");
mkdirSync(dirname(dbPath), { recursive: true });

const db = new DatabaseSync(dbPath);
db.exec(`
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
`);

const tableCount = db
  .prepare("SELECT count(*) AS count FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%'")
  .get();
db.close();

console.log(
  JSON.stringify(
    {
      ok: true,
      db_path: dbPath,
      table_count: Number(tableCount.count)
    },
    null,
    2
  )
);
