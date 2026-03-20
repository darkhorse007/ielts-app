import { randomUUID } from "node:crypto";
import { test, expect } from "@playwright/test";

const apiBaseURL = process.env.PLAYWRIGHT_API_BASE_URL ?? "http://127.0.0.1:8787";
const webBaseURL = process.env.PLAYWRIGHT_WEB_BASE_URL ?? "http://127.0.0.1:5173";

const requestJson = async (request, path, init = {}, apiBase = apiBaseURL) => {
  const response = await request.fetch(`${apiBase}${path}`, {
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

const registerAdminUser = async (request, prefix = "admin-observability-page") => {
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
  return {
    email,
    password
  };
};

const loginFromPage = async (page, credentials) => {
  await page.goto(`${webBaseURL}/login`);
  await page.fill("#login-identifier", credentials.email);
  await page.fill("#login-password", credentials.password);
  await page.getByRole("button", { name: "登录" }).click();
  await expect(page).toHaveURL(/\/home$/);
};

test("observability storage alerting metrics and filters", async ({ request, page }) => {
  const credentials = await registerAdminUser(request);
  await loginFromPage(page, credentials);

  await page.goto(`${webBaseURL}/observability`);
  await page.getByRole("button", { name: "加载发布链路指标" }).click();

  await expect(page.locator("p").filter({ hasText: "status: 发布链路运行指标已加载" })).toBeVisible();
  await expect(page.locator("p").filter({ hasText: "release_metrics:" })).toContainText("idempotency");
  await expect(page.locator("p").filter({ hasText: "storage_alerting:" })).toContainText("recent=");
  await expect(page.locator("p").filter({ hasText: "storage_alerting:" })).toContainText("capped=");

  await page.selectOption("#observability-storage-alert-event-filter", "circuit_opened");
  await page.selectOption("#observability-storage-alert-backend-filter", "postgres");
  await page.selectOption("#observability-storage-alert-write-failed-filter", "failed");

  const recentList = page.getByLabel("storage-alerting-recent");
  await expect(recentList.locator("li").first()).toBeVisible();
});
