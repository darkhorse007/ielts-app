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

const registerAndLogin = async (request, prefix = "ui-e2e") => {
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
      device_id: "pw-ui-e2e"
    }
  });
  expect(login.status).toBe(200);
  return login.body.access_token;
};

test("stability internal ui flow", async ({ request, page }) => {
  const accessToken = await registerAndLogin(request, "qa-ui-flow");
  const releaseId = `REL-UI-${randomUUID().slice(0, 8)}`;

  await page.goto(`${baseURL}/internal/e2e/stability-ui`);
  await page.fill("#token", accessToken);
  await page.fill("#release-id", releaseId);

  await page.click("#start-soak");
  await expect(page.locator("#output")).toContainText("soak started run_id=");
  await expect(page.locator("#run-id")).not.toHaveValue("");

  await page.click("#record-checkpoint");
  await expect(page.locator("#output")).toContainText("checkpoint=");
  await expect(page.locator("#output")).toContainText("run_status=");
});
