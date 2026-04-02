import { describe, expect, test } from "vitest";
import {
  DEVELOPMENT_AUTH_SECRET,
  MIN_AUTH_SECRET_LENGTH,
  defaultConfig,
  resolveAllowedBrowserOriginsFromEnv,
  resolveAuthSecretFromEnv,
  resolveBooleanFlagFromEnv,
  resolveInternalDebugRoutesEnabledFromEnv
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
});
