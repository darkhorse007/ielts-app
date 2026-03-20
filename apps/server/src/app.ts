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
import { SubscriptionService } from "./domain/subscription-service.js";
import { AdminService } from "./domain/admin-service.js";
import { AdminOpsService } from "./domain/admin-ops-service.js";
import { AdminReviewService } from "./domain/admin-review-service.js";
import { AnalyticsService } from "./domain/analytics-service.js";
import {
  InMemoryAnalyticsRepository,
  PostgresAnalyticsRepository,
  type AnalyticsRepository
} from "./domain/analytics-repository.js";
import { ReminderService } from "./domain/reminder-service.js";
import { ChurnService } from "./domain/churn-service.js";
import { ProviderHealthService } from "./domain/provider-health-service.js";
import { ReleaseService } from "./domain/release-service.js";
import {
  InMemoryReleaseRepository,
  PostgresReleaseRepository,
  SqliteReleaseRepository,
  type ReleaseRepository
} from "./domain/release-repository.js";
import { registerAuthRoutes } from "./routes/auth.js";
import { registerOnboardingRoutes } from "./routes/onboarding.js";
import { registerProgressRoutes } from "./routes/progress.js";
import { registerAccountRoutes } from "./routes/account.js";
import { registerPracticeRoutes } from "./routes/practice.js";
import { registerRealtimeSpeakingRoutes } from "./routes/realtime-speaking.js";
import { registerWritingRoutes } from "./routes/writing.js";
import { registerMockExamRoutes } from "./routes/mock-exam.js";
import { registerAdminRoutes } from "./routes/admin.js";
import { registerAnalyticsRoutes } from "./routes/analytics.js";
import { registerReminderRoutes } from "./routes/reminder.js";
import { registerChurnRoutes } from "./routes/churn.js";
import { registerSystemRoutes } from "./routes/system.js";

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
  releaseStorageBackend?: "memory" | "sqlite" | "postgres";
  releaseStoragePath?: string;
  releaseStorageConnectionString?: string;
  releaseStorageSchema?: string;
  releaseRepository?: ReleaseRepository;
  systemRbacEnforced?: boolean;
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
  subscriptionService: SubscriptionService;
  adminService: AdminService;
  adminOpsService: AdminOpsService;
  adminReviewService: AdminReviewService;
  analyticsService: AnalyticsService;
  reminderService: ReminderService;
  churnService: ChurnService;
  providerHealthService: ProviderHealthService;
  releaseService: ReleaseService;
  analyticsRepository: AnalyticsRepository;
  authAccountRepository: AuthAccountRepository;
  learnerStateRepository: LearnerStateRepository;
  practiceStateRepository: PracticeStateRepository;
  speakingStateRepository: SpeakingStateRepository;
  writingStateRepository: WritingStateRepository;
  mockStateRepository: MockStateRepository;
  releaseRepository: ReleaseRepository;
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
  const subscriptionService = new SubscriptionService(store, config.paymentRuntime);
  const adminService = new AdminService(store);
  const adminOpsService = new AdminOpsService(store, authService);
  const adminReviewService = new AdminReviewService(store);
  const analyticsService = new AnalyticsService(store, analyticsRepository);
  const reminderService = new ReminderService(store);
  const churnService = new ChurnService(store, reminderService);
  const providerHealthService = new ProviderHealthService(store, config.aiRuntime);
  const releaseRepository =
    options?.releaseRepository ??
    (options?.releaseStorageBackend === "sqlite"
      ? new SqliteReleaseRepository({
          dbPath: options.releaseStoragePath
        })
      : options?.releaseStorageBackend === "postgres"
        ? new PostgresReleaseRepository({
            connectionString: options.releaseStorageConnectionString,
            schema: options.releaseStorageSchema
          })
        : new InMemoryReleaseRepository(store));
  const releaseService = new ReleaseService(store, releaseRepository);

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

  app.get("/internal/e2e/stability-ui", async (_request, reply) => {
    reply.type("text/html; charset=utf-8").send(`<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>Stability UI Smoke</title>
    <style>
      body { font-family: ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto, Helvetica, Arial, sans-serif; margin: 24px; }
      .row { margin-bottom: 12px; display: flex; gap: 8px; align-items: center; }
      label { min-width: 100px; font-size: 14px; color: #333; }
      input { padding: 6px 8px; min-width: 320px; }
      button { padding: 8px 12px; cursor: pointer; }
      pre { margin-top: 16px; padding: 12px; background: #f5f7fa; border: 1px solid #d9dee6; white-space: pre-wrap; }
    </style>
  </head>
  <body>
    <h1>Stability UI Smoke</h1>
    <div class="row">
      <label for="token">access_token</label>
      <input id="token" />
    </div>
    <div class="row">
      <label for="release-id">release_id</label>
      <input id="release-id" value="REL-UI-SMOKE-001" />
    </div>
    <div class="row">
      <label for="run-id">run_id</label>
      <input id="run-id" />
    </div>
    <div class="row">
      <button id="evaluate-gate" type="button">Evaluate Gate</button>
      <button id="start-soak" type="button">Start Soak</button>
      <button id="record-checkpoint" type="button">Record Checkpoint</button>
    </div>
    <pre id="output">idle</pre>
    <script>
      const output = document.getElementById("output");
      const tokenInput = document.getElementById("token");
      const releaseIdInput = document.getElementById("release-id");
      const runIdInput = document.getElementById("run-id");

      const request = async (path, payload) => {
        const response = await fetch(path, {
          method: "POST",
          headers: {
            "content-type": "application/json",
            authorization: "Bearer " + tokenInput.value.trim()
          },
          body: JSON.stringify(payload)
        });
        const body = await response.json().catch(() => ({}));
        if (!response.ok) {
          throw new Error((body && body.message) || "request failed");
        }
        return body;
      };

      document.getElementById("evaluate-gate").addEventListener("click", async () => {
        try {
          const releaseId = releaseIdInput.value.trim();
          const result = await request("/v1/system/release/gate/evaluate", {
            release_id: releaseId,
            p0_defects: 0,
            regression_pass_rate: 99.9,
            api_success_rate: 99.9,
            provider_healthy: true
          });
          output.textContent = "gate passed=" + String(result.passed);
        } catch (error) {
          output.textContent = "error: " + error.message;
        }
      });

      document.getElementById("start-soak").addEventListener("click", async () => {
        try {
          const releaseId = releaseIdInput.value.trim();
          const result = await request("/v1/system/stability/soak-tests/start", {
            release_id: releaseId,
            planned_duration_hours: 72
          });
          runIdInput.value = result.run_id;
          output.textContent = "soak started run_id=" + result.run_id;
        } catch (error) {
          output.textContent = "error: " + error.message;
        }
      });

      document.getElementById("record-checkpoint").addEventListener("click", async () => {
        try {
          const runId = runIdInput.value.trim();
          const result = await request("/v1/system/stability/soak-tests/" + runId + "/checkpoints", {
            at_hour: 24,
            crash_count: 1,
            active_sessions: 2000,
            api_success_rate: 99.8,
            latency_p95_ms: 1200
          });
          output.textContent = "checkpoint=" + result.checkpoint_id + "; run_status=" + result.run_status;
        } catch (error) {
          output.textContent = "error: " + error.message;
        }
      });
    </script>
  </body>
</html>`);
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
    await registerAdminRoutes(child, {
      adminService,
      adminOpsService,
      adminReviewService,
      subscriptionService,
      authAccountRepository
    });
    await registerAnalyticsRoutes(child, {
      authService,
      analyticsService
    });
    await registerReminderRoutes(child, {
      authService,
      reminderService
    });
    await registerChurnRoutes(child, {
      authService,
      churnService
    });
    await registerSystemRoutes(child, {
      authService,
      providerHealthService,
      releaseService,
      authAccountRepository,
      systemRbacEnforced: options?.systemRbacEnforced ?? true
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
    await releaseRepository.close();
  });

  app.addHook("onReady", async () => {
    await mockStateRepository.ready();
    await writingStateRepository.ready();
    await speakingStateRepository.ready();
    await practiceStateRepository.ready();
    await learnerStateRepository.ready();
    await authAccountRepository.ready();
    await analyticsRepository.ready();
    await releaseRepository.ready();
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
    subscriptionService,
    adminService,
    adminOpsService,
    adminReviewService,
    analyticsService,
    reminderService,
    churnService,
    providerHealthService,
    releaseService,
    analyticsRepository,
    authAccountRepository,
    learnerStateRepository,
    practiceStateRepository,
    speakingStateRepository,
    writingStateRepository,
    mockStateRepository,
    releaseRepository
  };
};
