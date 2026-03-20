import type { FastifyInstance } from "fastify";
import { z } from "zod";
import type { AuthService } from "../domain/auth-service.js";
import type { ChurnService } from "../domain/churn-service.js";
import { authenticate, type AuthenticatedRequest } from "../middleware/auth.js";

const churnRiskQuerySchema = z.object({
  min_score: z
    .string()
    .optional()
    .transform((value) => (value === undefined ? undefined : Number(value))),
  level: z.enum(["low", "medium", "high"]).optional(),
  limit: z
    .string()
    .optional()
    .transform((value) => (value === undefined ? undefined : Number(value)))
});

const churnTriggerSchema = z.object({
  user_id: z.string().uuid(),
  strategy_type: z.enum(["smart_reminder", "mock_exam_boost", "coupon_nudge"]),
  reason: z.string().trim().min(1).max(300).optional(),
  conversion_window_days: z.number().int().min(1).max(30).optional()
});

const churnEffectQuerySchema = z.object({
  since: z.string().datetime().optional(),
  strategy_type: z.enum(["smart_reminder", "mock_exam_boost", "coupon_nudge"]).optional()
});

const toError = (code: string, message: string): { code: string; message: string } => ({
  code,
  message
});

export const registerChurnRoutes = async (
  app: FastifyInstance,
  services: {
    authService: AuthService;
    churnService: ChurnService;
  }
): Promise<void> => {
  app.get("/v1/analytics/churn/risks", { preHandler: authenticate(services.authService) }, async (request, reply) => {
    const parsed = churnRiskQuerySchema.safeParse(request.query ?? {});
    if (!parsed.success) {
      reply.code(400).send(toError("VALIDATION_ERROR", "churn risk query is invalid"));
      return;
    }
    const minScore = parsed.data.min_score;
    const limit = parsed.data.limit;
    if ((typeof minScore === "number" && Number.isNaN(minScore)) || (typeof limit === "number" && Number.isNaN(limit))) {
      reply.code(400).send(toError("VALIDATION_ERROR", "min_score or limit is invalid"));
      return;
    }

    const items = services.churnService.listRisks({
      minScore: typeof minScore === "number" ? minScore : undefined,
      level: parsed.data.level,
      limit: typeof limit === "number" ? limit : undefined
    });
    reply.code(200).send({
      total: items.length,
      items: items.map((item) => ({
        risk_id: item.id,
        user_id: item.userId,
        score: item.score,
        level: item.level,
        factors: item.factors,
        last_active_at: item.lastActiveAt,
        weekly_learning_events: item.weeklyLearningEvents,
        reminder_clicks_30d: item.reminderClicksIn30Days,
        computed_at: item.computedAt
      }))
    });
  });

  app.post(
    "/v1/analytics/churn/strategies/trigger",
    { preHandler: authenticate(services.authService) },
    async (request, reply) => {
      const parsed = churnTriggerSchema.safeParse(request.body);
      if (!parsed.success) {
        reply.code(400).send(toError("VALIDATION_ERROR", "churn strategy trigger payload is invalid"));
        return;
      }
      const authRequest = request as AuthenticatedRequest;
      try {
        const result = services.churnService.triggerStrategy({
          actorUserId: authRequest.auth.userId,
          targetUserId: parsed.data.user_id,
          strategyType: parsed.data.strategy_type,
          reason: parsed.data.reason,
          conversionWindowDays: parsed.data.conversion_window_days
        });
        reply.code(201).send({
          trigger_id: result.trigger.id,
          user_id: result.trigger.userId,
          risk: {
            risk_id: result.risk.id,
            score: result.risk.score,
            level: result.risk.level,
            factors: result.risk.factors,
            computed_at: result.risk.computedAt
          },
          strategy_type: result.trigger.strategyType,
          status: result.trigger.status,
          conversion_window_days: result.trigger.conversionWindowDays,
          reason: result.trigger.reason,
          payload: result.trigger.payload,
          triggered_at: result.trigger.triggeredAt
        });
      } catch (error) {
        if (error instanceof Error && error.message === "USER_NOT_FOUND") {
          reply.code(404).send(toError("USER_NOT_FOUND", "target user not found"));
          return;
        }
        throw error;
      }
    }
  );

  app.get("/v1/analytics/churn/effect", { preHandler: authenticate(services.authService) }, async (request, reply) => {
    const parsed = churnEffectQuerySchema.safeParse(request.query ?? {});
    if (!parsed.success) {
      reply.code(400).send(toError("VALIDATION_ERROR", "churn effect query is invalid"));
      return;
    }
    const result = services.churnService.getRecallEffect({
      since: parsed.data.since,
      strategyType: parsed.data.strategy_type
    });
    reply.code(200).send({
      total_triggers: result.totalTriggers,
      converted_triggers: result.convertedTriggers,
      recall_rate_percent: result.recallRatePercent,
      by_strategy: result.byStrategy.map((item) => ({
        strategy_type: item.strategyType,
        total_triggers: item.totalTriggers,
        converted_triggers: item.convertedTriggers,
        recall_rate_percent: item.recallRatePercent
      })),
      items: result.items.map((item) => ({
        trigger_id: item.id,
        user_id: item.userId,
        strategy_type: item.strategyType,
        status: item.status,
        reason: item.reason,
        conversion_window_days: item.conversionWindowDays,
        payload: item.payload,
        triggered_at: item.triggeredAt,
        converted_at: item.convertedAt
      }))
    });
  });
};
