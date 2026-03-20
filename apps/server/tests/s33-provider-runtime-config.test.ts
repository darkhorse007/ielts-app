import { afterEach, describe, expect, test } from "vitest";
import { buildServer } from "../src/app.js";
import { resolveAiRuntimeFromEnv, resolvePaymentRuntimeFromEnv } from "../src/domain/config.js";

describe("S33 provider runtime config visibility", () => {
  let context: ReturnType<typeof buildServer> | undefined;

  afterEach(async () => {
    if (context) {
      await context.app.close();
      context = undefined;
    }
  });

  const registerAndLogin = async (emailPrefix: "admin" | "candidate") => {
    const email = `${emailPrefix}-${crypto.randomUUID()}@example.com`;
    const register = await context?.app.inject({
      method: "POST",
      url: "/v1/auth/register",
      payload: {
        email,
        password: "StrongPass123"
      }
    });
    expect(register?.statusCode).toBe(201);

    const login = await context?.app.inject({
      method: "POST",
      url: "/v1/auth/login",
      payload: {
        identifier: email,
        password: "StrongPass123",
        device_id: "macos"
      }
    });
    expect(login?.statusCode).toBe(200);

    return login?.json() as {
      access_token: string;
      user_id: string;
    };
  };

  test("exposes configured AI and payment runtime summaries through system endpoints", async () => {
    const paymentRuntime = resolvePaymentRuntimeFromEnv({
      PAYMENT_PROVIDER_DEFAULT: "stripe",
      PAYMENT_STRIPE_ENABLED: "true",
      PAYMENT_STRIPE_WEBHOOK_SECRET: "stripe-webhook-secret-0001",
      PAYMENT_WEBHOOK_TIMESTAMP_TOLERANCE_SECONDS: "600"
    });
    const aiRuntime = resolveAiRuntimeFromEnv({
      LLM_PRIMARY_PROVIDER_NAME: "openai",
      LLM_PRIMARY_ENDPOINT: "https://api.openai.example/v1",
      LLM_PRIMARY_API_KEY: "openai-test-key",
      LLM_PRIMARY_DATA_REGION: "us",
      LLM_FALLBACK_ENABLED: "true",
      LLM_FALLBACK_PROVIDER_NAME: "anthropic",
      LLM_FALLBACK_ENDPOINT: "https://api.anthropic.example/v1",
      LLM_FALLBACK_API_KEY: "anthropic-test-key",
      LLM_FALLBACK_DATA_REGION: "us"
    });

    context = buildServer({
      paymentRuntime,
      aiRuntime
    });
    await context.app.ready();

    const user = await registerAndLogin("admin");

    const batch = await context.app.inject({
      method: "POST",
      url: "/v1/analytics/events/batch",
      headers: {
        authorization: `Bearer ${user.access_token}`
      },
      payload: {
        events: [
          {
            platform: "ios",
            event_type: "writing_evaluated",
            trace_id: "s33-primary-trace",
            provider_name: "primary-llm",
            latency_ms: 900,
            success: true
          },
          {
            platform: "android",
            event_type: "speaking_turn_scored",
            trace_id: "s33-fallback-trace",
            provider_name: "fallback-llm",
            latency_ms: 2100,
            success: false,
            fallback_triggered: true
          }
        ]
      }
    });
    expect(batch.statusCode).toBe(202);

    const providerHealth = await context.app.inject({
      method: "GET",
      url: "/v1/system/health/providers",
      headers: {
        authorization: `Bearer ${user.access_token}`
      }
    });
    expect(providerHealth.statusCode).toBe(200);
    expect(providerHealth.json().runtime_config.ready).toBe(true);
    expect(providerHealth.json().runtime_config.providers).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          role: "primary",
          provider_name: "openai",
          endpoint_configured: true,
          api_key_configured: true
        }),
        expect.objectContaining({
          role: "fallback",
          provider_name: "anthropic",
          enabled: true,
          endpoint_configured: true,
          api_key_configured: true
        })
      ])
    );
    expect(providerHealth.json().providers.map((item: { provider_name: string }) => item.provider_name)).toEqual(
      expect.arrayContaining(["openai", "anthropic"])
    );

    const paymentRuntimeResponse = await context.app.inject({
      method: "GET",
      url: "/v1/system/payments/runtime",
      headers: {
        authorization: `Bearer ${user.access_token}`
      }
    });
    expect(paymentRuntimeResponse.statusCode).toBe(200);
    expect(paymentRuntimeResponse.json().default_provider).toBe("stripe");
    expect(paymentRuntimeResponse.json().providers).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          provider_name: "stripe",
          enabled: true,
          signature_required: true,
          webhook_secret_configured: true,
          replay_window_seconds: 600
        })
      ])
    );
  });
});
