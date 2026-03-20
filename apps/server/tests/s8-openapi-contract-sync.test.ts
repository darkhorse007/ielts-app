import { afterEach, beforeEach, describe, expect, test } from "vitest";
import { readFile } from "node:fs/promises";
import { buildServer } from "../src/app.js";

describe("S8 openapi contract sync", () => {
  const betaOpenApiFile = new URL("../../../docs/engineering/openapi/S8-Beta-Feedback.yaml", import.meta.url);
  const stabilityOpenApiFile = new URL("../../../docs/engineering/openapi/S8-Stability-Report.yaml", import.meta.url);
  const nextEmail = (prefix = "contract") => `${prefix}-${crypto.randomUUID()}@example.com`;

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

  const registerAndLogin = async (prefix = "contract-user"): Promise<{ userId: string; accessToken: string }> => {
    const email = nextEmail(prefix);
    const password = "StrongPass123";
    const register = await context.app.inject({
      method: "POST",
      url: "/v1/auth/register",
      payload: {
        email,
        password
      }
    });
    expect(register.statusCode).toBe(201);

    const login = await context.app.inject({
      method: "POST",
      url: "/v1/auth/login",
      payload: {
        identifier: email,
        password,
        device_id: "qa-contract"
      }
    });
    expect(login.statusCode).toBe(200);

    return {
      userId: register.json().user_id as string,
      accessToken: login.json().access_token as string
    };
  };

  test("openapi files include new routes and conflict semantics", async () => {
    const [betaDoc, stabilityDoc] = await Promise.all([
      readFile(betaOpenApiFile, "utf8"),
      readFile(stabilityOpenApiFile, "utf8")
    ]);

    expect(betaDoc).toContain("/v1/system/beta/feedback/{feedback_id}:");
    expect(betaDoc).toContain("/v1/system/beta/feedback/{feedback_id}/escalate:");
    expect(betaDoc).toContain("expected_version:");
    expect(betaDoc).toContain("BETA_WHITELIST_VERSION_CONFLICT");
    expect(betaDoc).toContain("BETA_FEEDBACK_VERSION_CONFLICT");

    expect(stabilityDoc).toContain("/v1/system/release/metrics:");
    expect(stabilityDoc).toContain("storage_resilience");
    expect(stabilityDoc).toContain("circuit_open");
    expect(stabilityDoc).toContain("alerting:");
    expect(stabilityDoc).toContain("circuit_open_threshold_ms");
    expect(stabilityDoc).toContain("recent_limit");
    expect(stabilityDoc).toContain("recent_count");
    expect(stabilityDoc).toContain("capped_count");
    expect(stabilityDoc).toContain("STABILITY_CHECKPOINT_VERSION_CONFLICT");
    expect(stabilityDoc).toContain("STABILITY_ALERT_VERSION_CONFLICT");
  });

  test("runtime responses keep key fields aligned with openapi contracts", async () => {
    const manager = await registerAndLogin("admin-contract-manager");
    const betaUser = await registerAndLogin("ops-contract-beta");
    const managerAuth = {
      authorization: `Bearer ${manager.accessToken}`
    };
    const betaAuth = {
      authorization: `Bearer ${betaUser.accessToken}`
    };

    const gate = await context.app.inject({
      method: "POST",
      url: "/v1/system/release/gate/evaluate",
      headers: managerAuth,
      payload: {
        release_id: "REL-S8-CONTRACT-001",
        p0_defects: 0,
        regression_pass_rate: 99.9,
        api_success_rate: 99.9,
        provider_healthy: true
      }
    });
    expect(gate.statusCode).toBe(200);

    const canaryPayload = {
      release_id: "REL-S8-CONTRACT-001",
      target_percent: 10,
      metrics: {
        error_rate: 0.2,
        latency_p95_ms: 1000,
        provider_healthy: true
      }
    };
    const canaryStart = await context.app.inject({
      method: "POST",
      url: "/v1/system/release/canary/start",
      headers: {
        ...managerAuth,
        "x-idempotency-key": "contract-canary-start"
      },
      payload: canaryPayload
    });
    expect(canaryStart.statusCode).toBe(201);

    const canaryReplay = await context.app.inject({
      method: "POST",
      url: "/v1/system/release/canary/start",
      headers: {
        ...managerAuth,
        "x-idempotency-key": "contract-canary-start"
      },
      payload: canaryPayload
    });
    expect(canaryReplay.statusCode).toBe(201);

    const whitelist = await context.app.inject({
      method: "PUT",
      url: `/v1/system/beta/whitelist/${betaUser.userId}`,
      headers: managerAuth,
      payload: {
        release_id: "REL-S8-CONTRACT-001",
        status: "active"
      }
    });
    expect(whitelist.statusCode).toBe(200);

    const feedback = await context.app.inject({
      method: "POST",
      url: "/v1/system/beta/feedback",
      headers: betaAuth,
      payload: {
        title: "contract feedback",
        description: "contract feedback description",
        category: "bug",
        severity: "high"
      }
    });
    expect(feedback.statusCode).toBe(201);
    const feedbackId = feedback.json().feedback_id as string;

    const feedbackById = await context.app.inject({
      method: "GET",
      url: `/v1/system/beta/feedback/${feedbackId}`,
      headers: managerAuth
    });
    expect(feedbackById.statusCode).toBe(200);
    const feedbackBody = feedbackById.json();
    expect(feedbackBody).toHaveProperty("feedback_id", feedbackId);
    expect(feedbackBody).toHaveProperty("version");
    expect(feedbackBody).toHaveProperty("priority");
    expect(feedbackBody).toHaveProperty("status");
    expect(feedbackBody).toHaveProperty("title");
    expect(feedbackBody).toHaveProperty("description");

    const metrics = await context.app.inject({
      method: "GET",
      url: "/v1/system/release/metrics",
      headers: managerAuth
    });
    expect(metrics.statusCode).toBe(200);
    const metricsBody = metrics.json();
    expect(metricsBody).toHaveProperty("idempotency.totals.attempts");
    expect(metricsBody).toHaveProperty("idempotency.totals.replay_hits");
    expect(metricsBody).toHaveProperty("idempotency.totals.conflict_count");
    expect(metricsBody).toHaveProperty("write_latency.total_writes");
    expect(metricsBody).toHaveProperty("write_latency.thresholds_ms.yellow", 400);
    expect(metricsBody).toHaveProperty("write_latency.thresholds_ms.red", 1000);
    expect(metricsBody).toHaveProperty("write_latency.alerts.yellow_count");
    expect(metricsBody).toHaveProperty("write_latency.alerts.red_count");
    expect(metricsBody).toHaveProperty("storage_resilience.backend");
    expect(metricsBody).toHaveProperty("storage_resilience.mode");
    expect(metricsBody).toHaveProperty("storage_resilience.circuit_open");
    expect(metricsBody).toHaveProperty("storage_resilience.consecutive_write_failures");
    expect(metricsBody).toHaveProperty("storage_resilience.alerting.circuit_open_threshold_ms");
    expect(metricsBody).toHaveProperty("storage_resilience.alerting.recent_limit");
    expect(metricsBody).toHaveProperty("storage_resilience.alerting.recent_count");
    expect(metricsBody).toHaveProperty("storage_resilience.alerting.capped_count");
    expect(metricsBody).toHaveProperty("storage_resilience.alerting.opened_count");
    expect(metricsBody).toHaveProperty("storage_resilience.alerting.prolonged_count");
    expect(metricsBody).toHaveProperty("storage_resilience.alerting.recovered_count");
  });
});
