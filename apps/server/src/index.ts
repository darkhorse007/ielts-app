import { buildServer } from "./app.js";
import { resolveAuthSecretFromEnv } from "./domain/config.js";
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
let authSecret: string;
try {
  authSecret = resolveAuthSecretFromEnv(process.env);
} catch (error) {
  const message = error instanceof Error ? error.message : "SERVER_CONFIG_INVALID";
  console.error(
    `[server-config] ${message}. Set AUTH_SECRET or AUTH_SECRET_FILE before starting apps/server.`
  );
  process.exit(1);
}

const { app } = buildServer({
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
  analyticsStorageSchema
});
const port = Number(process.env.PORT ?? 8787);

const main = async (): Promise<void> => {
  try {
    await app.listen({
      host: "0.0.0.0",
      port
    });
  } catch (error) {
    app.log.error(error);
    process.exit(1);
  }
};

void main();
