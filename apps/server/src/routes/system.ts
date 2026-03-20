import type { FastifyInstance, FastifyReply } from "fastify";
import { z } from "zod";
import type { AuthAccountRepository } from "../domain/auth-account-repository.js";
import type { AuthService } from "../domain/auth-service.js";
import type { ProviderHealthService } from "../domain/provider-health-service.js";
import { isReleaseServiceError } from "../domain/release-service.js";
import type { ReleaseService, ReleaseServiceErrorCode } from "../domain/release-service.js";
import type { SubscriptionService } from "../domain/subscription-service.js";
import { authenticate } from "../middleware/auth.js";
import type { AuthenticatedRequest } from "../middleware/auth.js";

const gateSchema = z.object({
  release_id: z.string().trim().min(3).max(120),
  p0_defects: z.number().int().min(0).max(999),
  regression_pass_rate: z.number().min(0).max(100),
  api_success_rate: z.number().min(0).max(100),
  provider_healthy: z.boolean()
});

const canaryStartSchema = z.object({
  release_id: z.string().trim().min(3).max(120),
  target_percent: z.number().int().min(1).max(50),
  metrics: z.object({
    error_rate: z.number().min(0).max(100),
    latency_p95_ms: z.number().int().min(0).max(600000),
    provider_healthy: z.boolean()
  })
});

const canaryParamsSchema = z.object({
  canary_id: z.string().uuid()
});

const canaryPromoteSchema = z.object({
  metrics: z.object({
    error_rate: z.number().min(0).max(100),
    latency_p95_ms: z.number().int().min(0).max(600000),
    provider_healthy: z.boolean()
  }),
  expected_version: z.number().int().min(1).optional()
});

const canaryRollbackSchema = z.object({
  reason: z.string().trim().min(3).max(500),
  expected_version: z.number().int().min(1).optional()
});

const betaWhitelistParamsSchema = z.object({
  user_id: z.string().uuid()
});

const betaWhitelistUpsertSchema = z.object({
  release_id: z.string().trim().min(3).max(120),
  status: z.enum(["active", "disabled"]).optional(),
  note: z.string().trim().max(500).optional(),
  expected_version: z.number().int().min(0).optional()
});

const betaWhitelistQuerySchema = z.object({
  user_id: z.string().uuid().optional(),
  release_id: z.string().trim().min(3).max(120).optional(),
  status: z.enum(["active", "disabled"]).optional(),
  page: z
    .string()
    .optional()
    .transform((value) => (value ? Number(value) : undefined)),
  page_size: z
    .string()
    .optional()
    .transform((value) => (value ? Number(value) : undefined))
});

const betaFeedbackSubmitSchema = z.object({
  title: z.string().trim().min(3).max(200),
  description: z.string().trim().min(3).max(2000),
  category: z.enum(["bug", "ux", "performance", "other"]),
  severity: z.enum(["low", "medium", "high", "critical"]),
  app_version: z.string().trim().max(64).optional()
});

const betaFeedbackQuerySchema = z.object({
  user_id: z.string().uuid().optional(),
  release_id: z.string().trim().min(3).max(120).optional(),
  status: z.enum(["open", "triaged", "resolved"]).optional(),
  priority: z.enum(["low", "medium", "high", "critical"]).optional(),
  page: z
    .string()
    .optional()
    .transform((value) => (value ? Number(value) : undefined)),
  page_size: z
    .string()
    .optional()
    .transform((value) => (value ? Number(value) : undefined))
});

const betaFeedbackEscalateParamsSchema = z.object({
  feedback_id: z.string().uuid()
});

const betaFeedbackEscalateSchema = z.object({
  priority: z.enum(["high", "critical"]),
  reason: z.string().trim().min(3).max(500),
  expected_version: z.number().int().min(1).optional()
});

const betaCohortQuerySchema = z.object({
  release_id: z.string().trim().min(3).max(120)
});

const betaCohortExportQuerySchema = z.object({
  release_id: z.string().trim().min(3).max(120),
  format: z.enum(["json", "csv"]).optional()
});

const stabilitySoakStartSchema = z.object({
  release_id: z.string().trim().min(3).max(120),
  planned_duration_hours: z.number().int().min(1).max(240).optional()
});

const stabilitySoakRunParamsSchema = z.object({
  run_id: z.string().uuid()
});

const stabilityCheckpointSchema = z.object({
  at_hour: z.number().int().min(0).max(240),
  crash_count: z.number().int().min(0).max(100000),
  active_sessions: z.number().int().min(0).max(100000000),
  api_success_rate: z.number().min(0).max(100),
  latency_p95_ms: z.number().int().min(0).max(600000),
  expected_version: z.number().int().min(0).optional()
});

const stabilityCompareQuerySchema = z.object({
  baseline_release_id: z.string().trim().min(3).max(120),
  target_release_id: z.string().trim().min(3).max(120)
});

const stabilityExportQuerySchema = z.object({
  baseline_release_id: z.string().trim().min(3).max(120),
  target_release_id: z.string().trim().min(3).max(120)
});

const stabilityAlertQuerySchema = z.object({
  run_id: z.string().uuid().optional(),
  release_id: z.string().trim().min(3).max(120).optional(),
  level: z.enum(["yellow", "red"]).optional(),
  status: z.enum(["open", "acknowledged", "resolved"]).optional(),
  page: z
    .string()
    .optional()
    .transform((value) => (value ? Number(value) : undefined)),
  page_size: z
    .string()
    .optional()
    .transform((value) => (value ? Number(value) : undefined))
});

const stabilityAlertHandleParamsSchema = z.object({
  alert_id: z.string().uuid()
});

const stabilityAlertHandleSchema = z.object({
  action: z.enum(["acknowledge", "resolve"]),
  note: z.string().trim().max(500).optional(),
  expected_version: z.number().int().min(1).optional()
});

const systemUserParamsSchema = z.object({
  user_id: z.string().uuid()
});

const systemUserRolesUpdateSchema = z.object({
  roles: z.array(z.enum(["learner", "qa", "ops", "admin"])).min(1).max(4)
});

const systemRoleAuditQuerySchema = z.object({
  target_user_id: z.string().uuid().optional(),
  operator_user_id: z.string().uuid().optional(),
  page: z
    .string()
    .optional()
    .transform((value) => (value ? Number(value) : undefined)),
  page_size: z
    .string()
    .optional()
    .transform((value) => (value ? Number(value) : undefined))
});

const toError = (code: string, message: string): { code: string; message: string } => ({
  code,
  message
});

const resolveIdempotencyKey = (headers: Record<string, unknown>): string | undefined => {
  const raw = headers["x-idempotency-key"];
  if (typeof raw !== "string") {
    return undefined;
  }
  const trimmed = raw.trim();
  return trimmed ? trimmed : undefined;
};

type SystemPermission =
  | "provider_health:read"
  | "release:manage"
  | "stability:read"
  | "stability:manage"
  | "beta:read"
  | "beta:manage"
  | "user_roles:manage";

const SYSTEM_ROLE_PERMISSIONS: Record<string, SystemPermission[]> = {
  learner: [],
  qa: ["provider_health:read", "stability:read", "stability:manage"],
  ops: ["provider_health:read", "stability:read", "beta:read", "beta:manage"],
  admin: [
    "provider_health:read",
    "release:manage",
    "stability:read",
    "stability:manage",
    "beta:read",
    "beta:manage",
    "user_roles:manage"
  ]
};

const hasSystemPermission = (roles: string[], permission: SystemPermission): boolean =>
  roles.some((role) => (SYSTEM_ROLE_PERMISSIONS[role] ?? []).includes(permission));

type ReleaseServiceErrorResponse = {
  statusCode: number;
  code: string;
  message: string;
};

const RELEASE_SERVICE_ERROR_RESPONSES: Record<ReleaseServiceErrorCode, ReleaseServiceErrorResponse> = {
  RELEASE_STORAGE_UNAVAILABLE: {
    statusCode: 503,
    code: "RELEASE_STORAGE_UNAVAILABLE",
    message: "Release storage is unavailable"
  },
  RELEASE_GATE_NOT_PASSED: {
    statusCode: 409,
    code: "RELEASE_GATE_NOT_PASSED",
    message: "Release gate is not passed"
  },
  CANARY_NOT_FOUND: {
    statusCode: 404,
    code: "CANARY_NOT_FOUND",
    message: "Canary release not found"
  },
  CANARY_NOT_RUNNING: {
    statusCode: 409,
    code: "CANARY_NOT_RUNNING",
    message: "Canary release is not running"
  },
  CANARY_VERSION_CONFLICT: {
    statusCode: 409,
    code: "CANARY_VERSION_CONFLICT",
    message: "Canary version conflict"
  },
  CANARY_METRICS_NOT_MET: {
    statusCode: 409,
    code: "CANARY_METRICS_NOT_MET",
    message: "Canary metrics do not satisfy promotion rule"
  },
  STABILITY_RELEASE_ID_REQUIRED: {
    statusCode: 400,
    code: "STABILITY_RELEASE_ID_REQUIRED",
    message: "release_id is required"
  },
  STABILITY_SOAK_RUN_NOT_FOUND: {
    statusCode: 404,
    code: "STABILITY_SOAK_RUN_NOT_FOUND",
    message: "Stability soak run not found"
  },
  STABILITY_SOAK_RUN_NOT_RUNNING: {
    statusCode: 409,
    code: "STABILITY_SOAK_RUN_NOT_RUNNING",
    message: "Stability soak run is not running"
  },
  STABILITY_CHECKPOINT_OUT_OF_RANGE: {
    statusCode: 409,
    code: "STABILITY_CHECKPOINT_OUT_OF_RANGE",
    message: "Checkpoint hour exceeds planned duration"
  },
  STABILITY_CHECKPOINT_VERSION_CONFLICT: {
    statusCode: 409,
    code: "STABILITY_CHECKPOINT_VERSION_CONFLICT",
    message: "Checkpoint version conflict"
  },
  STABILITY_REPORT_NOT_FOUND: {
    statusCode: 404,
    code: "STABILITY_REPORT_NOT_FOUND",
    message: "Stability report for release is not found"
  },
  STABILITY_REPORT_NOT_READY: {
    statusCode: 409,
    code: "STABILITY_REPORT_NOT_READY",
    message: "Stability report is not ready"
  },
  STABILITY_ALERT_NOT_FOUND: {
    statusCode: 404,
    code: "STABILITY_ALERT_NOT_FOUND",
    message: "Stability alert not found"
  },
  STABILITY_ALERT_VERSION_CONFLICT: {
    statusCode: 409,
    code: "STABILITY_ALERT_VERSION_CONFLICT",
    message: "Stability alert version conflict"
  },
  STABILITY_ALERT_ALREADY_RESOLVED: {
    statusCode: 409,
    code: "STABILITY_ALERT_ALREADY_RESOLVED",
    message: "Stability alert is already resolved"
  },
  IDEMPOTENCY_KEY_CONFLICT: {
    statusCode: 409,
    code: "IDEMPOTENCY_KEY_CONFLICT",
    message: "Idempotency key conflict"
  },
  BETA_RELEASE_ID_REQUIRED: {
    statusCode: 400,
    code: "BETA_RELEASE_ID_REQUIRED",
    message: "release_id is required"
  },
  BETA_WHITELIST_CORRUPTED: {
    statusCode: 500,
    code: "BETA_WHITELIST_CORRUPTED",
    message: "Beta whitelist data is corrupted"
  },
  BETA_WHITELIST_VERSION_CONFLICT: {
    statusCode: 409,
    code: "BETA_WHITELIST_VERSION_CONFLICT",
    message: "Beta whitelist version conflict"
  },
  BETA_ACCESS_DENIED: {
    statusCode: 403,
    code: "BETA_ACCESS_DENIED",
    message: "Current user is not in beta whitelist"
  },
  BETA_FEEDBACK_VERSION_CONFLICT: {
    statusCode: 409,
    code: "BETA_FEEDBACK_VERSION_CONFLICT",
    message: "Beta feedback version conflict"
  },
  BETA_FEEDBACK_NOT_FOUND: {
    statusCode: 404,
    code: "BETA_FEEDBACK_NOT_FOUND",
    message: "Beta feedback not found"
  }
};

export const registerSystemRoutes = async (
  app: FastifyInstance,
  services: {
    authService: AuthService;
    subscriptionService: SubscriptionService;
    providerHealthService: ProviderHealthService;
    releaseService: ReleaseService;
    authAccountRepository?: AuthAccountRepository;
    systemRbacEnforced?: boolean;
  }
): Promise<void> => {
  const assertSystemPermission = (
    request: AuthenticatedRequest,
    reply: FastifyReply,
    permission: SystemPermission
  ): boolean => {
    if (!services.systemRbacEnforced) {
      return true;
    }
    if (hasSystemPermission(request.auth.roles, permission)) {
      return true;
    }
    reply.code(403).send(toError("FORBIDDEN", "Insufficient system permission"));
    return false;
  };

  const replyReleaseServiceError = (
    reply: FastifyReply,
    error: unknown,
    overrides?: Partial<Record<ReleaseServiceErrorCode, ReleaseServiceErrorResponse>>
  ): boolean => {
    if (!isReleaseServiceError(error)) {
      return false;
    }
    const resolved = overrides?.[error.code] ?? RELEASE_SERVICE_ERROR_RESPONSES[error.code];
    reply.code(resolved.statusCode).send(toError(resolved.code, resolved.message));
    return true;
  };

  const serializeBetaCohortMetrics = (metrics: ReturnType<ReleaseService["getBetaCohortMetrics"]>) => ({
    release_id: metrics.releaseId,
    generated_at: metrics.generatedAt,
    invited_users: metrics.invitedUsers,
    disabled_users: metrics.disabledUsers,
    eligible_active_users: metrics.eligibleActiveUsers,
    internal_feedback_total: metrics.internalFeedbackTotal,
    unresolved_critical_feedback: metrics.unresolvedCriticalFeedback,
    unresolved_high_feedback_older_than_48h: metrics.unresolvedHighFeedbackOlderThan48h,
    invited_to_activation_users: metrics.invitedToActivationUsers,
    invited_to_activation_rate: metrics.invitedToActivationRate,
    d7_retained_users: metrics.d7RetainedUsers,
    d7_retention_rate: metrics.d7RetentionRate,
    week1_task_completed_users: metrics.week1TaskCompletedUsers,
    week1_task_completion_rate: metrics.week1TaskCompletionRate,
    first_mock_completed_users: metrics.firstMockCompletedUsers,
    first_mock_completion_rate: metrics.firstMockCompletionRate
  });

  const serializeBetaCohortUser = (item: ReturnType<ReleaseService["getBetaCohortExport"]>["users"][number]) => ({
    whitelist_id: item.whitelistId,
    user_id: item.userId,
    release_id: item.releaseId,
    whitelist_status: item.whitelistStatus,
    cohort_started_at: item.cohortStartedAt,
    whitelist_updated_at: item.whitelistUpdatedAt,
    onboarding_completed_at: item.onboardingCompletedAt,
    first_core_learning_event_at: item.firstCoreLearningEventAt,
    activation_qualified: item.activationQualified,
    activation_qualified_at: item.activationQualifiedAt,
    d7_retained: item.d7Retained,
    d7_retained_at: item.d7RetainedAt,
    week1_core_learning_event_count: item.week1CoreLearningEventCount,
    week1_task_completion_qualified: item.week1TaskCompletionQualified,
    first_mock_completed_at: item.firstMockCompletedAt,
    first_mock_completion_qualified: item.firstMockCompletionQualified,
    total_core_learning_event_count: item.totalCoreLearningEventCount,
    feedback_total: item.feedbackTotal,
    unresolved_feedback_count: item.unresolvedFeedbackCount,
    highest_open_feedback_priority: item.highestOpenFeedbackPriority
  });

  app.get("/v1/system/health/providers", { preHandler: authenticate(services.authService) }, async (_request, reply) => {
    const authRequest = _request as AuthenticatedRequest;
    if (!assertSystemPermission(authRequest, reply, "provider_health:read")) {
      return;
    }
    const result = services.providerHealthService.getProviderHealth();
    reply.code(200).send({
      healthy: result.healthy,
      providers: result.providers.map((item) => ({
        provider_name: item.providerName,
        success_rate: item.successRate,
        fallback_rate: item.fallbackRate,
        p95_latency_ms: item.p95LatencyMs,
        total_calls: item.totalCalls,
        alert_level: item.alertLevel,
        alert_reasons: item.alertReasons,
        recent_traces: item.recentTraces.map((trace) => ({
          trace_id: trace.traceId,
          source: trace.source,
          latency_ms: trace.latencyMs,
          fallback_triggered: trace.fallbackTriggered,
          created_at: trace.createdAt,
          session_id: trace.sessionId,
          evaluation_id: trace.evaluationId
        })),
        updated_at: item.updatedAt
      })),
      runtime_config: {
        ready: result.runtime.ready,
        fallback_enabled: result.runtime.fallbackEnabled,
        allow_user_content_logging: result.runtime.allowUserContentLogging,
        providers: result.runtime.providers.map((provider) => ({
          role: provider.role,
          provider_name: provider.providerName,
          enabled: provider.enabled,
          endpoint_configured: provider.endpointConfigured,
          api_key_configured: provider.apiKeyConfigured,
          data_region: provider.dataRegion,
          timeout_ms: provider.timeoutMs,
          sends_user_content: provider.sendsUserContent
        }))
      },
      alerts: result.alerts
    });
  });

  app.get("/v1/system/payments/runtime", { preHandler: authenticate(services.authService) }, async (_request, reply) => {
    const authRequest = _request as AuthenticatedRequest;
    if (!assertSystemPermission(authRequest, reply, "provider_health:read")) {
      return;
    }
    const runtime = services.subscriptionService.getPaymentRuntimeSummary();
    reply.code(200).send({
      default_provider: runtime.defaultProvider,
      webhook_timestamp_tolerance_seconds: runtime.timestampToleranceSeconds,
      providers: runtime.providers.map((provider) => ({
        provider_name: provider.providerName,
        enabled: provider.enabled,
        upgrade_enabled: provider.upgradeEnabled,
        mode: provider.mode,
        webhook_path: provider.webhookPath,
        signature_required: provider.signatureRequired,
        webhook_secret_configured: provider.webhookSecretConfigured,
        replay_window_seconds: provider.replayWindowSeconds,
        refund_handling: provider.refundHandling
      }))
    });
  });

  app.post("/v1/system/release/gate/evaluate", { preHandler: authenticate(services.authService) }, async (request, reply) => {
    const parsed = gateSchema.safeParse(request.body);
    if (!parsed.success) {
      reply.code(400).send(toError("VALIDATION_ERROR", "release gate payload is invalid"));
      return;
    }

    const authRequest = request as AuthenticatedRequest;
    if (!assertSystemPermission(authRequest, reply, "release:manage")) {
      return;
    }

    try {
      const result = await services.releaseService.evaluateGateAsync({
        releaseId: parsed.data.release_id,
        p0Defects: parsed.data.p0_defects,
        regressionPassRate: parsed.data.regression_pass_rate,
        apiSuccessRate: parsed.data.api_success_rate,
        providerHealthy: parsed.data.provider_healthy
      });
      reply.code(200).send({
        gate_id: result.id,
        release_id: result.releaseId,
        passed: result.passed,
        checks: result.checks.map((item) => ({
          name: item.name,
          threshold: item.threshold,
          actual: item.actual,
          passed: item.passed
        })),
        created_at: result.createdAt
      });
    } catch (error) {
      if (replyReleaseServiceError(reply, error)) {
        return;
      }
      throw error;
    }
  });

  app.post("/v1/system/release/canary/start", { preHandler: authenticate(services.authService) }, async (request, reply) => {
    const parsed = canaryStartSchema.safeParse(request.body);
    if (!parsed.success) {
      reply.code(400).send(toError("VALIDATION_ERROR", "canary start payload is invalid"));
      return;
    }

    const authRequest = request as AuthenticatedRequest;
    if (!assertSystemPermission(authRequest, reply, "release:manage")) {
      return;
    }
    const idempotencyKey = resolveIdempotencyKey(request.headers);

    try {
      const canary = await services.releaseService.startCanaryAsync({
        releaseId: parsed.data.release_id,
        targetPercent: parsed.data.target_percent,
        metrics: {
          errorRate: parsed.data.metrics.error_rate,
          latencyP95Ms: parsed.data.metrics.latency_p95_ms,
          providerHealthy: parsed.data.metrics.provider_healthy
        },
        idempotencyKey
      });
      reply.code(201).send({
        canary_id: canary.id,
        release_id: canary.releaseId,
        version: canary.version,
        target_percent: canary.targetPercent,
        status: canary.status,
        metrics: {
          error_rate: canary.metrics.errorRate,
          latency_p95_ms: canary.metrics.latencyP95Ms,
          provider_healthy: canary.metrics.providerHealthy
        },
        started_at: canary.startedAt
      });
    } catch (error) {
      if (replyReleaseServiceError(reply, error)) {
        return;
      }
      throw error;
    }
  });

  app.post(
    "/v1/system/release/canary/:canary_id/promote",
    { preHandler: authenticate(services.authService) },
    async (request, reply) => {
      const paramsParsed = canaryParamsSchema.safeParse(request.params);
      const bodyParsed = canaryPromoteSchema.safeParse(request.body);
      if (!paramsParsed.success || !bodyParsed.success) {
        reply.code(400).send(toError("VALIDATION_ERROR", "canary promote payload is invalid"));
        return;
      }
      const authRequest = request as AuthenticatedRequest;
      if (!assertSystemPermission(authRequest, reply, "release:manage")) {
        return;
      }
      const idempotencyKey = resolveIdempotencyKey(request.headers);

      try {
        const canary = await services.releaseService.promoteCanaryAsync({
          canaryId: paramsParsed.data.canary_id,
          metrics: {
            errorRate: bodyParsed.data.metrics.error_rate,
            latencyP95Ms: bodyParsed.data.metrics.latency_p95_ms,
            providerHealthy: bodyParsed.data.metrics.provider_healthy
          },
          expectedVersion: bodyParsed.data.expected_version,
          idempotencyKey
        });
        reply.code(200).send({
          canary_id: canary.id,
          release_id: canary.releaseId,
          version: canary.version,
          status: canary.status,
          promoted_at: canary.promotedAt,
          metrics: {
            error_rate: canary.metrics.errorRate,
            latency_p95_ms: canary.metrics.latencyP95Ms,
            provider_healthy: canary.metrics.providerHealthy
          }
        });
      } catch (error) {
        if (replyReleaseServiceError(reply, error)) {
          return;
        }
        throw error;
      }
    }
  );

  app.post(
    "/v1/system/release/canary/:canary_id/rollback",
    { preHandler: authenticate(services.authService) },
    async (request, reply) => {
      const paramsParsed = canaryParamsSchema.safeParse(request.params);
      const bodyParsed = canaryRollbackSchema.safeParse(request.body);
      if (!paramsParsed.success || !bodyParsed.success) {
        reply.code(400).send(toError("VALIDATION_ERROR", "canary rollback payload is invalid"));
        return;
      }
      const authRequest = request as AuthenticatedRequest;
      if (!assertSystemPermission(authRequest, reply, "release:manage")) {
        return;
      }
      const idempotencyKey = resolveIdempotencyKey(request.headers);

      try {
        const canary = await services.releaseService.rollbackCanaryAsync({
          canaryId: paramsParsed.data.canary_id,
          reason: bodyParsed.data.reason,
          expectedVersion: bodyParsed.data.expected_version,
          idempotencyKey
        });
        reply.code(200).send({
          canary_id: canary.id,
          release_id: canary.releaseId,
          version: canary.version,
          status: canary.status,
          rollback_reason: canary.rollbackReason,
          rolled_back_at: canary.rolledBackAt
        });
      } catch (error) {
        if (replyReleaseServiceError(reply, error)) {
          return;
        }
        throw error;
      }
    }
  );

  app.get("/v1/system/release/canary/:canary_id", { preHandler: authenticate(services.authService) }, async (request, reply) => {
    const parsed = canaryParamsSchema.safeParse(request.params);
    if (!parsed.success) {
      reply.code(400).send(toError("VALIDATION_ERROR", "canary_id is invalid"));
      return;
    }
    const authRequest = request as AuthenticatedRequest;
    if (!assertSystemPermission(authRequest, reply, "release:manage")) {
      return;
    }

    try {
      const canary = services.releaseService.getCanary(parsed.data.canary_id);
      reply.code(200).send({
        canary_id: canary.id,
        release_id: canary.releaseId,
        version: canary.version,
        target_percent: canary.targetPercent,
        status: canary.status,
        metrics: {
          error_rate: canary.metrics.errorRate,
          latency_p95_ms: canary.metrics.latencyP95Ms,
          provider_healthy: canary.metrics.providerHealthy
        },
        started_at: canary.startedAt,
        promoted_at: canary.promotedAt,
        rolled_back_at: canary.rolledBackAt,
        rollback_reason: canary.rollbackReason,
        updated_at: canary.updatedAt
      });
    } catch (error) {
      if (replyReleaseServiceError(reply, error)) {
        return;
      }
      throw error;
    }
  });

  app.get("/v1/system/release/metrics", { preHandler: authenticate(services.authService) }, async (request, reply) => {
    const authRequest = request as AuthenticatedRequest;
    if (!assertSystemPermission(authRequest, reply, "release:manage")) {
      return;
    }
    const metrics = services.releaseService.getOperationalMetrics();
    reply.code(200).send({
      idempotency: {
        totals: {
          attempts: metrics.idempotency.totals.attempts,
          replay_hits: metrics.idempotency.totals.replayHits,
          conflict_count: metrics.idempotency.totals.conflictCount,
          replay_rate: metrics.idempotency.totals.replayRate,
          conflict_rate: metrics.idempotency.totals.conflictRate
        },
        actions: metrics.idempotency.actions.map((item) => ({
          action_name: item.actionName,
          attempts: item.attempts,
          replay_hits: item.replayHits,
          conflict_count: item.conflictCount,
          replay_rate: item.replayRate,
          conflict_rate: item.conflictRate
        }))
      },
      write_latency: {
        total_writes: metrics.writeLatency.totalWrites,
        failed_writes: metrics.writeLatency.failedWrites,
        avg_latency_ms: metrics.writeLatency.avgLatencyMs,
        p95_latency_ms: metrics.writeLatency.p95LatencyMs,
        max_latency_ms: metrics.writeLatency.maxLatencyMs,
        thresholds_ms: {
          yellow: metrics.writeLatency.thresholdsMs.yellow,
          red: metrics.writeLatency.thresholdsMs.red
        },
        alerts: {
          yellow_count: metrics.writeLatency.alerts.yellowCount,
          red_count: metrics.writeLatency.alerts.redCount,
          recent: metrics.writeLatency.alerts.recent.map((item) => ({
            operation: item.operation,
            latency_ms: item.latencyMs,
            level: item.level,
            failed: item.failed,
            threshold_ms: item.thresholdMs,
            recorded_at: item.recordedAt
          }))
        },
        recent_samples: metrics.writeLatency.recentSamples.map((item) => ({
          operation: item.operation,
          latency_ms: item.latencyMs,
          failed: item.failed,
          recorded_at: item.recordedAt
        }))
      },
      storage_resilience: {
        backend: metrics.storageResilience.backend,
        mode: metrics.storageResilience.mode,
        circuit_open: metrics.storageResilience.circuitOpen,
        circuit_open_until: metrics.storageResilience.circuitOpenUntil,
        consecutive_write_failures: metrics.storageResilience.consecutiveWriteFailures,
        max_attempts: metrics.storageResilience.maxAttempts,
        retry_base_delay_ms: metrics.storageResilience.retryBaseDelayMs,
        retry_max_delay_ms: metrics.storageResilience.retryMaxDelayMs,
        circuit_failure_threshold: metrics.storageResilience.circuitFailureThreshold,
        circuit_cooldown_ms: metrics.storageResilience.circuitCooldownMs,
        last_error: metrics.storageResilience.lastError,
        alerting: {
          circuit_open_threshold_ms: metrics.storageResilienceAlerting.circuitOpenThresholdMs,
          recent_limit: metrics.storageResilienceAlerting.recentLimit,
          recent_count: metrics.storageResilienceAlerting.recentCount,
          capped_count: metrics.storageResilienceAlerting.cappedCount,
          opened_count: metrics.storageResilienceAlerting.openedCount,
          prolonged_count: metrics.storageResilienceAlerting.prolongedCount,
          recovered_count: metrics.storageResilienceAlerting.recoveredCount,
          recent: metrics.storageResilienceAlerting.recent.map((item) => ({
            event: item.event,
            backend: item.backend,
            operation: item.operation,
            write_failed: item.writeFailed,
            consecutive_write_failures: item.consecutiveWriteFailures,
            duration_ms: item.durationMs,
            last_error: item.lastError,
            recorded_at: item.recordedAt
          }))
        }
      }
    });
  });

  app.post("/v1/system/stability/soak-tests/start", { preHandler: authenticate(services.authService) }, async (request, reply) => {
    const parsed = stabilitySoakStartSchema.safeParse(request.body ?? {});
    if (!parsed.success) {
      reply.code(400).send(toError("VALIDATION_ERROR", "stability soak start payload is invalid"));
      return;
    }
    const authRequest = request as AuthenticatedRequest;
    if (!assertSystemPermission(authRequest, reply, "stability:manage")) {
      return;
    }
    try {
      const run = await services.releaseService.startStabilitySoakRunAsync({
        releaseId: parsed.data.release_id,
        plannedDurationHours: parsed.data.planned_duration_hours,
        operatorUserId: authRequest.auth.userId
      });
      reply.code(201).send({
        run_id: run.id,
        release_id: run.releaseId,
        planned_duration_hours: run.plannedDurationHours,
        status: run.status,
        started_at: run.startedAt,
        completed_at: run.completedAt,
        created_by_user_id: run.createdByUserId,
        created_at: run.createdAt,
        updated_at: run.updatedAt
      });
    } catch (error) {
      if (replyReleaseServiceError(reply, error)) {
        return;
      }
      throw error;
    }
  });

  app.post(
    "/v1/system/stability/soak-tests/:run_id/checkpoints",
    { preHandler: authenticate(services.authService) },
    async (request, reply) => {
      const paramsParsed = stabilitySoakRunParamsSchema.safeParse(request.params);
      const bodyParsed = stabilityCheckpointSchema.safeParse(request.body ?? {});
      if (!paramsParsed.success || !bodyParsed.success) {
        reply.code(400).send(toError("VALIDATION_ERROR", "stability checkpoint payload is invalid"));
        return;
      }
      const authRequest = request as AuthenticatedRequest;
      if (!assertSystemPermission(authRequest, reply, "stability:manage")) {
        return;
      }
      const idempotencyKey = resolveIdempotencyKey(request.headers);
      try {
        const result = await services.releaseService.recordStabilityCheckpointAsync({
          runId: paramsParsed.data.run_id,
          atHour: bodyParsed.data.at_hour,
          crashCount: bodyParsed.data.crash_count,
          activeSessions: bodyParsed.data.active_sessions,
          apiSuccessRate: bodyParsed.data.api_success_rate,
          latencyP95Ms: bodyParsed.data.latency_p95_ms,
          expectedVersion: bodyParsed.data.expected_version,
          idempotencyKey,
          operatorUserId: authRequest.auth.userId
        });
        reply.code(201).send({
          checkpoint_id: result.checkpoint.id,
          run_id: result.checkpoint.runId,
          release_id: result.checkpoint.releaseId,
          at_hour: result.checkpoint.atHour,
          crash_count: result.checkpoint.crashCount,
          active_sessions: result.checkpoint.activeSessions,
          api_success_rate: result.checkpoint.apiSuccessRate,
          latency_p95_ms: result.checkpoint.latencyP95Ms,
          version: result.checkpoint.version,
          created_by_user_id: result.checkpoint.createdByUserId,
          created_at: result.checkpoint.createdAt,
          run_status: result.run.status,
          run_completed_at: result.run.completedAt,
          alerts: result.alerts.map((item) => ({
            alert_id: item.id,
            type: item.type,
            level: item.level,
            status: item.status,
            version: item.version,
            reason: item.reason
          }))
        });
      } catch (error) {
        if (replyReleaseServiceError(reply, error)) {
          return;
        }
        throw error;
      }
    }
  );

  app.get(
    "/v1/system/stability/soak-tests/:run_id/report",
    { preHandler: authenticate(services.authService) },
    async (request, reply) => {
      const paramsParsed = stabilitySoakRunParamsSchema.safeParse(request.params);
      if (!paramsParsed.success) {
        reply.code(400).send(toError("VALIDATION_ERROR", "stability report params is invalid"));
        return;
      }
      const authRequest = request as AuthenticatedRequest;
      if (!assertSystemPermission(authRequest, reply, "stability:read")) {
        return;
      }
      try {
        const report = services.releaseService.getStabilityReport({
          runId: paramsParsed.data.run_id,
          operatorUserId: authRequest.auth.userId
        });
        reply.code(200).send({
          run: {
            run_id: report.run.id,
            release_id: report.run.releaseId,
            planned_duration_hours: report.run.plannedDurationHours,
            status: report.run.status,
            started_at: report.run.startedAt,
            completed_at: report.run.completedAt,
            created_by_user_id: report.run.createdByUserId,
            created_at: report.run.createdAt,
            updated_at: report.run.updatedAt
          },
          summary: {
            checkpoint_count: report.summary.checkpointCount,
            collected_duration_hours: report.summary.collectedDurationHours,
            last_checkpoint_at: report.summary.lastCheckpointAt,
            total_crashes: report.summary.totalCrashes,
            max_crash_count: report.summary.maxCrashCount,
            avg_crash_rate_per_1k: report.summary.avgCrashRatePer1k,
            min_api_success_rate: report.summary.minApiSuccessRate,
            avg_api_success_rate: report.summary.avgApiSuccessRate,
            max_latency_p95_ms: report.summary.maxLatencyP95Ms,
            avg_latency_p95_ms: report.summary.avgLatencyP95Ms
          },
          trend: report.trend.map((item) => ({
            checkpoint_id: item.checkpointId,
            at_hour: item.atHour,
            crash_count: item.crashCount,
            active_sessions: item.activeSessions,
            crash_rate_per_1k: item.crashRatePer1k,
            api_success_rate: item.apiSuccessRate,
            latency_p95_ms: item.latencyP95Ms,
            recorded_at: item.recordedAt
          })),
          generated_at: report.generatedAt
        });
      } catch (error) {
        if (replyReleaseServiceError(reply, error)) {
          return;
        }
        throw error;
      }
    }
  );

  app.get("/v1/system/stability/reports/compare", { preHandler: authenticate(services.authService) }, async (request, reply) => {
    const parsed = stabilityCompareQuerySchema.safeParse(request.query ?? {});
    if (!parsed.success) {
      reply.code(400).send(toError("VALIDATION_ERROR", "stability compare query is invalid"));
      return;
    }
    const authRequest = request as AuthenticatedRequest;
    if (!assertSystemPermission(authRequest, reply, "stability:read")) {
      return;
    }
    try {
      const compared = services.releaseService.compareStabilityReports({
        baselineReleaseId: parsed.data.baseline_release_id,
        targetReleaseId: parsed.data.target_release_id,
        operatorUserId: authRequest.auth.userId
      });
      reply.code(200).send({
        baseline_release_id: parsed.data.baseline_release_id,
        target_release_id: parsed.data.target_release_id,
        baseline_report: {
          run_id: compared.baseline.run.id,
          release_id: compared.baseline.run.releaseId,
          status: compared.baseline.run.status,
          summary: {
            checkpoint_count: compared.baseline.summary.checkpointCount,
            total_crashes: compared.baseline.summary.totalCrashes,
            avg_crash_rate_per_1k: compared.baseline.summary.avgCrashRatePer1k,
            avg_api_success_rate: compared.baseline.summary.avgApiSuccessRate,
            avg_latency_p95_ms: compared.baseline.summary.avgLatencyP95Ms
          }
        },
        target_report: {
          run_id: compared.target.run.id,
          release_id: compared.target.run.releaseId,
          status: compared.target.run.status,
          summary: {
            checkpoint_count: compared.target.summary.checkpointCount,
            total_crashes: compared.target.summary.totalCrashes,
            avg_crash_rate_per_1k: compared.target.summary.avgCrashRatePer1k,
            avg_api_success_rate: compared.target.summary.avgApiSuccessRate,
            avg_latency_p95_ms: compared.target.summary.avgLatencyP95Ms
          }
        },
        delta: {
          total_crashes: compared.delta.totalCrashes,
          avg_crash_rate_per_1k: compared.delta.avgCrashRatePer1k,
          avg_api_success_rate: compared.delta.avgApiSuccessRate,
          avg_latency_p95_ms: compared.delta.avgLatencyP95Ms
        },
        conclusion: compared.conclusion,
        compared_at: compared.comparedAt
      });
    } catch (error) {
      if (
        replyReleaseServiceError(reply, error, {
          STABILITY_REPORT_NOT_READY: {
            statusCode: 404,
            code: "STABILITY_REPORT_NOT_FOUND",
            message: "Stability report for release is not found"
          }
        })
      ) {
        return;
      }
      throw error;
    }
  });

  app.get("/v1/system/stability/reports/export", { preHandler: authenticate(services.authService) }, async (request, reply) => {
    const parsed = stabilityExportQuerySchema.safeParse(request.query ?? {});
    if (!parsed.success) {
      reply.code(400).send(toError("VALIDATION_ERROR", "stability export query is invalid"));
      return;
    }
    const authRequest = request as AuthenticatedRequest;
    if (!assertSystemPermission(authRequest, reply, "stability:read")) {
      return;
    }
    try {
      const exported = services.releaseService.exportStabilityComparison({
        baselineReleaseId: parsed.data.baseline_release_id,
        targetReleaseId: parsed.data.target_release_id,
        operatorUserId: authRequest.auth.userId
      });
      reply.code(200).send({
        filename: exported.filename,
        content: exported.content,
        compared_at: exported.comparedAt
      });
    } catch (error) {
      if (
        replyReleaseServiceError(reply, error, {
          STABILITY_REPORT_NOT_READY: {
            statusCode: 404,
            code: "STABILITY_REPORT_NOT_FOUND",
            message: "Stability report for release is not found"
          }
        })
      ) {
        return;
      }
      throw error;
    }
  });

  app.get("/v1/system/stability/alerts", { preHandler: authenticate(services.authService) }, async (request, reply) => {
    const parsed = stabilityAlertQuerySchema.safeParse(request.query ?? {});
    if (!parsed.success) {
      reply.code(400).send(toError("VALIDATION_ERROR", "stability alert query is invalid"));
      return;
    }
    const authRequest = request as AuthenticatedRequest;
    if (!assertSystemPermission(authRequest, reply, "stability:read")) {
      return;
    }
    const result = services.releaseService.listStabilityAlerts({
      runId: parsed.data.run_id,
      releaseId: parsed.data.release_id,
      level: parsed.data.level,
      status: parsed.data.status,
      page: parsed.data.page,
      pageSize: parsed.data.page_size
    });
    reply.code(200).send({
      total: result.total,
      page: result.page,
      page_size: result.pageSize,
      thresholds: {
        crash_rate_per_1k: result.thresholds.crashRatePer1k,
        api_success_rate: result.thresholds.apiSuccessRate,
        latency_p95_ms: result.thresholds.latencyP95Ms
      },
      items: result.items.map((item) => ({
        alert_id: item.id,
        run_id: item.runId,
        release_id: item.releaseId,
        checkpoint_id: item.checkpointId,
        at_hour: item.atHour,
        type: item.type,
        level: item.level,
        status: item.status,
        version: item.version,
        threshold: item.threshold,
        actual: item.actual,
        reason: item.reason,
        triggered_at: item.triggeredAt,
        updated_at: item.updatedAt,
        handled_at: item.handledAt,
        handled_by_user_id: item.handledByUserId,
        handling_action: item.handlingAction,
        handling_note: item.handlingNote
      }))
    });
  });

  app.post(
    "/v1/system/stability/alerts/:alert_id/handle",
    { preHandler: authenticate(services.authService) },
    async (request, reply) => {
      const paramsParsed = stabilityAlertHandleParamsSchema.safeParse(request.params);
      const bodyParsed = stabilityAlertHandleSchema.safeParse(request.body ?? {});
      if (!paramsParsed.success || !bodyParsed.success) {
        reply.code(400).send(toError("VALIDATION_ERROR", "stability alert handle payload is invalid"));
        return;
      }
      const authRequest = request as AuthenticatedRequest;
      if (!assertSystemPermission(authRequest, reply, "stability:manage")) {
        return;
      }
      const idempotencyKey = resolveIdempotencyKey(request.headers);
      try {
        const alert = await services.releaseService.handleStabilityAlertAsync({
          alertId: paramsParsed.data.alert_id,
          action: bodyParsed.data.action,
          note: bodyParsed.data.note,
          expectedVersion: bodyParsed.data.expected_version,
          idempotencyKey,
          operatorUserId: authRequest.auth.userId
        });
        reply.code(200).send({
          alert_id: alert.id,
          run_id: alert.runId,
          release_id: alert.releaseId,
          checkpoint_id: alert.checkpointId,
          at_hour: alert.atHour,
          type: alert.type,
          level: alert.level,
          status: alert.status,
          version: alert.version,
          threshold: alert.threshold,
          actual: alert.actual,
          reason: alert.reason,
          triggered_at: alert.triggeredAt,
          updated_at: alert.updatedAt,
          handled_at: alert.handledAt,
          handled_by_user_id: alert.handledByUserId,
          handling_action: alert.handlingAction,
          handling_note: alert.handlingNote
        });
      } catch (error) {
        if (replyReleaseServiceError(reply, error)) {
          return;
        }
        throw error;
      }
    }
  );

  app.put("/v1/system/beta/whitelist/:user_id", { preHandler: authenticate(services.authService) }, async (request, reply) => {
    const paramsParsed = betaWhitelistParamsSchema.safeParse(request.params);
    const bodyParsed = betaWhitelistUpsertSchema.safeParse(request.body ?? {});
    if (!paramsParsed.success || !bodyParsed.success) {
      reply.code(400).send(toError("VALIDATION_ERROR", "beta whitelist payload is invalid"));
      return;
    }

    const authRequest = request as AuthenticatedRequest;
    if (!assertSystemPermission(authRequest, reply, "beta:manage")) {
      return;
    }
    const idempotencyKey = resolveIdempotencyKey(request.headers);
    try {
      const entry = await services.releaseService.upsertBetaWhitelistAsync({
        userId: paramsParsed.data.user_id,
        releaseId: bodyParsed.data.release_id,
        status: bodyParsed.data.status,
        note: bodyParsed.data.note,
        expectedVersion: bodyParsed.data.expected_version,
        idempotencyKey,
        operatorUserId: authRequest.auth.userId
      });
      reply.code(200).send({
        whitelist_id: entry.id,
        user_id: entry.userId,
        release_id: entry.releaseId,
        version: entry.version,
        status: entry.status,
        note: entry.note,
        created_by_user_id: entry.createdByUserId,
        updated_by_user_id: entry.updatedByUserId,
        created_at: entry.createdAt,
        updated_at: entry.updatedAt
      });
    } catch (error) {
      if (replyReleaseServiceError(reply, error)) {
        return;
      }
      throw error;
    }
  });

  app.get("/v1/system/beta/whitelist", { preHandler: authenticate(services.authService) }, async (request, reply) => {
    const parsed = betaWhitelistQuerySchema.safeParse(request.query ?? {});
    if (!parsed.success) {
      reply.code(400).send(toError("VALIDATION_ERROR", "beta whitelist query is invalid"));
      return;
    }

    const authRequest = request as AuthenticatedRequest;
    if (!assertSystemPermission(authRequest, reply, "beta:read")) {
      return;
    }
    const result = services.releaseService.listBetaWhitelist({
      userId: parsed.data.user_id,
      releaseId: parsed.data.release_id,
      status: parsed.data.status,
      page: parsed.data.page,
      pageSize: parsed.data.page_size
    });
    reply.code(200).send({
      total: result.total,
      page: result.page,
      page_size: result.pageSize,
      items: result.items.map((item) => ({
        whitelist_id: item.id,
        user_id: item.userId,
        release_id: item.releaseId,
        version: item.version,
        status: item.status,
        note: item.note,
        created_by_user_id: item.createdByUserId,
        updated_by_user_id: item.updatedByUserId,
        created_at: item.createdAt,
        updated_at: item.updatedAt
      }))
    });
  });

  app.post("/v1/system/beta/feedback", { preHandler: authenticate(services.authService) }, async (request, reply) => {
    const parsed = betaFeedbackSubmitSchema.safeParse(request.body ?? {});
    if (!parsed.success) {
      reply.code(400).send(toError("VALIDATION_ERROR", "beta feedback payload is invalid"));
      return;
    }
    const authRequest = request as AuthenticatedRequest;
    if (!assertSystemPermission(authRequest, reply, "beta:manage")) {
      return;
    }
    const idempotencyKey = resolveIdempotencyKey(request.headers);
    try {
      const feedback = await services.releaseService.submitBetaFeedbackAsync({
        userId: authRequest.auth.userId,
        title: parsed.data.title,
        description: parsed.data.description,
        category: parsed.data.category,
        severity: parsed.data.severity,
        appVersion: parsed.data.app_version,
        idempotencyKey
      });
      reply.code(201).send({
        feedback_id: feedback.id,
        user_id: feedback.userId,
        release_id: feedback.releaseId,
        version: feedback.version,
        app_version: feedback.appVersion,
        category: feedback.category,
        severity: feedback.severity,
        priority: feedback.priority,
        status: feedback.status,
        title: feedback.title,
        description: feedback.description,
        escalated_at: feedback.escalatedAt,
        escalated_by_user_id: feedback.escalatedByUserId,
        escalation_reason: feedback.escalationReason,
        created_at: feedback.createdAt,
        updated_at: feedback.updatedAt
      });
    } catch (error) {
      if (replyReleaseServiceError(reply, error)) {
        return;
      }
      throw error;
    }
  });

  app.get("/v1/system/beta/feedback", { preHandler: authenticate(services.authService) }, async (request, reply) => {
    const authRequest = request as AuthenticatedRequest;
    if (!assertSystemPermission(authRequest, reply, "beta:read")) {
      return;
    }
    const parsed = betaFeedbackQuerySchema.safeParse(request.query ?? {});
    if (!parsed.success) {
      reply.code(400).send(toError("VALIDATION_ERROR", "beta feedback query is invalid"));
      return;
    }
    const result = services.releaseService.listBetaFeedback({
      userId: parsed.data.user_id,
      releaseId: parsed.data.release_id,
      status: parsed.data.status,
      priority: parsed.data.priority,
      page: parsed.data.page,
      pageSize: parsed.data.page_size,
      operatorUserId: authRequest.auth.userId
    });
    reply.code(200).send({
      total: result.total,
      page: result.page,
      page_size: result.pageSize,
      items: result.items.map((item) => ({
        feedback_id: item.id,
        user_id: item.userId,
        release_id: item.releaseId,
        version: item.version,
        app_version: item.appVersion,
        category: item.category,
        severity: item.severity,
        priority: item.priority,
        status: item.status,
        title: item.title,
        description: item.description,
        escalated_at: item.escalatedAt,
        escalated_by_user_id: item.escalatedByUserId,
        escalation_reason: item.escalationReason,
        created_at: item.createdAt,
        updated_at: item.updatedAt
      }))
    });
  });

  app.get(
    "/v1/system/beta/feedback/:feedback_id",
    { preHandler: authenticate(services.authService) },
    async (request, reply) => {
      const paramsParsed = betaFeedbackEscalateParamsSchema.safeParse(request.params);
      if (!paramsParsed.success) {
        reply.code(400).send(toError("VALIDATION_ERROR", "beta feedback params is invalid"));
        return;
      }
      const authRequest = request as AuthenticatedRequest;
      if (!assertSystemPermission(authRequest, reply, "beta:read")) {
        return;
      }
      try {
        const feedback = services.releaseService.getBetaFeedback(paramsParsed.data.feedback_id);
        reply.code(200).send({
          feedback_id: feedback.id,
          user_id: feedback.userId,
          release_id: feedback.releaseId,
          version: feedback.version,
          app_version: feedback.appVersion,
          category: feedback.category,
          severity: feedback.severity,
          priority: feedback.priority,
          status: feedback.status,
          title: feedback.title,
          description: feedback.description,
          escalated_at: feedback.escalatedAt,
          escalated_by_user_id: feedback.escalatedByUserId,
          escalation_reason: feedback.escalationReason,
          created_at: feedback.createdAt,
          updated_at: feedback.updatedAt
        });
      } catch (error) {
        if (replyReleaseServiceError(reply, error)) {
          return;
        }
        throw error;
      }
    }
  );

  app.post(
    "/v1/system/beta/feedback/:feedback_id/escalate",
    { preHandler: authenticate(services.authService) },
    async (request, reply) => {
      const paramsParsed = betaFeedbackEscalateParamsSchema.safeParse(request.params);
      const bodyParsed = betaFeedbackEscalateSchema.safeParse(request.body ?? {});
      if (!paramsParsed.success || !bodyParsed.success) {
        reply.code(400).send(toError("VALIDATION_ERROR", "beta feedback escalate payload is invalid"));
        return;
      }
      const authRequest = request as AuthenticatedRequest;
      if (!assertSystemPermission(authRequest, reply, "beta:manage")) {
        return;
      }
      const idempotencyKey = resolveIdempotencyKey(request.headers);
      try {
        const feedback = await services.releaseService.escalateBetaFeedbackAsync({
          feedbackId: paramsParsed.data.feedback_id,
          priority: bodyParsed.data.priority,
          reason: bodyParsed.data.reason,
          expectedVersion: bodyParsed.data.expected_version,
          idempotencyKey,
          operatorUserId: authRequest.auth.userId
        });
        reply.code(200).send({
          feedback_id: feedback.id,
          user_id: feedback.userId,
          release_id: feedback.releaseId,
          version: feedback.version,
          app_version: feedback.appVersion,
          category: feedback.category,
          severity: feedback.severity,
          priority: feedback.priority,
          status: feedback.status,
          title: feedback.title,
          description: feedback.description,
          escalated_at: feedback.escalatedAt,
          escalated_by_user_id: feedback.escalatedByUserId,
          escalation_reason: feedback.escalationReason,
          created_at: feedback.createdAt,
          updated_at: feedback.updatedAt
        });
      } catch (error) {
        if (replyReleaseServiceError(reply, error)) {
          return;
        }
        throw error;
      }
    }
  );

  app.get("/v1/system/beta/cohort/metrics", { preHandler: authenticate(services.authService) }, async (request, reply) => {
    const authRequest = request as AuthenticatedRequest;
    if (!assertSystemPermission(authRequest, reply, "beta:read")) {
      return;
    }
    const parsed = betaCohortQuerySchema.safeParse(request.query ?? {});
    if (!parsed.success) {
      reply.code(400).send(toError("VALIDATION_ERROR", "beta cohort query is invalid"));
      return;
    }
    try {
      const metrics = services.releaseService.getBetaCohortMetrics({
        releaseId: parsed.data.release_id,
        operatorUserId: authRequest.auth.userId
      });
      reply.code(200).send(serializeBetaCohortMetrics(metrics));
    } catch (error) {
      if (replyReleaseServiceError(reply, error)) {
        return;
      }
      throw error;
    }
  });

  app.get("/v1/system/beta/cohort/export", { preHandler: authenticate(services.authService) }, async (request, reply) => {
    const authRequest = request as AuthenticatedRequest;
    if (!assertSystemPermission(authRequest, reply, "beta:read")) {
      return;
    }
    const parsed = betaCohortExportQuerySchema.safeParse(request.query ?? {});
    if (!parsed.success) {
      reply.code(400).send(toError("VALIDATION_ERROR", "beta cohort export query is invalid"));
      return;
    }
    try {
      if (parsed.data.format === "csv") {
        const exported = services.releaseService.exportBetaCohortCsv({
          releaseId: parsed.data.release_id,
          operatorUserId: authRequest.auth.userId
        });
        reply
          .code(200)
          .header("content-disposition", `attachment; filename="${exported.filename}"`)
          .type("text/csv; charset=utf-8")
          .send(exported.content);
        return;
      }

      const report = services.releaseService.getBetaCohortExport({
        releaseId: parsed.data.release_id,
        operatorUserId: authRequest.auth.userId
      });
      reply.code(200).send({
        release_id: report.releaseId,
        generated_at: report.generatedAt,
        metrics: serializeBetaCohortMetrics(report.metrics),
        users: report.users.map(serializeBetaCohortUser)
      });
    } catch (error) {
      if (replyReleaseServiceError(reply, error)) {
        return;
      }
      throw error;
    }
  });

  app.get("/v1/system/users/roles/audit", { preHandler: authenticate(services.authService) }, async (request, reply) => {
    const authRequest = request as AuthenticatedRequest;
    if (!assertSystemPermission(authRequest, reply, "user_roles:manage")) {
      return;
    }
    const parsed = systemRoleAuditQuerySchema.safeParse(request.query ?? {});
    if (!parsed.success) {
      reply.code(400).send(toError("VALIDATION_ERROR", "system role audit query is invalid"));
      return;
    }
    const result = services.authService.querySystemRoleAudit({
      targetUserId: parsed.data.target_user_id,
      operatorUserId: parsed.data.operator_user_id,
      page: parsed.data.page,
      pageSize: parsed.data.page_size
    });
    reply.code(200).send({
      total: result.total,
      page: result.page,
      page_size: result.pageSize,
      items: result.items.map((item) => ({
        audit_id: item.id,
        operator_user_id: item.operatorUserId,
        target_user_id: item.targetUserId,
        roles: item.roles,
        created_at: item.createdAt
      }))
    });
  });

  app.get("/v1/system/users/:user_id/roles", { preHandler: authenticate(services.authService) }, async (request, reply) => {
    const authRequest = request as AuthenticatedRequest;
    if (!assertSystemPermission(authRequest, reply, "user_roles:manage")) {
      return;
    }
    const parsed = systemUserParamsSchema.safeParse(request.params);
    if (!parsed.success) {
      reply.code(400).send(toError("VALIDATION_ERROR", "system user params is invalid"));
      return;
    }
    try {
      const user = services.authService.getUserById(parsed.data.user_id);
      reply.code(200).send({
        user_id: user.id,
        roles: user.systemRoles,
        updated_at: user.updatedAt
      });
    } catch (error) {
      if (error instanceof Error && error.message === "USER_NOT_FOUND") {
        reply.code(404).send(toError("USER_NOT_FOUND", "User not found"));
        return;
      }
      throw error;
    }
  });

  app.put("/v1/system/users/:user_id/roles", { preHandler: authenticate(services.authService) }, async (request, reply) => {
    const authRequest = request as AuthenticatedRequest;
    if (!assertSystemPermission(authRequest, reply, "user_roles:manage")) {
      return;
    }
    const paramsParsed = systemUserParamsSchema.safeParse(request.params);
    const bodyParsed = systemUserRolesUpdateSchema.safeParse(request.body ?? {});
    if (!paramsParsed.success || !bodyParsed.success) {
      reply.code(400).send(toError("VALIDATION_ERROR", "system user roles payload is invalid"));
      return;
    }
    try {
      const updated = services.authService.setSystemRoles({
        userId: paramsParsed.data.user_id,
        roles: bodyParsed.data.roles,
        operatorUserId: authRequest.auth.userId
      });
      try {
        await services.authAccountRepository?.flush();
      } catch {
        reply.code(503).send(toError("AUTH_ACCOUNT_STORAGE_UNAVAILABLE", "Auth/account storage is unavailable"));
        return;
      }
      reply.code(200).send({
        user_id: updated.userId,
        roles: updated.roles,
        updated_at: updated.updatedAt
      });
    } catch (error) {
      if (error instanceof Error && error.message === "USER_NOT_FOUND") {
        reply.code(404).send(toError("USER_NOT_FOUND", "User not found"));
        return;
      }
      throw error;
    }
  });
};
