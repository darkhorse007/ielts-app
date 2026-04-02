import { afterEach, beforeEach, describe, expect, test } from "vitest";
import { randomUUID } from "node:crypto";
import { buildServer } from "../src/app.js";

describe("S7 personalized reminders", () => {
  const nextEmail = () => `candidate-${crypto.randomUUID()}@example.com`;

  const build = async () => {
    const server = buildServer({
      reminderDeliveryApnsEnabled: true,
      reminderDeliveryApnsBundleId: "com.selfhosted.ielts",
      reminderDeliveryFcmEnabled: true
    });
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

  test("registers lists and removes reminder devices", async () => {
    const user = await registerAndLogin();
    const installationId = "ios-installation-1";

    const registerDevice = await context.app.inject({
      method: "PUT",
      url: `/v1/reminders/devices/${installationId}`,
      headers: {
        authorization: `Bearer ${user.access_token}`
      },
      payload: {
        platform: "ios",
        permission_status: "granted",
        push_provider: "apns",
        push_token: "native-token-abcdef1234567890",
        device_label: "iPhone 15 Pro",
        app_build: "1.0.0",
        environment: "production"
      }
    });
    expect(registerDevice.statusCode).toBe(200);
    expect(registerDevice.json().installation_id).toBe(installationId);
    expect(registerDevice.json().delivery_ready).toBe(true);
    expect(registerDevice.json().push_token_preview).toBe("native...7890");

    const listDevices = await context.app.inject({
      method: "GET",
      url: "/v1/reminders/devices",
      headers: {
        authorization: `Bearer ${user.access_token}`
      }
    });
    expect(listDevices.statusCode).toBe(200);
    expect(listDevices.json().total_count).toBe(1);
    expect(listDevices.json().deliverable_count).toBe(1);
    expect(listDevices.json().items[0].installation_id).toBe(installationId);

    const deleteDevice = await context.app.inject({
      method: "DELETE",
      url: `/v1/reminders/devices/${installationId}`,
      headers: {
        authorization: `Bearer ${user.access_token}`
      }
    });
    expect(deleteDevice.statusCode).toBe(200);
    expect(deleteDevice.json()).toEqual({
      installation_id: installationId,
      removed: true
    });

    const listAfterDelete = await context.app.inject({
      method: "GET",
      url: "/v1/reminders/devices",
      headers: {
        authorization: `Bearer ${user.access_token}`
      }
    });
    expect(listAfterDelete.statusCode).toBe(200);
    expect(listAfterDelete.json().total_count).toBe(0);
    expect(listAfterDelete.json().deliverable_count).toBe(0);
  });

  test("updates the same reminder installation without creating duplicates", async () => {
    const user = await registerAndLogin();
    const installationId = "ios-installation-2";

    const firstUpsert = await context.app.inject({
      method: "PUT",
      url: `/v1/reminders/devices/${installationId}`,
      headers: {
        authorization: `Bearer ${user.access_token}`
      },
      payload: {
        platform: "ios",
        permission_status: "denied",
        device_label: "iPhone 14",
        environment: "preview"
      }
    });
    expect(firstUpsert.statusCode).toBe(200);
    expect(firstUpsert.json().delivery_ready).toBe(false);

    const secondUpsert = await context.app.inject({
      method: "PUT",
      url: `/v1/reminders/devices/${installationId}`,
      headers: {
        authorization: `Bearer ${user.access_token}`
      },
      payload: {
        platform: "ios",
        permission_status: "granted",
        push_provider: "apns",
        push_token: "native-token-fedcba0987654321",
        device_label: "iPhone 14",
        app_build: "1.0.1",
        environment: "production"
      }
    });
    expect(secondUpsert.statusCode).toBe(200);
    expect(secondUpsert.json().installation_id).toBe(installationId);
    expect(secondUpsert.json().delivery_ready).toBe(true);
    expect(secondUpsert.json().push_token_preview).toBe("native...4321");

    const listDevices = await context.app.inject({
      method: "GET",
      url: "/v1/reminders/devices",
      headers: {
        authorization: `Bearer ${user.access_token}`
      }
    });
    expect(listDevices.statusCode).toBe(200);
    expect(listDevices.json().total_count).toBe(1);
    expect(listDevices.json().deliverable_count).toBe(1);
    expect(listDevices.json().items[0].permission_status).toBe("granted");
    expect(listDevices.json().items[0].app_build).toBe("1.0.1");
  });

  test("keeps reminder devices isolated across users", async () => {
    const owner = await registerAndLogin();
    const outsider = await registerAndLogin();
    const installationId = "shared-installation-id";

    const ownerUpsert = await context.app.inject({
      method: "PUT",
      url: `/v1/reminders/devices/${installationId}`,
      headers: {
        authorization: `Bearer ${owner.access_token}`
      },
      payload: {
        platform: "android",
        permission_status: "granted",
        push_provider: "fcm",
        push_token: "android-token-abcdef1234567890",
        environment: "production"
      }
    });
    expect(ownerUpsert.statusCode).toBe(200);

    const outsiderDelete = await context.app.inject({
      method: "DELETE",
      url: `/v1/reminders/devices/${installationId}`,
      headers: {
        authorization: `Bearer ${outsider.access_token}`
      }
    });
    expect(outsiderDelete.statusCode).toBe(200);
    expect(outsiderDelete.json()).toEqual({
      installation_id: installationId,
      removed: false
    });

    const ownerDevices = await context.app.inject({
      method: "GET",
      url: "/v1/reminders/devices",
      headers: {
        authorization: `Bearer ${owner.access_token}`
      }
    });
    expect(ownerDevices.statusCode).toBe(200);
    expect(ownerDevices.json().total_count).toBe(1);
    expect(ownerDevices.json().items[0].installation_id).toBe(installationId);

    const outsiderDevices = await context.app.inject({
      method: "GET",
      url: "/v1/reminders/devices",
      headers: {
        authorization: `Bearer ${outsider.access_token}`
      }
    });
    expect(outsiderDevices.statusCode).toBe(200);
    expect(outsiderDevices.json().total_count).toBe(0);
  });

  test("previews reminder dispatch targets and provider readiness", async () => {
    const user = await registerAndLogin();
    seedActivePlan(user.user_id);

    const recommendation = await context.app.inject({
      method: "GET",
      url: "/v1/reminders/recommendation",
      headers: {
        authorization: `Bearer ${user.access_token}`
      }
    });
    expect(recommendation.statusCode).toBe(200);
    const reminderId = recommendation.json().reminder_id as string;

    const iosDevice = await context.app.inject({
      method: "PUT",
      url: "/v1/reminders/devices/dispatch-ios-1",
      headers: {
        authorization: `Bearer ${user.access_token}`
      },
      payload: {
        platform: "ios",
        permission_status: "granted",
        push_provider: "apns",
        push_token: "native-token-abcdef1234567890",
        environment: "production"
      }
    });
    expect(iosDevice.statusCode).toBe(200);

    const androidDevice = await context.app.inject({
      method: "PUT",
      url: "/v1/reminders/devices/dispatch-android-1",
      headers: {
        authorization: `Bearer ${user.access_token}`
      },
      payload: {
        platform: "android",
        permission_status: "granted",
        push_provider: "fcm",
        push_token: "android-token-abcdef1234567890",
        environment: "production"
      }
    });
    expect(androidDevice.statusCode).toBe(200);

    const deniedDevice = await context.app.inject({
      method: "PUT",
      url: "/v1/reminders/devices/dispatch-ios-2",
      headers: {
        authorization: `Bearer ${user.access_token}`
      },
      payload: {
        platform: "ios",
        permission_status: "denied",
        environment: "preview"
      }
    });
    expect(deniedDevice.statusCode).toBe(200);

    const preview = await context.app.inject({
      method: "POST",
      url: `/v1/reminders/${reminderId}/dispatch-preview`,
      headers: {
        authorization: `Bearer ${user.access_token}`
      }
    });
    expect(preview.statusCode).toBe(200);
    expect(preview.json().reminder_id).toBe(reminderId);
    expect(preview.json().dispatchable_count).toBe(1);
    expect(preview.json().skipped_count).toBe(2);
    expect(preview.json().provider_summary.apns.ready).toBe(true);
    expect(preview.json().provider_summary.apns.bundle_id).toBe("com.selfhosted.ielts");
    expect(preview.json().provider_summary.apns.dispatchable_count).toBe(1);
    expect(preview.json().provider_summary.fcm.enabled).toBe(true);
    expect(preview.json().provider_summary.fcm.ready).toBe(false);
    expect(preview.json().provider_summary.fcm.missing_fields).toEqual(["project_id"]);
    expect(preview.json().provider_summary.fcm.skipped_count).toBe(1);

    const previewItems = preview.json().items as Array<{
      installation_id: string;
      dispatchable: boolean;
      provider_ready: boolean;
      skip_reason?: string;
      push_token_preview?: string;
    }>;
    expect(previewItems).toHaveLength(3);
    expect(previewItems.find((item) => item.installation_id === "dispatch-ios-1")).toMatchObject({
      dispatchable: true,
      provider_ready: true,
      push_token_preview: "native...7890"
    });
    expect(previewItems.find((item) => item.installation_id === "dispatch-android-1")).toMatchObject({
      dispatchable: false,
      provider_ready: false,
      skip_reason: "PROVIDER_NOT_CONFIGURED"
    });
    expect(previewItems.find((item) => item.installation_id === "dispatch-ios-2")).toMatchObject({
      dispatchable: false,
      provider_ready: false,
      skip_reason: "DEVICE_NOT_DELIVERABLE"
    });
  });

  test("rejects reminder dispatch preview for other users", async () => {
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

    const preview = await context.app.inject({
      method: "POST",
      url: `/v1/reminders/${reminderId}/dispatch-preview`,
      headers: {
        authorization: `Bearer ${outsider.access_token}`
      }
    });
    expect(preview.statusCode).toBe(404);
    expect(preview.json().code).toBe("REMINDER_NOT_FOUND");
  });
});
