import { randomUUID } from "node:crypto";
import { test, expect } from "@playwright/test";

const apiBaseURL = process.env.PLAYWRIGHT_API_BASE_URL ?? "http://127.0.0.1:8787";

const requestJson = async (request, path, init = {}) => {
  const response = await request.fetch(`${apiBaseURL}${path}`, {
    ...init,
    headers: {
      "content-type": "application/json",
      ...(init.headers ?? {})
    }
  });
  const body = await response.json().catch(() => ({}));
  return {
    status: response.status(),
    body
  };
};

test("self-hosted core api smoke keeps mock exam open and removes paid surfaces", async ({ request }) => {
  const email = `candidate-${randomUUID()}@example.com`;
  const password = "StrongPass123";

  const register = await requestJson(request, "/v1/auth/register", {
    method: "POST",
    data: {
      email,
      password
    }
  });
  expect(register.status).toBe(201);

  const login = await requestJson(request, "/v1/auth/login", {
    method: "POST",
    data: {
      identifier: email,
      password,
      device_id: "self-hosted-api-smoke"
    }
  });
  expect(login.status).toBe(200);

  const authHeaders = {
    authorization: `Bearer ${login.body.access_token}`
  };

  const subscription = await requestJson(request, "/v1/subscription/entitlement", {
    method: "GET",
    headers: authHeaders
  });
  expect(subscription.status).toBe(404);

  const runtime = await requestJson(request, "/v1/system/payments/runtime", {
    method: "GET",
    headers: authHeaders
  });
  expect(runtime.status).toBe(404);

  for (let index = 0; index < 4; index += 1) {
    const created = await requestJson(request, "/v1/mock-exams", {
      method: "POST",
      headers: {
        ...authHeaders,
        "x-device-id": `self-hosted-device-${index}`
      },
      data: {}
    });
    expect(created.status).toBe(201);
    expect(typeof created.body.exam_id).toBe("string");
  }
});
