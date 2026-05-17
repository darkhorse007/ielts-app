import { afterEach, beforeEach, describe, expect, test } from "vitest";
import { buildServer } from "../src/app.js";

describe("S36 analytics coverage smoke", () => {
  const nextEmail = () => `analytics-coverage-${crypto.randomUUID()}@example.com`;

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
        device_id: "analytics-coverage-browser"
      }
    });
    expect(login.statusCode).toBe(200);

    return login.json() as {
      access_token: string;
      user_id: string;
    };
  };

  test("surfaces learner key events in analytics summary across web and mobile platforms", async () => {
    const user = await registerAndLogin();

    const ingest = await context.app.inject({
      method: "POST",
      url: "/v1/analytics/events/batch",
      headers: {
        authorization: `Bearer ${user.access_token}`
      },
      payload: {
        events: [
          {
            platform: "web",
            event_type: "onboarding_submitted",
            trace_id: "web-onboarding-coverage-1",
            metadata: {
              assessmentId: "assessment-coverage-1",
              planId: "plan-coverage-1"
            },
            created_at: "2026-04-11T08:00:00.000Z"
          },
          {
            platform: "ios",
            skill: "listening",
            event_type: "practice_submitted",
            trace_id: "ios-practice-coverage-1",
            metadata: {
              sessionId: "listening-session-coverage-1",
              taskType: "core_training"
            },
            created_at: "2026-04-11T08:05:00.000Z"
          },
          {
            platform: "android",
            skill: "writing",
            event_type: "writing_evaluated",
            trace_id: "android-writing-coverage-1",
            fallback_triggered: false,
            latency_ms: 812,
            metadata: {
              evaluationId: "writing-eval-coverage-1",
              overall: 6.5
            },
            created_at: "2026-04-11T08:10:00.000Z"
          },
          {
            platform: "web",
            event_type: "mock_exam_submitted",
            trace_id: "web-mock-coverage-1",
            metadata: {
              examId: "mock-exam-coverage-1",
              reportId: "mock-report-coverage-1",
              overall: 6
            },
            created_at: "2026-04-11T08:15:00.000Z"
          },
          {
            platform: "ios",
            event_type: "reminder_clicked",
            trace_id: "ios-reminder-coverage-1",
            metadata: {
              reminderId: "reminder-coverage-1",
              deepLink: "/plan?task_id=task-coverage-1"
            },
            created_at: "2026-04-11T08:20:00.000Z"
          }
        ]
      }
    });

    expect(ingest.statusCode).toBe(202);
    expect(ingest.json()).toMatchObject({
      accepted_count: 5,
      rejected_count: 0,
      field_completeness_percent: 100
    });

    const summary = await context.app.inject({
      method: "GET",
      url: "/v1/analytics/summary",
      headers: {
        authorization: `Bearer ${user.access_token}`
      }
    });

    expect(summary.statusCode).toBe(200);
    expect(summary.json()).toMatchObject({
      total_events: 5,
      by_platform: {
        web: 2,
        ios: 2,
        android: 1
      },
      by_skill: {
        listening: 1,
        writing: 1
      },
      field_completeness_percent: 100
    });

    const recentEvents = summary.json().recent_events as Array<{
      event_type: string;
      platform: string;
      skill?: string;
      trace_id: string;
      created_at: string;
    }>;

    expect(recentEvents).toHaveLength(5);
    expect(new Set(recentEvents.map((item) => item.event_type))).toEqual(
      new Set([
        "onboarding_submitted",
        "practice_submitted",
        "writing_evaluated",
        "mock_exam_submitted",
        "reminder_clicked"
      ])
    );
    expect(recentEvents.every((item) => item.trace_id.length > 0)).toBe(true);
    expect(recentEvents.every((item) => item.created_at.length > 0)).toBe(true);

    const iosSummary = await context.app.inject({
      method: "GET",
      url: "/v1/analytics/summary?platform=ios",
      headers: {
        authorization: `Bearer ${user.access_token}`
      }
    });
    expect(iosSummary.statusCode).toBe(200);
    expect(iosSummary.json()).toMatchObject({
      total_events: 2,
      by_platform: {
        ios: 2
      }
    });

    const writingSummary = await context.app.inject({
      method: "GET",
      url: "/v1/analytics/summary?skill=writing",
      headers: {
        authorization: `Bearer ${user.access_token}`
      }
    });
    expect(writingSummary.statusCode).toBe(200);
    expect(writingSummary.json()).toMatchObject({
      total_events: 1,
      by_skill: {
        writing: 1
      },
      recent_events: [
        expect.objectContaining({
          event_type: "writing_evaluated",
          platform: "android",
          skill: "writing"
        })
      ]
    });
  });
});
