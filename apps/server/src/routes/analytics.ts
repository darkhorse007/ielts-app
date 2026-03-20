import type { FastifyInstance } from "fastify";
import { z } from "zod";
import type { AuthService } from "../domain/auth-service.js";
import type { AnalyticsService } from "../domain/analytics-service.js";
import { authenticate, type AuthenticatedRequest } from "../middleware/auth.js";

const eventSchema = z.object({
  platform: z.enum(["windows", "macos", "ios", "android", "web"]),
  skill: z.enum(["listening", "speaking", "reading", "writing"]).optional(),
  event_type: z.string().trim().min(1).max(120),
  trace_id: z.string().trim().min(6).max(120).optional(),
  provider_name: z.string().trim().min(2).max(120).optional(),
  success: z.boolean().optional(),
  fallback_triggered: z.boolean().optional(),
  latency_ms: z.number().int().min(0).max(600000).optional(),
  metadata: z.record(z.string(), z.unknown()).optional(),
  created_at: z.string().datetime().optional()
});

const batchSchema = z.object({
  events: z.array(eventSchema).min(1).max(200)
});

const summaryQuerySchema = z.object({
  platform: z.enum(["windows", "macos", "ios", "android", "web"]).optional(),
  skill: z.enum(["listening", "speaking", "reading", "writing"]).optional()
});

const experimentParamsSchema = z.object({
  experiment_key: z
    .string()
    .trim()
    .min(2)
    .max(64)
    .regex(/^[a-zA-Z0-9._-]+$/)
});

const experimentVariantSchema = z.object({
  key: z
    .string()
    .trim()
    .min(1)
    .max(32)
    .regex(/^[a-zA-Z0-9._-]+$/),
  label: z.string().trim().min(1).max(100),
  weight: z.number().positive().max(10000)
});

const experimentUpsertSchema = z.object({
  name: z.string().trim().min(2).max(100),
  description: z.string().trim().max(300).optional(),
  status: z.enum(["draft", "running", "stopped"]).default("running"),
  traffic_percent: z.number().int().min(0).max(100).default(100),
  variants: z.array(experimentVariantSchema).min(2).max(5),
  metric_event_type: z.string().trim().min(1).max(120),
  stop_condition: z.object({
    min_sample_size: z.number().int().positive().max(1000000),
    target_lift_percent: z.number().min(0).max(1000),
    max_duration_days: z.number().int().positive().max(365)
  })
});

const experimentQuerySchema = z.object({
  status: z.enum(["draft", "running", "stopped"]).optional()
});

const experimentStopSchema = z.object({
  reason: z.string().trim().min(3).max(200).optional()
});

const toError = (code: string, message: string): { code: string; message: string } => ({
  code,
  message
});

const serializeExperiment = (experiment: {
  key: string;
  name: string;
  description?: string;
  status: "draft" | "running" | "stopped";
  trafficPercent: number;
  variants: Array<{
    key: string;
    label: string;
    weight: number;
  }>;
  metricEventType: string;
  stopCondition: {
    minSampleSize: number;
    targetLiftPercent: number;
    maxDurationDays: number;
  };
  createdAt: string;
  updatedAt: string;
  startedAt?: string;
  stoppedAt?: string;
  stopReason?: string;
}) => ({
  key: experiment.key,
  name: experiment.name,
  description: experiment.description,
  status: experiment.status,
  traffic_percent: experiment.trafficPercent,
  variants: experiment.variants.map((item) => ({
    key: item.key,
    label: item.label,
    weight: item.weight
  })),
  metric_event_type: experiment.metricEventType,
  stop_condition: {
    min_sample_size: experiment.stopCondition.minSampleSize,
    target_lift_percent: experiment.stopCondition.targetLiftPercent,
    max_duration_days: experiment.stopCondition.maxDurationDays
  },
  created_at: experiment.createdAt,
  updated_at: experiment.updatedAt,
  started_at: experiment.startedAt,
  stopped_at: experiment.stoppedAt,
  stop_reason: experiment.stopReason
});

export const registerAnalyticsRoutes = async (
  app: FastifyInstance,
  services: {
    authService: AuthService;
    analyticsService: AnalyticsService;
  }
): Promise<void> => {
  app.post("/v1/analytics/events/batch", { preHandler: authenticate(services.authService) }, async (request, reply) => {
    const parsed = batchSchema.safeParse(request.body);
    if (!parsed.success) {
      reply.code(400).send(toError("VALIDATION_ERROR", "analytics batch payload is invalid"));
      return;
    }
    const authRequest = request as AuthenticatedRequest;
    const result = services.analyticsService.ingestBatch({
      userId: authRequest.auth.userId,
      events: parsed.data.events
    });
    reply.code(202).send({
      accepted_count: result.acceptedCount,
      rejected_count: result.rejectedCount,
      core_coverage_percent: result.coveragePercent,
      field_completeness_percent: result.fieldCompletenessPercent
    });
  });

  app.get("/v1/analytics/summary", { preHandler: authenticate(services.authService) }, async (request, reply) => {
    const parsed = summaryQuerySchema.safeParse(request.query ?? {});
    if (!parsed.success) {
      reply.code(400).send(toError("VALIDATION_ERROR", "analytics summary query is invalid"));
      return;
    }

    const summary = services.analyticsService.getSummary({
      platform: parsed.data.platform,
      skill: parsed.data.skill
    });
    reply.code(200).send({
      total_events: summary.totalEvents,
      core_coverage_percent: summary.coreCoveragePercent,
      field_completeness_percent: summary.fieldCompletenessPercent,
      by_platform: summary.byPlatform,
      by_skill: summary.bySkill,
      recent_events: summary.recentEvents.map((item) => ({
        id: item.id,
        platform: item.platform,
        skill: item.skill,
        event_type: item.eventType,
        trace_id: item.traceId,
        provider_name: item.providerName,
        fallback_triggered: item.fallbackTriggered,
        latency_ms: item.latencyMs,
        created_at: item.createdAt
      }))
    });
  });

  app.put(
    "/v1/analytics/experiments/:experiment_key",
    { preHandler: authenticate(services.authService) },
    async (request, reply) => {
      const paramsParsed = experimentParamsSchema.safeParse(request.params);
      const bodyParsed = experimentUpsertSchema.safeParse(request.body);
      if (!paramsParsed.success || !bodyParsed.success) {
        reply.code(400).send(toError("VALIDATION_ERROR", "analytics experiment payload is invalid"));
        return;
      }
      try {
        const experiment = services.analyticsService.upsertExperiment({
          key: paramsParsed.data.experiment_key,
          name: bodyParsed.data.name,
          description: bodyParsed.data.description,
          status: bodyParsed.data.status,
          trafficPercent: bodyParsed.data.traffic_percent,
          variants: bodyParsed.data.variants,
          metricEventType: bodyParsed.data.metric_event_type,
          stopCondition: {
            minSampleSize: bodyParsed.data.stop_condition.min_sample_size,
            targetLiftPercent: bodyParsed.data.stop_condition.target_lift_percent,
            maxDurationDays: bodyParsed.data.stop_condition.max_duration_days
          }
        });
        reply.code(200).send(serializeExperiment(experiment));
      } catch (error) {
        if (error instanceof Error && error.message === "AB_EXPERIMENT_INVALID") {
          reply.code(400).send(toError("AB_EXPERIMENT_INVALID", "A/B experiment config is invalid"));
          return;
        }
        throw error;
      }
    }
  );

  app.post(
    "/v1/analytics/experiments/:experiment_key/stop",
    { preHandler: authenticate(services.authService) },
    async (request, reply) => {
      const paramsParsed = experimentParamsSchema.safeParse(request.params);
      const bodyParsed = experimentStopSchema.safeParse(request.body ?? {});
      if (!paramsParsed.success || !bodyParsed.success) {
        reply.code(400).send(toError("VALIDATION_ERROR", "experiment stop payload is invalid"));
        return;
      }
      try {
        const experiment = services.analyticsService.stopExperiment({
          key: paramsParsed.data.experiment_key,
          reason: bodyParsed.data.reason
        });
        reply.code(200).send(serializeExperiment(experiment));
      } catch (error) {
        if (error instanceof Error && error.message === "AB_EXPERIMENT_NOT_FOUND") {
          reply.code(404).send(toError("AB_EXPERIMENT_NOT_FOUND", "A/B experiment not found"));
          return;
        }
        throw error;
      }
    }
  );

  app.get("/v1/analytics/experiments", { preHandler: authenticate(services.authService) }, async (request, reply) => {
    const parsed = experimentQuerySchema.safeParse(request.query ?? {});
    if (!parsed.success) {
      reply.code(400).send(toError("VALIDATION_ERROR", "experiment query is invalid"));
      return;
    }

    const items = services.analyticsService.listExperiments({
      status: parsed.data.status
    });
    reply.code(200).send({
      total: items.length,
      items: items.map((item) => ({
        experiment: serializeExperiment(item.experiment),
        metrics: {
          sample_size: item.metrics.sampleSize,
          running_days: item.metrics.runningDays,
          variants: item.metrics.variants.map((variant) => ({
            variant_key: variant.variantKey,
            label: variant.label,
            assigned_users: variant.assignedUsers,
            exposure_count: variant.exposureCount,
            conversion_count: variant.conversionCount,
            conversion_rate: variant.conversionRate,
            lift_percent: variant.liftPercent
          }))
        },
        stop_recommendation: {
          should_stop: item.stopRecommendation.shouldStop,
          reasons: item.stopRecommendation.reasons,
          evaluated_at: item.stopRecommendation.evaluatedAt
        }
      }))
    });
  });

  app.get(
    "/v1/analytics/experiments/:experiment_key/assignment",
    { preHandler: authenticate(services.authService) },
    async (request, reply) => {
      const paramsParsed = experimentParamsSchema.safeParse(request.params);
      if (!paramsParsed.success) {
        reply.code(400).send(toError("VALIDATION_ERROR", "experiment_key is invalid"));
        return;
      }

      const authRequest = request as AuthenticatedRequest;
      try {
        const result = services.analyticsService.assignExperimentVariant({
          key: paramsParsed.data.experiment_key,
          userId: authRequest.auth.userId
        });
        reply.code(200).send({
          experiment_key: result.experiment.key,
          status: result.experiment.status,
          holdout: result.holdout,
          variant_key: result.variantKey,
          assignment_source: result.assignmentSource
        });
      } catch (error) {
        if (error instanceof Error && error.message === "AB_EXPERIMENT_NOT_FOUND") {
          reply.code(404).send(toError("AB_EXPERIMENT_NOT_FOUND", "A/B experiment not found"));
          return;
        }
        if (error instanceof Error && error.message === "AB_EXPERIMENT_NOT_RUNNING") {
          reply.code(409).send(toError("AB_EXPERIMENT_NOT_RUNNING", "A/B experiment is not running"));
          return;
        }
        throw error;
      }
    }
  );
};
