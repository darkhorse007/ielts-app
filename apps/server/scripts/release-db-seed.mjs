#!/usr/bin/env node
import { resolve } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { randomUUID } from "node:crypto";

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
const reset = args.reset === "true";
const withSample = args.with_sample === "false" ? false : true;
const now = new Date().toISOString();

const db = new DatabaseSync(dbPath);

if (reset) {
  db.exec(`
  DELETE FROM system_action_idempotency;
  DELETE FROM stability_alerts;
  DELETE FROM stability_checkpoints;
  DELETE FROM stability_soak_runs;
  DELETE FROM beta_feedbacks;
  DELETE FROM beta_whitelist_lookup;
  DELETE FROM beta_whitelist_entries;
  DELETE FROM canary_releases;
  DELETE FROM release_gate_latest;
  `);
}

let seeded = 0;

if (withSample) {
  const whitelistId = randomUUID();
  const userId = randomUUID();
  const releaseId = "REL-S8-SEED-001";
  const lookupKey = `${userId}::${releaseId}`;
  const payload = {
    id: whitelistId,
    userId,
    releaseId,
    status: "active",
    note: "seeded beta whitelist",
    createdByUserId: userId,
    updatedByUserId: userId,
    createdAt: now,
    updatedAt: now
  };
  db.prepare(
    `INSERT OR REPLACE INTO beta_whitelist_entries
      (whitelist_id, user_id, release_id, payload_json, updated_at)
      VALUES (?, ?, ?, ?, ?)`
  ).run(whitelistId, userId, releaseId, JSON.stringify(payload), now);
  db.prepare(
    `INSERT OR REPLACE INTO beta_whitelist_lookup
      (lookup_key, whitelist_id)
      VALUES (?, ?)`
  ).run(lookupKey, whitelistId);
  seeded += 1;
}

const counts = {
  release_gate_latest: Number(db.prepare("SELECT count(*) AS c FROM release_gate_latest").get().c),
  canary_releases: Number(db.prepare("SELECT count(*) AS c FROM canary_releases").get().c),
  beta_whitelist_entries: Number(db.prepare("SELECT count(*) AS c FROM beta_whitelist_entries").get().c),
  beta_feedbacks: Number(db.prepare("SELECT count(*) AS c FROM beta_feedbacks").get().c),
  stability_soak_runs: Number(db.prepare("SELECT count(*) AS c FROM stability_soak_runs").get().c),
  stability_checkpoints: Number(db.prepare("SELECT count(*) AS c FROM stability_checkpoints").get().c),
  stability_alerts: Number(db.prepare("SELECT count(*) AS c FROM stability_alerts").get().c),
  system_action_idempotency: Number(db.prepare("SELECT count(*) AS c FROM system_action_idempotency").get().c)
};
db.close();

console.log(
  JSON.stringify(
    {
      ok: true,
      db_path: dbPath,
      reset,
      seeded,
      counts
    },
    null,
    2
  )
);
