import { afterEach, beforeEach, describe, expect, test } from "vitest";
import { buildServer } from "../src/app.js";

describe("account minor guardian routes", () => {
  const nextEmail = () => `minor-guardian-${crypto.randomUUID()}@example.com`;

  const build = async () => {
    const server = buildServer({
      enableInternalDebugRoutes: true
    });
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

  test("persists minor guardian profile state and acknowledgment through authenticated account routes", async () => {
    const email = nextEmail();

    const register = await context.app.inject({
      method: "POST",
      url: "/v1/auth/register",
      payload: {
        email,
        password: "StrongPass123"
      }
    });
    expect(register.statusCode).toBe(201);
    const userId = register.json().user_id as string;

    const login = await context.app.inject({
      method: "POST",
      url: "/v1/auth/login",
      payload: {
        identifier: email,
        password: "StrongPass123",
        device_id: "iphone"
      }
    });
    expect(login.statusCode).toBe(200);
    const accessToken = login.json().access_token as string;

    const initialProfile = await context.app.inject({
      method: "GET",
      url: "/v1/users/me/profile",
      headers: {
        authorization: `Bearer ${accessToken}`
      }
    });
    expect(initialProfile.statusCode).toBe(200);
    expect(initialProfile.json().minor_guardian).toMatchObject({
      age_band: "unknown"
    });

    const updated = await context.app.inject({
      method: "PUT",
      url: "/v1/users/me/minor-guardian",
      headers: {
        authorization: `Bearer ${accessToken}`
      },
      payload: {
        age_band: "under_18",
        source: "account"
      }
    });
    expect(updated.statusCode).toBe(200);
    expect(updated.json().minor_guardian).toMatchObject({
      age_band: "under_18",
      source: "account"
    });

    const acknowledged = await context.app.inject({
      method: "POST",
      url: "/v1/users/me/minor-guardian/acknowledge",
      headers: {
        authorization: `Bearer ${accessToken}`
      }
    });
    expect(acknowledged.statusCode).toBe(200);
    expect(acknowledged.json().minor_guardian).toMatchObject({
      age_band: "under_18",
      guardian_notice_accepted_user_id: userId
    });
    expect(typeof acknowledged.json().minor_guardian.guardian_notice_accepted_at).toBe("string");

    const profile = await context.app.inject({
      method: "GET",
      url: "/v1/users/me/profile",
      headers: {
        authorization: `Bearer ${accessToken}`
      }
    });
    expect(profile.statusCode).toBe(200);
    expect(profile.json().minor_guardian).toMatchObject({
      age_band: "under_18",
      source: "account",
      guardian_notice_accepted_user_id: userId
    });
  });
});
