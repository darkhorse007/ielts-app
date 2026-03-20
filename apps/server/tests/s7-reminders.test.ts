import { afterEach, beforeEach, describe, expect, test } from "vitest";
import { randomUUID } from "node:crypto";
import { buildServer } from "../src/app.js";

describe("S7 personalized reminders", () => {
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
    return login.json() as {
      user_id: string;
      access_token: string;
    };
  };

  const seedActivePlan = (userId: string): { planId: string; taskId: string } => {
    const planId = randomUUID();
    const taskId = randomUUID();
    const now = new Date().toISOString();

    context.store.studyPlansById.set(planId, {
      id: planId,
      userId,
      assessmentId: randomUUID(),
      status: "active",
      horizonWeeks: 8,
      weeks: [
        {
          id: randomUUID(),
          weekNo: 1,
          goals: ["complete first week"],
          tasks: [
            {
              id: taskId,
              skill: "listening",
              taskType: "foundation",
              title: "listening task",
              targetMinutes: 30,
              completionCriteria: "complete and submit",
              dayOfWeek: 1,
              status: "todo"
            }
          ]
        }
      ],
      adjustmentHistory: [],
      version: 1,
      createdAt: now,
      updatedAt: now
    });
    context.store.activePlanIdByUserId.set(userId, planId);

    return {
      planId,
      taskId
    };
  };

  test("optimizes reminder hour and generates task deep-link", async () => {
    const user = await registerAndLogin();
    const seeded = seedActivePlan(user.user_id);

    const batch = await context.app.inject({
      method: "POST",
      url: "/v1/analytics/events/batch",
      headers: {
        authorization: `Bearer ${user.access_token}`
      },
      payload: {
        events: [
          {
            platform: "ios",
            event_type: "practice_submitted",
            created_at: "2026-02-27T21:05:00.000Z"
          },
          {
            platform: "ios",
            event_type: "writing_evaluated",
            created_at: "2026-02-27T21:20:00.000Z"
          },
          {
            platform: "ios",
            event_type: "practice_submitted",
            created_at: "2026-02-27T09:00:00.000Z"
          }
        ]
      }
    });
    expect(batch.statusCode).toBe(202);

    const recommendation = await context.app.inject({
      method: "GET",
      url: "/v1/reminders/recommendation",
      headers: {
        authorization: `Bearer ${user.access_token}`
      }
    });
    expect(recommendation.statusCode).toBe(200);
    expect(recommendation.json().subscribed).toBe(true);
    expect(recommendation.json().active_hour_utc).toBe(21);
    expect(recommendation.json().deep_link).toContain("/plan?");
    expect(recommendation.json().deep_link).toContain(`task_id=${seeded.taskId}`);
    expect(recommendation.json().plan_id).toBe(seeded.planId);
    expect(recommendation.json().task_id).toBe(seeded.taskId);
    expect(typeof recommendation.json().reminder_id).toBe("string");
    expect(new Date(recommendation.json().scheduled_at).toString()).not.toBe("Invalid Date");
  });

  test("supports unsubscribe and suppresses reminder recommendation", async () => {
    const user = await registerAndLogin();

    const update = await context.app.inject({
      method: "PUT",
      url: "/v1/reminders/preferences",
      headers: {
        authorization: `Bearer ${user.access_token}`
      },
      payload: {
        subscribed: false
      }
    });
    expect(update.statusCode).toBe(200);
    expect(update.json().subscribed).toBe(false);

    const recommendation = await context.app.inject({
      method: "GET",
      url: "/v1/reminders/recommendation",
      headers: {
        authorization: `Bearer ${user.access_token}`
      }
    });
    expect(recommendation.statusCode).toBe(200);
    expect(recommendation.json().subscribed).toBe(false);
    expect(recommendation.json().reminder_id).toBeUndefined();
  });

  test("tracks reminder click and rejects cross-user access", async () => {
    const owner = await registerAndLogin();
    const outsider = await registerAndLogin();
    seedActivePlan(owner.user_id);

    const recommendation = await context.app.inject({
      method: "GET",
      url: "/v1/reminders/recommendation",
      headers: {
        authorization: `Bearer ${owner.access_token}`
      }
    });
    expect(recommendation.statusCode).toBe(200);
    const reminderId = recommendation.json().reminder_id as string;

    const clickByOwner = await context.app.inject({
      method: "POST",
      url: `/v1/reminders/${reminderId}/click`,
      headers: {
        authorization: `Bearer ${owner.access_token}`
      }
    });
    expect(clickByOwner.statusCode).toBe(200);
    expect(clickByOwner.json().reminder_id).toBe(reminderId);
    expect(clickByOwner.json().deep_link).toContain("/plan?");
    expect(typeof clickByOwner.json().clicked_at).toBe("string");

    const clickByOutsider = await context.app.inject({
      method: "POST",
      url: `/v1/reminders/${reminderId}/click`,
      headers: {
        authorization: `Bearer ${outsider.access_token}`
      }
    });
    expect(clickByOutsider.statusCode).toBe(404);
    expect(clickByOutsider.json().code).toBe("REMINDER_NOT_FOUND");
  });
});
