import { afterEach, beforeEach, describe, expect, test } from "vitest";
import { buildServer } from "../src/app.js";

describe("S4 reading mode switch and writing evaluation", () => {
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

  const registerAndLogin = async () => {
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
        device_id: "windows"
      }
    });
    expect(login.statusCode).toBe(200);
    return login.json().access_token as string;
  };

  test("supports reading training/exam mode timer flow and submit with elapsed time", async () => {
    const accessToken = await registerAndLogin();

    const create = await context.app.inject({
      method: "POST",
      url: "/v1/practice/sessions",
      headers: {
        authorization: `Bearer ${accessToken}`
      },
      payload: {
        skill: "reading",
        training_mode: "training"
      }
    });
    expect(create.statusCode).toBe(201);
    const session = create.json();
    expect(session.training_mode).toBe("training");

    const switchToExam = await context.app.inject({
      method: "PATCH",
      url: `/v1/practice/sessions/${session.session_id}/mode`,
      headers: {
        authorization: `Bearer ${accessToken}`
      },
      payload: {
        training_mode: "exam",
        time_limit_seconds: 600
      }
    });
    expect(switchToExam.statusCode).toBe(200);
    expect(switchToExam.json().training_mode).toBe("exam");
    expect(switchToExam.json().timer.limit_seconds).toBe(600);

    const getTimer = await context.app.inject({
      method: "GET",
      url: `/v1/practice/sessions/${session.session_id}/timer`,
      headers: {
        authorization: `Bearer ${accessToken}`
      }
    });
    expect(getTimer.statusCode).toBe(200);
    expect(getTimer.json().timer.status).toBe("running");

    const pause = await context.app.inject({
      method: "POST",
      url: `/v1/practice/sessions/${session.session_id}/timer/pause`,
      headers: {
        authorization: `Bearer ${accessToken}`
      }
    });
    expect(pause.statusCode).toBe(200);
    expect(pause.json().timer.status).toBe("paused");

    const resume = await context.app.inject({
      method: "POST",
      url: `/v1/practice/sessions/${session.session_id}/timer/resume`,
      headers: {
        authorization: `Bearer ${accessToken}`
      }
    });
    expect(resume.statusCode).toBe(200);
    expect(resume.json().timer.status).toBe("running");

    const recover = await context.app.inject({
      method: "POST",
      url: `/v1/practice/sessions/${session.session_id}/timer/recover`,
      headers: {
        authorization: `Bearer ${accessToken}`
      }
    });
    expect(recover.statusCode).toBe(200);
    expect(recover.json().recovered).toBe(true);

    const sessionDetail = await context.app.inject({
      method: "GET",
      url: `/v1/practice/sessions/${session.session_id}`,
      headers: {
        authorization: `Bearer ${accessToken}`
      }
    });
    const questions = sessionDetail.json().questions as Array<{ question_id: string }>;

    const submit = await context.app.inject({
      method: "POST",
      url: `/v1/practice/sessions/${session.session_id}/submit`,
      headers: {
        authorization: `Bearer ${accessToken}`
      },
      payload: {
        answers: questions.map((item) => ({
          question_id: item.question_id,
          answer: "wrong answer"
        }))
      }
    });
    expect(submit.statusCode).toBe(200);
    expect(submit.json().submission.score_breakdown.mode).toBe("exam");
    expect(submit.json().submission.score_breakdown.elapsed_seconds).toBeGreaterThanOrEqual(0);
  });

  test("returns writing TR/CC/LR/GRA score and evidence-based suggestions", async () => {
    const accessToken = await registerAndLogin();

    const evaluate = await context.app.inject({
      method: "POST",
      url: "/v1/writing/evaluations",
      headers: {
        authorization: `Bearer ${accessToken}`
      },
      payload: {
        task_type: "task2",
        prompt: "Some people think online education is better than traditional classroom teaching.",
        essay:
          "I believe online education has clear advantages because it increases flexibility and access. For example, students can learn from high-quality resources regardless of location. However, traditional classrooms still provide stronger face-to-face interaction, so a mixed model may be most effective."
      }
    });
    expect(evaluate.statusCode).toBe(201);
    const evaluation = evaluate.json();
    expect(evaluation.scores.tr).toBeGreaterThan(0);
    expect(evaluation.scores.cc).toBeGreaterThan(0);
    expect(evaluation.scores.lr).toBeGreaterThan(0);
    expect(evaluation.scores.gra).toBeGreaterThan(0);
    expect(evaluation.latency_ms).toBeLessThanOrEqual(90000);
    expect(evaluation.suggestions.length).toBeGreaterThanOrEqual(3);
    expect(evaluation.suggestions.every((item: { evidence_sentence: string }) => item.evidence_sentence.length > 0)).toBe(
      true
    );

    const getEvaluation = await context.app.inject({
      method: "GET",
      url: `/v1/writing/evaluations/${evaluation.evaluation_id}`,
      headers: {
        authorization: `Bearer ${accessToken}`
      }
    });
    expect(getEvaluation.statusCode).toBe(200);
    expect(getEvaluation.json().evaluation_id).toBe(evaluation.evaluation_id);
  });
});
