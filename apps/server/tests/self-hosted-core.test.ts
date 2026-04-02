import { afterEach, beforeEach, describe, expect, test } from "vitest";
import { buildServer } from "../src/app.js";

describe("self-hosted core mode", () => {
  const nextEmail = () => `candidate-${crypto.randomUUID()}@example.com`;

  const build = async (overrides?: Parameters<typeof buildServer>[0]) => {
    const server = buildServer(overrides);
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

  test("disables public subscription endpoints while keeping mock exam available without quota gating", async () => {
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
        device_id: "self-hosted-browser"
      }
    });
    expect(login.statusCode).toBe(200);
    const accessToken = login.json().access_token as string;

    const subscription = await context.app.inject({
      method: "GET",
      url: "/v1/subscription/entitlement",
      headers: {
        authorization: `Bearer ${accessToken}`
      }
    });
    expect(subscription.statusCode).toBe(404);

    const paymentRuntime = await context.app.inject({
      method: "GET",
      url: "/v1/system/payments/runtime",
      headers: {
        authorization: `Bearer ${accessToken}`
      }
    });
    expect(paymentRuntime.statusCode).toBe(404);

    for (let index = 0; index < 4; index += 1) {
      const createExam = await context.app.inject({
        method: "POST",
        url: "/v1/mock-exams",
        headers: {
          authorization: `Bearer ${accessToken}`,
          "x-device-id": `device-${index}`
        }
      });
      expect(createExam.statusCode).toBe(201);
      expect(createExam.json().exam_id).toBeTypeOf("string");
    }
  });

  test("keeps health status ok while exposing injected reminder scheduler status", async () => {
    await context.app.close();
    context = await build({
      reminderDispatchSchedulerStatus: {
        enabled: true,
        intervalSeconds: 60,
        batchSize: 20,
        running: false,
        lastTrigger: "interval",
        lastStartedAt: "2026-04-02T10:00:00.000Z",
        lastCompletedAt: "2026-04-02T10:00:01.000Z",
        lastSuccessAt: "2026-04-02T10:00:01.000Z",
        lastDueCount: 3,
        lastDispatchedReminderCount: 2,
        lastSkippedAlreadyAttemptedCount: 1
      }
    });

    const response = await context.app.inject({
      method: "GET",
      url: "/health"
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({
      status: "ok",
      reminder_dispatch_scheduler: {
        enabled: true,
        running: false,
        interval_seconds: 60,
        batch_size: 20,
        last_trigger: "interval",
        last_started_at: "2026-04-02T10:00:00.000Z",
        last_completed_at: "2026-04-02T10:00:01.000Z",
        last_success_at: "2026-04-02T10:00:01.000Z",
        last_due_count: 3,
        last_dispatched_reminder_count: 2,
        last_skipped_already_attempted_count: 1
      }
    });
  });

  test("keeps internal scheduler status route disabled by default", async () => {
    const response = await context.app.inject({
      method: "GET",
      url: "/internal/reminders/scheduler-status"
    });

    expect(response.statusCode).toBe(404);
  });

  test("exposes internal scheduler status route when internal debug routes are enabled", async () => {
    await context.app.close();
    context = await build({
      enableInternalDebugRoutes: true,
      reminderDispatchSchedulerStatus: {
        enabled: true,
        intervalSeconds: 15,
        batchSize: 7,
        running: true,
        lastTrigger: "startup",
        lastStartedAt: "2026-04-02T09:59:59.000Z",
        lastError: "temporary provider timeout"
      }
    });

    const response = await context.app.inject({
      method: "GET",
      url: "/internal/reminders/scheduler-status"
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({
      reminder_dispatch_scheduler: {
        enabled: true,
        running: true,
        interval_seconds: 15,
        batch_size: 7,
        last_trigger: "startup",
        last_started_at: "2026-04-02T09:59:59.000Z",
        last_error: "temporary provider timeout"
      }
    });
  });
});
