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
    learnerStateStorageBackend: "postgres",
    learnerStateStorageConnectionString: postgresUrl,
    learnerStateStorageSchema: schema,
    mockStateStorageBackend: "postgres",
    mockStateStorageConnectionString: postgresUrl,
    mockStateStorageSchema: schema
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

const futureDate = () => "2026-12-31";

const seedActivePlan = async (
  server: ReturnType<typeof buildServer>,
  accessToken: string
): Promise<{ planId: string; assessmentId: string }> => {
  const onboarding = await server.app.inject({
    method: "POST",
    url: "/v1/users/onboarding",
    headers: {
      authorization: `Bearer ${accessToken}`
    },
    payload: {
      target_overall_band: 6.5,
      target_exam_date: futureDate(),
      weekly_study_hours: 12,
      weak_skills: ["reading", "writing"]
    }
  });
  expect(onboarding.statusCode).toBe(202);
  const assessmentId = onboarding.json().assessment_id as string;
  const complete = await server.app.inject({
    method: "POST",
    url: `/v1/users/onboarding/${assessmentId}/complete`,
    headers: {
      authorization: `Bearer ${accessToken}`
    }
  });
  expect(complete.statusCode).toBe(200);
  return {
    assessmentId,
    planId: complete.json().plan_id as string
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

describe("S30 mock-state postgres persistence", () => {
  test("rejects mock-state postgres backend without connection string", () => {
    expect(() =>
      buildServer({
        mockStateStorageBackend: "postgres",
        mockStateStorageConnectionString: ""
      })
    ).toThrowError("MOCK_STATE_POSTGRES_CONNECTION_STRING_REQUIRED");
  });

  test("rejects mock-state postgres backend with invalid schema", () => {
    expect(() =>
      buildServer({
        mockStateStorageBackend: "postgres",
        mockStateStorageConnectionString: "postgres://u:p@localhost:5432/ielts",
        mockStateStorageSchema: "invalid-schema"
      })
    ).toThrowError("MOCK_STATE_POSTGRES_SCHEMA_INVALID");
  });

  runIfPostgres("persists mock exam/report/writeback state across server restarts", async () => {
    const schema = `mock_${randomUUID().replace(/-/g, "").slice(0, 12)}`;
    const password = "StrongPass123";
    let server = buildPostgresServer(schema);
    let email = "";
    let examId = "";

    try {
      await server.app.ready();
      const session = await registerAndLogin(server, "candidate", password);
      email = session.email;
      await seedActivePlan(server, session.accessToken);

      const createExam = await server.app.inject({
        method: "POST",
        url: "/v1/mock-exams",
        headers: {
          authorization: `Bearer ${session.accessToken}`
        }
      });
      expect(createExam.statusCode).toBe(201);
      examId = createExam.json().exam_id as string;

      const progress = await server.app.inject({
        method: "POST",
        url: `/v1/mock-exams/${examId}/progress`,
        headers: {
          authorization: `Bearer ${session.accessToken}`
        },
        payload: {
          skill: "reading",
          answered_count: 24,
          completed: true
        }
      });
      expect(progress.statusCode).toBe(200);

      const submit = await server.app.inject({
        method: "POST",
        url: `/v1/mock-exams/${examId}/submit`,
        headers: {
          authorization: `Bearer ${session.accessToken}`
        },
        payload: {
          skill_bands: {
            listening: 6.5,
            speaking: 6,
            reading: 5.5,
            writing: 6
          }
        }
      });
      expect(submit.statusCode).toBe(200);

      const report = await server.app.inject({
        method: "GET",
        url: `/v1/mock-exams/${examId}/report`,
        headers: {
          authorization: `Bearer ${session.accessToken}`
        }
      });
      expect(report.statusCode).toBe(200);
      expect(report.json().plan_writeback.applied).toBe(true);
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

      const exam = await server.app.inject({
        method: "GET",
        url: `/v1/mock-exams/${examId}`,
        headers: {
          authorization: `Bearer ${accessToken}`
        }
      });
      expect(exam.statusCode).toBe(200);
      expect(exam.json().status).toBe("completed");

      const report = await server.app.inject({
        method: "GET",
        url: `/v1/mock-exams/${examId}/report`,
        headers: {
          authorization: `Bearer ${accessToken}`
        }
      });
      expect(report.statusCode).toBe(200);
      expect(report.json().plan_writeback.applied).toBe(true);
      expect(report.json().plan_writeback.undo_available).toBe(true);

      const undo = await server.app.inject({
        method: "POST",
        url: `/v1/mock-exams/${examId}/report/writeback/undo`,
        headers: {
          authorization: `Bearer ${accessToken}`
        }
      });
      expect(undo.statusCode).toBe(200);
      expect(undo.json().plan_writeback.undo_available).toBe(false);
    } finally {
      await server.app.close();
      await dropSchema(schema);
    }
  });
});
