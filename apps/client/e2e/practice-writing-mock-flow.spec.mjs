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

const registerLearnerUser = async (request, prefix = "learner-content-flow") => {
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

const futureDate = (daysAhead = 120) => {
  const date = new Date();
  date.setUTCDate(date.getUTCDate() + daysAhead);
  const year = date.getUTCFullYear();
  const month = String(date.getUTCMonth() + 1).padStart(2, "0");
  const day = String(date.getUTCDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
};

const apiLogin = async (request, credentials) => {
  const login = await requestJson(request, "/v1/auth/login", {
    method: "POST",
    data: {
      identifier: credentials.email,
      password: credentials.password,
      device_id: "playwright-content-flow"
    }
  });

  expect(login.status).toBe(200);
  return login.body.access_token;
};

const ensureActivePlan = async (request, accessToken) => {
  const onboarding = await requestJson(request, "/v1/users/onboarding", {
    method: "POST",
    headers: {
      authorization: `Bearer ${accessToken}`,
      "idempotency-key": `idem-${randomUUID()}`
    },
    data: {
      target_overall_band: 6.5,
      target_exam_date: futureDate(),
      weekly_study_hours: 10,
      weak_skills: ["speaking", "writing"]
    }
  });

  expect(onboarding.status).toBe(202);

  const complete = await request.fetch(`${apiBaseURL}/v1/users/onboarding/${onboarding.body.assessment_id}/complete`, {
    method: "POST",
    headers: {
      authorization: `Bearer ${accessToken}`
    }
  });

  expect(complete.status()).toBe(200);
  const completed = await complete.json();
  expect(completed.status).toBe("completed");
};

const loginFromPage = async (page, credentials) => {
  await page.goto(`${webBaseURL}/login`);
  await page.waitForLoadState("networkidle");
  await page.fill("#login-identifier", credentials.email);
  await page.fill("#login-password", credentials.password);
  await page.getByRole("button", { name: "登录" }).click();
  await expect(page).toHaveURL(/\/home$/);
};

const statusLine = (page) => page.locator("p").filter({ hasText: "status:" });

test("practice, writing and mock exam browser flow", async ({ request, page }) => {
  const credentials = await registerLearnerUser(request);
  const accessToken = await apiLogin(request, credentials);
  await ensureActivePlan(request, accessToken);

  await loginFromPage(page, credentials);

  await page.goto(`${webBaseURL}/practice/listening`);
  await page.waitForLoadState("networkidle");
  await expect(page.getByRole("heading", { name: "听力训练（核心题型 / 听写）" })).toBeVisible();

  await page.getByRole("button", { name: "创建听力训练" }).click();
  await expect(statusLine(page)).toContainText("已创建听力训练");
  await expect(page.locator("p").filter({ hasText: "session_id:" })).toHaveText(/session_id: [0-9a-f-]{36}/);

  const answerInputs = page.locator('input[id^="listening-answer-"]');
  const answerCount = await answerInputs.count();
  expect(answerCount).toBeGreaterThan(0);
  for (let index = 0; index < answerCount; index += 1) {
    await answerInputs.nth(index).fill(index % 2 === 0 ? "B" : "Queen");
  }

  await page.getByRole("button", { name: "提交听力答案" }).click();
  await expect(statusLine(page)).toContainText("提交完成，正确");

  await page.fill("#listening-playback-rate", "1.1");
  await page.fill("#listening-segment-index", "2");
  await page.fill("#listening-position-seconds", "95");
  await page.getByLabel("仅重听错题").check();
  await page.getByRole("button", { name: "保存播放状态" }).click();
  await expect(statusLine(page)).toContainText("播放器异常已恢复到 1.0x");

  await page.getByRole("button", { name: "加载播放状态" }).click();
  await expect(statusLine(page)).toContainText("已加载播放状态");

  await page.getByRole("button", { name: "加入重练队列" }).click();
  await expect(statusLine(page)).toContainText("已加入重练队列");
  await expect(page.locator("p").filter({ hasText: "retry_queue_count:" })).toHaveText(/retry_queue_count: [1-9]/);

  await page.goto(`${webBaseURL}/writing`);
  await page.waitForLoadState("networkidle");
  await expect(page.getByRole("heading", { name: "写作四维评分与证据建议" })).toBeVisible();

  await page.getByRole("button", { name: "加载写作模板" }).click();
  await expect(statusLine(page)).toContainText("已加载写作模板库");
  await expect(page.locator("p").filter({ hasText: "template_count:" })).toHaveText(/template_count: [1-9]/);

  await page.getByRole("button", { name: "插入模板框架" }).click();
  await expect(statusLine(page)).toContainText("模板已插入");
  await expect(page.locator("p").filter({ hasText: "template_preserved_original:" })).toContainText("true");

  await page.getByRole("button", { name: "查看模板采纳率" }).click();
  await expect(statusLine(page)).toContainText("已加载模板采纳率");
  await expect(page.locator("p").filter({ hasText: "template_adoption:" })).toContainText("total=");

  await page.getByRole("button", { name: "提交写作批改" }).click();
  await expect(statusLine(page)).toContainText("写作批改完成，overall=");
  await expect(page.locator("#writing-evaluation-id")).not.toHaveValue("");
  await expect(page.locator("p").filter({ hasText: "overall:" })).not.toContainText("-");

  await page.getByRole("button", { name: "改写复评" }).click();
  await expect(statusLine(page)).toContainText("改写复评完成");
  await expect(page.locator("p").filter({ hasText: "comparison:" })).toContainText("Δ");

  await page.getByRole("button", { name: "加载改写档案" }).click();
  await expect(statusLine(page)).toContainText("已加载改写档案");
  await expect(page.locator("p").filter({ hasText: "archive_count:" })).toHaveText(/archive_count: [1-9]/);

  await page.goto(`${webBaseURL}/mock-exam`);
  await page.waitForLoadState("networkidle");
  await expect(page.getByRole("heading", { name: "全科模考与复盘" })).toBeVisible();

  await page.getByRole("button", { name: "创建模考" }).click();
  await expect(statusLine(page)).toContainText("模考创建成功");
  await expect(page.locator("p").filter({ hasText: "exam_id:" })).toHaveText(/exam_id: [0-9a-f-]{36}/);

  await page.getByRole("button", { name: "拉取模考状态" }).click();
  await expect(statusLine(page)).toContainText("模考状态=");

  await page.getByRole("button", { name: "保存进度" }).click();
  await expect(statusLine(page)).toContainText("进度已保存");

  await page.getByRole("button", { name: "恢复模考" }).click();
  await expect(statusLine(page)).toContainText("模考恢复");

  await page.getByRole("button", { name: "提交整场模考" }).click();
  await expect(statusLine(page)).toContainText("模考提交完成，overall=");
  await expect(page.locator("p").filter({ hasText: "report:" })).toContainText("L");

  await page.getByRole("button", { name: "加载复盘报告" }).click();
  await expect(statusLine(page)).toContainText("已加载模考报告");
  await expect(page.locator("p").filter({ hasText: "report:" })).toContainText("writeback=true");

  await page.getByRole("button", { name: "撤销计划回写" }).click();
  await expect(statusLine(page)).toContainText("已撤销计划回写");
  await expect(page.locator("p").filter({ hasText: "report:" })).toContainText("undo_available=false");

  await page.getByRole("button", { name: "导出报告" }).click();
  await expect(statusLine(page)).toContainText("已导出报告");
});
