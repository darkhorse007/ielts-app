import { afterEach, beforeEach, describe, expect, test } from "vitest";
import { buildServer } from "../src/app.js";

describe("US-2104 adaptive study plan", () => {
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

  test("auto adjusts active plan after new practice data and exposes reason/history", async () => {
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
        device_id: "ios"
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
        weekly_study_hours: 10,
        weak_skills: ["listening", "speaking"]
      }
    });
    expect(onboarding.statusCode).toBe(202);
    const assessmentId = onboarding.json().assessment_id as string;

    const questions = await context.app.inject({
      method: "GET",
      url: `/v1/users/onboarding/${assessmentId}/questions`,
      headers: {
        authorization: `Bearer ${accessToken}`
      }
    });
    expect(questions.statusCode).toBe(200);

    for (const question of questions.json().questions as Array<{ question_id: string }>) {
      const submit = await context.app.inject({
        method: "POST",
        url: `/v1/users/onboarding/${assessmentId}/answers`,
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

    const complete = await context.app.inject({
      method: "POST",
      url: `/v1/users/onboarding/${assessmentId}/complete`,
      headers: {
        authorization: `Bearer ${accessToken}`
      }
    });
    expect(complete.statusCode).toBe(200);

    const planBefore = await context.app.inject({
      method: "GET",
      url: "/v1/users/plans/active",
      headers: {
        authorization: `Bearer ${accessToken}`
      }
    });
    expect(planBefore.statusCode).toBe(200);
    const planBeforeBody = planBefore.json();
    const listeningTaskBefore = planBeforeBody.weeks
      .flatMap((week: { tasks: Array<{ skill: string; task_id: string; target_minutes: number }> }) => week.tasks)
      .find((task: { skill: string }) => task.skill === "listening");
    expect(listeningTaskBefore).toBeDefined();

    const createSession = await context.app.inject({
      method: "POST",
      url: "/v1/practice/sessions",
      headers: {
        authorization: `Bearer ${accessToken}`
      },
      payload: {
        skill: "listening"
      }
    });
    expect(createSession.statusCode).toBe(201);
    const created = createSession.json();

    const submitPractice = await context.app.inject({
      method: "POST",
      url: `/v1/practice/sessions/${created.session_id}/submit`,
      headers: {
        authorization: `Bearer ${accessToken}`
      },
      payload: {
        answers: created.questions.map((question: { question_id: string }) => ({
          question_id: question.question_id,
          answer: "wrong"
        }))
      }
    });
    expect(submitPractice.statusCode).toBe(200);

    const planAfter = await context.app.inject({
      method: "GET",
      url: "/v1/users/plans/active",
      headers: {
        authorization: `Bearer ${accessToken}`
      }
    });
    expect(planAfter.statusCode).toBe(200);
    const planAfterBody = planAfter.json();

    const listeningTaskAfter = planAfterBody.weeks
      .flatMap((week: { tasks: Array<{ skill: string; task_id: string; target_minutes: number }> }) => week.tasks)
      .find((task: { skill: string; task_id: string }) =>
        task.skill === "listening" && task.task_id === listeningTaskBefore.task_id
      );

    expect(planAfterBody.version).toBeGreaterThan(planBeforeBody.version);
    expect(listeningTaskAfter.target_minutes).toBeGreaterThan(listeningTaskBefore.target_minutes);

    const history = await context.app.inject({
      method: "GET",
      url: `/v1/users/plans/${planAfterBody.plan_id}/adjustments?source_type=practice_session&skill=listening&page=1&page_size=20`,
      headers: {
        authorization: `Bearer ${accessToken}`
      }
    });
    expect(history.statusCode).toBe(200);
    const historyBody = history.json();
    expect(historyBody.total).toBeGreaterThanOrEqual(1);
    expect(historyBody.items[0].reason).toContain("最近表现");
    expect(historyBody.items[0].changed_tasks[0].after_target_minutes).toBeGreaterThan(
      historyBody.items[0].changed_tasks[0].before_target_minutes
    );
    expect(Date.now() - new Date(historyBody.items[0].created_at).getTime()).toBeLessThanOrEqual(120000);
  });
});
