import type { FastifyInstance } from "fastify";
import { z } from "zod";
import type { AuthService } from "../domain/auth-service.js";
import type { ReminderDeliveryService } from "../domain/reminder-delivery-service.js";
import type { ReminderService } from "../domain/reminder-service.js";
import type { ReminderDeviceRegistration } from "../domain/types.js";
import { authenticate, type AuthenticatedRequest } from "../middleware/auth.js";

const reminderPreferenceUpdateSchema = z.object({
  subscribed: z.boolean()
});

const reminderParamsSchema = z.object({
  reminder_id: z.string().uuid()
});

const reminderDeviceParamsSchema = z.object({
  installation_id: z.string().trim().min(1).max(128)
});

const reminderDeviceUpsertSchema = z.object({
  platform: z.enum(["ios", "android"]),
  permission_status: z.enum(["granted", "provisional", "undetermined", "denied", "unsupported"]),
  push_provider: z.enum(["apns", "fcm"]).optional(),
  push_token: z.string().trim().min(16).max(4096).optional(),
  device_label: z.string().trim().min(1).max(128).optional(),
  app_build: z.string().trim().min(1).max(64).optional(),
  environment: z.enum(["development", "preview", "production"])
});

const toError = (code: string, message: string): { code: string; message: string } => ({
  code,
  message
});

const toPushTokenPreview = (pushToken?: string): string | undefined => {
  if (!pushToken) {
    return undefined;
  }

  if (pushToken.length <= 10) {
    return pushToken;
  }

  return `${pushToken.slice(0, 6)}...${pushToken.slice(-4)}`;
};

const toReminderDeviceResponse = (
  reminderService: ReminderService,
  device: ReminderDeviceRegistration
): {
  installation_id: string;
  platform: "ios" | "android";
  permission_status: "granted" | "provisional" | "undetermined" | "denied" | "unsupported";
  push_provider?: "apns" | "fcm";
  push_token_preview?: string;
  device_label?: string;
  app_build?: string;
  environment: "development" | "preview" | "production";
  delivery_ready: boolean;
  created_at: string;
  updated_at: string;
} => ({
  installation_id: device.installationId,
  platform: device.platform,
  permission_status: device.permissionStatus,
  push_provider: device.pushProvider,
  push_token_preview: toPushTokenPreview(device.pushToken),
  device_label: device.deviceLabel,
  app_build: device.appBuild,
  environment: device.environment,
  delivery_ready: reminderService.isDeviceDeliverable(device),
  created_at: device.createdAt,
  updated_at: device.updatedAt
});

export const registerReminderRoutes = async (
  app: FastifyInstance,
  services: {
    authService: AuthService;
    reminderService: ReminderService;
    reminderDeliveryService: ReminderDeliveryService;
  }
): Promise<void> => {
  app.get("/v1/reminders/preferences", { preHandler: authenticate(services.authService) }, async (request, reply) => {
    const authRequest = request as AuthenticatedRequest;
    const preference = services.reminderService.getPreference(authRequest.auth.userId);
    const activeHourUtc = services.reminderService.getActiveHourUtc(authRequest.auth.userId);

    reply.code(200).send({
      subscribed: preference.subscribed,
      active_hour_utc: activeHourUtc,
      updated_at: preference.updatedAt
    });
  });

  app.put("/v1/reminders/preferences", { preHandler: authenticate(services.authService) }, async (request, reply) => {
    const parsed = reminderPreferenceUpdateSchema.safeParse(request.body);
    if (!parsed.success) {
      reply.code(400).send(toError("VALIDATION_ERROR", "reminder preference payload is invalid"));
      return;
    }

    const authRequest = request as AuthenticatedRequest;
    const preference = services.reminderService.updatePreference({
      userId: authRequest.auth.userId,
      subscribed: parsed.data.subscribed
    });
    const activeHourUtc = services.reminderService.getActiveHourUtc(authRequest.auth.userId);

    reply.code(200).send({
      subscribed: preference.subscribed,
      active_hour_utc: activeHourUtc,
      updated_at: preference.updatedAt
    });
  });

  app.get("/v1/reminders/recommendation", { preHandler: authenticate(services.authService) }, async (request, reply) => {
    const authRequest = request as AuthenticatedRequest;
    const result = services.reminderService.getRecommendation(authRequest.auth.userId);
    if (!result.recommendation) {
      reply.code(200).send({
        subscribed: false,
        active_hour_utc: result.activeHourUtc
      });
      return;
    }

    reply.code(200).send({
      subscribed: true,
      active_hour_utc: result.activeHourUtc,
      reminder_id: result.recommendation.id,
      scheduled_at: result.recommendation.scheduledAt,
      reason: result.recommendation.reason,
      deep_link: result.recommendation.deepLink,
      plan_id: result.recommendation.planId,
      task_id: result.recommendation.taskId,
      created_at: result.recommendation.createdAt
    });
  });

  app.get("/v1/reminders/devices", { preHandler: authenticate(services.authService) }, async (request, reply) => {
    const authRequest = request as AuthenticatedRequest;
    const devices = services.reminderService.listDevices(authRequest.auth.userId);
    reply.code(200).send({
      total_count: devices.length,
      deliverable_count: devices.filter((item) => services.reminderService.isDeviceDeliverable(item)).length,
      items: devices.map((item) => toReminderDeviceResponse(services.reminderService, item))
    });
  });

  app.put("/v1/reminders/devices/:installation_id", { preHandler: authenticate(services.authService) }, async (request, reply) => {
    const parsedParams = reminderDeviceParamsSchema.safeParse(request.params);
    if (!parsedParams.success) {
      reply.code(400).send(toError("VALIDATION_ERROR", "installation_id is invalid"));
      return;
    }

    const parsedBody = reminderDeviceUpsertSchema.safeParse(request.body);
    if (!parsedBody.success) {
      reply.code(400).send(toError("VALIDATION_ERROR", "reminder device payload is invalid"));
      return;
    }

    const authRequest = request as AuthenticatedRequest;
    const payload = parsedBody.data;
    const device = services.reminderService.upsertDevice({
      userId: authRequest.auth.userId,
      installationId: parsedParams.data.installation_id,
      platform: payload.platform,
      permissionStatus: payload.permission_status,
      pushProvider: payload.push_provider,
      pushToken: payload.push_token,
      deviceLabel: payload.device_label,
      appBuild: payload.app_build,
      environment: payload.environment
    });

    reply.code(200).send(toReminderDeviceResponse(services.reminderService, device));
  });

  app.delete(
    "/v1/reminders/devices/:installation_id",
    { preHandler: authenticate(services.authService) },
    async (request, reply) => {
      const parsedParams = reminderDeviceParamsSchema.safeParse(request.params);
      if (!parsedParams.success) {
        reply.code(400).send(toError("VALIDATION_ERROR", "installation_id is invalid"));
        return;
      }

      const authRequest = request as AuthenticatedRequest;
      const removed = services.reminderService.removeDevice({
        userId: authRequest.auth.userId,
        installationId: parsedParams.data.installation_id
      });
      reply.code(200).send({
        installation_id: parsedParams.data.installation_id,
        removed
      });
    }
  );

  app.post(
    "/v1/reminders/:reminder_id/dispatch-preview",
    { preHandler: authenticate(services.authService) },
    async (request, reply) => {
      const parsed = reminderParamsSchema.safeParse(request.params);
      if (!parsed.success) {
        reply.code(400).send(toError("VALIDATION_ERROR", "reminder_id is invalid"));
        return;
      }

      const authRequest = request as AuthenticatedRequest;
      try {
        const preview = services.reminderDeliveryService.previewDispatch({
          reminderId: parsed.data.reminder_id,
          requestUserId: authRequest.auth.userId
        });
        reply.code(200).send({
          reminder_id: preview.reminderId,
          user_id: preview.userId,
          subscribed: preview.subscribed,
          scheduled_at: preview.scheduledAt,
          deep_link: preview.deepLink,
          plan_id: preview.planId,
          task_id: preview.taskId,
          dispatchable_count: preview.dispatchableCount,
          skipped_count: preview.skippedCount,
          provider_summary: {
            apns: {
              enabled: preview.providerSummary.apns.enabled,
              configured: preview.providerSummary.apns.configured,
              ready: preview.providerSummary.apns.ready,
              missing_fields: preview.providerSummary.apns.missingFields,
              target_count: preview.providerSummary.apns.targetCount,
              dispatchable_count: preview.providerSummary.apns.dispatchableCount,
              skipped_count: preview.providerSummary.apns.skippedCount,
              bundle_id: preview.providerSummary.apns.bundleId
            },
            fcm: {
              enabled: preview.providerSummary.fcm.enabled,
              configured: preview.providerSummary.fcm.configured,
              ready: preview.providerSummary.fcm.ready,
              missing_fields: preview.providerSummary.fcm.missingFields,
              target_count: preview.providerSummary.fcm.targetCount,
              dispatchable_count: preview.providerSummary.fcm.dispatchableCount,
              skipped_count: preview.providerSummary.fcm.skippedCount,
              project_id: preview.providerSummary.fcm.projectId
            }
          },
          items: preview.items.map((item) => ({
            installation_id: item.installationId,
            platform: item.platform,
            permission_status: item.permissionStatus,
            push_provider: item.pushProvider,
            push_token_preview: item.pushTokenPreview,
            environment: item.environment,
            delivery_ready: item.deliveryReady,
            dispatchable: item.dispatchable,
            provider_ready: item.providerReady,
            skip_reason: item.skipReason,
            device_label: item.deviceLabel,
            app_build: item.appBuild,
            updated_at: item.updatedAt
          }))
        });
      } catch (error) {
        if (error instanceof Error && error.message === "REMINDER_NOT_FOUND") {
          reply.code(404).send(toError("REMINDER_NOT_FOUND", "reminder not found"));
          return;
        }
        throw error;
      }
    }
  );

  app.post(
    "/v1/reminders/:reminder_id/dispatch",
    { preHandler: authenticate(services.authService) },
    async (request, reply) => {
      const parsed = reminderParamsSchema.safeParse(request.params);
      if (!parsed.success) {
        reply.code(400).send(toError("VALIDATION_ERROR", "reminder_id is invalid"));
        return;
      }

      const authRequest = request as AuthenticatedRequest;
      try {
        const result = await services.reminderDeliveryService.dispatch({
          reminderId: parsed.data.reminder_id,
          requestUserId: authRequest.auth.userId
        });
        reply.code(200).send({
          reminder_id: result.reminderId,
          user_id: result.userId,
          dispatch_count: result.dispatchCount,
          duplicate_count: result.duplicateCount,
          skipped_count: result.skippedCount,
          failed_count: result.failedCount,
          items: result.items.map((item) => ({
            attempt_id: item.attemptId,
            installation_id: item.installationId,
            platform: item.platform,
            push_provider: item.pushProvider,
            status: item.status,
            provider_message_id: item.providerMessageId,
            duplicate_of_attempt_id: item.duplicateOfAttemptId,
            skip_reason: item.skipReason,
            failure_code: item.failureCode,
            failure_message: item.failureMessage,
            retry_count: item.retryCount,
            updated_at: item.updatedAt
          }))
        });
      } catch (error) {
        if (error instanceof Error && error.message === "REMINDER_NOT_FOUND") {
          reply.code(404).send(toError("REMINDER_NOT_FOUND", "reminder not found"));
          return;
        }
        throw error;
      }
    }
  );

  app.post("/v1/reminders/:reminder_id/click", { preHandler: authenticate(services.authService) }, async (request, reply) => {
    const parsed = reminderParamsSchema.safeParse(request.params);
    if (!parsed.success) {
      reply.code(400).send(toError("VALIDATION_ERROR", "reminder_id is invalid"));
      return;
    }

    const authRequest = request as AuthenticatedRequest;
    try {
      const reminder = services.reminderService.clickReminder({
        userId: authRequest.auth.userId,
        reminderId: parsed.data.reminder_id
      });
      reply.code(200).send({
        reminder_id: reminder.id,
        deep_link: reminder.deepLink,
        plan_id: reminder.planId,
        task_id: reminder.taskId,
        clicked_at: reminder.clickedAt
      });
    } catch (error) {
      if (error instanceof Error && error.message === "REMINDER_NOT_FOUND") {
        reply.code(404).send(toError("REMINDER_NOT_FOUND", "reminder not found"));
        return;
      }
      throw error;
    }
  });
};
