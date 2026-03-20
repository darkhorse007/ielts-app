import { afterEach, beforeEach, describe, expect, test } from "vitest";
import { randomUUID } from "node:crypto";
import { buildServer } from "../src/app.js";

describe("S6 observability/release/admin user-content management", () => {
  const nextEmail = () => `admin-candidate-${crypto.randomUUID()}@example.com`;

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

  const registerAndLogin = async () => {
    const email = nextEmail();
    const register = await context.app.inject({
      method: "POST",
      url: "/v1/auth/register",
      payload: {
        email,
        password: "StrongPass123"
      }
    });
    expect(register.statusCode).toBe(201);

    const login = await context.app.inject({
      method: "POST",
      url: "/v1/auth/login",
      payload: {
        identifier: email,
        password: "StrongPass123",
        device_id: "android"
      }
    });
    expect(login.statusCode).toBe(200);
    const body = login.json() as {
      access_token: string;
      user_id: string;
    };
    return {
      ...body,
      email
    };
  };

  test("supports analytics observability and release gate/canary workflow", async () => {
    const user = await registerAndLogin();

    const batch = await context.app.inject({
      method: "POST",
      url: "/v1/analytics/events/batch",
      headers: {
        authorization: `Bearer ${user.access_token}`
      },
      payload: {
        events: [
          {
            platform: "windows",
            event_type: "onboarding_submitted",
            trace_id: "trace-01",
            skill: "listening",
            provider_name: "primary-llm",
            latency_ms: 800,
            success: true
          },
          {
            platform: "macos",
            event_type: "diagnostic_completed",
            trace_id: "trace-02",
            skill: "speaking",
            provider_name: "primary-llm",
            latency_ms: 900,
            success: true
          },
          {
            platform: "ios",
            event_type: "practice_submitted",
            trace_id: "trace-03",
            skill: "reading",
            provider_name: "primary-llm",
            latency_ms: 1200,
            success: true
          },
          {
            platform: "android",
            event_type: "speaking_turn_scored",
            trace_id: "trace-04",
            skill: "speaking",
            provider_name: "fallback-llm",
            latency_ms: 3500,
            success: false,
            fallback_triggered: true
          },
          {
            platform: "web",
            event_type: "writing_evaluated",
            trace_id: "trace-05",
            skill: "writing",
            provider_name: "primary-llm",
            latency_ms: 1100,
            success: true
          },
          {
            platform: "windows",
            event_type: "mock_exam_submitted",
            trace_id: "trace-06",
            provider_name: "primary-llm",
            latency_ms: 1500,
            success: true
          },
          {
            platform: "ios",
            event_type: "subscription_upgraded",
            trace_id: "trace-07",
            provider_name: "primary-llm",
            latency_ms: 600,
            success: true
          },
          {
            platform: "android",
            event_type: "admin_adjustment",
            trace_id: "trace-08",
            provider_name: "primary-llm",
            latency_ms: 700,
            success: true
          }
        ]
      }
    });
    expect(batch.statusCode).toBe(202);
    expect(batch.json().accepted_count).toBe(8);
    expect(batch.json().core_coverage_percent).toBeGreaterThanOrEqual(95);

    const upsertExperiment = await context.app.inject({
      method: "PUT",
      url: "/v1/analytics/experiments/paywall_copy_v1",
      headers: {
        authorization: `Bearer ${user.access_token}`
      },
      payload: {
        name: "Paywall Copy Test",
        status: "running",
        traffic_percent: 100,
        variants: [
          {
            key: "control",
            label: "Control",
            weight: 50
          },
          {
            key: "treatment",
            label: "Treatment",
            weight: 50
          }
        ],
        metric_event_type: "subscription_upgraded",
        stop_condition: {
          min_sample_size: 1,
          target_lift_percent: 0,
          max_duration_days: 14
        }
      }
    });
    expect(upsertExperiment.statusCode).toBe(200);
    expect(upsertExperiment.json().key).toBe("paywall_copy_v1");

    const assignment = await context.app.inject({
      method: "GET",
      url: "/v1/analytics/experiments/paywall_copy_v1/assignment",
      headers: {
        authorization: `Bearer ${user.access_token}`
      }
    });
    expect(assignment.statusCode).toBe(200);
    expect(assignment.json().experiment_key).toBe("paywall_copy_v1");

    const exposure = await context.app.inject({
      method: "POST",
      url: "/v1/analytics/events/batch",
      headers: {
        authorization: `Bearer ${user.access_token}`
      },
      payload: {
        events: [
          {
            platform: "ios",
            event_type: "experiment_exposure",
            trace_id: "exp-trace-1",
            metadata: {
              experiment_key: "paywall_copy_v1",
              experiment_variant: assignment.json().variant_key
            }
          },
          {
            platform: "ios",
            event_type: "subscription_upgraded",
            trace_id: "exp-trace-2",
            metadata: {
              experiment_key: "paywall_copy_v1",
              experiment_variant: assignment.json().variant_key
            }
          }
        ]
      }
    });
    expect(exposure.statusCode).toBe(202);
    expect(exposure.json().accepted_count).toBe(2);

    const experiments = await context.app.inject({
      method: "GET",
      url: "/v1/analytics/experiments?status=running",
      headers: {
        authorization: `Bearer ${user.access_token}`
      }
    });
    expect(experiments.statusCode).toBe(200);
    expect(experiments.json().total).toBeGreaterThanOrEqual(1);
    expect(experiments.json().items[0].metrics.sample_size).toBeGreaterThanOrEqual(1);
    expect(typeof experiments.json().items[0].stop_recommendation.should_stop).toBe("boolean");

    const stopExperiment = await context.app.inject({
      method: "POST",
      url: "/v1/analytics/experiments/paywall_copy_v1/stop",
      headers: {
        authorization: `Bearer ${user.access_token}`
      },
      payload: {
        reason: "manual stop after quick check"
      }
    });
    expect(stopExperiment.statusCode).toBe(200);
    expect(stopExperiment.json().status).toBe("stopped");

    const summary = await context.app.inject({
      method: "GET",
      url: "/v1/analytics/summary?platform=windows",
      headers: {
        authorization: `Bearer ${user.access_token}`
      }
    });
    expect(summary.statusCode).toBe(200);
    expect(summary.json().total_events).toBeGreaterThanOrEqual(2);
    expect(summary.json().field_completeness_percent).toBeGreaterThanOrEqual(95);

    const health = await context.app.inject({
      method: "GET",
      url: "/v1/system/health/providers",
      headers: {
        authorization: `Bearer ${user.access_token}`
      }
    });
    expect(health.statusCode).toBe(200);
    expect(health.json().providers.length).toBeGreaterThanOrEqual(1);
    expect(Array.isArray(health.json().providers[0].recent_traces)).toBe(true);

    const gate = await context.app.inject({
      method: "POST",
      url: "/v1/system/release/gate/evaluate",
      headers: {
        authorization: `Bearer ${user.access_token}`
      },
      payload: {
        release_id: "REL-S6-001",
        p0_defects: 0,
        regression_pass_rate: 100,
        api_success_rate: 99.9,
        provider_healthy: true
      }
    });
    expect(gate.statusCode).toBe(200);
    expect(gate.json().passed).toBe(true);

    const canaryStart = await context.app.inject({
      method: "POST",
      url: "/v1/system/release/canary/start",
      headers: {
        authorization: `Bearer ${user.access_token}`
      },
      payload: {
        release_id: "REL-S6-001",
        target_percent: 10,
        metrics: {
          error_rate: 0.3,
          latency_p95_ms: 1200,
          provider_healthy: true
        }
      }
    });
    expect(canaryStart.statusCode).toBe(201);
    const canaryId = canaryStart.json().canary_id as string;

    const promote = await context.app.inject({
      method: "POST",
      url: `/v1/system/release/canary/${canaryId}/promote`,
      headers: {
        authorization: `Bearer ${user.access_token}`
      },
      payload: {
        metrics: {
          error_rate: 0.2,
          latency_p95_ms: 1000,
          provider_healthy: true
        }
      }
    });
    expect(promote.statusCode).toBe(200);
    expect(promote.json().status).toBe("promoted");

    const rollback = await context.app.inject({
      method: "POST",
      url: `/v1/system/release/canary/${canaryId}/rollback`,
      headers: {
        authorization: `Bearer ${user.access_token}`
      },
      payload: {
        reason: "manual rollback drill"
      }
    });
    expect(rollback.statusCode).toBe(200);
    expect(rollback.json().status).toBe("rolled_back");
  });

  test("supports admin user freeze/unfreeze, content publish lifecycle and audit query", async () => {
    const user = await registerAndLogin();

    const admin = await context.app.inject({
      method: "POST",
      url: "/v1/admin/auth/login",
      payload: {
        email: "ops@example.com",
        password: "OpsPass123"
      }
    });
    expect(admin.statusCode).toBe(200);
    const adminToken = admin.json().access_token as string;

    const listUsers = await context.app.inject({
      method: "GET",
      url: `/v1/admin/users?email=${encodeURIComponent(user.email)}`,
      headers: {
        authorization: `Bearer ${adminToken}`
      }
    });
    expect(listUsers.statusCode).toBe(200);
    expect(listUsers.json().items.length).toBeGreaterThanOrEqual(1);

    const freeze = await context.app.inject({
      method: "POST",
      url: `/v1/admin/users/${user.user_id}/freeze`,
      headers: {
        authorization: `Bearer ${adminToken}`
      },
      payload: {
        reason: "risk detected"
      }
    });
    expect(freeze.statusCode).toBe(200);
    expect(freeze.json().status).toBe("frozen");

    const useFrozenToken = await context.app.inject({
      method: "GET",
      url: "/v1/users/me/profile",
      headers: {
        authorization: `Bearer ${user.access_token}`
      }
    });
    expect(useFrozenToken.statusCode).toBe(401);

    const unfreeze = await context.app.inject({
      method: "POST",
      url: `/v1/admin/users/${user.user_id}/unfreeze`,
      headers: {
        authorization: `Bearer ${adminToken}`
      },
      payload: {
        reason: "manual release"
      }
    });
    expect(unfreeze.statusCode).toBe(200);
    expect(unfreeze.json().status).toBe("active");

    const relogin = await context.app.inject({
      method: "POST",
      url: "/v1/auth/login",
      payload: {
        identifier: user.email,
        password: "StrongPass123",
        device_id: "android"
      }
    });
    expect(relogin.statusCode).toBe(200);

    const contentList = await context.app.inject({
      method: "GET",
      url: "/v1/admin/content/items",
      headers: {
        authorization: `Bearer ${adminToken}`
      }
    });
    expect(contentList.statusCode).toBe(200);
    const itemId = contentList.json().items[0].item_id as string;

    const publishFail = await context.app.inject({
      method: "POST",
      url: `/v1/admin/content/items/${itemId}/publish`,
      headers: {
        authorization: `Bearer ${adminToken}`
      },
      payload: {
        note: "simulate rollback",
        simulate_failure: true
      }
    });
    expect(publishFail.statusCode).toBe(409);

    const publish = await context.app.inject({
      method: "POST",
      url: `/v1/admin/content/items/${itemId}/publish`,
      headers: {
        authorization: `Bearer ${adminToken}`
      },
      payload: {
        note: "publish v2"
      }
    });
    expect(publish.statusCode).toBe(200);
    expect(publish.json().status).toBe("published");

    const unpublishContent = await context.app.inject({
      method: "POST",
      url: `/v1/admin/content/items/${itemId}/unpublish`,
      headers: {
        authorization: `Bearer ${adminToken}`
      },
      payload: {
        note: "offline for correction"
      }
    });
    expect(unpublishContent.statusCode).toBe(200);
    expect(unpublishContent.json().status).toBe("unpublished");

    const auditLogs = await context.app.inject({
      method: "GET",
      url: "/v1/admin/audit-logs?type=admin_content_published&page=1&page_size=20",
      headers: {
        authorization: `Bearer ${adminToken}`
      }
    });
    expect(auditLogs.statusCode).toBe(200);
    expect(auditLogs.json().total).toBeGreaterThanOrEqual(1);
  });
});
