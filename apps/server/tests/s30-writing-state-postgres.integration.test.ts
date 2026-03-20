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
    writingStateStorageBackend: "postgres",
    writingStateStorageConnectionString: postgresUrl,
    writingStateStorageSchema: schema
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

describe("S30 writing-state postgres persistence", () => {
  test("rejects writing-state postgres backend without connection string", () => {
    expect(() =>
      buildServer({
        writingStateStorageBackend: "postgres",
        writingStateStorageConnectionString: ""
      })
    ).toThrowError("WRITING_STATE_POSTGRES_CONNECTION_STRING_REQUIRED");
  });

  test("rejects writing-state postgres backend with invalid schema", () => {
    expect(() =>
      buildServer({
        writingStateStorageBackend: "postgres",
        writingStateStorageConnectionString: "postgres://u:p@localhost:5432/ielts",
        writingStateStorageSchema: "invalid-schema"
      })
    ).toThrowError("WRITING_STATE_POSTGRES_SCHEMA_INVALID");
  });

  runIfPostgres("persists evaluation, rewrite archive and template usage across server restarts", async () => {
    const schema = `writing_${randomUUID().replace(/-/g, "").slice(0, 12)}`;
    const password = "StrongPass123";
    let server = buildPostgresServer(schema);
    let email = "";
    let evaluationId = "";

    try {
      await server.app.ready();
      const session = await registerAndLogin(server, "candidate", password);
      email = session.email;

      const evaluation = await server.app.inject({
        method: "POST",
        url: "/v1/writing/evaluations",
        headers: {
          authorization: `Bearer ${session.accessToken}`
        },
        payload: {
          task_type: "task2",
          prompt: "Some people think practical skills are more important than academic subjects.",
          essay:
            "I believe practical skills matter because students need to solve real-world problems, but academic subjects still provide the theory that supports long-term development."
        }
      });
      expect(evaluation.statusCode).toBe(201);
      evaluationId = evaluation.json().evaluation_id as string;

      const rewrite = await server.app.inject({
        method: "POST",
        url: `/v1/writing/evaluations/${evaluationId}/rewrite`,
        headers: {
          authorization: `Bearer ${session.accessToken}`
        },
        payload: {
          essay:
            "Practical skills are essential for modern students because they improve real-world readiness, while academic knowledge offers the theoretical framework needed for sustainable progress."
        }
      });
      expect(rewrite.statusCode).toBe(201);

      const insertTemplate = await server.app.inject({
        method: "POST",
        url: "/v1/writing/templates/task2-balanced-opinion/insert",
        headers: {
          authorization: `Bearer ${session.accessToken}`
        },
        payload: {
          essay: "This is a baseline essay paragraph for template insertion."
        }
      });
      expect(insertTemplate.statusCode).toBe(200);
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

      const evaluation = await server.app.inject({
        method: "GET",
        url: `/v1/writing/evaluations/${evaluationId}`,
        headers: {
          authorization: `Bearer ${accessToken}`
        }
      });
      expect(evaluation.statusCode).toBe(200);
      expect(evaluation.json().evaluation_id).toBe(evaluationId);

      const archive = await server.app.inject({
        method: "GET",
        url: "/v1/writing/archives",
        headers: {
          authorization: `Bearer ${accessToken}`
        }
      });
      expect(archive.statusCode).toBe(200);
      expect(archive.json().items.length).toBeGreaterThanOrEqual(1);

      const adoption = await server.app.inject({
        method: "GET",
        url: "/v1/writing/templates/adoption",
        headers: {
          authorization: `Bearer ${accessToken}`
        }
      });
      expect(adoption.statusCode).toBe(200);
      expect(adoption.json().total_insertions).toBeGreaterThanOrEqual(1);
    } finally {
      await server.app.close();
      await dropSchema(schema);
    }
  });
});
