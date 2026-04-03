import { generateKeyPairSync } from "node:crypto";
import { afterEach, beforeEach, describe, expect, test } from "vitest";
import { buildServer } from "../src/app.js";

describe("self-hosted core mode", () => {
  const nextEmail = () => `candidate-${crypto.randomUUID()}@example.com`;
  const nextOpsEmail = () => `ops-reviewer-${crypto.randomUUID()}@example.com`;

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

  const registerAndLogin = async (email = nextEmail(), deviceId = "self-hosted-browser") => {
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
        device_id: deviceId
      }
    });
    expect(login.statusCode).toBe(200);

    return {
      email,
      accessToken: login.json().access_token as string
    };
  };

  test("disables public subscription endpoints while keeping mock exam available without quota gating", async () => {
    const learner = await registerAndLogin();
    const accessToken = learner.accessToken;

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

  test("keeps internal reminder push status route disabled by default", async () => {
    const response = await context.app.inject({
      method: "GET",
      url: "/internal/reminders/push-status"
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
    const opsUser = await registerAndLogin(nextOpsEmail(), "ops-console");

    const response = await context.app.inject({
      method: "GET",
      url: "/internal/reminders/scheduler-status",
      headers: {
        authorization: `Bearer ${opsUser.accessToken}`
      }
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

  test("exposes internal reminder push status route when internal debug routes are enabled", async () => {
    const { privateKey: apnsPrivateKey } = generateKeyPairSync("ec", {
      namedCurve: "prime256v1",
      privateKeyEncoding: {
        type: "pkcs8",
        format: "pem"
      },
      publicKeyEncoding: {
        type: "spki",
        format: "pem"
      }
    });
    const { privateKey: fcmPrivateKey } = generateKeyPairSync("rsa", {
      modulusLength: 2048,
      privateKeyEncoding: {
        type: "pkcs8",
        format: "pem"
      },
      publicKeyEncoding: {
        type: "spki",
        format: "pem"
      }
    });

    await context.app.close();
    context = await build({
      enableInternalDebugRoutes: true,
      reminderDeliveryApnsEnabled: true,
      reminderDeliveryApnsBundleId: "com.selfhosted.ielts",
      reminderDeliveryApnsTeamId: "TEAM123",
      reminderDeliveryApnsKeyId: "KEY123",
      reminderDeliveryApnsPrivateKey: apnsPrivateKey,
      reminderDeliveryFcmEnabled: true,
      reminderDeliveryFcmProjectId: "project-123",
      reminderDeliveryFcmClientEmail: "push@example.iam.gserviceaccount.com",
      reminderDeliveryFcmPrivateKey: fcmPrivateKey
    });
    const opsUser = await registerAndLogin(nextOpsEmail(), "ops-console");

    context.reminderService.upsertDevice({
      userId: "user-apns-1",
      installationId: "ios-production-1",
      platform: "ios",
      permissionStatus: "granted",
      pushProvider: "apns",
      pushToken: "native-token-abcdef1234567890",
      environment: "production"
    });
    context.reminderService.upsertDevice({
      userId: "user-apns-2",
      installationId: "ios-preview-1",
      platform: "ios",
      permissionStatus: "denied",
      pushProvider: "apns",
      pushToken: "native-token-preview1234567890",
      environment: "preview"
    });
    context.reminderService.upsertDevice({
      userId: "user-fcm-1",
      installationId: "android-production-1",
      platform: "android",
      permissionStatus: "provisional",
      pushProvider: "fcm",
      pushToken: "android-token-abcdef1234567890",
      environment: "production"
    });
    context.reminderService.upsertDevice({
      userId: "user-fcm-2",
      installationId: "android-development-1",
      platform: "android",
      permissionStatus: "granted",
      pushProvider: "fcm",
      environment: "development"
    });

    const response = await context.app.inject({
      method: "GET",
      url: "/internal/reminders/push-status",
      headers: {
        authorization: `Bearer ${opsUser.accessToken}`
      }
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({
      reminder_push_providers: {
        apns: {
          enabled: true,
          configured: true,
          ready: true,
          sender_available: true,
          missing_fields: [],
          registered_device_count: 2,
          deliverable_device_count: 1,
          platform_counts: {
            ios: 2,
            android: 0
          },
          environment_counts: {
            development: 0,
            preview: 1,
            production: 1
          },
          bundle_id: "com.selfhosted.ielts"
        },
        fcm: {
          enabled: true,
          configured: true,
          ready: true,
          sender_available: true,
          missing_fields: [],
          registered_device_count: 2,
          deliverable_device_count: 1,
          platform_counts: {
            ios: 0,
            android: 2
          },
          environment_counts: {
            development: 1,
            preview: 0,
            production: 1
          },
          project_id: "project-123"
        }
      }
    });
  });
});
