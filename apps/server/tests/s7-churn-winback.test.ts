import { afterEach, beforeEach, describe, expect, test } from "vitest";
import { buildServer } from "../src/app.js";

describe("S7 churn risk scoring and win-back strategy", () => {
  const nextEmail = () => `candidate-${crypto.randomUUID()}@example.com`;

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
        device_id: "ios"
      }
    });
    expect(login.statusCode).toBe(200);
    return login.json() as {
      user_id: string;
      access_token: string;
    };
  };

  test("identifies churn risk users, triggers strategy and observes recall effect", async () => {
    const operator = await registerAndLogin();
    const riskyUser = await registerAndLogin();
    const activeUser = await registerAndLogin();

    const riskySeed = await context.app.inject({
      method: "POST",
      url: "/v1/analytics/events/batch",
      headers: {
        authorization: `Bearer ${riskyUser.access_token}`
      },
      payload: {
        events: [
          {
            platform: "android",
            event_type: "practice_submitted",
            created_at: "2025-12-01T10:00:00.000Z"
          }
        ]
      }
    });
    expect(riskySeed.statusCode).toBe(202);

    const activeSeed = await context.app.inject({
      method: "POST",
      url: "/v1/analytics/events/batch",
      headers: {
        authorization: `Bearer ${activeUser.access_token}`
      },
      payload: {
        events: [
          {
            platform: "ios",
            event_type: "practice_submitted",
            created_at: new Date().toISOString()
          },
          {
            platform: "ios",
            event_type: "writing_evaluated",
            created_at: new Date().toISOString()
          }
        ]
      }
    });
    expect(activeSeed.statusCode).toBe(202);

    const risks = await context.app.inject({
      method: "GET",
      url: "/v1/analytics/churn/risks?min_score=40&limit=10",
      headers: {
        authorization: `Bearer ${operator.access_token}`
      }
    });
    expect(risks.statusCode).toBe(200);
    expect(risks.json().total).toBeGreaterThanOrEqual(1);
    const riskUserIds = (risks.json().items as Array<{ user_id: string }>).map((item) => item.user_id);
    expect(riskUserIds).toContain(riskyUser.user_id);

    const trigger = await context.app.inject({
      method: "POST",
      url: "/v1/analytics/churn/strategies/trigger",
      headers: {
        authorization: `Bearer ${operator.access_token}`
      },
      payload: {
        user_id: riskyUser.user_id,
        strategy_type: "smart_reminder",
        reason: "high risk user",
        conversion_window_days: 7
      }
    });
    expect(trigger.statusCode).toBe(201);
    expect(trigger.json().user_id).toBe(riskyUser.user_id);
    expect(trigger.json().strategy_type).toBe("smart_reminder");
    expect(["medium", "high"]).toContain(trigger.json().risk.level);

    const effectBefore = await context.app.inject({
      method: "GET",
      url: "/v1/analytics/churn/effect?strategy_type=smart_reminder",
      headers: {
        authorization: `Bearer ${operator.access_token}`
      }
    });
    expect(effectBefore.statusCode).toBe(200);
    expect(effectBefore.json().total_triggers).toBe(1);
    expect(effectBefore.json().converted_triggers).toBe(0);

    const conversionEvent = await context.app.inject({
      method: "POST",
      url: "/v1/analytics/events/batch",
      headers: {
        authorization: `Bearer ${riskyUser.access_token}`
      },
      payload: {
        events: [
          {
            platform: "android",
            event_type: "practice_submitted",
            created_at: new Date().toISOString()
          }
        ]
      }
    });
    expect(conversionEvent.statusCode).toBe(202);

    const effectAfter = await context.app.inject({
      method: "GET",
      url: "/v1/analytics/churn/effect?strategy_type=smart_reminder",
      headers: {
        authorization: `Bearer ${operator.access_token}`
      }
    });
    expect(effectAfter.statusCode).toBe(200);
    expect(effectAfter.json().total_triggers).toBe(1);
    expect(effectAfter.json().converted_triggers).toBe(1);
    expect(effectAfter.json().recall_rate_percent).toBe(100);
    expect(effectAfter.json().items[0].status).toBe("converted");
  });

  test("returns 404 when triggering strategy for unknown user", async () => {
    const operator = await registerAndLogin();

    const trigger = await context.app.inject({
      method: "POST",
      url: "/v1/analytics/churn/strategies/trigger",
      headers: {
        authorization: `Bearer ${operator.access_token}`
      },
      payload: {
        user_id: crypto.randomUUID(),
        strategy_type: "coupon_nudge"
      }
    });

    expect(trigger.statusCode).toBe(404);
    expect(trigger.json().code).toBe("USER_NOT_FOUND");
  });
});
