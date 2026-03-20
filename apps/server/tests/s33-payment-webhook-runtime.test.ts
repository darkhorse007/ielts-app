import { afterEach, beforeEach, describe, expect, test } from "vitest";
import { createHmac, randomUUID } from "node:crypto";
import { buildServer } from "../src/app.js";
import { resolvePaymentRuntimeFromEnv } from "../src/domain/config.js";

const buildWebhookSignature = (input: {
  secret: string;
  timestamp: string;
  provider: string;
  eventId: string;
  orderId: string;
  status: "paid" | "failed" | "refunded";
  providerOrderId?: string;
}): string =>
  createHmac("sha256", input.secret)
    .update(
      `${input.timestamp}.${input.provider}.${input.eventId}.${input.orderId}.${input.status}.${input.providerOrderId ?? ""}`
    )
    .digest("hex");

describe("S33 payment webhook runtime verification", () => {
  const stripeSecret = "stripe-webhook-secret-0001";
  const nextEmail = () => `candidate-${crypto.randomUUID()}@example.com`;

  const build = async (useStripeRuntime = false) => {
    const server = buildServer(
      useStripeRuntime
        ? {
            paymentRuntime: resolvePaymentRuntimeFromEnv({
              PAYMENT_PROVIDER_DEFAULT: "stripe",
              PAYMENT_STRIPE_ENABLED: "true",
              PAYMENT_STRIPE_WEBHOOK_SECRET: stripeSecret
            })
          }
        : undefined
    );
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

  test("rejects upgrade orders for providers that are not enabled in runtime", async () => {
    const user = await registerAndLoginUser();

    const upgrade = await context.app.inject({
      method: "POST",
      url: "/v1/subscription/upgrade",
      headers: {
        authorization: `Bearer ${user.access_token}`
      },
      payload: {
        plan_code: "pro_monthly",
        provider: "stripe"
      }
    });
    expect(upgrade.statusCode).toBe(409);
    expect(upgrade.json().code).toBe("PAYMENT_PROVIDER_DISABLED");
  });

  test("requires a valid signature for live provider webhooks", async () => {
    await context.app.close();
    context = await build(true);

    const user = await registerAndLoginUser();

    const upgrade = await context.app.inject({
      method: "POST",
      url: "/v1/subscription/upgrade",
      headers: {
        authorization: `Bearer ${user.access_token}`
      },
      payload: {
        plan_code: "pro_monthly",
        provider: "stripe"
      }
    });
    expect(upgrade.statusCode).toBe(201);

    const eventId = `evt-${randomUUID()}`;
    const missingSignature = await context.app.inject({
      method: "POST",
      url: "/v1/payments/webhooks/provider",
      payload: {
        event_id: eventId,
        order_id: upgrade.json().order_id,
        provider: "stripe",
        status: "paid"
      }
    });
    expect(missingSignature.statusCode).toBe(401);
    expect(missingSignature.json().code).toBe("PAYMENT_WEBHOOK_SIGNATURE_REQUIRED");

    const timestamp = `${Math.floor(Date.now() / 1000)}`;
    const signature = buildWebhookSignature({
      secret: stripeSecret,
      timestamp,
      provider: "stripe",
      eventId,
      orderId: upgrade.json().order_id,
      status: "paid"
    });

    const paid = await context.app.inject({
      method: "POST",
      url: "/v1/payments/webhooks/provider",
      headers: {
        "x-ielts-timestamp": timestamp,
        "x-ielts-signature": signature
      },
      payload: {
        event_id: eventId,
        order_id: upgrade.json().order_id,
        provider: "stripe",
        status: "paid"
      }
    });
    expect(paid.statusCode).toBe(200);
    expect(paid.json().webhook_verification).toEqual(
      expect.objectContaining({
        provider_name: "stripe",
        signature_required: true,
        signature_verified: true
      })
    );
    expect(paid.json().entitlement.tier).toBe("pro");
  });
});
