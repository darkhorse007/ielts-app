import { describe, expect, test } from "vitest";
import { randomUUID } from "node:crypto";
import { Client } from "pg";
import { buildServer } from "../src/app.js";

const postgresUrl = process.env.RELEASE_TEST_POSTGRES_URL;
const runIfPostgres = postgresUrl ? test : test.skip;

const dropSchema = async (schema: string): Promise<void> => {
  const client = new Client({
    connectionString: postgresUrl
  });
  await client.connect();
  try {
    await client.query(`DROP SCHEMA IF EXISTS "${schema}" CASCADE`);
  } finally {
    await client.end();
  }
};

describe("S31 analytics postgres persistence", () => {
  test("rejects analytics postgres backend without connection string", () => {
    expect(() =>
      buildServer({
        analyticsStorageBackend: "postgres",
        analyticsStorageConnectionString: ""
      })
    ).toThrowError("ANALYTICS_POSTGRES_CONNECTION_STRING_REQUIRED");
  });

  test("rejects analytics postgres backend with invalid schema", () => {
    expect(() =>
      buildServer({
        analyticsStorageBackend: "postgres",
        analyticsStorageConnectionString: "postgres://u:p@localhost:5432/ielts",
        analyticsStorageSchema: "invalid-schema"
      })
    ).toThrowError("ANALYTICS_POSTGRES_SCHEMA_INVALID");
  });

  runIfPostgres("persists analytics events across server restarts", async () => {
    const schema = `analytics_${randomUUID().replace(/-/g, "").slice(0, 12)}`;
    const userId = randomUUID();

    let server = buildServer({
      analyticsStorageBackend: "postgres",
      analyticsStorageConnectionString: postgresUrl,
      analyticsStorageSchema: schema
    });

    try {
      await server.app.ready();
      const firstIngest = server.analyticsService.ingestBatch({
        userId,
        events: [
          {
            platform: "web",
            event_type: "onboarding_submitted",
            created_at: "2026-03-13T10:00:00.000Z"
          },
          {
            platform: "web",
            event_type: "practice_submitted",
            skill: "reading",
            created_at: "2026-03-13T10:05:00.000Z"
          }
        ]
      });
      expect(firstIngest.acceptedCount).toBe(2);
      await server.analyticsRepository.flush();
    } finally {
      await server.app.close();
    }

    server = buildServer({
      analyticsStorageBackend: "postgres",
      analyticsStorageConnectionString: postgresUrl,
      analyticsStorageSchema: schema
    });

    try {
      await server.app.ready();
      const restoredSummary = server.analyticsService.getSummary();
      expect(restoredSummary.totalEvents).toBe(2);
      expect(restoredSummary.coreCoveragePercent).toBeGreaterThan(0);
      expect(restoredSummary.byPlatform.web).toBe(2);
      expect(restoredSummary.bySkill.reading).toBe(1);

      const restoredEvents = server.analyticsRepository.analyticsEvents.filter((item) => item.userId === userId);
      expect(restoredEvents).toHaveLength(2);
      expect(restoredEvents[0]?.eventType).toBe("onboarding_submitted");
      expect(restoredEvents[1]?.eventType).toBe("practice_submitted");
    } finally {
      await server.app.close();
      await dropSchema(schema);
    }
  });
});
