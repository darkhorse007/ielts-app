import Fastify from "fastify";
import websocket from "@fastify/websocket";
import { z } from "zod";
import { defaultConfig, type ServiceConfig } from "./domain/config.js";
import { getBrowserOrigin, isBrowserOriginAllowed, normalizeBrowserOrigin } from "./domain/browser-origin-policy.js";
import { InMemoryStore } from "./domain/store.js";
import {
  InMemoryAuthAccountRepository,
  PostgresAuthAccountRepository,
  type AuthAccountRepository
} from "./domain/auth-account-repository.js";
import {
  InMemoryLearnerStateRepository,
  PostgresLearnerStateRepository,
  type LearnerStateRepository
} from "./domain/learner-state-repository.js";
import {
  InMemoryPracticeStateRepository,
  PostgresPracticeStateRepository,
  type PracticeStateRepository
} from "./domain/practice-state-repository.js";
import {
  InMemorySpeakingStateRepository,
  PostgresSpeakingStateRepository,
  type SpeakingStateRepository
} from "./domain/speaking-state-repository.js";
import {
  InMemoryWritingStateRepository,
  PostgresWritingStateRepository,
  type WritingStateRepository
} from "./domain/writing-state-repository.js";
import {
  InMemoryMockStateRepository,
  PostgresMockStateRepository,
  type MockStateRepository
} from "./domain/mock-state-repository.js";
import { AuthService } from "./domain/auth-service.js";
import { OnboardingService } from "./domain/onboarding-service.js";
import { ProgressService } from "./domain/progress-service.js";
import { AccountService } from "./domain/account-service.js";
import { PracticeService } from "./domain/practice-service.js";
import { SpeakingRealtimeService } from "./domain/speaking-realtime-service.js";
import { WritingService } from "./domain/writing-service.js";
import { MockExamService } from "./domain/mock-exam-service.js";
import { AnalyticsService } from "./domain/analytics-service.js";
import {
  InMemoryAnalyticsRepository,
  PostgresAnalyticsRepository,
  type AnalyticsRepository
} from "./domain/analytics-repository.js";
import { ReminderService } from "./domain/reminder-service.js";
import {
  ReminderDeliveryService,
  type ReminderPushProviderSenders,
  type ReminderPushRuntimeDiagnostics
} from "./domain/reminder-delivery-service.js";
import { createReminderPushProviderSenders } from "./domain/reminder-push-provider-senders.js";
import { appendAudit } from "./domain/audit.js";
import { nowIso } from "./domain/time.js";
import { registerAuthRoutes } from "./routes/auth.js";
import { registerOnboardingRoutes } from "./routes/onboarding.js";
import { registerProgressRoutes } from "./routes/progress.js";
import { registerAccountRoutes } from "./routes/account.js";
import { registerPracticeRoutes } from "./routes/practice.js";
import { registerRealtimeSpeakingRoutes } from "./routes/realtime-speaking.js";
import { registerWritingRoutes } from "./routes/writing.js";
import { registerMockExamRoutes } from "./routes/mock-exam.js";
import { registerAnalyticsRoutes } from "./routes/analytics.js";
import { registerReminderRoutes } from "./routes/reminder.js";
import { authenticate, authorizeSystemRoles, type AuthenticatedRequest } from "./middleware/auth.js";

export type ReminderDispatchSchedulerStatusSnapshot = {
  enabled: boolean;
  intervalSeconds?: number;
  batchSize?: number;
  running: boolean;
  lastTrigger?: "startup" | "interval";
  lastStartedAt?: string;
  lastCompletedAt?: string;
  lastSuccessAt?: string;
  lastError?: string;
  lastDueCount?: number;
  lastDispatchedReminderCount?: number;
  lastSkippedAlreadyAttemptedCount?: number;
};

type BuildServerOptions = Partial<ServiceConfig> & {
  authAccountStorageBackend?: "memory" | "postgres";
  authAccountStorageConnectionString?: string;
  authAccountStorageSchema?: string;
  authAccountRepository?: AuthAccountRepository;
  learnerStateStorageBackend?: "memory" | "postgres";
  learnerStateStorageConnectionString?: string;
  learnerStateStorageSchema?: string;
  learnerStateRepository?: LearnerStateRepository;
  practiceStateStorageBackend?: "memory" | "postgres";
  practiceStateStorageConnectionString?: string;
  practiceStateStorageSchema?: string;
  practiceStateRepository?: PracticeStateRepository;
  speakingStateStorageBackend?: "memory" | "postgres";
  speakingStateStorageConnectionString?: string;
  speakingStateStorageSchema?: string;
  speakingStateRepository?: SpeakingStateRepository;
  writingStateStorageBackend?: "memory" | "postgres";
  writingStateStorageConnectionString?: string;
  writingStateStorageSchema?: string;
  writingStateRepository?: WritingStateRepository;
  mockStateStorageBackend?: "memory" | "postgres";
  mockStateStorageConnectionString?: string;
  mockStateStorageSchema?: string;
  mockStateRepository?: MockStateRepository;
  analyticsStorageBackend?: "memory" | "postgres";
  analyticsStorageConnectionString?: string;
  analyticsStorageSchema?: string;
  analyticsRepository?: AnalyticsRepository;
  reminderDeliveryApnsEnabled?: boolean;
  reminderDeliveryApnsBundleId?: string;
  reminderDeliveryApnsTeamId?: string;
  reminderDeliveryApnsKeyId?: string;
  reminderDeliveryApnsPrivateKey?: string;
  reminderDeliveryFcmEnabled?: boolean;
  reminderDeliveryFcmProjectId?: string;
  reminderDeliveryFcmClientEmail?: string;
  reminderDeliveryFcmPrivateKey?: string;
  reminderDeliveryFcmTokenUri?: string;
  reminderDeliverySenders?: ReminderPushProviderSenders;
  reminderDispatchSchedulerStatus?: ReminderDispatchSchedulerStatusSnapshot;
  allowedBrowserOrigins?: string[];
  enableInternalDebugRoutes?: boolean;
};

const ACCESS_CONTROL_ALLOW_METHODS = "GET,POST,PUT,PATCH,DELETE,OPTIONS";
const DEFAULT_ACCESS_CONTROL_ALLOW_HEADERS = "Authorization, Content-Type, Idempotency-Key, X-Device-Id";
type InternalMinorGuardianSupportRequestOrderBy = "updated_at_desc" | "sla_priority_desc" | "queue_wait_desc";

const internalMinorGuardianSupportRequestListSchema = z.object({
  status: z.enum(["pending_review", "contacted", "closed"]).optional(),
  q: z.string().trim().max(120).optional(),
  handled_by: z.string().trim().min(1).max(120).optional(),
  unassigned: z
    .enum(["true", "false"])
    .transform((value) => value === "true")
    .optional(),
  sla_state: z.enum(["within_sla", "due_soon", "breached"]).optional(),
  order_by: z.enum(["updated_at_desc", "sla_priority_desc", "queue_wait_desc"]).optional(),
  page: z.coerce.number().int().min(1).max(10_000).optional(),
  page_size: z.coerce.number().int().min(1).max(50).optional()
}).refine((value) => !(value.handled_by && value.unassigned), {
  message: "handled_by and unassigned cannot be combined"
});
const internalMinorGuardianSupportRequestUpdateSchema = z.object({
  status: z.enum(["pending_review", "contacted", "closed"]),
  handled_by: z.string().trim().min(1).max(120),
  operator_note: z.string().trim().min(1).max(600).optional()
});
const internalMinorGuardianSupportRequestBulkUpdateSchema = z.object({
  request_ids: z.array(z.string().trim().min(1).max(120)).min(1).max(50),
  status: z.enum(["pending_review", "contacted", "closed"]).optional(),
  handled_by: z.string().trim().min(1).max(120),
  operator_note: z.string().trim().min(1).max(600).optional()
});

const buildMinorGuardianSupportRequestStatusSummary = (
  items: Array<{
    request: {
      status: "pending_review" | "contacted" | "closed";
    };
  }>
): {
  pending_review: number;
  contacted: number;
  closed: number;
} =>
  items.reduce(
    (summary, item) => {
      summary[item.request.status] += 1;
      return summary;
    },
    {
      pending_review: 0,
      contacted: 0,
      closed: 0
    }
  );

type MinorGuardianSupportRequestSlaState = "within_sla" | "due_soon" | "breached" | "closed";
const MINOR_GUARDIAN_SUPPORT_REQUEST_SLA_PRIORITY: Record<MinorGuardianSupportRequestSlaState, number> = {
  breached: 3,
  due_soon: 2,
  within_sla: 1,
  closed: 0
};

const MINOR_GUARDIAN_SUPPORT_SLA_TARGET_MINUTES: Record<"pending_review" | "contacted", number> = {
  pending_review: 120,
  contacted: 1_440
};

const deriveMinorGuardianSupportRequestSla = (request: {
  status: "pending_review" | "contacted" | "closed";
  updatedAt: string;
}, nowMs = Date.now()): {
  lastActivityAt: string;
  queueWaitMinutes: number;
  slaTargetMinutes?: number;
  slaState: MinorGuardianSupportRequestSlaState;
  slaBreached: boolean;
} => {
  const lastActivityAt = request.updatedAt;
  const lastActivityAtMs = Date.parse(lastActivityAt);
  const queueWaitMinutes = Number.isFinite(lastActivityAtMs)
    ? Math.max(0, Math.floor((nowMs - lastActivityAtMs) / 60_000))
    : 0;

  if (request.status === "closed") {
    return {
      lastActivityAt,
      queueWaitMinutes,
      slaState: "closed",
      slaBreached: false
    };
  }

  const slaTargetMinutes = MINOR_GUARDIAN_SUPPORT_SLA_TARGET_MINUTES[request.status];
  const slaState: MinorGuardianSupportRequestSlaState =
    queueWaitMinutes >= slaTargetMinutes
      ? "breached"
      : queueWaitMinutes >= Math.floor(slaTargetMinutes * 0.75)
        ? "due_soon"
        : "within_sla";

  return {
    lastActivityAt,
    queueWaitMinutes,
    slaTargetMinutes,
    slaState,
    slaBreached: slaState === "breached"
  };
};

const matchesMinorGuardianSupportRequestSlaState = (
  item: {
    request: {
      status: "pending_review" | "contacted" | "closed";
      updatedAt: string;
    };
  },
  slaState?: "within_sla" | "due_soon" | "breached",
  nowMs = Date.now()
): boolean => {
  if (!slaState) {
    return true;
  }

  return deriveMinorGuardianSupportRequestSla(item.request, nowMs).slaState === slaState;
};

const buildMinorGuardianSupportRequestSlaSummary = (
  items: Array<{
    request: {
      status: "pending_review" | "contacted" | "closed";
      updatedAt: string;
    };
  }>,
  nowMs = Date.now()
): {
  within_sla: number;
  due_soon: number;
  breached: number;
} =>
  items.reduce(
    (summary, item) => {
      const sla = deriveMinorGuardianSupportRequestSla(item.request, nowMs);
      if (sla.slaState === "within_sla" || sla.slaState === "due_soon" || sla.slaState === "breached") {
        summary[sla.slaState] += 1;
      }
      return summary;
    },
    {
      within_sla: 0,
      due_soon: 0,
      breached: 0
    }
  );

const buildMinorGuardianSupportRequestDashboardSummary = (
  items: Array<{
    request: {
      status: "pending_review" | "contacted" | "closed";
      updatedAt: string;
      handledBy?: string;
    };
  }>,
  nowMs = Date.now()
): {
  open_count: number;
  assigned_open_count: number;
  unassigned_open_count: number;
  breached_open_count: number;
  due_soon_open_count: number;
  oldest_open_wait_minutes: number;
  average_open_wait_minutes: number;
} => {
  const openItems = items.filter((item) => item.request.status !== "closed");
  if (openItems.length === 0) {
    return {
      open_count: 0,
      assigned_open_count: 0,
      unassigned_open_count: 0,
      breached_open_count: 0,
      due_soon_open_count: 0,
      oldest_open_wait_minutes: 0,
      average_open_wait_minutes: 0
    };
  }

  const queueWaitMinutes = openItems.map((item) => deriveMinorGuardianSupportRequestSla(item.request, nowMs).queueWaitMinutes);
  const breachedOpenCount = openItems.filter(
    (item) => deriveMinorGuardianSupportRequestSla(item.request, nowMs).slaState === "breached"
  ).length;
  const dueSoonOpenCount = openItems.filter(
    (item) => deriveMinorGuardianSupportRequestSla(item.request, nowMs).slaState === "due_soon"
  ).length;
  const assignedOpenCount = openItems.filter(
    (item) => typeof item.request.handledBy === "string" && item.request.handledBy.trim().length > 0
  ).length;

  return {
    open_count: openItems.length,
    assigned_open_count: assignedOpenCount,
    unassigned_open_count: openItems.length - assignedOpenCount,
    breached_open_count: breachedOpenCount,
    due_soon_open_count: dueSoonOpenCount,
    oldest_open_wait_minutes: Math.max(...queueWaitMinutes),
    average_open_wait_minutes: Math.floor(queueWaitMinutes.reduce((sum, current) => sum + current, 0) / openItems.length)
  };
};

const sortMinorGuardianSupportRequestItems = <T extends {
  request: {
    status: "pending_review" | "contacted" | "closed";
    updatedAt: string;
  };
}>(
  items: T[],
  orderBy: InternalMinorGuardianSupportRequestOrderBy,
  nowMs = Date.now()
): T[] =>
  [...items].sort((left, right) => {
    if (orderBy === "updated_at_desc") {
      return right.request.updatedAt.localeCompare(left.request.updatedAt);
    }

    const leftSla = deriveMinorGuardianSupportRequestSla(left.request, nowMs);
    const rightSla = deriveMinorGuardianSupportRequestSla(right.request, nowMs);
    if (orderBy === "sla_priority_desc") {
      const priorityDifference =
        MINOR_GUARDIAN_SUPPORT_REQUEST_SLA_PRIORITY[rightSla.slaState] -
        MINOR_GUARDIAN_SUPPORT_REQUEST_SLA_PRIORITY[leftSla.slaState];
      if (priorityDifference !== 0) {
        return priorityDifference;
      }

      if (rightSla.queueWaitMinutes !== leftSla.queueWaitMinutes) {
        return rightSla.queueWaitMinutes - leftSla.queueWaitMinutes;
      }
      return right.request.updatedAt.localeCompare(left.request.updatedAt);
    }

    const leftOpenPriority = left.request.status === "closed" ? 0 : 1;
    const rightOpenPriority = right.request.status === "closed" ? 0 : 1;
    if (rightOpenPriority !== leftOpenPriority) {
      return rightOpenPriority - leftOpenPriority;
    }
    if (rightSla.queueWaitMinutes !== leftSla.queueWaitMinutes) {
      return rightSla.queueWaitMinutes - leftSla.queueWaitMinutes;
    }
    return right.request.updatedAt.localeCompare(left.request.updatedAt);
  });

const escapeCsvCell = (value: unknown): string => `"${String(value ?? "").replace(/"/g, "\"\"")}"`;

const serializeInternalMinorGuardianSupportRequestsCsv = (
  items: Array<{
    userId: string;
    email?: string;
    phone?: string;
    displayName?: string;
    userStatus: string;
    minorGuardianAgeBand: "unknown" | "under_18" | "adult";
    request: {
      id: string;
      topic: "account_review" | "data_deletion" | "usage_concern" | "other";
      contactChannel: "email" | "phone";
      contactValue: string;
      message: string;
      status: "pending_review" | "contacted" | "closed";
      createdAt: string;
      updatedAt: string;
      resolvedAt?: string;
      handledBy?: string;
      operatorNote?: string;
    };
  }>,
  nowMs = Date.now()
): string => {
  const header = [
    "request_id",
    "user_id",
    "user_email",
    "user_phone",
    "user_display_name",
    "user_status",
    "minor_guardian_age_band",
    "topic",
    "contact_channel",
    "contact_value",
    "message",
    "status",
    "created_at",
    "updated_at",
    "resolved_at",
    "handled_by",
    "operator_note",
    "last_activity_at",
    "queue_wait_minutes",
    "sla_target_minutes",
    "sla_state",
    "sla_breached"
  ];

  const rows = items.map((item) => {
    const sla = deriveMinorGuardianSupportRequestSla(item.request, nowMs);
    return [
      item.request.id,
      item.userId,
      item.email,
      item.phone,
      item.displayName,
      item.userStatus,
      item.minorGuardianAgeBand,
      item.request.topic,
      item.request.contactChannel,
      item.request.contactValue,
      item.request.message,
      item.request.status,
      item.request.createdAt,
      item.request.updatedAt,
      item.request.resolvedAt,
      item.request.handledBy,
      item.request.operatorNote,
      sla.lastActivityAt,
      sla.queueWaitMinutes,
      sla.slaTargetMinutes,
      sla.slaState,
      sla.slaBreached
    ]
      .map((value) => escapeCsvCell(value))
      .join(",");
  });

  return [header.join(","), ...rows].join("\n");
};

const serializeReminderDispatchSchedulerStatus = (
  status?: ReminderDispatchSchedulerStatusSnapshot
):
  | {
      enabled: boolean;
      running: boolean;
      interval_seconds?: number;
      batch_size?: number;
      last_trigger?: "startup" | "interval";
      last_started_at?: string;
      last_completed_at?: string;
      last_success_at?: string;
      last_error?: string;
      last_due_count?: number;
      last_dispatched_reminder_count?: number;
      last_skipped_already_attempted_count?: number;
    }
  | undefined =>
  status
    ? {
        enabled: status.enabled,
        running: status.running,
        interval_seconds: status.intervalSeconds,
        batch_size: status.batchSize,
        last_trigger: status.lastTrigger,
        last_started_at: status.lastStartedAt,
        last_completed_at: status.lastCompletedAt,
        last_success_at: status.lastSuccessAt,
        last_error: status.lastError,
        last_due_count: status.lastDueCount,
        last_dispatched_reminder_count: status.lastDispatchedReminderCount,
        last_skipped_already_attempted_count: status.lastSkippedAlreadyAttemptedCount
      }
    : undefined;

const serializeReminderPushRuntimeDiagnostics = (
  diagnostics: ReminderPushRuntimeDiagnostics
): {
  apns: {
    enabled: boolean;
    configured: boolean;
    ready: boolean;
    sender_available: boolean;
    missing_fields: string[];
    registered_device_count: number;
    deliverable_device_count: number;
    platform_counts: {
      ios: number;
      android: number;
    };
    environment_counts: {
      development: number;
      preview: number;
      production: number;
    };
    bundle_id?: string;
  };
  fcm: {
    enabled: boolean;
    configured: boolean;
    ready: boolean;
    sender_available: boolean;
    missing_fields: string[];
    registered_device_count: number;
    deliverable_device_count: number;
    platform_counts: {
      ios: number;
      android: number;
    };
    environment_counts: {
      development: number;
      preview: number;
      production: number;
    };
    project_id?: string;
  };
} => ({
  apns: {
    enabled: diagnostics.apns.enabled,
    configured: diagnostics.apns.configured,
    ready: diagnostics.apns.ready,
    sender_available: diagnostics.apns.senderAvailable,
    missing_fields: diagnostics.apns.missingFields,
    registered_device_count: diagnostics.apns.registeredDeviceCount,
    deliverable_device_count: diagnostics.apns.deliverableDeviceCount,
    platform_counts: diagnostics.apns.platformCounts,
    environment_counts: diagnostics.apns.environmentCounts,
    bundle_id: diagnostics.apns.bundleId
  },
  fcm: {
    enabled: diagnostics.fcm.enabled,
    configured: diagnostics.fcm.configured,
    ready: diagnostics.fcm.ready,
    sender_available: diagnostics.fcm.senderAvailable,
    missing_fields: diagnostics.fcm.missingFields,
    registered_device_count: diagnostics.fcm.registeredDeviceCount,
    deliverable_device_count: diagnostics.fcm.deliverableDeviceCount,
    platform_counts: diagnostics.fcm.platformCounts,
    environment_counts: diagnostics.fcm.environmentCounts,
    project_id: diagnostics.fcm.projectId
  }
});

const serializeInternalMinorGuardianSupportRequest = (item: {
  userId: string;
  email?: string;
  phone?: string;
  displayName?: string;
  userStatus: string;
  minorGuardianAgeBand: "unknown" | "under_18" | "adult";
  request: {
    id: string;
    topic: "account_review" | "data_deletion" | "usage_concern" | "other";
    contactChannel: "email" | "phone";
    contactValue: string;
    message: string;
    status: "pending_review" | "contacted" | "closed";
    createdAt: string;
    updatedAt: string;
    resolvedAt?: string;
    handledBy?: string;
    operatorNote?: string;
  };
}, nowMs = Date.now()) => {
  const sla = deriveMinorGuardianSupportRequestSla(item.request, nowMs);
  return {
    request_id: item.request.id,
    user_id: item.userId,
    user_email: item.email,
    user_phone: item.phone,
    user_display_name: item.displayName,
    user_status: item.userStatus,
    minor_guardian_age_band: item.minorGuardianAgeBand,
    topic: item.request.topic,
    contact_channel: item.request.contactChannel,
    contact_value: item.request.contactValue,
    message: item.request.message,
    status: item.request.status,
    created_at: item.request.createdAt,
    updated_at: item.request.updatedAt,
    resolved_at: item.request.resolvedAt,
    handled_by: item.request.handledBy,
    operator_note: item.request.operatorNote,
    last_activity_at: sla.lastActivityAt,
    queue_wait_minutes: sla.queueWaitMinutes,
    sla_target_minutes: sla.slaTargetMinutes,
    sla_state: sla.slaState,
    sla_breached: sla.slaBreached
  };
};

const setCorsHeaders = (
  reply: { header: (name: string, value: string) => void },
  origin: string,
  requestHeaders?: string
): void => {
  reply.header("Vary", "Origin");
  reply.header("Access-Control-Allow-Origin", origin);
  reply.header("Access-Control-Allow-Methods", ACCESS_CONTROL_ALLOW_METHODS);
  reply.header("Access-Control-Allow-Headers", requestHeaders?.trim() || DEFAULT_ACCESS_CONTROL_ALLOW_HEADERS);
};

export const buildServer = (options?: BuildServerOptions): {
  app: ReturnType<typeof Fastify>;
  store: InMemoryStore;
  authService: AuthService;
  onboardingService: OnboardingService;
  progressService: ProgressService;
  accountService: AccountService;
  practiceService: PracticeService;
  speakingRealtimeService: SpeakingRealtimeService;
  writingService: WritingService;
  mockExamService: MockExamService;
  analyticsService: AnalyticsService;
  reminderService: ReminderService;
  reminderDeliveryService: ReminderDeliveryService;
  analyticsRepository: AnalyticsRepository;
  authAccountRepository: AuthAccountRepository;
  learnerStateRepository: LearnerStateRepository;
  practiceStateRepository: PracticeStateRepository;
  speakingStateRepository: SpeakingStateRepository;
  writingStateRepository: WritingStateRepository;
  mockStateRepository: MockStateRepository;
} => {
  const config: ServiceConfig = {
    ...defaultConfig,
    ...options
  };
  const allowedBrowserOrigins = options?.allowedBrowserOrigins ?? [];
  const enableInternalDebugRoutes = options?.enableInternalDebugRoutes ?? false;
  const reminderDispatchSchedulerStatus = options?.reminderDispatchSchedulerStatus;

  const authAccountRepository =
    options?.authAccountRepository ??
    (options?.authAccountStorageBackend === "postgres"
      ? new PostgresAuthAccountRepository({
          connectionString: options.authAccountStorageConnectionString,
          schema: options.authAccountStorageSchema
        })
      : new InMemoryAuthAccountRepository());
  const learnerStateRepository =
    options?.learnerStateRepository ??
    (options?.learnerStateStorageBackend === "postgres"
      ? new PostgresLearnerStateRepository({
          connectionString: options.learnerStateStorageConnectionString,
          schema: options.learnerStateStorageSchema
        })
      : new InMemoryLearnerStateRepository());
  const practiceStateRepository =
    options?.practiceStateRepository ??
    (options?.practiceStateStorageBackend === "postgres"
      ? new PostgresPracticeStateRepository({
          connectionString: options.practiceStateStorageConnectionString,
          schema: options.practiceStateStorageSchema
        })
      : new InMemoryPracticeStateRepository());
  const speakingStateRepository =
    options?.speakingStateRepository ??
    (options?.speakingStateStorageBackend === "postgres"
      ? new PostgresSpeakingStateRepository({
          connectionString: options.speakingStateStorageConnectionString,
          schema: options.speakingStateStorageSchema
        })
      : new InMemorySpeakingStateRepository());
  const writingStateRepository =
    options?.writingStateRepository ??
    (options?.writingStateStorageBackend === "postgres"
      ? new PostgresWritingStateRepository({
          connectionString: options.writingStateStorageConnectionString,
          schema: options.writingStateStorageSchema
        })
      : new InMemoryWritingStateRepository());
  const mockStateRepository =
    options?.mockStateRepository ??
    (options?.mockStateStorageBackend === "postgres"
      ? new PostgresMockStateRepository({
          connectionString: options.mockStateStorageConnectionString,
          schema: options.mockStateStorageSchema
        })
      : new InMemoryMockStateRepository());
  const analyticsRepository =
    options?.analyticsRepository ??
    (options?.analyticsStorageBackend === "postgres"
      ? new PostgresAnalyticsRepository({
          connectionString: options.analyticsStorageConnectionString,
          schema: options.analyticsStorageSchema
        })
      : new InMemoryAnalyticsRepository());

  const store = new InMemoryStore({
    usersById: authAccountRepository.usersById,
    userIdByEmail: authAccountRepository.userIdByEmail,
    userIdByPhone: authAccountRepository.userIdByPhone,
    sessionsById: authAccountRepository.sessionsById,
    sessionIdByRefreshHash: authAccountRepository.sessionIdByRefreshHash,
    refreshBlacklist: authAccountRepository.refreshBlacklist,
    failedLoginByIdentifier: authAccountRepository.failedLoginByIdentifier,
    goalProfilesById: learnerStateRepository.goalProfilesById,
    goalProfileByUserAndIdempotency: learnerStateRepository.goalProfileByUserAndIdempotency,
    assessmentJobsById: learnerStateRepository.assessmentJobsById,
    studyPlansById: learnerStateRepository.studyPlansById,
    activePlanIdByUserId: learnerStateRepository.activePlanIdByUserId,
    userProgressByUserId: learnerStateRepository.userProgressByUserId,
    progressConflicts: learnerStateRepository.progressConflicts,
    practiceSessionsById: practiceStateRepository.practiceSessionsById,
    retryQueueById: practiceStateRepository.retryQueueById,
    skillProficiencyByUserAndSkill: practiceStateRepository.skillProficiencyByUserAndSkill,
    speakingSessionsById: speakingStateRepository.speakingSessionsById,
    writingEvaluationsById: writingStateRepository.writingEvaluationsById,
    writingRewriteArchivesByUserId: writingStateRepository.writingRewriteArchivesByUserId,
    writingTemplateUsagesByUserId: writingStateRepository.writingTemplateUsagesByUserId,
    mockExamsById: mockStateRepository.mockExamsById,
    mockExamReportsById: mockStateRepository.mockExamReportsById,
    analyticsEvents: analyticsRepository.analyticsEvents
  });
  const authService = new AuthService(store, config);
  const onboardingService = new OnboardingService(store);
  const progressService = new ProgressService(store);
  const accountService = new AccountService(store, authService, progressService);
  const practiceService = new PracticeService(store, onboardingService);
  const speakingRealtimeService = new SpeakingRealtimeService(store, onboardingService);
  const writingService = new WritingService(store, onboardingService);
  const mockExamService = new MockExamService(store);
  const analyticsService = new AnalyticsService(store, analyticsRepository);
  const reminderService = new ReminderService(store);
  const reminderProviderSettings = {
    apns: {
      enabled: options?.reminderDeliveryApnsEnabled ?? false,
      bundleId: options?.reminderDeliveryApnsBundleId,
      teamId: options?.reminderDeliveryApnsTeamId,
      keyId: options?.reminderDeliveryApnsKeyId,
      privateKey: options?.reminderDeliveryApnsPrivateKey
    },
    fcm: {
      enabled: options?.reminderDeliveryFcmEnabled ?? false,
      projectId: options?.reminderDeliveryFcmProjectId,
      clientEmail: options?.reminderDeliveryFcmClientEmail,
      privateKey: options?.reminderDeliveryFcmPrivateKey,
      tokenUri: options?.reminderDeliveryFcmTokenUri
    }
  };
  const defaultReminderDeliverySenders = createReminderPushProviderSenders(reminderProviderSettings);
  const reminderDeliveryService = new ReminderDeliveryService(
    store,
    reminderService,
    reminderProviderSettings,
    {
      ...defaultReminderDeliverySenders,
      ...options?.reminderDeliverySenders
    }
  );

  const app = Fastify({
    logger: false
  });
  app.register(websocket);

  app.addHook("onRequest", async (request, reply) => {
    const origin = getBrowserOrigin(request.headers);
    if (!origin) {
      return;
    }

    const normalizedOrigin = normalizeBrowserOrigin(origin);
    const browserOriginAllowed = isBrowserOriginAllowed(request.headers, allowedBrowserOrigins);
    if (
      normalizedOrigin &&
      browserOriginAllowed &&
      request.method !== "OPTIONS"
    ) {
      setCorsHeaders(
        reply,
        normalizedOrigin,
        typeof request.headers["access-control-request-headers"] === "string"
          ? request.headers["access-control-request-headers"]
          : undefined
      );
    }

    if (request.method !== "OPTIONS") {
      return;
    }

    if (!normalizedOrigin || !browserOriginAllowed) {
      reply.code(403).send({
        code: "ORIGIN_NOT_ALLOWED",
        message: "Browser origin is not allowed"
      });
      return;
    }

    setCorsHeaders(
      reply,
      normalizedOrigin,
      typeof request.headers["access-control-request-headers"] === "string"
        ? request.headers["access-control-request-headers"]
        : undefined
    );
    reply.code(204).send();
  });

  app.get("/health", async () => ({
    status: "ok",
    reminder_dispatch_scheduler: serializeReminderDispatchSchedulerStatus(reminderDispatchSchedulerStatus)
  }));

  if (enableInternalDebugRoutes) {
    const internalOpsPreHandler = {
      preHandler: [authenticate(authService), authorizeSystemRoles(["ops", "admin"])]
    };

    app.get("/internal/audit-events", internalOpsPreHandler, async () => ({
      items: store.auditEvents
    }));

    app.get<{ Params: { user_id: string } }>("/internal/users/:user_id", internalOpsPreHandler, async (request, reply) => {
      try {
        const user = authService.getUserById(request.params.user_id);
        reply.code(200).send(user);
      } catch {
        reply.code(404).send({
          code: "USER_NOT_FOUND",
          message: "User not found"
        });
      }
    });

    app.get("/internal/minor-guardian/support-requests", internalOpsPreHandler, async (request, reply) => {
      const parsed = internalMinorGuardianSupportRequestListSchema.safeParse(request.query ?? {});
      if (!parsed.success) {
        reply.code(400).send({
          code: "VALIDATION_ERROR",
          message: "minor guardian support request query is invalid"
        });
        return;
      }

      const page = parsed.data.page ?? 1;
      const pageSize = parsed.data.page_size ?? 10;
      const orderBy = parsed.data.order_by ?? "updated_at_desc";
      const evaluatedAtMs = Date.now();
      const allMatchingItems = accountService.listAllMinorGuardianSupportRequests({
        query: parsed.data.q,
        handledBy: parsed.data.handled_by,
        unassigned: parsed.data.unassigned
      });
      const filteredByStatus = parsed.data.status
        ? allMatchingItems.filter((item) => item.request.status === parsed.data.status)
        : allMatchingItems;
      const filteredItems = parsed.data.sla_state
        ? filteredByStatus.filter((item) =>
            matchesMinorGuardianSupportRequestSlaState(item, parsed.data.sla_state, evaluatedAtMs)
          )
        : filteredByStatus;
      const sortedItems = sortMinorGuardianSupportRequestItems(filteredItems, orderBy, evaluatedAtMs);
      const totalCount = sortedItems.length;
      const pageStartIndex = (page - 1) * pageSize;
      const paginatedItems = sortedItems
        .slice(pageStartIndex, pageStartIndex + pageSize)
        .map((item) => serializeInternalMinorGuardianSupportRequest(item, evaluatedAtMs));

      reply.code(200).send({
        total_count: totalCount,
        page,
        page_size: pageSize,
        has_next_page: pageStartIndex + pageSize < totalCount,
        ordered_by: orderBy,
        status_summary: buildMinorGuardianSupportRequestStatusSummary(allMatchingItems),
        sla_summary: buildMinorGuardianSupportRequestSlaSummary(allMatchingItems, evaluatedAtMs),
        dashboard_summary: buildMinorGuardianSupportRequestDashboardSummary(allMatchingItems, evaluatedAtMs),
        items: paginatedItems
      });
    });

    app.get("/internal/minor-guardian/support-requests/export", internalOpsPreHandler, async (request, reply) => {
      const parsed = internalMinorGuardianSupportRequestListSchema.safeParse(request.query ?? {});
      if (!parsed.success) {
        reply.code(400).send({
          code: "VALIDATION_ERROR",
          message: "minor guardian support request query is invalid"
        });
        return;
      }

      const authRequest = request as AuthenticatedRequest;
      const orderBy = parsed.data.order_by ?? "updated_at_desc";
      const evaluatedAtMs = Date.now();
      const allMatchingItems = accountService.listAllMinorGuardianSupportRequests({
        query: parsed.data.q,
        handledBy: parsed.data.handled_by,
        unassigned: parsed.data.unassigned
      });
      const filteredByStatus = parsed.data.status
        ? allMatchingItems.filter((item) => item.request.status === parsed.data.status)
        : allMatchingItems;
      const filteredItems = parsed.data.sla_state
        ? filteredByStatus.filter((item) =>
            matchesMinorGuardianSupportRequestSlaState(item, parsed.data.sla_state, evaluatedAtMs)
          )
        : filteredByStatus;
      const sortedItems = sortMinorGuardianSupportRequestItems(filteredItems, orderBy, evaluatedAtMs);
      const timestamp = nowIso().replace(/[:.]/g, "-");
      const filename = `minor-guardian-support-requests-${timestamp}.csv`;

      appendAudit(store, "admin_report_exported", {
        userId: authRequest.auth.userId,
        sessionId: authRequest.auth.sessionId,
        metadata: {
          reportType: "minor_guardian_support_requests",
          status: parsed.data.status ?? "all",
          query: parsed.data.q ?? "",
          handledBy: parsed.data.handled_by ?? "",
          unassigned: parsed.data.unassigned ?? false,
          slaState: parsed.data.sla_state ?? "all",
          orderBy,
          exportedCount: sortedItems.length
        }
      });

      reply
        .code(200)
        .type("text/csv; charset=utf-8")
        .header("content-disposition", `attachment; filename="${filename}"`)
        .send(serializeInternalMinorGuardianSupportRequestsCsv(sortedItems, evaluatedAtMs));
    });

    app.patch(
      "/internal/minor-guardian/support-requests/bulk",
      internalOpsPreHandler,
      async (request, reply) => {
      const parsed = internalMinorGuardianSupportRequestBulkUpdateSchema.safeParse(request.body ?? {});
      if (!parsed.success) {
        reply.code(400).send({
          code: "VALIDATION_ERROR",
          message: "minor guardian support bulk update payload is invalid"
        });
        return;
      }

      try {
        const updated = accountService.bulkUpdateMinorGuardianSupportRequests({
          requestIds: parsed.data.request_ids,
          status: parsed.data.status,
          handledBy: parsed.data.handled_by,
          operatorNote: parsed.data.operator_note
        });
        try {
          await authAccountRepository.flush();
        } catch {
          reply.code(503).send({
            code: "AUTH_ACCOUNT_STORAGE_UNAVAILABLE",
            message: "Auth/account storage is unavailable"
          });
          return;
        }

        const evaluatedAtMs = Date.now();
        reply.code(200).send({
          updated_count: updated.updatedCount,
          request_ids: updated.items.map((item) => item.request.id),
          items: updated.items.map((item) => {
            const user = authService.getUserById(item.userId);
            return serializeInternalMinorGuardianSupportRequest(
              {
                userId: item.userId,
                email: user.email,
                phone: user.phone,
                displayName: user.displayName,
                userStatus: user.status,
                minorGuardianAgeBand: user.minorGuardian?.ageBand ?? "unknown",
                request: item.request
              },
              evaluatedAtMs
            );
          })
        });
      } catch (error) {
        if (error instanceof Error && error.message === "MINOR_GUARDIAN_SUPPORT_REQUEST_NOT_FOUND") {
          reply.code(404).send({
            code: "MINOR_GUARDIAN_SUPPORT_REQUEST_NOT_FOUND",
            message: "Minor guardian support request not found"
          });
          return;
        }
        if (error instanceof Error && error.message === "MINOR_GUARDIAN_SUPPORT_REQUEST_STATUS_TRANSITION_INVALID") {
          reply.code(409).send({
            code: "MINOR_GUARDIAN_SUPPORT_REQUEST_STATUS_TRANSITION_INVALID",
            message: "Minor guardian support request status transition is invalid"
          });
          return;
        }
        throw error;
      }
      }
    );

    app.patch<{ Params: { request_id: string } }>(
      "/internal/minor-guardian/support-requests/:request_id",
      internalOpsPreHandler,
      async (request, reply) => {
      const parsed = internalMinorGuardianSupportRequestUpdateSchema.safeParse(request.body ?? {});
      if (!parsed.success) {
        reply.code(400).send({
          code: "VALIDATION_ERROR",
          message: "minor guardian support request update payload is invalid"
        });
        return;
      }

      try {
        const updated = accountService.updateMinorGuardianSupportRequest({
          requestId: request.params.request_id,
          status: parsed.data.status,
          handledBy: parsed.data.handled_by,
          operatorNote: parsed.data.operator_note
        });
        try {
          await authAccountRepository.flush();
        } catch {
          reply.code(503).send({
            code: "AUTH_ACCOUNT_STORAGE_UNAVAILABLE",
            message: "Auth/account storage is unavailable"
          });
          return;
        }
        const user = authService.getUserById(updated.userId);
        reply.code(200).send({
          request: serializeInternalMinorGuardianSupportRequest({
            userId: updated.userId,
            email: user.email,
            phone: user.phone,
            displayName: user.displayName,
            userStatus: user.status,
            minorGuardianAgeBand: user.minorGuardian?.ageBand ?? "unknown",
            request: updated.request
          })
        });
      } catch (error) {
        if (error instanceof Error && error.message === "MINOR_GUARDIAN_SUPPORT_REQUEST_NOT_FOUND") {
          reply.code(404).send({
            code: "MINOR_GUARDIAN_SUPPORT_REQUEST_NOT_FOUND",
            message: "Minor guardian support request not found"
          });
          return;
        }
        if (error instanceof Error && error.message === "MINOR_GUARDIAN_SUPPORT_REQUEST_STATUS_TRANSITION_INVALID") {
          reply.code(409).send({
            code: "MINOR_GUARDIAN_SUPPORT_REQUEST_STATUS_TRANSITION_INVALID",
            message: "Minor guardian support request status transition is invalid"
          });
          return;
        }
        throw error;
      }
      }
    );

    app.post<{ Querystring: { limit?: string } }>(
      "/internal/reminders/dispatch-due",
      internalOpsPreHandler,
      async (request, reply) => {
      const rawLimit = request.query.limit?.trim();
      const limit = rawLimit ? Number(rawLimit) : undefined;
      if (rawLimit && (!Number.isInteger(limit) || (limit ?? 0) <= 0)) {
        reply.code(400).send({
          code: "VALIDATION_ERROR",
          message: "limit must be a positive integer"
        });
        return;
      }

      const result = await reminderDeliveryService.dispatchDueRecommendations({
        limit
      });
      reply.code(200).send({
        started_at: result.startedAt,
        completed_at: result.completedAt,
        limit: result.limit,
        due_count: result.dueCount,
        dispatched_reminder_count: result.dispatchedReminderCount,
        skipped_already_attempted_count: result.skippedAlreadyAttemptedCount,
        items: result.items.map((item) => ({
          reminder_id: item.reminderId,
          user_id: item.userId,
          scheduled_at: item.scheduledAt,
          status: item.status,
          skip_reason: item.skipReason,
          dispatch: item.result
            ? {
                dispatch_count: item.result.dispatchCount,
                duplicate_count: item.result.duplicateCount,
                skipped_count: item.result.skippedCount,
                failed_count: item.result.failedCount,
                removed_device_count: item.result.removedDeviceCount
              }
            : undefined
        }))
      });
      }
    );

    app.get("/internal/reminders/scheduler-status", internalOpsPreHandler, async () => ({
      reminder_dispatch_scheduler: serializeReminderDispatchSchedulerStatus(reminderDispatchSchedulerStatus)
    }));

    app.get("/internal/reminders/push-status", internalOpsPreHandler, async () => ({
      reminder_push_providers: serializeReminderPushRuntimeDiagnostics(reminderDeliveryService.getRuntimeDiagnostics())
    }));
  }

  app.register(async (child) => {
    await registerAuthRoutes(child, authService, authAccountRepository);
    await registerProgressRoutes(child, {
      authService,
      progressService,
      learnerStateRepository
    });
    await registerAccountRoutes(child, {
      authService,
      accountService,
      authAccountRepository,
      learnerStateRepository
    });
    await registerPracticeRoutes(child, {
      authService,
      practiceService,
      practiceStateRepository
    });
    await registerRealtimeSpeakingRoutes(child, {
      authService,
      speakingRealtimeService,
      speakingStateRepository,
      allowedBrowserOrigins
    });
    await registerWritingRoutes(child, {
      authService,
      writingService,
      writingStateRepository
    });
    await registerMockExamRoutes(child, {
      authService,
      mockExamService,
      learnerStateRepository,
      mockStateRepository
    });
    await registerAnalyticsRoutes(child, {
      authService,
      analyticsService
    });
    await registerReminderRoutes(child, {
      authService,
      reminderService,
      reminderDeliveryService
    });
    await registerOnboardingRoutes(child, {
      authService,
      onboardingService,
      learnerStateRepository
    });
  });

  app.addHook("onClose", async () => {
    await mockStateRepository.close();
    await writingStateRepository.close();
    await speakingStateRepository.close();
    await practiceStateRepository.close();
    await learnerStateRepository.close();
    await authAccountRepository.close();
    await analyticsRepository.close();
  });

  app.addHook("onReady", async () => {
    await mockStateRepository.ready();
    await writingStateRepository.ready();
    await speakingStateRepository.ready();
    await practiceStateRepository.ready();
    await learnerStateRepository.ready();
    await authAccountRepository.ready();
    await analyticsRepository.ready();
  });

  return {
    app,
    store,
    authService,
    onboardingService,
    progressService,
    accountService,
    practiceService,
    speakingRealtimeService,
    writingService,
    mockExamService,
    analyticsService,
    reminderService,
    reminderDeliveryService,
    analyticsRepository,
    authAccountRepository,
    learnerStateRepository,
    practiceStateRepository,
    speakingStateRepository,
    writingStateRepository,
    mockStateRepository
  };
};
