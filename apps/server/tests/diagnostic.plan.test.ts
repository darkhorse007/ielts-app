import { afterEach, beforeEach, describe, expect, test } from "vitest";
import { buildServer } from "../src/app.js";

describe("S2 diagnostic and 8-week study plan", () => {
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

  test("supports diagnostic pause/resume and generates adjustable 8-week plan", async () => {
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
        device_id: "macbook"
      }
    });
    expect(login.statusCode).toBe(200);
    const accessToken = login.json().access_token as string;

    const onboarding = await context.app.inject({
      method: "POST",
      url: "/v1/users/onboarding",
      headers: {
        authorization: `Bearer ${accessToken}`,
        "idempotency-key": `idem-${crypto.randomUUID()}`
      },
      payload: {
        target_overall_band: 6.5,
        target_exam_date: "2026-11-01",
        weekly_study_hours: 12,
        weak_skills: ["speaking", "writing"]
      }
    });
    expect(onboarding.statusCode).toBe(202);

    const onboardingBody = onboarding.json();

    const questions = await context.app.inject({
      method: "GET",
      url: `/v1/users/onboarding/${onboardingBody.assessment_id}/questions`,
      headers: {
        authorization: `Bearer ${accessToken}`
      }
    });

    expect(questions.statusCode).toBe(200);
    const questionsBody = questions.json();
    expect(questionsBody.total_questions).toBeGreaterThanOrEqual(8);

    const skillCount: Record<string, number> = {};
    for (const question of questionsBody.questions as Array<{ skill: string }>) {
      skillCount[question.skill] = (skillCount[question.skill] ?? 0) + 1;
    }

    expect(skillCount.listening).toBeGreaterThanOrEqual(2);
    expect(skillCount.speaking).toBeGreaterThanOrEqual(2);
    expect(skillCount.reading).toBeGreaterThanOrEqual(2);
    expect(skillCount.writing).toBeGreaterThanOrEqual(2);

    for (const question of questionsBody.questions as Array<{ question_id: string }>) {
      const submit = await context.app.inject({
        method: "POST",
        url: `/v1/users/onboarding/${onboardingBody.assessment_id}/answers`,
        headers: {
          authorization: `Bearer ${accessToken}`
        },
        payload: {
          question_id: question.question_id,
          answer: "time location purpose thesis argument example"
        }
      });
      expect(submit.statusCode).toBe(200);
    }

    const pause = await context.app.inject({
      method: "POST",
      url: `/v1/users/onboarding/${onboardingBody.assessment_id}/pause`,
      headers: {
        authorization: `Bearer ${accessToken}`
      }
    });
    expect(pause.statusCode).toBe(200);
    expect(pause.json().status).toBe("paused");

    const resume = await context.app.inject({
      method: "POST",
      url: `/v1/users/onboarding/${onboardingBody.assessment_id}/resume`,
      headers: {
        authorization: `Bearer ${accessToken}`
      }
    });
    expect(resume.statusCode).toBe(200);
    expect(resume.json().status).toBe("in_progress");

    const complete = await context.app.inject({
      method: "POST",
      url: `/v1/users/onboarding/${onboardingBody.assessment_id}/complete`,
      headers: {
        authorization: `Bearer ${accessToken}`
      }
    });

    expect(complete.statusCode).toBe(200);
    const completeBody = complete.json();
    expect(completeBody.status).toBe("completed");
    expect(completeBody.elapsed_seconds).toBeLessThanOrEqual(300);
    expect(completeBody.skill_bands.listening).toBeGreaterThan(0);

    const plan = await context.app.inject({
      method: "GET",
      url: "/v1/users/plans/active",
      headers: {
        authorization: `Bearer ${accessToken}`
      }
    });

    expect(plan.statusCode).toBe(200);
    const planBody = plan.json();
    expect(planBody.horizon_weeks).toBe(8);
    expect(planBody.weeks.length).toBe(8);
    expect(planBody.weeks[0].tasks.length).toBeGreaterThanOrEqual(4);

    const firstTask = planBody.weeks[0].tasks[0];

    const adjusted = await context.app.inject({
      method: "PATCH",
      url: `/v1/users/plans/${planBody.plan_id}/tasks/${firstTask.task_id}`,
      headers: {
        authorization: `Bearer ${accessToken}`
      },
      payload: {
        target_minutes: 90,
        completion_criteria: "完成90分钟专项训练并提交错因复盘"
      }
    });

    expect(adjusted.statusCode).toBe(200);
    expect(adjusted.json().version).toBeGreaterThan(planBody.version);

    const adjustedTask = adjusted.json().weeks[0].tasks.find((item: { task_id: string }) => item.task_id === firstTask.task_id);
    expect(adjustedTask.target_minutes).toBe(90);
    expect(adjustedTask.completion_criteria).toContain("90分钟");
  });
});
