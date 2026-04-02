import { buildServer } from "./app.js";
import {
  resolveAllowedBrowserOriginsFromEnv,
  resolveAuthSecretFromEnv,
  resolveInternalDebugRoutesEnabledFromEnv,
  resolveReminderDispatchSchedulerRuntimeConfigFromEnv,
  resolveReminderPushRuntimeConfigFromEnv
} from "./domain/config.js";
const authAccountStorageBackend = process.env.AUTH_ACCOUNT_STORAGE_BACKEND === "postgres" ? "postgres" : "memory";
const authAccountStorageConnectionString = process.env.AUTH_ACCOUNT_STORAGE_CONNECTION_STRING;
const authAccountStorageSchema = process.env.AUTH_ACCOUNT_STORAGE_SCHEMA;
const learnerStateStorageBackend = process.env.LEARNER_STATE_STORAGE_BACKEND === "postgres" ? "postgres" : "memory";
const learnerStateStorageConnectionString =
  process.env.LEARNER_STATE_STORAGE_CONNECTION_STRING ?? process.env.AUTH_ACCOUNT_STORAGE_CONNECTION_STRING;
const learnerStateStorageSchema = process.env.LEARNER_STATE_STORAGE_SCHEMA;
const practiceStateStorageBackend = process.env.PRACTICE_STATE_STORAGE_BACKEND === "postgres" ? "postgres" : "memory";
const practiceStateStorageConnectionString =
  process.env.PRACTICE_STATE_STORAGE_CONNECTION_STRING ??
  process.env.LEARNER_STATE_STORAGE_CONNECTION_STRING ??
  process.env.AUTH_ACCOUNT_STORAGE_CONNECTION_STRING;
const practiceStateStorageSchema = process.env.PRACTICE_STATE_STORAGE_SCHEMA;
const speakingStateStorageBackend = process.env.SPEAKING_STATE_STORAGE_BACKEND === "postgres" ? "postgres" : "memory";
const speakingStateStorageConnectionString =
  process.env.SPEAKING_STATE_STORAGE_CONNECTION_STRING ??
  process.env.PRACTICE_STATE_STORAGE_CONNECTION_STRING ??
  process.env.LEARNER_STATE_STORAGE_CONNECTION_STRING ??
  process.env.AUTH_ACCOUNT_STORAGE_CONNECTION_STRING;
const speakingStateStorageSchema = process.env.SPEAKING_STATE_STORAGE_SCHEMA;
const writingStateStorageBackend = process.env.WRITING_STATE_STORAGE_BACKEND === "postgres" ? "postgres" : "memory";
const writingStateStorageConnectionString =
  process.env.WRITING_STATE_STORAGE_CONNECTION_STRING ??
  process.env.SPEAKING_STATE_STORAGE_CONNECTION_STRING ??
  process.env.PRACTICE_STATE_STORAGE_CONNECTION_STRING ??
  process.env.LEARNER_STATE_STORAGE_CONNECTION_STRING ??
  process.env.AUTH_ACCOUNT_STORAGE_CONNECTION_STRING;
const writingStateStorageSchema = process.env.WRITING_STATE_STORAGE_SCHEMA;
const mockStateStorageBackend = process.env.MOCK_STATE_STORAGE_BACKEND === "postgres" ? "postgres" : "memory";
const mockStateStorageConnectionString =
  process.env.MOCK_STATE_STORAGE_CONNECTION_STRING ??
  process.env.WRITING_STATE_STORAGE_CONNECTION_STRING ??
  process.env.SPEAKING_STATE_STORAGE_CONNECTION_STRING ??
  process.env.PRACTICE_STATE_STORAGE_CONNECTION_STRING ??
  process.env.LEARNER_STATE_STORAGE_CONNECTION_STRING ??
  process.env.AUTH_ACCOUNT_STORAGE_CONNECTION_STRING;
const mockStateStorageSchema = process.env.MOCK_STATE_STORAGE_SCHEMA;
const analyticsStorageBackend = process.env.ANALYTICS_STORAGE_BACKEND === "postgres" ? "postgres" : "memory";
const analyticsStorageConnectionString =
  process.env.ANALYTICS_STORAGE_CONNECTION_STRING ??
  process.env.MOCK_STATE_STORAGE_CONNECTION_STRING ??
  process.env.WRITING_STATE_STORAGE_CONNECTION_STRING ??
  process.env.SPEAKING_STATE_STORAGE_CONNECTION_STRING ??
  process.env.PRACTICE_STATE_STORAGE_CONNECTION_STRING ??
  process.env.LEARNER_STATE_STORAGE_CONNECTION_STRING ??
  process.env.AUTH_ACCOUNT_STORAGE_CONNECTION_STRING;
const analyticsStorageSchema = process.env.ANALYTICS_STORAGE_SCHEMA;
let authSecret = "";
let allowedBrowserOrigins: string[] = [];
let enableInternalDebugRoutes = false;
let reminderDispatchSchedulerRuntimeConfig = resolveReminderDispatchSchedulerRuntimeConfigFromEnv({});
let reminderPushRuntimeConfig = resolveReminderPushRuntimeConfigFromEnv({});
try {
  authSecret = resolveAuthSecretFromEnv(process.env);
  allowedBrowserOrigins = resolveAllowedBrowserOriginsFromEnv(process.env);
  enableInternalDebugRoutes = resolveInternalDebugRoutesEnabledFromEnv(process.env);
  reminderDispatchSchedulerRuntimeConfig = resolveReminderDispatchSchedulerRuntimeConfigFromEnv(process.env);
  reminderPushRuntimeConfig = resolveReminderPushRuntimeConfigFromEnv(process.env);
} catch (error) {
  const message = error instanceof Error ? error.message : "SERVER_CONFIG_INVALID";
  console.error(
    `[server-config] ${message}. Check AUTH_SECRET, BROWSER_ALLOWED_ORIGINS, INTERNAL_DEBUG_ROUTES_ENABLED, REMINDER_DISPATCH_SCHEDULER_*, and REMINDER_PUSH_* before starting apps/server.`
  );
  process.exit(1);
}

let app: ReturnType<typeof buildServer>["app"];
let reminderDeliveryService: ReturnType<typeof buildServer>["reminderDeliveryService"];
try {
  ({ app, reminderDeliveryService } = buildServer({
    authSecret,
    authAccountStorageBackend,
    authAccountStorageConnectionString,
    authAccountStorageSchema,
    learnerStateStorageBackend,
    learnerStateStorageConnectionString,
    learnerStateStorageSchema,
    practiceStateStorageBackend,
    practiceStateStorageConnectionString,
    practiceStateStorageSchema,
    speakingStateStorageBackend,
    speakingStateStorageConnectionString,
    speakingStateStorageSchema,
    writingStateStorageBackend,
    writingStateStorageConnectionString,
    writingStateStorageSchema,
    mockStateStorageBackend,
    mockStateStorageConnectionString,
    mockStateStorageSchema,
    analyticsStorageBackend,
    analyticsStorageConnectionString,
    analyticsStorageSchema,
    reminderDeliveryApnsEnabled: reminderPushRuntimeConfig.apns.enabled,
    reminderDeliveryApnsBundleId: reminderPushRuntimeConfig.apns.bundleId,
    reminderDeliveryApnsTeamId: reminderPushRuntimeConfig.apns.teamId,
    reminderDeliveryApnsKeyId: reminderPushRuntimeConfig.apns.keyId,
    reminderDeliveryApnsPrivateKey: reminderPushRuntimeConfig.apns.privateKey,
    reminderDeliveryFcmEnabled: reminderPushRuntimeConfig.fcm.enabled,
    reminderDeliveryFcmProjectId: reminderPushRuntimeConfig.fcm.projectId,
    reminderDeliveryFcmClientEmail: reminderPushRuntimeConfig.fcm.clientEmail,
    reminderDeliveryFcmPrivateKey: reminderPushRuntimeConfig.fcm.privateKey,
    reminderDeliveryFcmTokenUri: reminderPushRuntimeConfig.fcm.tokenUri,
    allowedBrowserOrigins,
    enableInternalDebugRoutes
  }));
} catch (error) {
  const message = error instanceof Error ? error.message : "SERVER_CONFIG_INVALID";
  console.error(
    `[server-config] ${message}. Check AUTH_SECRET, BROWSER_ALLOWED_ORIGINS, INTERNAL_DEBUG_ROUTES_ENABLED, REMINDER_DISPATCH_SCHEDULER_*, and REMINDER_PUSH_* before starting apps/server.`
  );
  process.exit(1);
}

const port = Number(process.env.PORT ?? 8787);
let reminderDispatchSchedulerTimer: ReturnType<typeof setInterval> | undefined;
let reminderDispatchSchedulerInFlight = false;

app.addHook("onClose", async () => {
  if (reminderDispatchSchedulerTimer) {
    clearInterval(reminderDispatchSchedulerTimer);
    reminderDispatchSchedulerTimer = undefined;
  }
});

const runReminderDispatchSchedulerSweep = async (): Promise<void> => {
  if (!reminderDispatchSchedulerRuntimeConfig.enabled || reminderDispatchSchedulerInFlight) {
    return;
  }

  reminderDispatchSchedulerInFlight = true;
  try {
    const result = await reminderDeliveryService.dispatchDueRecommendations({
      limit: reminderDispatchSchedulerRuntimeConfig.batchSize
    });
    if (result.dueCount > 0 || result.skippedAlreadyAttemptedCount > 0) {
      console.info(
        `[reminder-dispatch-scheduler] due=${result.dueCount} dispatched=${result.dispatchedReminderCount} skipped_already_attempted=${result.skippedAlreadyAttemptedCount}`
      );
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : "scheduler sweep failed";
    console.error(`[reminder-dispatch-scheduler] ${message}`);
  } finally {
    reminderDispatchSchedulerInFlight = false;
  }
};

const main = async (): Promise<void> => {
  try {
    await app.listen({
      host: "0.0.0.0",
      port
    });
    if (reminderDispatchSchedulerRuntimeConfig.enabled) {
      void runReminderDispatchSchedulerSweep();
      reminderDispatchSchedulerTimer = setInterval(() => {
        void runReminderDispatchSchedulerSweep();
      }, reminderDispatchSchedulerRuntimeConfig.intervalSeconds * 1000);
      console.info(
        `[reminder-dispatch-scheduler] enabled interval=${reminderDispatchSchedulerRuntimeConfig.intervalSeconds}s batch=${reminderDispatchSchedulerRuntimeConfig.batchSize}`
      );
    }
  } catch (error) {
    app.log.error(error);
    process.exit(1);
  }
};

void main();
