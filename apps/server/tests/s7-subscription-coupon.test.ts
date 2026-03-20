import { afterEach, beforeEach, describe, expect, test } from "vitest";
import { randomUUID } from "node:crypto";
import { buildServer } from "../src/app.js";

describe("S7 subscription coupon and refund accounting", () => {
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
        device_id: "macos"
      }
    });
    expect(login.statusCode).toBe(200);
    return login.json() as {
      access_token: string;
      user_id: string;
    };
  };

  const loginAdmin = async (email: string, password: string): Promise<string> => {
    const response = await context.app.inject({
      method: "POST",
      url: "/v1/admin/auth/login",
      payload: {
        email,
        password
      }
    });
    expect(response.statusCode).toBe(200);
    return response.json().access_token as string;
  };

  test("supports configurable coupon discount and refund accounting consistency", async () => {
    const user = await registerAndLoginUser();
    const financeToken = await loginAdmin("finance@example.com", "FinancePass123");

    const upsertCoupon = await context.app.inject({
      method: "PUT",
      url: "/v1/admin/coupons/IELTS20",
      headers: {
        authorization: `Bearer ${financeToken}`
      },
      payload: {
        status: "active",
        description: "P1 campaign",
        discount_type: "percentage",
        discount_value: 20,
        plan_codes: ["pro_monthly"]
      }
    });
    expect(upsertCoupon.statusCode).toBe(200);
    expect(upsertCoupon.json().code).toBe("IELTS20");

    const listCoupons = await context.app.inject({
      method: "GET",
      url: "/v1/admin/coupons?status=active",
      headers: {
        authorization: `Bearer ${financeToken}`
      }
    });
    expect(listCoupons.statusCode).toBe(200);
    expect(listCoupons.json().items.some((item: { code: string }) => item.code === "IELTS20")).toBe(true);

    const upgrade = await context.app.inject({
      method: "POST",
      url: "/v1/subscription/upgrade",
      headers: {
        authorization: `Bearer ${user.access_token}`
      },
      payload: {
        plan_code: "pro_monthly",
        provider: "mockpay",
        coupon_code: "ielts20"
      }
    });
    expect(upgrade.statusCode).toBe(201);
    expect(upgrade.json().list_price_cny).toBe(108);
    expect(upgrade.json().discount_cny).toBe(21);
    expect(upgrade.json().payable_amount_cny).toBe(87);
    expect(upgrade.json().amount_cny).toBe(87);
    expect(upgrade.json().coupon_code).toBe("IELTS20");
    expect(upgrade.json().paid_amount_cny).toBe(0);
    expect(upgrade.json().refunded_amount_cny).toBe(0);

    const paid = await context.app.inject({
      method: "POST",
      url: "/v1/payments/webhooks/provider",
      payload: {
        event_id: `evt-${randomUUID()}`,
        order_id: upgrade.json().order_id,
        status: "paid"
      }
    });
    expect(paid.statusCode).toBe(200);
    expect(paid.json().order.paid_amount_cny).toBe(87);
    expect(paid.json().order.refunded_amount_cny).toBe(0);
    expect(paid.json().entitlement.tier).toBe("pro");

    const refund = await context.app.inject({
      method: "POST",
      url: "/v1/payments/webhooks/provider",
      payload: {
        event_id: `evt-${randomUUID()}`,
        order_id: upgrade.json().order_id,
        status: "refunded"
      }
    });
    expect(refund.statusCode).toBe(200);
    expect(refund.json().order.paid_amount_cny).toBe(87);
    expect(refund.json().order.refunded_amount_cny).toBe(87);
    expect(refund.json().entitlement.tier).toBe("free");

    const refundAgain = await context.app.inject({
      method: "POST",
      url: "/v1/payments/webhooks/provider",
      payload: {
        event_id: `evt-${randomUUID()}`,
        order_id: upgrade.json().order_id,
        status: "refunded"
      }
    });
    expect(refundAgain.statusCode).toBe(200);
    expect(refundAgain.json().order.refunded_amount_cny).toBe(87);
  });

  test("rejects invalid coupon usage and enforces coupon permissions", async () => {
    const user = await registerAndLoginUser();

    const invalidCouponUpgrade = await context.app.inject({
      method: "POST",
      url: "/v1/subscription/upgrade",
      headers: {
        authorization: `Bearer ${user.access_token}`
      },
      payload: {
        plan_code: "pro_monthly",
        provider: "mockpay",
        coupon_code: "NOT-EXIST"
      }
    });
    expect(invalidCouponUpgrade.statusCode).toBe(409);
    expect(invalidCouponUpgrade.json().code).toBe("INVALID_COUPON");

    const financeToken = await loginAdmin("finance@example.com", "FinancePass123");
    const invalidRule = await context.app.inject({
      method: "PUT",
      url: "/v1/admin/coupons/BAD120",
      headers: {
        authorization: `Bearer ${financeToken}`
      },
      payload: {
        status: "active",
        discount_type: "percentage",
        discount_value: 120
      }
    });
    expect(invalidRule.statusCode).toBe(400);
    expect(invalidRule.json().code).toBe("VALIDATION_ERROR");

    const opsToken = await loginAdmin("ops@example.com", "OpsPass123");
    const forbiddenCoupon = await context.app.inject({
      method: "PUT",
      url: "/v1/admin/coupons/OPS10",
      headers: {
        authorization: `Bearer ${opsToken}`
      },
      payload: {
        status: "active",
        discount_type: "percentage",
        discount_value: 10
      }
    });
    expect(forbiddenCoupon.statusCode).toBe(403);
    expect(forbiddenCoupon.json().code).toBe("ADMIN_FORBIDDEN");
  });
});
