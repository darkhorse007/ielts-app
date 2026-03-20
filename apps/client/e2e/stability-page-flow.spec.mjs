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

const registerAdminUser = async (request, prefix = "admin-stability-page") => {
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

const runStabilityOpsFlow = async (page, releaseId) => {
  const statusLine = page.locator("p").filter({ hasText: "status:" }).first();
  const metricsLine = page.locator("p").filter({ hasText: "metrics:" }).first();
  const storageAlertingLine = page.locator("p").filter({ hasText: "storage_alerting:" }).first();
  const reportLine = page.locator("p").filter({ hasText: "report:" }).first();
  const alertsLine = page.locator("p").filter({ hasText: "alerts:" }).first();
  const storageAlertingRecentList = page.getByLabel("storage-alerting-recent");

  await page.goto(`${webBaseURL}/stability`);
  await page.fill("#stability-release-id", releaseId);

  await page.getByRole("button", { name: "加载发布运行指标" }).click();
  await expect(statusLine).toContainText("已加载发布运行指标");
  await expect(metricsLine).toContainText("idempotency=");
  await expect(storageAlertingLine).toContainText("opened=");
  await expect(storageAlertingLine).toContainText("threshold_ms=");
  await expect(storageAlertingRecentList.locator("li").first()).toBeVisible();

  await page.getByRole("button", { name: "启动稳定性长测" }).click();
  await expect(statusLine).toContainText("长测已启动 run=");
  await expect(page.locator("#stability-run-id")).not.toHaveValue("");

  await page.fill("#stability-at-hour", "24");
  await page.fill("#stability-crash-count", "8");
  await page.fill("#stability-active-sessions", "100");
  await page.fill("#stability-api-success-rate", "98.9");
  await page.fill("#stability-latency-p95", "2500");

  await page.getByRole("button", { name: "记录检查点" }).click();
  await expect(statusLine).toContainText("检查点已记录 checkpoint=");

  await page.getByRole("button", { name: "加载趋势报告" }).click();
  await expect(statusLine).toContainText("已加载稳定性趋势报告");
  await expect(reportLine).toContainText("checkpoints=");

  await page.getByRole("button", { name: "加载告警" }).click();
  await expect(statusLine).toContainText("已加载稳定性告警");
  await expect(alertsLine).toContainText("total=");
  await expect(page.locator("#stability-alert-id")).not.toHaveValue("");

  await page.getByRole("button", { name: "处理告警" }).click();
  await expect(statusLine).toContainText("告警已处理 status=resolved");
};

test("stability ops page flow (desktop)", async ({ request, page }) => {
  const credentials = await registerAdminUser(request, "admin-stability-page-desktop");
  const releaseId = `REL-PAGE-DESKTOP-${randomUUID().slice(0, 8)}`;

  await loginFromPage(page, credentials);
  await runStabilityOpsFlow(page, releaseId);
});

test.describe("stability ops page flow (mobile)", () => {
  test.use({
    viewport: {
      width: 390,
      height: 844
    }
  });

  test("runs key operations under mobile viewport", async ({ request, page }) => {
    const credentials = await registerAdminUser(request, "admin-stability-page-mobile");
    const releaseId = `REL-PAGE-MOBILE-${randomUUID().slice(0, 8)}`;

    await loginFromPage(page, credentials);
    await runStabilityOpsFlow(page, releaseId);
  });
});
