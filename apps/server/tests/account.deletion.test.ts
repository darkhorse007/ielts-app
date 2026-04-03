import { afterEach, beforeEach, describe, expect, test } from "vitest";
import { buildServer } from "../src/app.js";

describe("S2 account deletion and data cleanup", () => {
  const nextEmail = () => `candidate-${crypto.randomUUID()}@example.com`;

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

  test("requests deletion then deletes account and revokes access", async () => {
    const email = nextEmail();
    const opsEmail = `ops-reviewer-${crypto.randomUUID()}@example.com`;

    const register = await context.app.inject({
      method: "POST",
      url: "/v1/auth/register",
      payload: {
        email,
        password: "StrongPass123"
      }
    });
    expect(register.statusCode).toBe(201);

    const login = await context.app.inject({
      method: "POST",
      url: "/v1/auth/login",
      payload: {
        identifier: email,
        password: "StrongPass123",
        device_id: "macbook"
      }
    });
    expect(login.statusCode).toBe(200);
    const loginBody = login.json();

    const opsRegister = await context.app.inject({
      method: "POST",
      url: "/v1/auth/register",
      payload: {
        email: opsEmail,
        password: "StrongPass123"
      }
    });
    expect(opsRegister.statusCode).toBe(201);

    const opsLogin = await context.app.inject({
      method: "POST",
      url: "/v1/auth/login",
      payload: {
        identifier: opsEmail,
        password: "StrongPass123",
        device_id: "ops-console"
      }
    });
    expect(opsLogin.statusCode).toBe(200);
    const opsAccessToken = opsLogin.json().access_token as string;

    const requestDeletion = await context.app.inject({
      method: "POST",
      url: "/v1/users/me/deletion-request",
      headers: {
        authorization: `Bearer ${loginBody.access_token}`
      }
    });

    expect(requestDeletion.statusCode).toBe(202);
    expect(requestDeletion.json().status).toBe("pending_deletion");

    const deleteAccount = await context.app.inject({
      method: "POST",
      url: "/v1/users/me/delete",
      headers: {
        authorization: `Bearer ${loginBody.access_token}`
      },
      payload: {
        confirm_text: "DELETE"
      }
    });

    expect(deleteAccount.statusCode).toBe(200);
    expect(deleteAccount.json().status).toBe("deleted");
    expect(deleteAccount.json().revoked_sessions).toBeGreaterThan(0);

    const useOldSession = await context.app.inject({
      method: "GET",
      url: "/v1/users/me/profile",
      headers: {
        authorization: `Bearer ${loginBody.access_token}`
      }
    });
    expect(useOldSession.statusCode).toBe(401);

    const relogin = await context.app.inject({
      method: "POST",
      url: "/v1/auth/login",
      payload: {
        identifier: email,
        password: "StrongPass123"
      }
    });

    expect(relogin.statusCode).toBe(401);
    expect(relogin.json().code).toBe("INVALID_CREDENTIALS");

    const userState = await context.app.inject({
      method: "GET",
      url: `/internal/users/${loginBody.user_id}`,
      headers: {
        authorization: `Bearer ${opsAccessToken}`
      }
    });

    expect(userState.statusCode).toBe(200);
    expect(userState.json().status).toBe("deleted");
  });
});
