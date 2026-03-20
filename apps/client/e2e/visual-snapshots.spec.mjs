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

const registerAdminUser = async (request, prefix = "admin-visual") => {
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

const captureRouteSnapshots = async (page, testInfo, suffix) => {
  const routes = [
    { path: "/observability", name: "observability" },
    { path: "/stability", name: "stability" },
    { path: "/system-roles", name: "system-roles" }
  ];

  for (const item of routes) {
    await page.goto(`${webBaseURL}${item.path}`);
    await page.waitForLoadState("networkidle");
    await expect(page.locator("h1")).toBeVisible();
    await page.screenshot({
      path: testInfo.outputPath(`${item.name}-${suffix}.png`),
      fullPage: true
    });
  }
};

test("capture visual snapshots (desktop)", async ({ request, page }, testInfo) => {
  const credentials = await registerAdminUser(request, "admin-visual-desktop");
  await loginFromPage(page, credentials);
  await captureRouteSnapshots(page, testInfo, "desktop");
});

test.describe("capture visual snapshots (mobile)", () => {
  test.use({
    viewport: {
      width: 390,
      height: 844
    }
  });

  test("capture mobile visual snapshots", async ({ request, page }, testInfo) => {
    const credentials = await registerAdminUser(request, "admin-visual-mobile");
    await loginFromPage(page, credentials);
    await captureRouteSnapshots(page, testInfo, "mobile");
  });
});
