import { afterEach, beforeEach, describe, expect, test } from "vitest";
import { buildServer } from "../src/app.js";

describe("S2 progress sync across devices", () => {
  const nextEmail = () => `candidate-${crypto.randomUUID()}@example.com`;

  const build = async () => {
    const server = buildServer();
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

  test("syncs latest progress and records stale conflicts", async () => {
    const firstSession = await registerAndLogin(undefined, "macos-laptop");

    const firstSync = await context.app.inject({
      method: "POST",
      url: "/v1/users/me/progress/sync",
      headers: {
        authorization: `Bearer ${firstSession.access_token}`
      },
      payload: {
        device_id: "macos-laptop",
        client_updated_at: new Date().toISOString(),
        progress: {
          listening_completed: 5,
          speaking_completed: 3,
          reading_completed: 4,
          writing_completed: 2,
          total_study_minutes: 150,
          streak_days: 4
        }
      }
    });

    expect(firstSync.statusCode).toBe(200);
    expect(firstSync.json().stale_request).toBe(false);

    const secondSessionLogin = await context.app.inject({
      method: "POST",
      url: "/v1/auth/login",
      payload: {
        identifier: firstSession.email,
        password: "StrongPass123",
        device_id: "windows-desktop"
      }
    });
    expect(secondSessionLogin.statusCode).toBe(200);
    const secondSession = secondSessionLogin.json();

    const progressOnSecondDevice = await context.app.inject({
      method: "GET",
      url: "/v1/users/me/progress",
      headers: {
        authorization: `Bearer ${secondSession.access_token}`
      }
    });

    expect(progressOnSecondDevice.statusCode).toBe(200);
    expect(progressOnSecondDevice.json().total_study_minutes).toBe(150);
    expect(progressOnSecondDevice.json().listening_completed).toBe(5);

    const staleSync = await context.app.inject({
      method: "POST",
      url: "/v1/users/me/progress/sync",
      headers: {
        authorization: `Bearer ${secondSession.access_token}`
      },
      payload: {
        device_id: "windows-desktop",
        client_updated_at: "2024-01-01T00:00:00.000Z",
        progress: {
          listening_completed: 1,
          speaking_completed: 1,
          reading_completed: 1,
          writing_completed: 1,
          total_study_minutes: 10,
          streak_days: 1
        }
      }
    });

    expect(staleSync.statusCode).toBe(200);
    expect(staleSync.json().stale_request).toBe(true);
    expect(staleSync.json().conflict_count).toBeGreaterThan(0);
    expect(staleSync.json().total_study_minutes).toBe(150);

    const conflicts = await context.app.inject({
      method: "GET",
      url: "/v1/users/me/progress/conflicts",
      headers: {
        authorization: `Bearer ${secondSession.access_token}`
      }
    });

    expect(conflicts.statusCode).toBe(200);
    expect(conflicts.json().items.length).toBeGreaterThan(0);
  });
});
