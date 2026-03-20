import Fastify from "fastify";
import websocket from "@fastify/websocket";
import { defaultConfig, type ServiceConfig } from "./domain/config.js";
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

  const app = Fastify({
    logger: false
  });
  app.register(websocket);

  app.get("/health", async () => ({
    status: "ok"
  }));

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
      speakingStateRepository
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
      reminderService
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
    analyticsRepository,
    authAccountRepository,
    learnerStateRepository,
    practiceStateRepository,
    speakingStateRepository,
    writingStateRepository,
    mockStateRepository
  };
};
