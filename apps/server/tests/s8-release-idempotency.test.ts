import { afterEach, beforeEach, describe, expect, test } from "vitest";
import { buildServer } from "../src/app.js";

describe("S8 release canary/beta idempotency", () => {
  const nextEmail = (prefix = "idempotency") => `${prefix}-${crypto.randomUUID()}@example.com`;

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

  const registerAndLogin = async (prefix = "user"): Promise<{ userId: string; accessToken: string }> => {
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
        device_id: "web"
      }
    });
    expect(login.statusCode).toBe(200);
    return {
      userId: register.json().user_id as string,
      accessToken: login.json().access_token as string
    };
  };

  test("supports canary write idempotency replay and conflict protection", async () => {
    const user = await registerAndLogin("admin-canary");
    const auth = {
      authorization: `Bearer ${user.accessToken}`
    };

    const gate = await context.app.inject({
      method: "POST",
      url: "/v1/system/release/gate/evaluate",
      headers: auth,
      payload: {
        release_id: "REL-S8-IDEMPOTENCY-CANARY-001",
        p0_defects: 0,
        regression_pass_rate: 99.9,
        api_success_rate: 99.9,
        provider_healthy: true
      }
    });
    expect(gate.statusCode).toBe(200);
    expect(gate.json().passed).toBe(true);

    const canaryStartPayload = {
      release_id: "REL-S8-IDEMPOTENCY-CANARY-001",
      target_percent: 10,
      metrics: {
        error_rate: 0.2,
        latency_p95_ms: 1000,
        provider_healthy: true
      }
    };
    const canaryStartFirst = await context.app.inject({
      method: "POST",
      url: "/v1/system/release/canary/start",
      headers: {
        ...auth,
        "x-idempotency-key": "canary-start-idempotent"
      },
      payload: canaryStartPayload
    });
    expect(canaryStartFirst.statusCode).toBe(201);
    const canaryId = canaryStartFirst.json().canary_id as string;

    const canaryStartReplay = await context.app.inject({
      method: "POST",
      url: "/v1/system/release/canary/start",
      headers: {
        ...auth,
        "x-idempotency-key": "canary-start-idempotent"
      },
      payload: canaryStartPayload
    });
    expect(canaryStartReplay.statusCode).toBe(201);
    expect(canaryStartReplay.json().canary_id).toBe(canaryId);

    const canaryStartConflict = await context.app.inject({
      method: "POST",
      url: "/v1/system/release/canary/start",
      headers: {
        ...auth,
        "x-idempotency-key": "canary-start-idempotent"
      },
      payload: {
        ...canaryStartPayload,
        target_percent: 20
      }
    });
    expect(canaryStartConflict.statusCode).toBe(409);
    expect(canaryStartConflict.json().code).toBe("IDEMPOTENCY_KEY_CONFLICT");

    const promotePayload = {
      metrics: {
        error_rate: 0.1,
        latency_p95_ms: 900,
        provider_healthy: true
      }
    };
    const promoteFirst = await context.app.inject({
      method: "POST",
      url: `/v1/system/release/canary/${canaryId}/promote`,
      headers: {
        ...auth,
        "x-idempotency-key": "canary-promote-idempotent"
      },
      payload: promotePayload
    });
    expect(promoteFirst.statusCode).toBe(200);
    expect(promoteFirst.json().status).toBe("promoted");

    const promoteReplay = await context.app.inject({
      method: "POST",
      url: `/v1/system/release/canary/${canaryId}/promote`,
      headers: {
        ...auth,
        "x-idempotency-key": "canary-promote-idempotent"
      },
      payload: promotePayload
    });
    expect(promoteReplay.statusCode).toBe(200);
    expect(promoteReplay.json().canary_id).toBe(canaryId);
    expect(promoteReplay.json().status).toBe("promoted");

    const promoteConflict = await context.app.inject({
      method: "POST",
      url: `/v1/system/release/canary/${canaryId}/promote`,
      headers: {
        ...auth,
        "x-idempotency-key": "canary-promote-idempotent"
      },
      payload: {
        metrics: {
          error_rate: 0.1,
          latency_p95_ms: 1000,
          provider_healthy: true
        }
      }
    });
    expect(promoteConflict.statusCode).toBe(409);
    expect(promoteConflict.json().code).toBe("IDEMPOTENCY_KEY_CONFLICT");

    const rollbackPayload = {
      reason: "rollback for idempotency test"
    };
    const rollbackFirst = await context.app.inject({
      method: "POST",
      url: `/v1/system/release/canary/${canaryId}/rollback`,
      headers: {
        ...auth,
        "x-idempotency-key": "canary-rollback-idempotent"
      },
      payload: rollbackPayload
    });
    expect(rollbackFirst.statusCode).toBe(200);
    expect(rollbackFirst.json().status).toBe("rolled_back");

    const rollbackReplay = await context.app.inject({
      method: "POST",
      url: `/v1/system/release/canary/${canaryId}/rollback`,
      headers: {
        ...auth,
        "x-idempotency-key": "canary-rollback-idempotent"
      },
      payload: rollbackPayload
    });
    expect(rollbackReplay.statusCode).toBe(200);
    expect(rollbackReplay.json().canary_id).toBe(canaryId);
    expect(rollbackReplay.json().status).toBe("rolled_back");

    const rollbackConflict = await context.app.inject({
      method: "POST",
      url: `/v1/system/release/canary/${canaryId}/rollback`,
      headers: {
        ...auth,
        "x-idempotency-key": "canary-rollback-idempotent"
      },
      payload: {
        reason: "another reason"
      }
    });
    expect(rollbackConflict.statusCode).toBe(409);
    expect(rollbackConflict.json().code).toBe("IDEMPOTENCY_KEY_CONFLICT");
  });

  test("supports canary expected_version conflict protection", async () => {
    const user = await registerAndLogin("admin-canary-version");
    const auth = {
      authorization: `Bearer ${user.accessToken}`
    };

    const gate = await context.app.inject({
      method: "POST",
      url: "/v1/system/release/gate/evaluate",
      headers: auth,
      payload: {
        release_id: "REL-S8-CANARY-VERSION-001",
        p0_defects: 0,
        regression_pass_rate: 99.9,
        api_success_rate: 99.9,
        provider_healthy: true
      }
    });
    expect(gate.statusCode).toBe(200);

    const start = await context.app.inject({
      method: "POST",
      url: "/v1/system/release/canary/start",
      headers: auth,
      payload: {
        release_id: "REL-S8-CANARY-VERSION-001",
        target_percent: 10,
        metrics: {
          error_rate: 0.2,
          latency_p95_ms: 1000,
          provider_healthy: true
        }
      }
    });
    expect(start.statusCode).toBe(201);
    expect(start.json().version).toBe(1);
    const canaryId = start.json().canary_id as string;

    const promote = await context.app.inject({
      method: "POST",
      url: `/v1/system/release/canary/${canaryId}/promote`,
      headers: auth,
      payload: {
        metrics: {
          error_rate: 0.1,
          latency_p95_ms: 900,
          provider_healthy: true
        },
        expected_version: 1
      }
    });
    expect(promote.statusCode).toBe(200);
    expect(promote.json().version).toBe(2);

    const promoteConflict = await context.app.inject({
      method: "POST",
      url: `/v1/system/release/canary/${canaryId}/promote`,
      headers: auth,
      payload: {
        metrics: {
          error_rate: 0.1,
          latency_p95_ms: 900,
          provider_healthy: true
        },
        expected_version: 1
      }
    });
    expect(promoteConflict.statusCode).toBe(409);
    expect(promoteConflict.json().code).toBe("CANARY_VERSION_CONFLICT");

    const rollbackConflict = await context.app.inject({
      method: "POST",
      url: `/v1/system/release/canary/${canaryId}/rollback`,
      headers: auth,
      payload: {
        reason: "stale version rollback",
        expected_version: 1
      }
    });
    expect(rollbackConflict.statusCode).toBe(409);
    expect(rollbackConflict.json().code).toBe("CANARY_VERSION_CONFLICT");

    const rollback = await context.app.inject({
      method: "POST",
      url: `/v1/system/release/canary/${canaryId}/rollback`,
      headers: auth,
      payload: {
        reason: "version matched rollback",
        expected_version: 2
      }
    });
    expect(rollback.statusCode).toBe(200);
    expect(rollback.json().version).toBe(3);
  });

  test("supports beta write idempotency replay and conflict protection", async () => {
    const releaseManager = await registerAndLogin("admin-manager");
    const betaUser = await registerAndLogin("ops-beta-user");
    const managerAuth = {
      authorization: `Bearer ${releaseManager.accessToken}`
    };
    const betaAuth = {
      authorization: `Bearer ${betaUser.accessToken}`
    };

    const whitelistPayload = {
      release_id: "REL-S8-IDEMPOTENCY-BETA-001",
      status: "active",
      note: "first invite"
    };
    const whitelistFirst = await context.app.inject({
      method: "PUT",
      url: `/v1/system/beta/whitelist/${betaUser.userId}`,
      headers: {
        ...managerAuth,
        "x-idempotency-key": "beta-whitelist-idempotent"
      },
      payload: whitelistPayload
    });
    expect(whitelistFirst.statusCode).toBe(200);
    const whitelistId = whitelistFirst.json().whitelist_id as string;

    const whitelistReplay = await context.app.inject({
      method: "PUT",
      url: `/v1/system/beta/whitelist/${betaUser.userId}`,
      headers: {
        ...managerAuth,
        "x-idempotency-key": "beta-whitelist-idempotent"
      },
      payload: whitelistPayload
    });
    expect(whitelistReplay.statusCode).toBe(200);
    expect(whitelistReplay.json().whitelist_id).toBe(whitelistId);

    const whitelistConflict = await context.app.inject({
      method: "PUT",
      url: `/v1/system/beta/whitelist/${betaUser.userId}`,
      headers: {
        ...managerAuth,
        "x-idempotency-key": "beta-whitelist-idempotent"
      },
      payload: {
        ...whitelistPayload,
        note: "different note"
      }
    });
    expect(whitelistConflict.statusCode).toBe(409);
    expect(whitelistConflict.json().code).toBe("IDEMPOTENCY_KEY_CONFLICT");

    const submitPayload = {
      title: "beta submit idempotent",
      description: "submit with idempotency key",
      category: "bug",
      severity: "high",
      app_version: "ios-beta-1.0.1"
    };
    const submitFirst = await context.app.inject({
      method: "POST",
      url: "/v1/system/beta/feedback",
      headers: {
        ...betaAuth,
        "x-idempotency-key": "beta-submit-idempotent"
      },
      payload: submitPayload
    });
    expect(submitFirst.statusCode).toBe(201);
    const feedbackId = submitFirst.json().feedback_id as string;

    const submitReplay = await context.app.inject({
      method: "POST",
      url: "/v1/system/beta/feedback",
      headers: {
        ...betaAuth,
        "x-idempotency-key": "beta-submit-idempotent"
      },
      payload: submitPayload
    });
    expect(submitReplay.statusCode).toBe(201);
    expect(submitReplay.json().feedback_id).toBe(feedbackId);

    const submitConflict = await context.app.inject({
      method: "POST",
      url: "/v1/system/beta/feedback",
      headers: {
        ...betaAuth,
        "x-idempotency-key": "beta-submit-idempotent"
      },
      payload: {
        ...submitPayload,
        description: "submit with a different description"
      }
    });
    expect(submitConflict.statusCode).toBe(409);
    expect(submitConflict.json().code).toBe("IDEMPOTENCY_KEY_CONFLICT");

    const escalatePayload = {
      priority: "critical",
      reason: "urgent issue"
    };
    const escalateFirst = await context.app.inject({
      method: "POST",
      url: `/v1/system/beta/feedback/${feedbackId}/escalate`,
      headers: {
        ...managerAuth,
        "x-idempotency-key": "beta-escalate-idempotent"
      },
      payload: escalatePayload
    });
    expect(escalateFirst.statusCode).toBe(200);
    expect(escalateFirst.json().priority).toBe("critical");

    const escalateReplay = await context.app.inject({
      method: "POST",
      url: `/v1/system/beta/feedback/${feedbackId}/escalate`,
      headers: {
        ...managerAuth,
        "x-idempotency-key": "beta-escalate-idempotent"
      },
      payload: escalatePayload
    });
    expect(escalateReplay.statusCode).toBe(200);
    expect(escalateReplay.json().feedback_id).toBe(feedbackId);
    expect(escalateReplay.json().escalation_reason).toBe("urgent issue");

    const escalateConflict = await context.app.inject({
      method: "POST",
      url: `/v1/system/beta/feedback/${feedbackId}/escalate`,
      headers: {
        ...managerAuth,
        "x-idempotency-key": "beta-escalate-idempotent"
      },
      payload: {
        priority: "critical",
        reason: "another reason"
      }
    });
    expect(escalateConflict.statusCode).toBe(409);
    expect(escalateConflict.json().code).toBe("IDEMPOTENCY_KEY_CONFLICT");
  });

  test("supports beta expected_version conflict protection", async () => {
    const releaseManager = await registerAndLogin("admin-manager-version");
    const betaUser = await registerAndLogin("ops-beta-user-version");
    const managerAuth = {
      authorization: `Bearer ${releaseManager.accessToken}`
    };
    const betaAuth = {
      authorization: `Bearer ${betaUser.accessToken}`
    };

    const whitelistCreate = await context.app.inject({
      method: "PUT",
      url: `/v1/system/beta/whitelist/${betaUser.userId}`,
      headers: managerAuth,
      payload: {
        release_id: "REL-S8-BETA-VERSION-001",
        status: "active",
        note: "created"
      }
    });
    expect(whitelistCreate.statusCode).toBe(200);
    expect(whitelistCreate.json().version).toBe(1);

    const whitelistUpdate = await context.app.inject({
      method: "PUT",
      url: `/v1/system/beta/whitelist/${betaUser.userId}`,
      headers: managerAuth,
      payload: {
        release_id: "REL-S8-BETA-VERSION-001",
        status: "active",
        note: "updated once",
        expected_version: 1
      }
    });
    expect(whitelistUpdate.statusCode).toBe(200);
    expect(whitelistUpdate.json().version).toBe(2);

    const whitelistConflict = await context.app.inject({
      method: "PUT",
      url: `/v1/system/beta/whitelist/${betaUser.userId}`,
      headers: managerAuth,
      payload: {
        release_id: "REL-S8-BETA-VERSION-001",
        status: "active",
        note: "stale expected version",
        expected_version: 1
      }
    });
    expect(whitelistConflict.statusCode).toBe(409);
    expect(whitelistConflict.json().code).toBe("BETA_WHITELIST_VERSION_CONFLICT");

    const submitFeedback = await context.app.inject({
      method: "POST",
      url: "/v1/system/beta/feedback",
      headers: betaAuth,
      payload: {
        title: "beta version conflict",
        description: "feedback for expected version",
        category: "bug",
        severity: "high"
      }
    });
    expect(submitFeedback.statusCode).toBe(201);
    expect(submitFeedback.json().version).toBe(1);
    const feedbackId = submitFeedback.json().feedback_id as string;

    const escalate = await context.app.inject({
      method: "POST",
      url: `/v1/system/beta/feedback/${feedbackId}/escalate`,
      headers: managerAuth,
      payload: {
        priority: "critical",
        reason: "first escalation",
        expected_version: 1
      }
    });
    expect(escalate.statusCode).toBe(200);
    expect(escalate.json().version).toBe(2);

    const escalateConflict = await context.app.inject({
      method: "POST",
      url: `/v1/system/beta/feedback/${feedbackId}/escalate`,
      headers: managerAuth,
      payload: {
        priority: "critical",
        reason: "stale escalation",
        expected_version: 1
      }
    });
    expect(escalateConflict.statusCode).toBe(409);
    expect(escalateConflict.json().code).toBe("BETA_FEEDBACK_VERSION_CONFLICT");
  });

  test("exposes release operational metrics and beta feedback query by id", async () => {
    const releaseManager = await registerAndLogin("admin-metrics-manager");
    const betaUser = await registerAndLogin("ops-metrics-beta-user");
    const managerAuth = {
      authorization: `Bearer ${releaseManager.accessToken}`
    };
    const betaAuth = {
      authorization: `Bearer ${betaUser.accessToken}`
    };

    const gate = await context.app.inject({
      method: "POST",
      url: "/v1/system/release/gate/evaluate",
      headers: managerAuth,
      payload: {
        release_id: "REL-S8-METRICS-001",
        p0_defects: 0,
        regression_pass_rate: 99.9,
        api_success_rate: 99.9,
        provider_healthy: true
      }
    });
    expect(gate.statusCode).toBe(200);

    const startPayload = {
      release_id: "REL-S8-METRICS-001",
      target_percent: 10,
      metrics: {
        error_rate: 0.2,
        latency_p95_ms: 1000,
        provider_healthy: true
      }
    };

    const start = await context.app.inject({
      method: "POST",
      url: "/v1/system/release/canary/start",
      headers: {
        ...managerAuth,
        "x-idempotency-key": "metrics-canary-start"
      },
      payload: startPayload
    });
    expect(start.statusCode).toBe(201);

    const startReplay = await context.app.inject({
      method: "POST",
      url: "/v1/system/release/canary/start",
      headers: {
        ...managerAuth,
        "x-idempotency-key": "metrics-canary-start"
      },
      payload: startPayload
    });
    expect(startReplay.statusCode).toBe(201);

    const startConflict = await context.app.inject({
      method: "POST",
      url: "/v1/system/release/canary/start",
      headers: {
        ...managerAuth,
        "x-idempotency-key": "metrics-canary-start"
      },
      payload: {
        ...startPayload,
        target_percent: 20
      }
    });
    expect(startConflict.statusCode).toBe(409);
    expect(startConflict.json().code).toBe("IDEMPOTENCY_KEY_CONFLICT");

    const whitelist = await context.app.inject({
      method: "PUT",
      url: `/v1/system/beta/whitelist/${betaUser.userId}`,
      headers: managerAuth,
      payload: {
        release_id: "REL-S8-METRICS-001",
        status: "active"
      }
    });
    expect(whitelist.statusCode).toBe(200);

    const feedback = await context.app.inject({
      method: "POST",
      url: "/v1/system/beta/feedback",
      headers: betaAuth,
      payload: {
        title: "metrics test feedback",
        description: "verify beta feedback by id route",
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
    expect(feedbackById.json().feedback_id).toBe(feedbackId);

    const metrics = await context.app.inject({
      method: "GET",
      url: "/v1/system/release/metrics",
      headers: managerAuth
    });
    expect(metrics.statusCode).toBe(200);
    expect(metrics.json().idempotency.totals.attempts).toBeGreaterThanOrEqual(3);
    expect(metrics.json().idempotency.totals.replay_hits).toBeGreaterThanOrEqual(1);
    expect(metrics.json().idempotency.totals.conflict_count).toBeGreaterThanOrEqual(1);
    expect(metrics.json().write_latency.total_writes).toBeGreaterThan(0);
    expect(metrics.json().write_latency.thresholds_ms.yellow).toBe(400);
    expect(metrics.json().write_latency.thresholds_ms.red).toBe(1000);
    expect(metrics.json().storage_resilience.backend).toBeTruthy();
    expect(metrics.json().storage_resilience.mode).toBeTruthy();
    expect(metrics.json().storage_resilience).toHaveProperty("circuit_open");
    expect(metrics.json().storage_resilience).toHaveProperty("consecutive_write_failures");
    expect(metrics.json().storage_resilience.alerting).toHaveProperty("circuit_open_threshold_ms");
    expect(metrics.json().storage_resilience.alerting).toHaveProperty("recent_limit");
    expect(metrics.json().storage_resilience.alerting).toHaveProperty("recent_count");
    expect(metrics.json().storage_resilience.alerting).toHaveProperty("capped_count");
    expect(metrics.json().storage_resilience.alerting).toHaveProperty("opened_count");
    expect(metrics.json().storage_resilience.alerting).toHaveProperty("prolonged_count");
    expect(metrics.json().storage_resilience.alerting).toHaveProperty("recovered_count");
  });
});
