import { afterEach, beforeEach, describe, expect, test } from "vitest";
import { rmSync } from "node:fs";
import { buildServer } from "../src/app.js";

describe("S8 stability soak and trend report workflow", () => {
  const nextEmail = (prefix = "stability") => `${prefix}-${crypto.randomUUID()}@example.com`;

  const build = async () => {
    const server = buildServer();
    await server.app.ready();
    return server;
  };

  let context: Awaited<ReturnType<typeof build>>;

  beforeEach(async () => {
    context = await build();
  });

  afterEach(async () => {
    await context.app.close();
  });

  const registerAndLogin = async (emailPrefix = "qa-stability"): Promise<{
    userId: string;
    accessToken: string;
  }> => {
    const email = nextEmail(emailPrefix);
    const register = await context.app.inject({
      method: "POST",
      url: "/v1/auth/register",
      payload: {
        email,
        password: "StrongPass123"
      }
    });
    expect(register.statusCode).toBe(201);
    const userId = register.json().user_id as string;

    const login = await context.app.inject({
      method: "POST",
      url: "/v1/auth/login",
      payload: {
        identifier: email,
        password: "StrongPass123",
        device_id: "qa-web"
      }
    });
    expect(login.statusCode).toBe(200);
    return {
      userId,
      accessToken: login.json().access_token as string
    };
  };

  const startRun = async (accessToken: string, releaseId: string): Promise<string> => {
    const started = await context.app.inject({
      method: "POST",
      url: "/v1/system/stability/soak-tests/start",
      headers: {
        authorization: `Bearer ${accessToken}`
      },
      payload: {
        release_id: releaseId,
        planned_duration_hours: 72
      }
    });
    expect(started.statusCode).toBe(201);
    return started.json().run_id as string;
  };

  const checkpoint = async (
    accessToken: string,
    runId: string,
    payload: {
      at_hour: number;
      crash_count: number;
      active_sessions: number;
      api_success_rate: number;
      latency_p95_ms: number;
    }
  ) => {
    return context.app.inject({
      method: "POST",
      url: `/v1/system/stability/soak-tests/${runId}/checkpoints`,
      headers: {
        authorization: `Bearer ${accessToken}`
      },
      payload
    });
  };

  test("supports 72h soak run, trend report generation and historical release comparison", async () => {
    const qa = await registerAndLogin();
    const baselineRunId = await startRun(qa.accessToken, "REL-S7-STABLE-001");
    const targetRunId = await startRun(qa.accessToken, "REL-S8-STABLE-001");

    for (const item of [
      { at_hour: 24, crash_count: 3, active_sessions: 1500, api_success_rate: 99.1, latency_p95_ms: 1450 },
      { at_hour: 48, crash_count: 4, active_sessions: 1400, api_success_rate: 99.0, latency_p95_ms: 1520 },
      { at_hour: 72, crash_count: 5, active_sessions: 1300, api_success_rate: 98.8, latency_p95_ms: 1600 }
    ]) {
      const response = await checkpoint(qa.accessToken, baselineRunId, item);
      expect(response.statusCode).toBe(201);
    }

    for (const item of [
      { at_hour: 24, crash_count: 1, active_sessions: 2000, api_success_rate: 99.7, latency_p95_ms: 1150 },
      { at_hour: 48, crash_count: 1, active_sessions: 2100, api_success_rate: 99.8, latency_p95_ms: 1080 },
      { at_hour: 72, crash_count: 2, active_sessions: 2200, api_success_rate: 99.6, latency_p95_ms: 1180 }
    ]) {
      const response = await checkpoint(qa.accessToken, targetRunId, item);
      expect(response.statusCode).toBe(201);
    }

    const report = await context.app.inject({
      method: "GET",
      url: `/v1/system/stability/soak-tests/${targetRunId}/report`,
      headers: {
        authorization: `Bearer ${qa.accessToken}`
      }
    });
    expect(report.statusCode).toBe(200);
    expect(report.json().run.status).toBe("completed");
    expect(report.json().summary.checkpoint_count).toBe(3);
    expect(report.json().summary.total_crashes).toBe(4);
    expect(report.json().trend.length).toBe(3);

    const compare = await context.app.inject({
      method: "GET",
      url: "/v1/system/stability/reports/compare?baseline_release_id=REL-S7-STABLE-001&target_release_id=REL-S8-STABLE-001",
      headers: {
        authorization: `Bearer ${qa.accessToken}`
      }
    });
    expect(compare.statusCode).toBe(200);
    expect(compare.json().conclusion).toBe("improved");
    expect(compare.json().delta.total_crashes).toBeLessThan(0);
    expect(compare.json().delta.avg_latency_p95_ms).toBeLessThan(0);

    const exported = await context.app.inject({
      method: "GET",
      url: "/v1/system/stability/reports/export?baseline_release_id=REL-S7-STABLE-001&target_release_id=REL-S8-STABLE-001",
      headers: {
        authorization: `Bearer ${qa.accessToken}`
      }
    });
    expect(exported.statusCode).toBe(200);
    expect(exported.json().filename).toContain("stability-report-REL-S7-STABLE-001-to-REL-S8-STABLE-001");
    expect(exported.json().content).toContain("metric,baseline,target,delta");

    const alerts = await context.app.inject({
      method: "GET",
      url: `/v1/system/stability/alerts?run_id=${baselineRunId}&status=open`,
      headers: {
        authorization: `Bearer ${qa.accessToken}`
      }
    });
    expect(alerts.statusCode).toBe(200);
    expect(alerts.json().total).toBeGreaterThan(0);
    const alertId = alerts.json().items[0].alert_id as string;

    const handled = await context.app.inject({
      method: "POST",
      url: `/v1/system/stability/alerts/${alertId}/handle`,
      headers: {
        authorization: `Bearer ${qa.accessToken}`
      },
      payload: {
        action: "acknowledge",
        note: "ack in drill"
      }
    });
    expect(handled.statusCode).toBe(200);
    expect(handled.json().status).toBe("acknowledged");

    const audit = await context.app.inject({
      method: "GET",
      url: "/internal/audit-events"
    });
    expect(audit.statusCode).toBe(200);
    const types = (audit.json().items as Array<{ type: string }>).map((item) => item.type);
    expect(types).toContain("stability_soak_started");
    expect(types).toContain("stability_soak_checkpoint_recorded");
    expect(types).toContain("stability_report_generated");
    expect(types).toContain("stability_report_compared");
    expect(types).toContain("stability_report_exported");
    expect(types).toContain("stability_alert_triggered");
    expect(types).toContain("stability_alert_handled");
  });

  test("handles stability run/report not-found and conflict paths", async () => {
    const qa = await registerAndLogin();
    const runId = await startRun(qa.accessToken, "REL-S8-STABLE-ERR-001");

    const notReady = await context.app.inject({
      method: "GET",
      url: `/v1/system/stability/soak-tests/${runId}/report`,
      headers: {
        authorization: `Bearer ${qa.accessToken}`
      }
    });
    expect(notReady.statusCode).toBe(409);
    expect(notReady.json().code).toBe("STABILITY_REPORT_NOT_READY");

    const outOfRange = await checkpoint(qa.accessToken, runId, {
      at_hour: 80,
      crash_count: 1,
      active_sessions: 1000,
      api_success_rate: 99.8,
      latency_p95_ms: 1000
    });
    expect(outOfRange.statusCode).toBe(409);
    expect(outOfRange.json().code).toBe("STABILITY_CHECKPOINT_OUT_OF_RANGE");

    const completeRun = await checkpoint(qa.accessToken, runId, {
      at_hour: 72,
      crash_count: 2,
      active_sessions: 1800,
      api_success_rate: 99.6,
      latency_p95_ms: 1200
    });
    expect(completeRun.statusCode).toBe(201);
    expect(completeRun.json().run_status).toBe("completed");

    const notRunning = await checkpoint(qa.accessToken, runId, {
      at_hour: 24,
      crash_count: 2,
      active_sessions: 1700,
      api_success_rate: 99.5,
      latency_p95_ms: 1250
    });
    expect(notRunning.statusCode).toBe(409);
    expect(notRunning.json().code).toBe("STABILITY_SOAK_RUN_NOT_RUNNING");

    const missingRun = await context.app.inject({
      method: "POST",
      url: `/v1/system/stability/soak-tests/${crypto.randomUUID()}/checkpoints`,
      headers: {
        authorization: `Bearer ${qa.accessToken}`
      },
      payload: {
        at_hour: 24,
        crash_count: 1,
        active_sessions: 1200,
        api_success_rate: 99.5,
        latency_p95_ms: 1180
      }
    });
    expect(missingRun.statusCode).toBe(404);
    expect(missingRun.json().code).toBe("STABILITY_SOAK_RUN_NOT_FOUND");

    const reportMissingRun = await context.app.inject({
      method: "GET",
      url: `/v1/system/stability/soak-tests/${crypto.randomUUID()}/report`,
      headers: {
        authorization: `Bearer ${qa.accessToken}`
      }
    });
    expect(reportMissingRun.statusCode).toBe(404);
    expect(reportMissingRun.json().code).toBe("STABILITY_SOAK_RUN_NOT_FOUND");

    const compareMissingRelease = await context.app.inject({
      method: "GET",
      url: "/v1/system/stability/reports/compare?baseline_release_id=REL-S7-MISSING&target_release_id=REL-S8-STABLE-ERR-001",
      headers: {
        authorization: `Bearer ${qa.accessToken}`
      }
    });
    expect(compareMissingRelease.statusCode).toBe(404);
    expect(compareMissingRelease.json().code).toBe("STABILITY_REPORT_NOT_FOUND");

    const exportMissingRelease = await context.app.inject({
      method: "GET",
      url: "/v1/system/stability/reports/export?baseline_release_id=REL-S7-MISSING&target_release_id=REL-S8-STABLE-ERR-001",
      headers: {
        authorization: `Bearer ${qa.accessToken}`
      }
    });
    expect(exportMissingRelease.statusCode).toBe(404);
    expect(exportMissingRelease.json().code).toBe("STABILITY_REPORT_NOT_FOUND");

    const handleMissingAlert = await context.app.inject({
      method: "POST",
      url: `/v1/system/stability/alerts/${crypto.randomUUID()}/handle`,
      headers: {
        authorization: `Bearer ${qa.accessToken}`
      },
      payload: {
        action: "resolve",
        note: "manual resolve"
      }
    });
    expect(handleMissingAlert.statusCode).toBe(404);
    expect(handleMissingAlert.json().code).toBe("STABILITY_ALERT_NOT_FOUND");
  });

  test("dedupes checkpoint alerts on overwrite and enforces resolved alert conflict", async () => {
    const qa = await registerAndLogin();
    const runId = await startRun(qa.accessToken, "REL-S8-STABLE-DEDUPE-001");

    const firstCheckpoint = await checkpoint(qa.accessToken, runId, {
      at_hour: 24,
      crash_count: 2,
      active_sessions: 2100,
      api_success_rate: 98.8,
      latency_p95_ms: 2700
    });
    expect(firstCheckpoint.statusCode).toBe(201);
    expect(firstCheckpoint.json().alerts.length).toBeGreaterThan(0);
    const checkpointId = firstCheckpoint.json().checkpoint_id as string;

    const firstAlertList = await context.app.inject({
      method: "GET",
      url: `/v1/system/stability/alerts?run_id=${runId}&status=open`,
      headers: {
        authorization: `Bearer ${qa.accessToken}`
      }
    });
    expect(firstAlertList.statusCode).toBe(200);
    expect(firstAlertList.json().total).toBe(2);
    const firstAlertIds = new Set<string>(
      (firstAlertList.json().items as Array<{ alert_id: string }>).map((item) => item.alert_id)
    );

    const overwriteHealthy = await checkpoint(qa.accessToken, runId, {
      at_hour: 24,
      crash_count: 0,
      active_sessions: 2300,
      api_success_rate: 99.9,
      latency_p95_ms: 1100
    });
    expect(overwriteHealthy.statusCode).toBe(201);
    expect(overwriteHealthy.json().checkpoint_id).toBe(checkpointId);
    expect(overwriteHealthy.json().alerts).toHaveLength(0);

    const afterHealthyList = await context.app.inject({
      method: "GET",
      url: `/v1/system/stability/alerts?run_id=${runId}&status=open`,
      headers: {
        authorization: `Bearer ${qa.accessToken}`
      }
    });
    expect(afterHealthyList.statusCode).toBe(200);
    expect(afterHealthyList.json().total).toBe(0);

    const overwriteDegraded = await checkpoint(qa.accessToken, runId, {
      at_hour: 24,
      crash_count: 1,
      active_sessions: 2300,
      api_success_rate: 99.7,
      latency_p95_ms: 1800
    });
    expect(overwriteDegraded.statusCode).toBe(201);
    expect(overwriteDegraded.json().checkpoint_id).toBe(checkpointId);
    expect(overwriteDegraded.json().alerts).toHaveLength(1);

    const degradedList = await context.app.inject({
      method: "GET",
      url: `/v1/system/stability/alerts?run_id=${runId}&status=open`,
      headers: {
        authorization: `Bearer ${qa.accessToken}`
      }
    });
    expect(degradedList.statusCode).toBe(200);
    expect(degradedList.json().total).toBe(1);
    const alertId = degradedList.json().items[0].alert_id as string;
    expect(firstAlertIds.has(alertId)).toBe(false);

    const acknowledged = await context.app.inject({
      method: "POST",
      url: `/v1/system/stability/alerts/${alertId}/handle`,
      headers: {
        authorization: `Bearer ${qa.accessToken}`
      },
      payload: {
        action: "acknowledge",
        note: "ack after overwrite"
      }
    });
    expect(acknowledged.statusCode).toBe(200);
    expect(acknowledged.json().status).toBe("acknowledged");

    const resolved = await context.app.inject({
      method: "POST",
      url: `/v1/system/stability/alerts/${alertId}/handle`,
      headers: {
        authorization: `Bearer ${qa.accessToken}`
      },
      payload: {
        action: "resolve",
        note: "resolved after ack"
      }
    });
    expect(resolved.statusCode).toBe(200);
    expect(resolved.json().status).toBe("resolved");

    const resolveAgain = await context.app.inject({
      method: "POST",
      url: `/v1/system/stability/alerts/${alertId}/handle`,
      headers: {
        authorization: `Bearer ${qa.accessToken}`
      },
      payload: {
        action: "acknowledge",
        note: "should conflict"
      }
    });
    expect(resolveAgain.statusCode).toBe(409);
    expect(resolveAgain.json().code).toBe("STABILITY_ALERT_ALREADY_RESOLVED");

    const resolvedList = await context.app.inject({
      method: "GET",
      url: `/v1/system/stability/alerts?run_id=${runId}&status=resolved`,
      headers: {
        authorization: `Bearer ${qa.accessToken}`
      }
    });
    expect(resolvedList.statusCode).toBe(200);
    expect(resolvedList.json().total).toBe(1);
  });

  test("enforces system RBAC when enabled", async () => {
    const secured = buildServer({
      systemRbacEnforced: true
    });
    await secured.app.ready();

    const registerAndLoginWithServer = async (prefix: string): Promise<{ userId: string; accessToken: string }> => {
      const email = nextEmail(prefix);
      const register = await secured.app.inject({
        method: "POST",
        url: "/v1/auth/register",
        payload: {
          email,
          password: "StrongPass123"
        }
      });
      expect(register.statusCode).toBe(201);
      const userId = register.json().user_id as string;
      const login = await secured.app.inject({
        method: "POST",
        url: "/v1/auth/login",
        payload: {
          identifier: email,
          password: "StrongPass123",
          device_id: "qa-web"
        }
      });
      expect(login.statusCode).toBe(200);
      return {
        userId,
        accessToken: login.json().access_token as string
      };
    };

    const learner = await registerAndLoginWithServer("learner");
    const forbidden = await secured.app.inject({
      method: "POST",
      url: "/v1/system/stability/soak-tests/start",
      headers: {
        authorization: `Bearer ${learner.accessToken}`
      },
      payload: {
        release_id: "REL-S8-RBAC-001",
        planned_duration_hours: 72
      }
    });
    expect(forbidden.statusCode).toBe(403);
    expect(forbidden.json().code).toBe("FORBIDDEN");

    const qa = await registerAndLoginWithServer("qa");
    const allowed = await secured.app.inject({
      method: "POST",
      url: "/v1/system/stability/soak-tests/start",
      headers: {
        authorization: `Bearer ${qa.accessToken}`
      },
      payload: {
        release_id: "REL-S8-RBAC-002",
        planned_duration_hours: 72
      }
    });
    expect(allowed.statusCode).toBe(201);

    const qaManageRoleForbidden = await secured.app.inject({
      method: "PUT",
      url: `/v1/system/users/${learner.userId}/roles`,
      headers: {
        authorization: `Bearer ${qa.accessToken}`
      },
      payload: {
        roles: ["qa"]
      }
    });
    expect(qaManageRoleForbidden.statusCode).toBe(403);

    const admin = await registerAndLoginWithServer("admin");
    const setRoles = await secured.app.inject({
      method: "PUT",
      url: `/v1/system/users/${learner.userId}/roles`,
      headers: {
        authorization: `Bearer ${admin.accessToken}`
      },
      payload: {
        roles: ["qa"]
      }
    });
    expect(setRoles.statusCode).toBe(200);
    expect(setRoles.json().roles).toContain("qa");
    expect(setRoles.json().roles).toContain("learner");

    const getRoles = await secured.app.inject({
      method: "GET",
      url: `/v1/system/users/${learner.userId}/roles`,
      headers: {
        authorization: `Bearer ${admin.accessToken}`
      }
    });
    expect(getRoles.statusCode).toBe(200);
    expect(getRoles.json().roles).toContain("qa");

    await secured.app.close();
  });

  test("supports idempotency key replay and version conflict protection", async () => {
    const qa = await registerAndLogin("qa");
    const runId = await startRun(qa.accessToken, "REL-S8-IDEMPOTENCY-001");

    const first = await context.app.inject({
      method: "POST",
      url: `/v1/system/stability/soak-tests/${runId}/checkpoints`,
      headers: {
        authorization: `Bearer ${qa.accessToken}`,
        "x-idempotency-key": "cp-24-idempotent"
      },
      payload: {
        at_hour: 24,
        crash_count: 1,
        active_sessions: 2000,
        api_success_rate: 99.7,
        latency_p95_ms: 1700
      }
    });
    expect(first.statusCode).toBe(201);
    expect(first.json().version).toBe(1);

    const replay = await context.app.inject({
      method: "POST",
      url: `/v1/system/stability/soak-tests/${runId}/checkpoints`,
      headers: {
        authorization: `Bearer ${qa.accessToken}`,
        "x-idempotency-key": "cp-24-idempotent"
      },
      payload: {
        at_hour: 24,
        crash_count: 1,
        active_sessions: 2000,
        api_success_rate: 99.7,
        latency_p95_ms: 1700
      }
    });
    expect(replay.statusCode).toBe(201);
    expect(replay.json().checkpoint_id).toBe(first.json().checkpoint_id);
    expect(replay.json().version).toBe(1);

    const replayConflict = await context.app.inject({
      method: "POST",
      url: `/v1/system/stability/soak-tests/${runId}/checkpoints`,
      headers: {
        authorization: `Bearer ${qa.accessToken}`,
        "x-idempotency-key": "cp-24-idempotent"
      },
      payload: {
        at_hour: 24,
        crash_count: 9,
        active_sessions: 2000,
        api_success_rate: 99.7,
        latency_p95_ms: 1700
      }
    });
    expect(replayConflict.statusCode).toBe(409);
    expect(replayConflict.json().code).toBe("IDEMPOTENCY_KEY_CONFLICT");

    const versionConflict = await context.app.inject({
      method: "POST",
      url: `/v1/system/stability/soak-tests/${runId}/checkpoints`,
      headers: {
        authorization: `Bearer ${qa.accessToken}`
      },
      payload: {
        at_hour: 24,
        crash_count: 2,
        active_sessions: 2100,
        api_success_rate: 99.6,
        latency_p95_ms: 1800,
        expected_version: 99
      }
    });
    expect(versionConflict.statusCode).toBe(409);
    expect(versionConflict.json().code).toBe("STABILITY_CHECKPOINT_VERSION_CONFLICT");
  });

  test("persists stability data when sqlite release repository is enabled", async () => {
    const dbPath = `/tmp/ielts-release-${crypto.randomUUID()}.db`;
    const firstServer = buildServer({
      releaseStorageBackend: "sqlite",
      releaseStoragePath: dbPath
    });
    await firstServer.app.ready();

    const firstEmail = nextEmail("qa");
    await firstServer.app.inject({
      method: "POST",
      url: "/v1/auth/register",
      payload: {
        email: firstEmail,
        password: "StrongPass123"
      }
    });
    const firstLogin = await firstServer.app.inject({
      method: "POST",
      url: "/v1/auth/login",
      payload: {
        identifier: firstEmail,
        password: "StrongPass123",
        device_id: "qa-web"
      }
    });
    expect(firstLogin.statusCode).toBe(200);
    const firstToken = firstLogin.json().access_token as string;

    const started = await firstServer.app.inject({
      method: "POST",
      url: "/v1/system/stability/soak-tests/start",
      headers: {
        authorization: `Bearer ${firstToken}`
      },
      payload: {
        release_id: "REL-S8-PERSIST-001",
        planned_duration_hours: 72
      }
    });
    expect(started.statusCode).toBe(201);
    const runId = started.json().run_id as string;

    const recorded = await firstServer.app.inject({
      method: "POST",
      url: `/v1/system/stability/soak-tests/${runId}/checkpoints`,
      headers: {
        authorization: `Bearer ${firstToken}`
      },
      payload: {
        at_hour: 24,
        crash_count: 1,
        active_sessions: 2000,
        api_success_rate: 99.7,
        latency_p95_ms: 1700
      }
    });
    expect(recorded.statusCode).toBe(201);
    await firstServer.app.close();

    const secondServer = buildServer({
      releaseStorageBackend: "sqlite",
      releaseStoragePath: dbPath
    });
    await secondServer.app.ready();

    const secondEmail = nextEmail("qa");
    await secondServer.app.inject({
      method: "POST",
      url: "/v1/auth/register",
      payload: {
        email: secondEmail,
        password: "StrongPass123"
      }
    });
    const secondLogin = await secondServer.app.inject({
      method: "POST",
      url: "/v1/auth/login",
      payload: {
        identifier: secondEmail,
        password: "StrongPass123",
        device_id: "qa-web"
      }
    });
    expect(secondLogin.statusCode).toBe(200);
    const secondToken = secondLogin.json().access_token as string;

    const listed = await secondServer.app.inject({
      method: "GET",
      url: `/v1/system/stability/alerts?run_id=${runId}&status=open`,
      headers: {
        authorization: `Bearer ${secondToken}`
      }
    });
    expect(listed.statusCode).toBe(200);
    expect(listed.json().total).toBeGreaterThan(0);

    await secondServer.app.close();
    rmSync(dbPath, { force: true });
  });
});
