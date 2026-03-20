import { afterEach, beforeEach, describe, expect, test } from "vitest";
import { randomUUID } from "node:crypto";
import { buildServer } from "../src/app.js";

describe("S5 writing rewrite, mock exam and subscription flow", () => {
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
        device_id: "iphone"
      }
    });
    expect(login.statusCode).toBe(200);
    return login.json() as {
      access_token: string;
      user_id: string;
    };
  };

  test("supports writing rewrite comparison and mock exam report writeback in self-hosted mode", async () => {
    const login = await registerAndLogin();

    const planId = randomUUID();
    const taskId = randomUUID();
    context.store.activePlanIdByUserId.set(login.user_id, planId);
    context.store.studyPlansById.set(planId, {
      id: planId,
      userId: login.user_id,
      assessmentId: randomUUID(),
      status: "active",
      horizonWeeks: 8,
      adjustmentHistory: [],
      version: 1,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      weeks: [
        {
          id: randomUUID(),
          weekNo: 1,
          goals: ["提升阅读速度"],
          tasks: [
            {
              id: taskId,
              skill: "reading",
              taskType: "targeted_practice",
              title: "阅读精练",
              targetMinutes: 60,
              completionCriteria: "完成 2 篇长难句分析",
              dayOfWeek: 2,
              status: "todo"
            }
          ]
        }
      ]
    });

    const evaluate = await context.app.inject({
      method: "POST",
      url: "/v1/writing/evaluations",
      headers: {
        authorization: `Bearer ${login.access_token}`
      },
      payload: {
        task_type: "task2",
        prompt: "Some people think online learning is replacing classroom education.",
        essay:
          "I partly agree with this view because online courses provide convenience. However, face to face communication remains essential for collaborative tasks."
      }
    });
    expect(evaluate.statusCode).toBe(201);
    const evaluation = evaluate.json();

    const rewrite = await context.app.inject({
      method: "POST",
      url: `/v1/writing/evaluations/${evaluation.evaluation_id}/rewrite`,
      headers: {
        authorization: `Bearer ${login.access_token}`
      },
      payload: {
        essay:
          "I strongly believe online learning should complement rather than replace classroom teaching. Because digital platforms increase flexibility and access, students can review lessons anytime. However, classroom interaction develops communication and teamwork in ways that online tools cannot fully replicate. Therefore, a blended model delivers better long term outcomes."
      }
    });
    expect(rewrite.statusCode).toBe(201);
    expect(rewrite.json().comparison.delta).toBeDefined();
    expect(rewrite.json().archive.delta_overall).toBeTypeOf("number");

    const archives = await context.app.inject({
      method: "GET",
      url: "/v1/writing/archives",
      headers: {
        authorization: `Bearer ${login.access_token}`
      }
    });
    expect(archives.statusCode).toBe(200);
    expect(archives.json().items.length).toBeGreaterThanOrEqual(1);

    const createExam = await context.app.inject({
      method: "POST",
      url: "/v1/mock-exams",
      headers: {
        authorization: `Bearer ${login.access_token}`,
        "x-device-id": "iphone"
      }
    });
    expect(createExam.statusCode).toBe(201);
    const exam = createExam.json();

    const progress = await context.app.inject({
      method: "POST",
      url: `/v1/mock-exams/${exam.exam_id}/progress`,
      headers: {
        authorization: `Bearer ${login.access_token}`
      },
      payload: {
        skill: "reading",
        answered_count: 24,
        completed: true
      }
    });
    expect(progress.statusCode).toBe(200);

    const recover = await context.app.inject({
      method: "POST",
      url: `/v1/mock-exams/${exam.exam_id}/recover`,
      headers: {
        authorization: `Bearer ${login.access_token}`
      }
    });
    expect(recover.statusCode).toBe(200);
    expect(recover.json().recovered).toBe(true);

    const submit = await context.app.inject({
      method: "POST",
      url: `/v1/mock-exams/${exam.exam_id}/submit`,
      headers: {
        authorization: `Bearer ${login.access_token}`
      },
      payload: {
        skill_bands: {
          listening: 6.5,
          speaking: 6,
          reading: 5.5,
          writing: 6
        }
      }
    });
    expect(submit.statusCode).toBe(200);
    expect(submit.json().report.total_estimated_band).toBeGreaterThan(0);

    const report = await context.app.inject({
      method: "GET",
      url: `/v1/mock-exams/${exam.exam_id}/report`,
      headers: {
        authorization: `Bearer ${login.access_token}`
      }
    });
    expect(report.statusCode).toBe(200);
    expect(report.json().plan_writeback.applied).toBe(true);
    expect(report.json().plan_writeback.undo_available).toBe(true);

    const undo = await context.app.inject({
      method: "POST",
      url: `/v1/mock-exams/${exam.exam_id}/report/writeback/undo`,
      headers: {
        authorization: `Bearer ${login.access_token}`
      }
    });
    expect(undo.statusCode).toBe(200);
    expect(undo.json().plan_writeback.undo_available).toBe(false);

    const exported = await context.app.inject({
      method: "GET",
      url: `/v1/mock-exams/${exam.exam_id}/report/export`,
      headers: {
        authorization: `Bearer ${login.access_token}`
      }
    });
    expect(exported.statusCode).toBe(200);
    expect(exported.json().content).toContain("Overall");

    const secondExam = await context.app.inject({
      method: "POST",
      url: "/v1/mock-exams",
      headers: {
        authorization: `Bearer ${login.access_token}`
      }
    });
    expect(secondExam.statusCode).toBe(201);
    const thirdExam = await context.app.inject({
      method: "POST",
      url: "/v1/mock-exams",
      headers: {
        authorization: `Bearer ${login.access_token}`
      }
    });
    expect(thirdExam.statusCode).toBe(201);
    const fourthExam = await context.app.inject({
      method: "POST",
      url: "/v1/mock-exams",
      headers: {
        authorization: `Bearer ${login.access_token}`
      }
    });
    expect(fourthExam.statusCode).toBe(201);
  });
});
