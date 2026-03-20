import { afterEach, beforeEach, describe, expect, test } from "vitest";
import { buildServer } from "../src/app.js";

describe("S34 user data export", () => {
  const nextEmail = () => `export-user-${crypto.randomUUID()}@example.com`;

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
        device_id: "macos"
      }
    });
    expect(login.statusCode).toBe(200);
    return login.json() as {
      access_token: string;
      user_id: string;
    };
  };

  test("exports user-domain data through a single authenticated endpoint", async () => {
    const user = await registerAndLogin();

    const analytics = await context.app.inject({
      method: "POST",
      url: "/v1/analytics/events/batch",
      headers: {
        authorization: `Bearer ${user.access_token}`
      },
      payload: {
        events: [
          {
            platform: "ios",
            event_type: "onboarding_submitted",
            trace_id: "export-trace-1",
            provider_name: "openai",
            success: true
          }
        ]
      }
    });
    expect(analytics.statusCode).toBe(202);

    const reminderPreference = await context.app.inject({
      method: "PUT",
      url: "/v1/reminders/preferences",
      headers: {
        authorization: `Bearer ${user.access_token}`
      },
      payload: {
        subscribed: true
      }
    });
    expect(reminderPreference.statusCode).toBe(200);

    const reminderRecommendation = await context.app.inject({
      method: "GET",
      url: "/v1/reminders/recommendation",
      headers: {
        authorization: `Bearer ${user.access_token}`
      }
    });
    expect(reminderRecommendation.statusCode).toBe(200);

    const upgrade = await context.app.inject({
      method: "POST",
      url: "/v1/subscription/upgrade",
      headers: {
        authorization: `Bearer ${user.access_token}`
      },
      payload: {
        plan_code: "pro_monthly"
      }
    });
    expect(upgrade.statusCode).toBe(201);
    expect(upgrade.json().provider).toBe("mockpay");

    const exported = await context.app.inject({
      method: "GET",
      url: "/v1/users/me/export",
      headers: {
        authorization: `Bearer ${user.access_token}`
      }
    });
    expect(exported.statusCode).toBe(200);
    expect(exported.headers["content-disposition"]).toContain("user-data-export-");

    const body = exported.json() as {
      profile: {
        id: string;
      };
      auth: {
        sessions: Array<{
          deviceId?: string;
        }>;
      };
      subscription: {
        orders: Array<{
          provider: string;
        }>;
      };
      reminders: {
        preference?: {
          subscribed: boolean;
        };
        recommendations: Array<{
          id: string;
        }>;
      };
      analytics: {
        total_events: number;
      };
      exclusions: string[];
    };

    expect(body.profile.id).toBe(user.user_id);
    expect(body.auth.sessions.length).toBeGreaterThanOrEqual(1);
    expect(body.auth.sessions[0].deviceId).toBe("macos");
    expect(body.subscription.orders).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          provider: "mockpay"
        })
      ])
    );
    expect(body.reminders.preference?.subscribed).toBe(true);
    expect(body.reminders.recommendations.length).toBe(1);
    expect(body.analytics.total_events).toBe(1);
    expect(body.exclusions).toEqual(
      expect.arrayContaining(["password_hash", "refresh_token_hash", "admin_audit_logs", "backup_copies"])
    );
  });
});
