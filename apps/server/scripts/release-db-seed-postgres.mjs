#!/usr/bin/env node
import { Client } from "pg";
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

const isValidIdentifier = (value) => /^[a-zA-Z_][a-zA-Z0-9_]*$/.test(value);

const args = parseArgs(process.argv.slice(2));
const connectionString = args.connection_string ?? process.env.RELEASE_STORAGE_CONNECTION_STRING ?? process.env.DATABASE_URL;
const schema = (args.schema ?? process.env.RELEASE_STORAGE_SCHEMA ?? "public").trim();
const reset = args.reset === "true";
const withSample = args.with_sample === "false" ? false : true;
const now = new Date().toISOString();

if (!connectionString) {
  console.error("missing connection string: use --connection_string or RELEASE_STORAGE_CONNECTION_STRING");
  process.exit(1);
}
if (!isValidIdentifier(schema)) {
  console.error(`invalid schema: ${schema}`);
  process.exit(1);
}

const table = (name) => `"${schema}"."${name}"`;

const client = new Client({
  connectionString
});

let seeded = 0;

try {
  await client.connect();

  if (reset) {
    await client.query(`DELETE FROM ${table("system_action_idempotency")}`);
    await client.query(`DELETE FROM ${table("stability_alerts")}`);
    await client.query(`DELETE FROM ${table("stability_checkpoints")}`);
    await client.query(`DELETE FROM ${table("stability_soak_runs")}`);
    await client.query(`DELETE FROM ${table("beta_feedbacks")}`);
    await client.query(`DELETE FROM ${table("beta_whitelist_lookup")}`);
    await client.query(`DELETE FROM ${table("beta_whitelist_entries")}`);
    await client.query(`DELETE FROM ${table("canary_releases")}`);
    await client.query(`DELETE FROM ${table("release_gate_latest")}`);
  }

  if (withSample) {
    const whitelistId = randomUUID();
    const userId = randomUUID();
    const releaseId = "REL-S8-PG-SEED-001";
    const lookupKey = `${userId}::${releaseId}`;
    const payload = {
      id: whitelistId,
      userId,
      releaseId,
      status: "active",
      note: "seeded beta whitelist by postgres script",
      createdByUserId: userId,
      updatedByUserId: userId,
      createdAt: now,
      updatedAt: now
    };
    await client.query(
      `INSERT INTO ${table("beta_whitelist_entries")}
        (whitelist_id, user_id, release_id, payload_json, updated_at)
       VALUES ($1, $2, $3, $4, $5)
       ON CONFLICT(whitelist_id)
       DO UPDATE SET
        user_id=EXCLUDED.user_id,
        release_id=EXCLUDED.release_id,
        payload_json=EXCLUDED.payload_json,
        updated_at=EXCLUDED.updated_at`,
      [whitelistId, userId, releaseId, JSON.stringify(payload), now]
    );
    await client.query(
      `INSERT INTO ${table("beta_whitelist_lookup")}
        (lookup_key, whitelist_id)
       VALUES ($1, $2)
       ON CONFLICT(lookup_key)
       DO UPDATE SET whitelist_id=EXCLUDED.whitelist_id`,
      [lookupKey, whitelistId]
    );
    seeded += 1;
  }

  const count = async (tableName) => {
    const result = await client.query(`SELECT count(*)::int AS c FROM ${table(tableName)}`);
    return Number(result.rows[0].c);
  };

  console.log(
    JSON.stringify(
      {
        ok: true,
        schema,
        reset,
        seeded,
        counts: {
          release_gate_latest: await count("release_gate_latest"),
          canary_releases: await count("canary_releases"),
          beta_whitelist_entries: await count("beta_whitelist_entries"),
          beta_feedbacks: await count("beta_feedbacks"),
          stability_soak_runs: await count("stability_soak_runs"),
          stability_checkpoints: await count("stability_checkpoints"),
          stability_alerts: await count("stability_alerts"),
          system_action_idempotency: await count("system_action_idempotency")
        }
      },
      null,
      2
    )
  );
} finally {
  await client.end();
}
