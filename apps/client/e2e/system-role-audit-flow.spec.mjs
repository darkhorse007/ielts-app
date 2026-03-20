import { randomUUID } from "node:crypto";
import { test, expect } from "@playwright/test";

const baseURL = process.env.PLAYWRIGHT_API_BASE_URL ?? "http://127.0.0.1:8787";

const requestJson = async (request, path, init = {}) => {
  const response = await request.fetch(`${baseURL}${path}`, {
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

const registerAndLogin = async (request, prefix) => {
  const email = `${prefix}-${randomUUID()}@example.com`;
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
      device_id: "pw-e2e"
    }
  });
  expect(login.status).toBe(200);
  return {
    userId: register.body.user_id,
    accessToken: login.body.access_token
  };
};

test("system role update -> audit query", async ({ request }) => {
  const learner = await registerAndLogin(request, "learner-e2e");
  const admin = await registerAndLogin(request, "admin-e2e");
  const qa = await registerAndLogin(request, "qa-e2e");

  const adminAuth = {
    authorization: `Bearer ${admin.accessToken}`
  };

  const setRoles = await requestJson(request, `/v1/system/users/${learner.userId}/roles`, {
    method: "PUT",
    headers: adminAuth,
    data: {
      roles: ["qa", "ops"]
    }
  });
  expect(setRoles.status).toBe(200);
  expect(setRoles.body.roles).toEqual(expect.arrayContaining(["learner", "qa", "ops"]));

  const getRoles = await requestJson(request, `/v1/system/users/${learner.userId}/roles`, {
    method: "GET",
    headers: adminAuth
  });
  expect(getRoles.status).toBe(200);
  expect(getRoles.body.roles).toEqual(expect.arrayContaining(["learner", "qa", "ops"]));

  const listAudit = await requestJson(
    request,
    `/v1/system/users/roles/audit?target_user_id=${learner.userId}&operator_user_id=${admin.userId}&page=1&page_size=20`,
    {
      method: "GET",
      headers: adminAuth
    }
  );
  expect(listAudit.status).toBe(200);
  expect(listAudit.body.total).toBeGreaterThan(0);
  const matched = listAudit.body.items.find((item) => item.target_user_id === learner.userId);
  expect(matched).toBeDefined();
  expect(matched.operator_user_id).toBe(admin.userId);
  expect(matched.roles).toEqual(expect.arrayContaining(["learner", "qa", "ops"]));

  const qaAuth = {
    authorization: `Bearer ${qa.accessToken}`
  };
  const qaAuditForbidden = await requestJson(request, "/v1/system/users/roles/audit", {
    method: "GET",
    headers: qaAuth
  });
  expect(qaAuditForbidden.status).toBe(403);
});
