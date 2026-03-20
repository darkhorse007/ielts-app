import { afterEach, beforeEach, describe, expect, test } from "vitest";
import { randomUUID } from "node:crypto";
import { buildServer } from "../src/app.js";

describe("S5 admin login and entitlement adjustment", () => {
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

  const registerAndLoginUser = async () => {
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
        device_id: "windows"
      }
    });
    expect(login.statusCode).toBe(200);
    return login.json() as {
      access_token: string;
      user_id: string;
    };
  };

  test("supports admin login, order query, entitlement adjust and one-time rollback", async () => {
    const user = await registerAndLoginUser();

    const upgrade = await context.app.inject({
      method: "POST",
      url: "/v1/subscription/upgrade",
      headers: {
        authorization: `Bearer ${user.access_token}`
      },
      payload: {
        plan_code: "pro_monthly",
        provider: "mockpay"
      }
    });
    expect(upgrade.statusCode).toBe(201);

    const adminLogin = await context.app.inject({
      method: "POST",
      url: "/v1/admin/auth/login",
      payload: {
        email: "finance@example.com",
        password: "FinancePass123"
      }
    });
    expect(adminLogin.statusCode).toBe(200);
    expect(adminLogin.json().menus.length).toBeGreaterThanOrEqual(1);
    const adminToken = adminLogin.json().access_token as string;

    const queryOrders = await context.app.inject({
      method: "GET",
      url: "/v1/admin/orders",
      headers: {
        authorization: `Bearer ${adminToken}`
      }
    });
    expect(queryOrders.statusCode).toBe(200);
    expect(queryOrders.json().total).toBeGreaterThanOrEqual(1);

    const adjust = await context.app.inject({
      method: "POST",
      url: `/v1/admin/entitlements/${user.user_id}/adjust`,
      headers: {
        authorization: `Bearer ${adminToken}`
      },
      payload: {
        reason: "manual correction for customer service",
        set_tier: "pro",
        delta_days: 30
      }
    });
    expect(adjust.statusCode).toBe(200);
    const adjustmentId = adjust.json().adjustment.adjustment_id as string;
    expect(adjust.json().entitlement.tier).toBe("pro");

    const rollback = await context.app.inject({
      method: "POST",
      url: `/v1/admin/entitlements/${user.user_id}/adjust`,
      headers: {
        authorization: `Bearer ${adminToken}`
      },
      payload: {
        reason: "rollback wrong adjustment",
        rollback_of_adjustment_id: adjustmentId
      }
    });
    expect(rollback.statusCode).toBe(200);
    expect(rollback.json().adjustment.rollback_of_adjustment_id).toBe(adjustmentId);

    const secondRollback = await context.app.inject({
      method: "POST",
      url: `/v1/admin/entitlements/${user.user_id}/adjust`,
      headers: {
        authorization: `Bearer ${adminToken}`
      },
      payload: {
        reason: "rollback again should fail",
        rollback_of_adjustment_id: adjustmentId
      }
    });
    expect(secondRollback.statusCode).toBe(409);
  });

  test("enforces rbac and invalid admin credentials", async () => {
    const invalid = await context.app.inject({
      method: "POST",
      url: "/v1/admin/auth/login",
      payload: {
        email: "finance@example.com",
        password: "wrong-pass"
      }
    });
    expect(invalid.statusCode).toBe(403);

    const user = await registerAndLoginUser();
    const opsLogin = await context.app.inject({
      method: "POST",
      url: "/v1/admin/auth/login",
      payload: {
        email: "ops@example.com",
        password: "OpsPass123"
      }
    });
    expect(opsLogin.statusCode).toBe(200);
    const opsToken = opsLogin.json().access_token as string;

    const forbiddenAdjust = await context.app.inject({
      method: "POST",
      url: `/v1/admin/entitlements/${user.user_id}/adjust`,
      headers: {
        authorization: `Bearer ${opsToken}`
      },
      payload: {
        reason: "ops should not adjust entitlement",
        set_tier: "pro"
      }
    });
    expect(forbiddenAdjust.statusCode).toBe(403);
  });

  test("admin order filter supports status and pagination", async () => {
    const user = await registerAndLoginUser();
    const created = await context.app.inject({
      method: "POST",
      url: "/v1/subscription/upgrade",
      headers: {
        authorization: `Bearer ${user.access_token}`
      },
      payload: {
        plan_code: "pro_monthly",
        provider: "mockpay"
      }
    });
    expect(created.statusCode).toBe(201);

    await context.app.inject({
      method: "POST",
      url: "/v1/payments/webhooks/provider",
      payload: {
        event_id: `evt-${randomUUID()}`,
        order_id: created.json().order_id,
        status: "paid"
      }
    });

    const admin = await context.app.inject({
      method: "POST",
      url: "/v1/admin/auth/login",
      payload: {
        email: "admin@example.com",
        password: "AdminPass123"
      }
    });
    expect(admin.statusCode).toBe(200);

    const result = await context.app.inject({
      method: "GET",
      url: `/v1/admin/orders?status=paid&page=1&page_size=5&user_id=${user.user_id}`,
      headers: {
        authorization: `Bearer ${admin.json().access_token}`
      }
    });
    expect(result.statusCode).toBe(200);
    expect(result.json().page).toBe(1);
    expect(result.json().page_size).toBe(5);
    expect(result.json().items.every((item: { status: string }) => item.status === "paid")).toBe(true);
  });
});
