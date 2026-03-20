import { describe, expect, test } from "vitest";
import { buildServer } from "../src/app.js";
import type {
  BetaFeedback,
  BetaWhitelistEntry,
  CanaryRelease,
  ReleaseGateEvaluation,
  StabilityAlert,
  StabilityCheckpoint,
  StabilitySoakRun,
  SystemActionIdempotencyRecord
} from "../src/domain/types.js";
import type { ReleaseRepository, ReleaseRepositoryWriteResilienceState } from "../src/domain/release-repository.js";

class FakeReleaseRepository implements ReleaseRepository {
  readonly latestReleaseGateByReleaseId = new Map<string, ReleaseGateEvaluation>();
  readonly canaryReleasesById = new Map<string, CanaryRelease>();
  readonly betaWhitelistEntriesById = new Map<string, BetaWhitelistEntry>();
  readonly betaWhitelistEntryIdByUserAndRelease = new Map<string, string>();
  readonly betaFeedbacksById = new Map<string, BetaFeedback>();
  readonly stabilitySoakRunsById = new Map<string, StabilitySoakRun>();
  readonly stabilityCheckpointsByRunId = new Map<string, StabilityCheckpoint[]>();
  readonly stabilityAlertsById = new Map<string, StabilityAlert>();
  readonly systemActionIdempotencyByKey = new Map<string, SystemActionIdempotencyRecord>();

  readyCalled = false;
  closeCalled = false;

  async ready(): Promise<void> {
    this.readyCalled = true;
  }

  async flush(): Promise<void> {}

  getWriteResilienceState(): ReleaseRepositoryWriteResilienceState {
    return {
      backend: "memory",
      mode: "synchronous",
      circuitOpen: false,
      circuitOpenUntil: null,
      consecutiveWriteFailures: 0,
      maxAttempts: 1,
      retryBaseDelayMs: 0,
      retryMaxDelayMs: 0,
      circuitFailureThreshold: 0,
      circuitCooldownMs: 0,
      lastError: null
    };
  }

  async close(): Promise<void> {
    this.closeCalled = true;
  }
}

class FailingFlushReleaseRepository extends FakeReleaseRepository {
  override async flush(): Promise<void> {
    throw new Error("FLUSH_FAILED");
  }
}

class FlappingCircuitReleaseRepository extends FakeReleaseRepository {
  private flushCount = 0;

  override async flush(): Promise<void> {
    this.flushCount += 1;
  }

  override getWriteResilienceState(): ReleaseRepositoryWriteResilienceState {
    const circuitOpen = this.flushCount % 2 === 1;
    return {
      backend: "postgres",
      mode: "async_buffered",
      circuitOpen,
      circuitOpenUntil: circuitOpen ? new Date(Date.now() + 5000).toISOString() : null,
      consecutiveWriteFailures: circuitOpen ? 5 : 0,
      maxAttempts: 3,
      retryBaseDelayMs: 60,
      retryMaxDelayMs: 800,
      circuitFailureThreshold: 5,
      circuitCooldownMs: 5000,
      lastError: circuitOpen ? "simulated circuit open" : null
    };
  }
}

describe("S8 release repository adapter", () => {
  test("waits repository ready on app.ready and closes repository on app.close", async () => {
    const releaseRepository = new FakeReleaseRepository();
    const server = buildServer({
      releaseRepository
    });

    await server.app.ready();
    expect(releaseRepository.readyCalled).toBe(true);

    await server.app.close();
    expect(releaseRepository.closeCalled).toBe(true);
  });

  test("rejects postgres backend without connection string", () => {
    expect(() =>
      buildServer({
        releaseStorageBackend: "postgres",
        releaseStorageConnectionString: ""
      })
    ).toThrowError("POSTGRES_CONNECTION_STRING_REQUIRED");
  });

  test("rejects postgres backend with invalid schema", () => {
    expect(() =>
      buildServer({
        releaseStorageBackend: "postgres",
        releaseStorageConnectionString: "postgres://u:p@localhost:5432/ielts",
        releaseStorageSchema: "invalid-schema"
      })
    ).toThrowError("POSTGRES_SCHEMA_INVALID");
  });

  test("returns 503 when release repository flush fails on mutating route", async () => {
    const releaseRepository = new FailingFlushReleaseRepository();
    const server = buildServer({
      releaseRepository
    });
    await server.app.ready();

    const email = `admin-flush-fail-${crypto.randomUUID()}@example.com`;
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

    const response = await server.app.inject({
      method: "POST",
      url: "/v1/system/release/gate/evaluate",
      headers: {
        authorization: `Bearer ${login.json().access_token as string}`
      },
      payload: {
        release_id: "REL-FLUSH-ERR-001",
        p0_defects: 0,
        regression_pass_rate: 99,
        api_success_rate: 99.9,
        provider_healthy: true
      }
    });
    expect(response.statusCode).toBe(503);
    expect(response.json().code).toBe("RELEASE_STORAGE_UNAVAILABLE");

    await server.app.close();
  });

  test("returns 503 on async stability write paths when flush fails", async () => {
    const releaseRepository = new FailingFlushReleaseRepository();
    const server = buildServer({
      releaseRepository
    });
    await server.app.ready();

    const email = `admin-flush-fail-async-${crypto.randomUUID()}@example.com`;
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
    const accessToken = login.json().access_token as string;

    const runId = crypto.randomUUID();
    const now = new Date().toISOString();
    releaseRepository.stabilitySoakRunsById.set(runId, {
      id: runId,
      releaseId: "REL-FLUSH-ASYNC-001",
      plannedDurationHours: 72,
      status: "running",
      startedAt: now,
      createdByUserId: register.json().user_id as string,
      createdAt: now,
      updatedAt: now
    });
    releaseRepository.stabilityCheckpointsByRunId.set(runId, []);

    const checkpointResponse = await server.app.inject({
      method: "POST",
      url: `/v1/system/stability/soak-tests/${runId}/checkpoints`,
      headers: {
        authorization: `Bearer ${accessToken}`
      },
      payload: {
        at_hour: 24,
        crash_count: 1,
        active_sessions: 1200,
        api_success_rate: 99.8,
        latency_p95_ms: 1100
      }
    });
    expect(checkpointResponse.statusCode).toBe(503);
    expect(checkpointResponse.json().code).toBe("RELEASE_STORAGE_UNAVAILABLE");

    const alertId = crypto.randomUUID();
    releaseRepository.stabilityAlertsById.set(alertId, {
      id: alertId,
      runId,
      releaseId: "REL-FLUSH-ASYNC-001",
      checkpointId: crypto.randomUUID(),
      atHour: 24,
      type: "latency_p95_ms",
      level: "yellow",
      status: "open",
      version: 1,
      threshold: 1500,
      actual: 1600,
      reason: "latency threshold exceeded",
      triggeredAt: now,
      updatedAt: now
    });

    const handleResponse = await server.app.inject({
      method: "POST",
      url: `/v1/system/stability/alerts/${alertId}/handle`,
      headers: {
        authorization: `Bearer ${accessToken}`
      },
      payload: {
        action: "acknowledge",
        note: "test flush fail"
      }
    });
    expect(handleResponse.statusCode).toBe(503);
    expect(handleResponse.json().code).toBe("RELEASE_STORAGE_UNAVAILABLE");

    await server.app.close();
  });

  test("returns 503 on async release and beta write paths when flush fails", async () => {
    const releaseRepository = new FailingFlushReleaseRepository();
    const server = buildServer({
      releaseRepository
    });
    await server.app.ready();

    const email = `admin-flush-fail-release-async-${crypto.randomUUID()}@example.com`;
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
    const accessToken = login.json().access_token as string;
    const userId = register.json().user_id as string;

    releaseRepository.latestReleaseGateByReleaseId.set("REL-FLUSH-ASYNC-002", {
      id: crypto.randomUUID(),
      releaseId: "REL-FLUSH-ASYNC-002",
      checks: [],
      passed: true,
      createdAt: new Date().toISOString()
    });

    const canaryStartResponse = await server.app.inject({
      method: "POST",
      url: "/v1/system/release/canary/start",
      headers: {
        authorization: `Bearer ${accessToken}`
      },
      payload: {
        release_id: "REL-FLUSH-ASYNC-002",
        target_percent: 10,
        metrics: {
          error_rate: 0.2,
          latency_p95_ms: 1100,
          provider_healthy: true
        }
      }
    });
    expect(canaryStartResponse.statusCode).toBe(503);
    expect(canaryStartResponse.json().code).toBe("RELEASE_STORAGE_UNAVAILABLE");

    const canaryId = Array.from(releaseRepository.canaryReleasesById.keys())[0];
    expect(canaryId).toBeTruthy();

    const canaryPromoteResponse = await server.app.inject({
      method: "POST",
      url: `/v1/system/release/canary/${canaryId}/promote`,
      headers: {
        authorization: `Bearer ${accessToken}`
      },
      payload: {
        metrics: {
          error_rate: 0.1,
          latency_p95_ms: 900,
          provider_healthy: true
        }
      }
    });
    expect(canaryPromoteResponse.statusCode).toBe(503);
    expect(canaryPromoteResponse.json().code).toBe("RELEASE_STORAGE_UNAVAILABLE");

    const canaryRollbackResponse = await server.app.inject({
      method: "POST",
      url: `/v1/system/release/canary/${canaryId}/rollback`,
      headers: {
        authorization: `Bearer ${accessToken}`
      },
      payload: {
        reason: "manual rollback"
      }
    });
    expect(canaryRollbackResponse.statusCode).toBe(503);
    expect(canaryRollbackResponse.json().code).toBe("RELEASE_STORAGE_UNAVAILABLE");

    const soakStartResponse = await server.app.inject({
      method: "POST",
      url: "/v1/system/stability/soak-tests/start",
      headers: {
        authorization: `Bearer ${accessToken}`
      },
      payload: {
        release_id: "REL-FLUSH-ASYNC-002",
        planned_duration_hours: 24
      }
    });
    expect(soakStartResponse.statusCode).toBe(503);
    expect(soakStartResponse.json().code).toBe("RELEASE_STORAGE_UNAVAILABLE");

    const whitelistResponse = await server.app.inject({
      method: "PUT",
      url: `/v1/system/beta/whitelist/${userId}`,
      headers: {
        authorization: `Bearer ${accessToken}`
      },
      payload: {
        release_id: "REL-FLUSH-ASYNC-002",
        status: "active"
      }
    });
    expect(whitelistResponse.statusCode).toBe(503);
    expect(whitelistResponse.json().code).toBe("RELEASE_STORAGE_UNAVAILABLE");

    const submitFeedbackResponse = await server.app.inject({
      method: "POST",
      url: "/v1/system/beta/feedback",
      headers: {
        authorization: `Bearer ${accessToken}`
      },
      payload: {
        title: "flush failure",
        description: "ensure submit path maps storage unavailable",
        category: "bug",
        severity: "high"
      }
    });
    expect(submitFeedbackResponse.statusCode).toBe(503);
    expect(submitFeedbackResponse.json().code).toBe("RELEASE_STORAGE_UNAVAILABLE");

    const feedbackId = Array.from(releaseRepository.betaFeedbacksById.keys())[0];
    expect(feedbackId).toBeTruthy();

    const escalateResponse = await server.app.inject({
      method: "POST",
      url: `/v1/system/beta/feedback/${feedbackId}/escalate`,
      headers: {
        authorization: `Bearer ${accessToken}`
      },
      payload: {
        priority: "critical",
        reason: "flush failure escalation"
      }
    });
    expect(escalateResponse.statusCode).toBe(503);
    expect(escalateResponse.json().code).toBe("RELEASE_STORAGE_UNAVAILABLE");

    await server.app.close();
  });

  test("caps storage resilience alert recent list with configured ring buffer limit", async () => {
    const previousLimit = process.env.RELEASE_POSTGRES_CIRCUIT_ALERT_RECENT_LIMIT;
    process.env.RELEASE_POSTGRES_CIRCUIT_ALERT_RECENT_LIMIT = "3";

    const releaseRepository = new FlappingCircuitReleaseRepository();
    const server = buildServer({
      releaseRepository
    });
    await server.app.ready();

    try {
      const email = `admin-rbac-alert-cap-${crypto.randomUUID()}@example.com`;
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
      const accessToken = login.json().access_token as string;

      for (let index = 1; index <= 6; index += 1) {
        const evaluated = await server.app.inject({
          method: "POST",
          url: "/v1/system/release/gate/evaluate",
          headers: {
            authorization: `Bearer ${accessToken}`
          },
          payload: {
            release_id: `REL-ALERT-CAP-${index}`,
            p0_defects: 0,
            regression_pass_rate: 100,
            api_success_rate: 99.9,
            provider_healthy: true
          }
        });
        expect(evaluated.statusCode).toBe(200);
      }

      const metrics = await server.app.inject({
        method: "GET",
        url: "/v1/system/release/metrics",
        headers: {
          authorization: `Bearer ${accessToken}`
        }
      });
      expect(metrics.statusCode).toBe(200);
      expect(metrics.json().storage_resilience.alerting.recent_limit).toBe(3);
      expect(metrics.json().storage_resilience.alerting.recent_count).toBe(3);
      expect(metrics.json().storage_resilience.alerting.capped_count).toBeGreaterThanOrEqual(3);

      const recent = metrics.json().storage_resilience.alerting.recent as Array<{ event: string }>;
      expect(recent).toHaveLength(3);
      expect(recent.map((item) => item.event)).toEqual([
        "circuit_recovered",
        "circuit_opened",
        "circuit_recovered"
      ]);
    } finally {
      await server.app.close();
      if (previousLimit === undefined) {
        delete process.env.RELEASE_POSTGRES_CIRCUIT_ALERT_RECENT_LIMIT;
      } else {
        process.env.RELEASE_POSTGRES_CIRCUIT_ALERT_RECENT_LIMIT = previousLimit;
      }
    }
  });
});
