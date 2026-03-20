import { describe, expect, test } from "vitest";
import { randomUUID } from "node:crypto";
import { Client } from "pg";
import { buildServer } from "../src/app.js";

const postgresUrl = process.env.RELEASE_TEST_POSTGRES_URL;
const runIfPostgres = postgresUrl ? test : test.skip;

const buildPostgresServer = (schema: string) =>
  buildServer({
    authAccountStorageBackend: "postgres",
    authAccountStorageConnectionString: postgresUrl,
    authAccountStorageSchema: schema,
    practiceStateStorageBackend: "postgres",
    practiceStateStorageConnectionString: postgresUrl,
    practiceStateStorageSchema: schema
  });

const registerAndLogin = async (
  server: ReturnType<typeof buildServer>,
  prefix: string,
  password = "StrongPass123"
): Promise<{ userId: string; email: string; accessToken: string }> => {
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
  const userId = register.json().user_id as string;

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
    userId,
    email,
    accessToken: login.json().access_token as string
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

describe("S30 practice-state postgres persistence", () => {
  test("rejects practice-state postgres backend without connection string", () => {
    expect(() =>
      buildServer({
        practiceStateStorageBackend: "postgres",
        practiceStateStorageConnectionString: ""
      })
    ).toThrowError("PRACTICE_STATE_POSTGRES_CONNECTION_STRING_REQUIRED");
  });

  test("rejects practice-state postgres backend with invalid schema", () => {
    expect(() =>
      buildServer({
        practiceStateStorageBackend: "postgres",
        practiceStateStorageConnectionString: "postgres://u:p@localhost:5432/ielts",
        practiceStateStorageSchema: "invalid-schema"
      })
    ).toThrowError("PRACTICE_STATE_POSTGRES_SCHEMA_INVALID");
  });

  runIfPostgres("persists practice session and retry queue across server restarts", async () => {
    const schema = `practice_${randomUUID().replace(/-/g, "").slice(0, 12)}`;
    const password = "StrongPass123";
    let server = buildPostgresServer(schema);
    let email = "";
    let sessionId = "";
    let queueItemId = "";

    try {
      await server.app.ready();
      const session = await registerAndLogin(server, "candidate", password);
      email = session.email;

      const create = await server.app.inject({
        method: "POST",
        url: "/v1/practice/sessions",
        headers: {
          authorization: `Bearer ${session.accessToken}`
        },
        payload: {
          skill: "reading",
          training_mode: "exam",
          time_limit_seconds: 1800
        }
      });
      expect(create.statusCode).toBe(201);
      sessionId = create.json().session_id as string;

      const mode = await server.app.inject({
        method: "PATCH",
        url: `/v1/practice/sessions/${sessionId}/mode`,
        headers: {
          authorization: `Bearer ${session.accessToken}`
        },
        payload: {
          training_mode: "exam",
          time_limit_seconds: 1500
        }
      });
      expect(mode.statusCode).toBe(200);

      const submit = await server.app.inject({
        method: "POST",
        url: `/v1/practice/sessions/${sessionId}/submit`,
        headers: {
          authorization: `Bearer ${session.accessToken}`
        },
        payload: {
          answers: create.json().questions.map((question: { question_id: string }) => ({
            question_id: question.question_id,
            answer: "wrong answer"
          }))
        }
      });
      expect(submit.statusCode).toBe(200);

      const queue = await server.app.inject({
        method: "POST",
        url: `/v1/practice/sessions/${sessionId}/retry-queue`,
        headers: {
          authorization: `Bearer ${session.accessToken}`
        },
        payload: {}
      });
      expect(queue.statusCode).toBe(200);
      queueItemId = queue.json().items[0].queue_item_id as string;
    } finally {
      await server.app.close();
    }

    server = buildPostgresServer(schema);
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
      const accessToken = relogin.json().access_token as string;

      const session = await server.app.inject({
        method: "GET",
        url: `/v1/practice/sessions/${sessionId}`,
        headers: {
          authorization: `Bearer ${accessToken}`
        }
      });
      expect(session.statusCode).toBe(200);
      expect(session.json().status).toBe("submitted");
      expect(session.json().training_mode).toBe("exam");

      const timer = await server.app.inject({
        method: "GET",
        url: `/v1/practice/sessions/${sessionId}/timer`,
        headers: {
          authorization: `Bearer ${accessToken}`
        }
      });
      expect(timer.statusCode).toBe(200);
      expect(timer.json().timer.limit_seconds).toBe(1500);

      const queue = await server.app.inject({
        method: "GET",
        url: "/v1/practice/retry-queue",
        headers: {
          authorization: `Bearer ${accessToken}`
        }
      });
      expect(queue.statusCode).toBe(200);
      expect(queue.json().items.some((item: { queue_item_id: string }) => item.queue_item_id === queueItemId)).toBe(true);

      const retryStart = await server.app.inject({
        method: "POST",
        url: `/v1/practice/retry-queue/${queueItemId}/start`,
        headers: {
          authorization: `Bearer ${accessToken}`
        }
      });
      expect(retryStart.statusCode).toBe(201);
      expect(retryStart.json().mode).toBe("retry");
    } finally {
      await server.app.close();
      await dropSchema(schema);
    }
  });
});
