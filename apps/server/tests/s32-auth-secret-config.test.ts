import { describe, expect, test } from "vitest";
import {
  DEVELOPMENT_AUTH_SECRET,
  MIN_AUTH_SECRET_LENGTH,
  defaultConfig,
  resolveAuthSecretFromEnv
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
});
