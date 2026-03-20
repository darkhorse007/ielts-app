import { describe, expect, test } from "vitest";
import { randomUUID } from "node:crypto";
import { spawnSync } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Client } from "pg";

const postgresUrl = process.env.RELEASE_TEST_POSTGRES_URL;
const runIfPostgres = postgresUrl ? test : test.skip;

const runNodeScript = (script: string, args: string[]): void => {
  const result = spawnSync("node", [script, ...args], {
    cwd: process.cwd(),
    encoding: "utf-8"
  });
  if (result.status !== 0) {
    const output = `${result.stdout}\n${result.stderr}`.trim();
    throw new Error(`script failed: ${script}\n${output}`);
  }
};

describe("S8 sqlite->postgres migration scripts", () => {
  runIfPostgres("migrates sqlite release data to postgres and passes strict verification", async () => {
    const schema = `t_${randomUUID().replace(/-/g, "").slice(0, 12)}`;
    const tempDir = mkdtempSync(join(tmpdir(), "ielts-release-migrate-"));
    const sqlitePath = join(tempDir, "release.db");

    try {
      runNodeScript("scripts/release-db-migrate.mjs", [`--db_path=${sqlitePath}`]);
      runNodeScript("scripts/release-db-seed.mjs", [`--db_path=${sqlitePath}`, "--reset=true", "--with_sample=true"]);
      runNodeScript("scripts/release-db-migrate-postgres.mjs", [
        `--connection_string=${postgresUrl}`,
        `--schema=${schema}`
      ]);
      runNodeScript("scripts/release-db-migrate-sqlite-to-postgres.mjs", [
        `--sqlite_db_path=${sqlitePath}`,
        `--connection_string=${postgresUrl}`,
        `--schema=${schema}`,
        "--truncate_target=true",
        "--verify_counts=true"
      ]);
      runNodeScript("scripts/release-db-verify-sqlite-postgres.mjs", [
        `--sqlite_db_path=${sqlitePath}`,
        `--connection_string=${postgresUrl}`,
        `--schema=${schema}`,
        "--strict=true"
      ]);

      const client = new Client({
        connectionString: postgresUrl
      });
      await client.connect();
      try {
        const row = await client.query(`SELECT count(*)::int AS c FROM "${schema}"."beta_whitelist_entries"`);
        expect(Number(row.rows[0].c)).toBeGreaterThan(0);
      } finally {
        await client.end();
      }
    } finally {
      rmSync(tempDir, {
        recursive: true,
        force: true
      });
      const cleanupClient = new Client({
        connectionString: postgresUrl
      });
      await cleanupClient.connect();
      try {
        await cleanupClient.query(`DROP SCHEMA IF EXISTS "${schema}" CASCADE`);
      } finally {
        await cleanupClient.end();
      }
    }
  });
});
