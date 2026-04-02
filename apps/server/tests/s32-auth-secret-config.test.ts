import { describe, expect, test } from "vitest";
import {
  DEFAULT_REMINDER_PUSH_FCM_TOKEN_URI,
  DEVELOPMENT_AUTH_SECRET,
  MIN_AUTH_SECRET_LENGTH,
  defaultConfig,
  resolveAllowedBrowserOriginsFromEnv,
  resolveAuthSecretFromEnv,
  resolveBooleanFlagFromEnv,
  resolveInternalDebugRoutesEnabledFromEnv,
  resolveReminderPushRuntimeConfigFromEnv
} from "../src/domain/config.js";

describe("S32 auth secret runtime config", () => {
  test("keeps an explicit development secret for in-process test builds", () => {
    expect(defaultConfig.authSecret).toBe(DEVELOPMENT_AUTH_SECRET);
    expect(defaultConfig.authSecret.length).toBeGreaterThanOrEqual(MIN_AUTH_SECRET_LENGTH);
  });

  test("prefers AUTH_SECRET when provided", () => {
    const resolved = resolveAuthSecretFromEnv({
      AUTH_SECRET: "x".repeat(MIN_AUTH_SECRET_LENGTH)
    });
    expect(resolved).toBe("x".repeat(MIN_AUTH_SECRET_LENGTH));
  });

  test("loads AUTH_SECRET_FILE when inline secret is absent", () => {
    const resolved = resolveAuthSecretFromEnv(
      {
        AUTH_SECRET_FILE: "/tmp/runtime-auth-secret"
      },
      (filePath) => {
        expect(filePath).toBe("/tmp/runtime-auth-secret");
        return "y".repeat(MIN_AUTH_SECRET_LENGTH + 4);
      }
    );
    expect(resolved).toBe("y".repeat(MIN_AUTH_SECRET_LENGTH + 4));
  });

  test("fails when no runtime auth secret is provided", () => {
    expect(() => resolveAuthSecretFromEnv({})).toThrow("AUTH_SECRET_REQUIRED");
  });

  test("rejects too-short secrets from either source", () => {
    expect(() =>
      resolveAuthSecretFromEnv({
        AUTH_SECRET: "short-secret"
      })
    ).toThrow("AUTH_SECRET_TOO_SHORT");

    expect(() =>
      resolveAuthSecretFromEnv(
        {
          AUTH_SECRET_FILE: "/tmp/runtime-auth-secret"
        },
        () => "tiny-secret"
      )
    ).toThrow("AUTH_SECRET_FILE_TOO_SHORT");
  });

  test("parses browser origin allowlist into normalized origins", () => {
    const origins = resolveAllowedBrowserOriginsFromEnv({
      BROWSER_ALLOWED_ORIGINS: "https://app.example.com, http://127.0.0.1:5173/, https://app.example.com"
    });

    expect(origins).toEqual(["https://app.example.com", "http://127.0.0.1:5173"]);
  });

  test("rejects invalid browser origins", () => {
    expect(() =>
      resolveAllowedBrowserOriginsFromEnv({
        BROWSER_ALLOWED_ORIGINS: "ws://app.example.com"
      })
    ).toThrow("BROWSER_ALLOWED_ORIGINS_INVALID");
  });

  test("keeps internal debug routes disabled unless explicitly enabled", () => {
    expect(resolveInternalDebugRoutesEnabledFromEnv({})).toBe(false);
    expect(
      resolveInternalDebugRoutesEnabledFromEnv({
        INTERNAL_DEBUG_ROUTES_ENABLED: "true"
      })
    ).toBe(true);
    expect(() =>
      resolveInternalDebugRoutesEnabledFromEnv({
        INTERNAL_DEBUG_ROUTES_ENABLED: "sometimes"
      })
    ).toThrow("INTERNAL_DEBUG_ROUTES_ENABLED_INVALID");
  });

  test("parses generic boolean runtime flags", () => {
    expect(resolveBooleanFlagFromEnv("REMINDER_PUSH_APNS_ENABLED", {})).toBe(false);
    expect(
      resolveBooleanFlagFromEnv("REMINDER_PUSH_APNS_ENABLED", {
        REMINDER_PUSH_APNS_ENABLED: "yes"
      })
    ).toBe(true);
    expect(() =>
      resolveBooleanFlagFromEnv("REMINDER_PUSH_FCM_ENABLED", {
        REMINDER_PUSH_FCM_ENABLED: "maybe"
      })
    ).toThrow("REMINDER_PUSH_FCM_ENABLED_INVALID");
  });

  test("resolves reminder push runtime config from inline env values", () => {
    const config = resolveReminderPushRuntimeConfigFromEnv({
      REMINDER_PUSH_APNS_ENABLED: "true",
      REMINDER_PUSH_APNS_BUNDLE_ID: "com.selfhosted.ielts",
      REMINDER_PUSH_APNS_TEAM_ID: "team-123",
      REMINDER_PUSH_APNS_KEY_ID: "key-123",
      REMINDER_PUSH_APNS_PRIVATE_KEY: "-----BEGIN PRIVATE KEY-----\\nabc\\n-----END PRIVATE KEY-----",
      REMINDER_PUSH_FCM_ENABLED: "true",
      REMINDER_PUSH_FCM_PROJECT_ID: "project-123",
      REMINDER_PUSH_FCM_CLIENT_EMAIL: "push@example.iam.gserviceaccount.com",
      REMINDER_PUSH_FCM_PRIVATE_KEY: "-----BEGIN PRIVATE KEY-----\\nxyz\\n-----END PRIVATE KEY-----"
    });

    expect(config).toEqual({
      apns: {
        enabled: true,
        bundleId: "com.selfhosted.ielts",
        teamId: "team-123",
        keyId: "key-123",
        privateKey: "-----BEGIN PRIVATE KEY-----\nabc\n-----END PRIVATE KEY-----"
      },
      fcm: {
        enabled: true,
        projectId: "project-123",
        clientEmail: "push@example.iam.gserviceaccount.com",
        privateKey: "-----BEGIN PRIVATE KEY-----\nxyz\n-----END PRIVATE KEY-----",
        tokenUri: DEFAULT_REMINDER_PUSH_FCM_TOKEN_URI
      }
    });
  });

  test("supports reminder push secret files and fcm service account json", () => {
    const reads = new Map<string, string>([
      ["/tmp/apns-key.p8", "-----BEGIN PRIVATE KEY-----\nabc\n-----END PRIVATE KEY-----\n"],
      [
        "/tmp/fcm-service-account.json",
        JSON.stringify({
          project_id: "project-from-json",
          client_email: "json@example.iam.gserviceaccount.com",
          private_key: "-----BEGIN PRIVATE KEY-----\\njson\\n-----END PRIVATE KEY-----",
          token_uri: "https://oauth2.googleapis.com/token"
        })
      ]
    ]);

    const config = resolveReminderPushRuntimeConfigFromEnv(
      {
        REMINDER_PUSH_APNS_ENABLED: "1",
        REMINDER_PUSH_APNS_PRIVATE_KEY_FILE: "/tmp/apns-key.p8",
        REMINDER_PUSH_FCM_ENABLED: "1",
        REMINDER_PUSH_FCM_SERVICE_ACCOUNT_JSON_FILE: "/tmp/fcm-service-account.json"
      },
      (filePath) => {
        const value = reads.get(filePath);
        if (!value) {
          throw new Error("missing fixture");
        }
        return value;
      }
    );

    expect(config.apns.privateKey).toBe("-----BEGIN PRIVATE KEY-----\nabc\n-----END PRIVATE KEY-----");
    expect(config.fcm.projectId).toBe("project-from-json");
    expect(config.fcm.clientEmail).toBe("json@example.iam.gserviceaccount.com");
    expect(config.fcm.privateKey).toBe("-----BEGIN PRIVATE KEY-----\njson\n-----END PRIVATE KEY-----");
    expect(config.fcm.tokenUri).toBe("https://oauth2.googleapis.com/token");
  });

  test("rejects invalid reminder push config payloads", () => {
    expect(() =>
      resolveReminderPushRuntimeConfigFromEnv({
        REMINDER_PUSH_FCM_SERVICE_ACCOUNT_JSON: "{"
      })
    ).toThrow("REMINDER_PUSH_FCM_SERVICE_ACCOUNT_JSON_INVALID_JSON");

    expect(() =>
      resolveReminderPushRuntimeConfigFromEnv({
        REMINDER_PUSH_FCM_TOKEN_URI: "not-a-url"
      })
    ).toThrow("REMINDER_PUSH_FCM_TOKEN_URI_INVALID");
  });
});
