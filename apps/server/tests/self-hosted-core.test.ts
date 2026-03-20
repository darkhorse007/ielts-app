import { afterEach, beforeEach, describe, expect, test } from "vitest";
import { buildServer } from "../src/app.js";

describe("self-hosted core mode", () => {
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

  test("disables public subscription endpoints while keeping mock exam available without quota gating", async () => {
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
        device_id: "self-hosted-browser"
      }
    });
    expect(login.statusCode).toBe(200);
    const accessToken = login.json().access_token as string;

    const subscription = await context.app.inject({
      method: "GET",
      url: "/v1/subscription/entitlement",
      headers: {
        authorization: `Bearer ${accessToken}`
      }
    });
    expect(subscription.statusCode).toBe(404);

    const paymentRuntime = await context.app.inject({
      method: "GET",
      url: "/v1/system/payments/runtime",
      headers: {
        authorization: `Bearer ${accessToken}`
      }
    });
    expect(paymentRuntime.statusCode).toBe(404);

    for (let index = 0; index < 4; index += 1) {
      const createExam = await context.app.inject({
        method: "POST",
        url: "/v1/mock-exams",
        headers: {
          authorization: `Bearer ${accessToken}`,
          "x-device-id": `device-${index}`
        }
      });
      expect(createExam.statusCode).toBe(201);
      expect(createExam.json().exam_id).toBeTypeOf("string");
    }
  });
});
