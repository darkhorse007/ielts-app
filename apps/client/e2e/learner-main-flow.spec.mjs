import { randomUUID } from "node:crypto";
import { expect, test } from "@playwright/test";

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

const registerLearnerUser = async (request, prefix = "learner-main-flow") => {
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

const futureDate = (daysAhead = 90) => {
  const date = new Date();
  date.setUTCDate(date.getUTCDate() + daysAhead);
  const year = date.getUTCFullYear();
  const month = String(date.getUTCMonth() + 1).padStart(2, "0");
  const day = String(date.getUTCDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
};

const loginFromPage = async (page, credentials) => {
  await page.goto(`${webBaseURL}/login`);
  await page.waitForLoadState("networkidle");
  await page.fill("#login-identifier", credentials.email);
  await page.fill("#login-password", credentials.password);
  await page.getByRole("button", { name: "登录" }).click();
  await expect(page).toHaveURL(/\/home$/);
  await expect(page.getByRole("heading", { name: "学习首页" })).toBeVisible();
};

const textAfterPrefix = async (locator, prefix) => {
  const text = (await locator.textContent())?.trim() ?? "";
  return text.startsWith(prefix) ? text.slice(prefix.length).trim() : text;
};

test("learner flow covers login, onboarding, diagnostic and plan", async ({ request, page }) => {
  const credentials = await registerLearnerUser(request);

  await loginFromPage(page, credentials);

  await page.getByRole("link", { name: "入门目标" }).click();
  await page.waitForLoadState("networkidle");
  await expect(page).toHaveURL(/\/onboarding$/);
  await expect(page.getByRole("heading", { name: "目标设置" })).toBeVisible();

  await page.fill("#target-band", "6.5");
  await page.fill("#target-exam-date", futureDate());
  await page.fill("#weekly-hours", "12");
  await page.getByLabel("speaking").check();
  await page.getByLabel("writing").check();
  await page.getByRole("button", { name: "提交目标" }).click();

  const assessmentLine = page.locator("p").filter({ hasText: "assessment_id:" });
  const planLine = page.locator("p").filter({ hasText: "plan_id:" });
  const onboardingStatusLine = page.locator("p").filter({ hasText: "status:" });

  await expect(assessmentLine).toHaveText(/assessment_id: [0-9a-f-]{36}/);
  await expect(planLine).toHaveText(/plan_id: [0-9a-f-]{36}/);
  await expect(onboardingStatusLine).toHaveText(/status: (processing|completed|in_progress)/);

  const assessmentId = await textAfterPrefix(assessmentLine, "assessment_id:");
  const planId = await textAfterPrefix(planLine, "plan_id:");

  await page.goto(`${webBaseURL}/home`);
  await page.waitForLoadState("networkidle");
  await page.getByRole("link", { name: "首次诊断" }).click();
  await page.waitForLoadState("networkidle");
  await expect(page).toHaveURL(/\/diagnostic$/);
  await expect(page.getByRole("heading", { name: "首次诊断" })).toBeVisible();

  await page.fill("#diagnostic-assessment-id", assessmentId);
  await page.getByRole("button", { name: "加载题目" }).click();
  await expect(page.locator("#diagnostic-question-id")).not.toHaveValue("");
  await expect(page.locator("p").filter({ hasText: "status:" })).toHaveText(/status: in_progress/);

  await page.fill("#diagnostic-answer", "time location purpose thesis argument example");
  await page.getByRole("button", { name: "提交答案" }).click();
  await expect(page.locator("p").filter({ hasText: "status:" })).toHaveText(/status: in_progress/);

  await page.getByRole("button", { name: "暂停" }).click();
  await expect(page.locator("p").filter({ hasText: "status:" })).toHaveText(/status: paused/);

  await page.getByRole("button", { name: "恢复" }).click();
  await expect(page.locator("p").filter({ hasText: "status:" })).toHaveText(/status: in_progress/);

  await page.getByRole("button", { name: "完成诊断" }).click();
  await expect(page.locator("p").filter({ hasText: "status:" })).toHaveText(/status: completed/);
  await expect(page.locator("p").filter({ hasText: "skill_bands:" })).toHaveText(/skill_bands: L\d/);

  await page.goto(`${webBaseURL}/home`);
  await page.waitForLoadState("networkidle");
  await page.getByRole("link", { name: "8周计划" }).click();
  await page.waitForLoadState("networkidle");
  await expect(page).toHaveURL(/\/plan$/);
  await expect(page.getByRole("heading", { name: "8周学习计划" })).toBeVisible();

  await page.getByRole("button", { name: "加载计划" }).click();
  await expect(page.locator("p").filter({ hasText: "plan_id:" })).toHaveText(new RegExp(`plan_id: ${planId}`));
  await expect(page.locator("p").filter({ hasText: "week_count:" })).toHaveText(/week_count: 8/);
  await expect(page.locator("p").filter({ hasText: "status:" })).toHaveText(/status: 计划已加载/);
});
