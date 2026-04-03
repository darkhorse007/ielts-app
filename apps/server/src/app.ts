import Fastify from "fastify";
import websocket from "@fastify/websocket";
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
    app.get("/internal/audit-events", async () => ({
      items: store.auditEvents
    }));

    app.get<{ Params: { user_id: string } }>("/internal/users/:user_id", async (request, reply) => {
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

    app.post<{ Querystring: { limit?: string } }>("/internal/reminders/dispatch-due", async (request, reply) => {
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
    });

    app.get("/internal/reminders/scheduler-status", async () => ({
      reminder_dispatch_scheduler: serializeReminderDispatchSchedulerStatus(reminderDispatchSchedulerStatus)
    }));

    app.get("/internal/reminders/push-status", async () => ({
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
