import { describe, expect, test } from "vitest";
import { randomUUID } from "node:crypto";
import { Client } from "pg";
import { buildServer } from "../src/app.js";

const postgresUrl = process.env.RELEASE_TEST_POSTGRES_URL;
const runIfPostgres = postgresUrl ? test : test.skip;

const isWriteSql = (text: string): boolean => {
  const sql = text.trim().toUpperCase();
  return (
    sql.startsWith("INSERT") ||
    sql.startsWith("UPDATE") ||
    sql.startsWith("DELETE") ||
    sql.startsWith("BEGIN") ||
    sql.startsWith("COMMIT")
  );
};

const loginAsAdmin = async (server: ReturnType<typeof buildServer>): Promise<string> => {
  const email = `admin-pg-recovery-${randomUUID()}@example.com`;
  const password = "StrongPass123";
  const register = await server.app.inject({
    method: "POST",
    url: "/v1/auth/register",
    payload: {
      email,
      password
    }
  });
  expect(register.statusCode).toBe(201);

  const login = await server.app.inject({
    method: "POST",
    url: "/v1/auth/login",
    payload: {
      identifier: email,
      password,
      device_id: "qa-web"
    }
  });
  expect(login.statusCode).toBe(200);
  return login.json().access_token as string;
};

const evaluateGate = async (
  server: ReturnType<typeof buildServer>,
  accessToken: string,
  releaseId: string
): Promise<Awaited<ReturnType<typeof server.app.inject>>> =>
  server.app.inject({
    method: "POST",
    url: "/v1/system/release/gate/evaluate",
    headers: {
      authorization: `Bearer ${accessToken}`
    },
    payload: {
      release_id: releaseId,
      p0_defects: 0,
      regression_pass_rate: 99.9,
      api_success_rate: 99.9,
      provider_healthy: true
    }
  });

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

type PgPoolForMonkeyPatch = {
  query: (
    text: string,
    values?: Array<string | number | boolean | null>
  ) => Promise<{ rows: Array<Record<string, unknown>> }>;
};

const resolvePool = async (server: ReturnType<typeof buildServer>): Promise<PgPoolForMonkeyPatch> => {
  const repo = server.releaseRepository as unknown as {
    poolPromise: Promise<PgPoolForMonkeyPatch>;
  };
  return repo.poolPromise;
};

describe("S8 postgres release repository recovery", () => {
  runIfPostgres("rolls back in-memory state after transient write failure and recovers", async () => {
    const schema = `t_${randomUUID().replace(/-/g, "").slice(0, 12)}`;
    const previousAttempts = process.env.RELEASE_POSTGRES_WRITE_MAX_ATTEMPTS;
    process.env.RELEASE_POSTGRES_WRITE_MAX_ATTEMPTS = "1";
    const server = buildServer({
      releaseStorageBackend: "postgres",
      releaseStorageConnectionString: postgresUrl,
      releaseStorageSchema: schema
    });

    try {
      await server.app.ready();
      const accessToken = await loginAsAdmin(server);

      const pool = await resolvePool(server);
      const originalQuery = pool.query.bind(pool);
      let failNextWrite = true;
      pool.query = async (text, values) => {
        if (failNextWrite && isWriteSql(text)) {
          failNextWrite = false;
          throw new Error("SIMULATED_POSTGRES_DISCONNECT");
        }
        return originalQuery(text, values);
      };

      const failedReleaseId = "REL-PG-RECOVERY-FAIL";
      const failedGate = await evaluateGate(server, accessToken, failedReleaseId);
      expect(failedGate.statusCode).toBe(503);
      expect(failedGate.json().code).toBe("RELEASE_STORAGE_UNAVAILABLE");
      expect(server.releaseRepository.latestReleaseGateByReleaseId.has(failedReleaseId)).toBe(false);

      pool.query = originalQuery;

      const recoveredReleaseId = "REL-PG-RECOVERY-OK";
      const recoveredGate = await evaluateGate(server, accessToken, recoveredReleaseId);
      expect(recoveredGate.statusCode).toBe(200);
      expect(recoveredGate.json().passed).toBe(true);
      expect(server.releaseRepository.latestReleaseGateByReleaseId.has(recoveredReleaseId)).toBe(true);
    } finally {
      await server.app.close();
      await dropSchema(schema);
      process.env.RELEASE_POSTGRES_WRITE_MAX_ATTEMPTS = previousAttempts;
    }
  });

  runIfPostgres("retries transient write failures and succeeds within single request", async () => {
    const schema = `t_${randomUUID().replace(/-/g, "").slice(0, 12)}`;
    const server = buildServer({
      releaseStorageBackend: "postgres",
      releaseStorageConnectionString: postgresUrl,
      releaseStorageSchema: schema
    });

    try {
      await server.app.ready();
      const accessToken = await loginAsAdmin(server);

      const pool = await resolvePool(server);
      const originalQuery = pool.query.bind(pool);
      let remainingFailures = 2;
      pool.query = async (text, values) => {
        if (remainingFailures > 0 && isWriteSql(text)) {
          remainingFailures -= 1;
          const error = new Error("SIMULATED_TRANSIENT_NETWORK_ERROR");
          (error as Error & { code?: string }).code = "ECONNRESET";
          throw error;
        }
        return originalQuery(text, values);
      };

      const response = await evaluateGate(server, accessToken, "REL-PG-RETRY-OK");
      expect(response.statusCode).toBe(200);
      expect(response.json().passed).toBe(true);

      pool.query = originalQuery;
    } finally {
      await server.app.close();
      await dropSchema(schema);
    }
  });

  runIfPostgres("opens write circuit temporarily after repeated failures and auto-recovers after cooldown", async () => {
    const schema = `t_${randomUUID().replace(/-/g, "").slice(0, 12)}`;
    const previousEnv = {
      attempts: process.env.RELEASE_POSTGRES_WRITE_MAX_ATTEMPTS,
      threshold: process.env.RELEASE_POSTGRES_WRITE_CIRCUIT_FAILURE_THRESHOLD,
      cooldown: process.env.RELEASE_POSTGRES_WRITE_CIRCUIT_COOLDOWN_MS
    };
    process.env.RELEASE_POSTGRES_WRITE_MAX_ATTEMPTS = "1";
    process.env.RELEASE_POSTGRES_WRITE_CIRCUIT_FAILURE_THRESHOLD = "2";
    process.env.RELEASE_POSTGRES_WRITE_CIRCUIT_COOLDOWN_MS = "250";

    const server = buildServer({
      releaseStorageBackend: "postgres",
      releaseStorageConnectionString: postgresUrl,
      releaseStorageSchema: schema
    });

    try {
      await server.app.ready();
      const accessToken = await loginAsAdmin(server);

      const pool = await resolvePool(server);
      const originalQuery = pool.query.bind(pool);
      pool.query = async (text, values) => {
        if (isWriteSql(text)) {
          const error = new Error("SIMULATED_PERSISTENT_DISCONNECT");
          (error as Error & { code?: string }).code = "ECONNRESET";
          throw error;
        }
        return originalQuery(text, values);
      };

      const firstFailure = await evaluateGate(server, accessToken, "REL-PG-CB-01");
      expect(firstFailure.statusCode).toBe(503);
      expect(firstFailure.json().code).toBe("RELEASE_STORAGE_UNAVAILABLE");

      const secondFailure = await evaluateGate(server, accessToken, "REL-PG-CB-02");
      expect(secondFailure.statusCode).toBe(503);
      expect(secondFailure.json().code).toBe("RELEASE_STORAGE_UNAVAILABLE");

      pool.query = originalQuery;

      const fastFailure = await evaluateGate(server, accessToken, "REL-PG-CB-03");
      expect(fastFailure.statusCode).toBe(503);
      expect(fastFailure.json().code).toBe("RELEASE_STORAGE_UNAVAILABLE");

      const metricsWhenOpen = await server.app.inject({
        method: "GET",
        url: "/v1/system/release/metrics",
        headers: {
          authorization: `Bearer ${accessToken}`
        }
      });
      expect(metricsWhenOpen.statusCode).toBe(200);
      expect(metricsWhenOpen.json().storage_resilience.circuit_open).toBe(true);
      expect(metricsWhenOpen.json().storage_resilience.consecutive_write_failures).toBeGreaterThanOrEqual(2);
      expect(metricsWhenOpen.json().storage_resilience.alerting.opened_count).toBeGreaterThanOrEqual(1);

      await new Promise((resolveSleep) => {
        setTimeout(resolveSleep, 300);
      });

      const recovered = await evaluateGate(server, accessToken, "REL-PG-CB-04");
      expect(recovered.statusCode).toBe(200);
      expect(recovered.json().passed).toBe(true);

      const metricsRecovered = await server.app.inject({
        method: "GET",
        url: "/v1/system/release/metrics",
        headers: {
          authorization: `Bearer ${accessToken}`
        }
      });
      expect(metricsRecovered.statusCode).toBe(200);
      expect(metricsRecovered.json().storage_resilience.circuit_open).toBe(false);
      expect(metricsRecovered.json().storage_resilience.alerting.recovered_count).toBeGreaterThanOrEqual(1);
    } finally {
      await server.app.close();
      await dropSchema(schema);
      process.env.RELEASE_POSTGRES_WRITE_MAX_ATTEMPTS = previousEnv.attempts;
      process.env.RELEASE_POSTGRES_WRITE_CIRCUIT_FAILURE_THRESHOLD = previousEnv.threshold;
      process.env.RELEASE_POSTGRES_WRITE_CIRCUIT_COOLDOWN_MS = previousEnv.cooldown;
    }
  });
});
