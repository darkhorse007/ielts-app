import { afterEach, beforeEach, describe, expect, test } from "vitest";
import { buildServer } from "../src/app.js";

describe("S1 session continuity and security", () => {
  const nextEmail = () => `candidate-${crypto.randomUUID()}@example.com`;

  const build = async (overrides?: Parameters<typeof buildServer>[0]) => {
    const server = buildServer(overrides);
    await server.app.ready();
    return server;
  };

  let context: Awaited<ReturnType<typeof build>>;

  beforeEach(async () => {
    context = await build();
  });

  afterEach(async () => {
    await context.app.close();
  });

  const registerAndLogin = async (email?: string, deviceId = "device-a") => {
    const userEmail = email ?? nextEmail();

    const register = await context.app.inject({
      method: "POST",
      url: "/v1/auth/register",
      payload: {
        email: userEmail,
        password: "StrongPass123"
      }
    });
    expect(register.statusCode).toBe(201);

    const login = await context.app.inject({
      method: "POST",
      url: "/v1/auth/login",
      payload: {
        identifier: userEmail,
        password: "StrongPass123",
        device_id: deviceId
      }
    });
    expect(login.statusCode).toBe(200);

    return {
      email: userEmail,
      ...login.json()
    };
  };

  test("refresh rotates token and blacklists old token", async () => {
    const login = await registerAndLogin();

    const refreshed = await context.app.inject({
      method: "POST",
      url: "/v1/auth/refresh",
      payload: {
        refresh_token: login.refresh_token,
        device_id: "device-a"
      }
    });

    expect(refreshed.statusCode).toBe(200);
    const refreshedBody = refreshed.json();
    expect(refreshedBody.refresh_token).not.toBe(login.refresh_token);

    const oldRefreshReuse = await context.app.inject({
      method: "POST",
      url: "/v1/auth/refresh",
      payload: {
        refresh_token: login.refresh_token,
        device_id: "device-a"
      }
    });

    expect(oldRefreshReuse.statusCode).toBe(401);
    expect(oldRefreshReuse.json().code).toBe("INVALID_REFRESH_TOKEN");
  });

  test("logout invalidates refresh token", async () => {
    const login = await registerAndLogin();

    const logout = await context.app.inject({
      method: "POST",
      url: "/v1/auth/logout",
      headers: {
        authorization: `Bearer ${login.access_token}`
      },
      payload: {
        refresh_token: login.refresh_token
      }
    });

    expect(logout.statusCode).toBe(200);

    const refreshAfterLogout = await context.app.inject({
      method: "POST",
      url: "/v1/auth/refresh",
      payload: {
        refresh_token: login.refresh_token
      }
    });

    expect(refreshAfterLogout.statusCode).toBe(401);
    expect(refreshAfterLogout.json().code).toBe("INVALID_REFRESH_TOKEN");
  });

  test("expired refresh token is rejected", async () => {
    await context.app.close();
    context = await build({
      refreshTokenTtlSeconds: 1
    });

    const login = await registerAndLogin();

    await new Promise((resolve) => {
      setTimeout(resolve, 1100);
    });

    const refresh = await context.app.inject({
      method: "POST",
      url: "/v1/auth/refresh",
      payload: {
        refresh_token: login.refresh_token
      }
    });

    expect(refresh.statusCode).toBe(401);
    expect(refresh.json().code).toBe("INVALID_REFRESH_TOKEN");
  });

  test("records anomalous login for same account across multiple devices", async () => {
    const email = nextEmail();
    await registerAndLogin(email, "iphone-15");
    const second = await context.app.inject({
      method: "POST",
      url: "/v1/auth/login",
      payload: {
        identifier: email,
        password: "StrongPass123",
        device_id: "windows-pc"
      }
    });

    expect(second.statusCode).toBe(200);

    const audit = await context.app.inject({
      method: "GET",
      url: "/internal/audit-events"
    });

    const events = audit.json().items as Array<{ type: string }>;
    const anomalyCount = events.filter((event) => event.type === "anomalous_login").length;

    expect(anomalyCount).toBeGreaterThan(0);
  });
});
