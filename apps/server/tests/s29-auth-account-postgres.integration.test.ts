import { describe, expect, test } from "vitest";
import { randomUUID } from "node:crypto";
import { Client } from "pg";
import { buildServer } from "../src/app.js";

const postgresUrl = process.env.RELEASE_TEST_POSTGRES_URL;
const runIfPostgres = postgresUrl ? test : test.skip;

const createServer = (schema: string) =>
  buildServer({
    authAccountStorageBackend: "postgres",
    authAccountStorageConnectionString: postgresUrl,
    authAccountStorageSchema: schema,
    enableInternalDebugRoutes: true
  });

const registerAndLogin = async (
  server: ReturnType<typeof buildServer>,
  prefix: string,
  password = "StrongPass123"
): Promise<{ email: string; accessToken: string; refreshToken: string; userId: string }> => {
  const email = `${prefix}-${randomUUID()}@example.com`;
  const register = await server.app.inject({
    method: "POST",
    url: "/v1/auth/register",
    payload: {
      email,
      password
    }
  });
  expect(register.statusCode).toBe(201);

  const login = await server.app.inject({
    method: "POST",
    url: "/v1/auth/login",
    payload: {
      identifier: email,
      password,
      device_id: "qa-web"
    }
  });
  expect(login.statusCode).toBe(200);

  return {
    email,
    accessToken: login.json().access_token as string,
    refreshToken: login.json().refresh_token as string,
    userId: register.json().user_id as string
  };
};

const dropSchema = async (schema: string): Promise<void> => {
  const client = new Client({
    connectionString: postgresUrl
  });
  await client.connect();
  try {
    await client.query(`DROP SCHEMA IF EXISTS "${schema}" CASCADE`);
  } finally {
    await client.end();
  }
};

describe("S29 auth/account postgres persistence", () => {
  test("rejects auth/account postgres backend without connection string", () => {
    expect(() =>
      buildServer({
        authAccountStorageBackend: "postgres",
        authAccountStorageConnectionString: ""
      })
    ).toThrowError("AUTH_ACCOUNT_POSTGRES_CONNECTION_STRING_REQUIRED");
  });

  test("rejects auth/account postgres backend with invalid schema", () => {
    expect(() =>
      buildServer({
        authAccountStorageBackend: "postgres",
        authAccountStorageConnectionString: "postgres://u:p@localhost:5432/ielts",
        authAccountStorageSchema: "invalid-schema"
      })
    ).toThrowError("AUTH_ACCOUNT_POSTGRES_SCHEMA_INVALID");
  });

  runIfPostgres("persists register/login/refresh/profile state across server restarts", async () => {
    const schema = `auth_${randomUUID().replace(/-/g, "").slice(0, 12)}`;
    const password = "StrongPass123";
    let server = createServer(schema);
    let email = "";
    let refreshToken = "";

    try {
      await server.app.ready();
      const session = await registerAndLogin(server, "candidate", password);
      email = session.email;
      refreshToken = session.refreshToken;

      const profile = await server.app.inject({
        method: "GET",
        url: "/v1/users/me/profile",
        headers: {
          authorization: `Bearer ${session.accessToken}`
        }
      });
      expect(profile.statusCode).toBe(200);
      expect(profile.json().email).toBe(email);

      const minorGuardian = await server.app.inject({
        method: "PUT",
        url: "/v1/users/me/minor-guardian",
        headers: {
          authorization: `Bearer ${session.accessToken}`
        },
        payload: {
          age_band: "under_18",
          source: "account"
        }
      });
      expect(minorGuardian.statusCode).toBe(200);

      const supportRequest = await server.app.inject({
        method: "POST",
        url: "/v1/users/me/minor-guardian/support-requests",
        headers: {
          authorization: `Bearer ${session.accessToken}`
        },
        payload: {
          topic: "account_review",
          contact_channel: "email",
          contact_value: "guardian@example.com",
          message: "需要了解监护人如何处理账号与导出。"
        }
      });
      expect(supportRequest.statusCode).toBe(201);
    } finally {
      await server.app.close();
    }

    server = createServer(schema);
    try {
      await server.app.ready();

      const relogin = await server.app.inject({
        method: "POST",
        url: "/v1/auth/login",
        payload: {
          identifier: email,
          password,
          device_id: "qa-web-restart"
        }
      });
      expect(relogin.statusCode).toBe(200);

      const refreshed = await server.app.inject({
        method: "POST",
        url: "/v1/auth/refresh",
        payload: {
          refresh_token: refreshToken,
          device_id: "qa-web-restart"
        }
      });
      expect(refreshed.statusCode).toBe(200);

      const profile = await server.app.inject({
        method: "GET",
        url: "/v1/users/me/profile",
        headers: {
          authorization: `Bearer ${refreshed.json().access_token as string}`
        }
      });
      expect(profile.statusCode).toBe(200);
      expect(profile.json().email).toBe(email);
      expect(profile.json().status).toBe("active");
      expect(profile.json().minor_guardian).toMatchObject({
        age_band: "under_18",
        source: "account"
      });

      const supportRequestList = await server.app.inject({
        method: "GET",
        url: "/v1/users/me/minor-guardian/support-requests",
        headers: {
          authorization: `Bearer ${refreshed.json().access_token as string}`
        }
      });
      expect(supportRequestList.statusCode).toBe(200);
      expect(supportRequestList.json().total_count).toBe(1);
      expect(supportRequestList.json().items[0]).toMatchObject({
        topic: "account_review",
        contact_channel: "email"
      });
    } finally {
      await server.app.close();
      await dropSchema(schema);
    }
  });

  runIfPostgres("persists pending-deletion state across server restarts", async () => {
    const schema = `auth_${randomUUID().replace(/-/g, "").slice(0, 12)}`;
    const password = "StrongPass123";
    let server = createServer(schema);
    let learnerEmail = "";
    let learnerUserId = "";

    try {
      await server.app.ready();

      const learner = await registerAndLogin(server, "candidate-role-target", password);
      learnerEmail = learner.email;
      learnerUserId = learner.userId;

      const deletionRequest = await server.app.inject({
        method: "POST",
        url: "/v1/users/me/deletion-request",
        headers: {
          authorization: `Bearer ${learner.accessToken}`
        }
      });
      expect(deletionRequest.statusCode).toBe(202);
      expect(deletionRequest.json().status).toBe("pending_deletion");
    } finally {
      await server.app.close();
    }

    server = createServer(schema);
    try {
      await server.app.ready();

      const learnerRelogin = await server.app.inject({
        method: "POST",
        url: "/v1/auth/login",
        payload: {
          identifier: learnerEmail,
          password,
          device_id: "qa-learner-restart"
        }
      });
      expect(learnerRelogin.statusCode).toBe(403);
      expect(learnerRelogin.json().code).toBe("USER_DISABLED");

      const internalUser = await server.app.inject({
        method: "GET",
        url: `/internal/users/${learnerUserId}`
      });
      expect(internalUser.statusCode).toBe(200);
      expect(internalUser.json().status).toBe("pending_deletion");
    } finally {
      await server.app.close();
      await dropSchema(schema);
    }
  });
});
