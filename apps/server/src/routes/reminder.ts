import type { FastifyInstance } from "fastify";
import { z } from "zod";
import type { AuthService } from "../domain/auth-service.js";
import type { ReminderService } from "../domain/reminder-service.js";
import { authenticate, type AuthenticatedRequest } from "../middleware/auth.js";

const reminderPreferenceUpdateSchema = z.object({
  subscribed: z.boolean()
});

const reminderParamsSchema = z.object({
  reminder_id: z.string().uuid()
});

const toError = (code: string, message: string): { code: string; message: string } => ({
  code,
  message
});

export const registerReminderRoutes = async (
  app: FastifyInstance,
  services: {
    authService: AuthService;
    reminderService: ReminderService;
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
