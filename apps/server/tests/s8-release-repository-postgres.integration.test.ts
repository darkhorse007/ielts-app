import { describe, expect, test } from "vitest";
import { randomUUID } from "node:crypto";
import { Client } from "pg";
import { buildServer } from "../src/app.js";

const postgresUrl = process.env.RELEASE_TEST_POSTGRES_URL;
const runIfPostgres = postgresUrl ? test : test.skip;

describe("S8 postgres release repository integration", () => {
  runIfPostgres("persists release data across server restart", async () => {
    const schema = `t_${randomUUID().replace(/-/g, "").slice(0, 12)}`;
    const releaseId = `REL-PG-${randomUUID().slice(0, 8)}`;
    const operatorUserId = randomUUID();

    const firstServer = buildServer({
      releaseStorageBackend: "postgres",
      releaseStorageConnectionString: postgresUrl,
      releaseStorageSchema: schema
    });
    await firstServer.app.ready();

    const run = firstServer.releaseService.startStabilitySoakRun({
      releaseId,
      operatorUserId
    });
    const checkpoint = firstServer.releaseService.recordStabilityCheckpoint({
      runId: run.id,
      atHour: 72,
      crashCount: 1,
      activeSessions: 2000,
      apiSuccessRate: 99.8,
      latencyP95Ms: 1200,
      operatorUserId
    });
    expect(checkpoint.run.status).toBe("completed");

    await firstServer.app.close();

    const secondServer = buildServer({
      releaseStorageBackend: "postgres",
      releaseStorageConnectionString: postgresUrl,
      releaseStorageSchema: schema
    });
    await secondServer.app.ready();

    const restoredRun = secondServer.releaseRepository.stabilitySoakRunsById.get(run.id);
    expect(restoredRun).toBeDefined();
    expect(restoredRun?.releaseId).toBe(releaseId);

    const restoredCheckpoints = secondServer.releaseRepository.stabilityCheckpointsByRunId.get(run.id);
    expect(restoredCheckpoints?.length).toBe(1);
    expect(restoredCheckpoints?.[0]?.atHour).toBe(72);

    await secondServer.app.close();

    const client = new Client({
      connectionString: postgresUrl
    });
    await client.connect();
    try {
      await client.query(`DROP SCHEMA IF EXISTS "${schema}" CASCADE`);
    } finally {
      await client.end();
    }
  });
});
