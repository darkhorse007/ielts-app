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
    learnerStateStorageSchema: schema
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

describe("S29 learner-state postgres persistence", () => {
  test("rejects learner-state postgres backend without connection string", () => {
    expect(() =>
      buildServer({
        learnerStateStorageBackend: "postgres",
        learnerStateStorageConnectionString: ""
      })
    ).toThrowError("LEARNER_STATE_POSTGRES_CONNECTION_STRING_REQUIRED");
  });

  test("rejects learner-state postgres backend with invalid schema", () => {
    expect(() =>
      buildServer({
        learnerStateStorageBackend: "postgres",
        learnerStateStorageConnectionString: "postgres://u:p@localhost:5432/ielts",
        learnerStateStorageSchema: "invalid-schema"
      })
    ).toThrowError("LEARNER_STATE_POSTGRES_SCHEMA_INVALID");
  });

  runIfPostgres("persists onboarding, plan and progress across server restarts", async () => {
    const schema = `learner_${randomUUID().replace(/-/g, "").slice(0, 12)}`;
    const password = "StrongPass123";
    let server = buildPostgresServer(schema);
    let email = "";
    let assessmentId = "";
    let planId = "";

    try {
      await server.app.ready();
      const session = await registerAndLogin(server, "candidate", password);
      email = session.email;

      const onboarding = await server.app.inject({
        method: "POST",
        url: "/v1/users/onboarding",
        headers: {
          authorization: `Bearer ${session.accessToken}`
        },
        payload: {
          target_overall_band: 6.5,
          target_exam_date: "2026-09-30",
          weekly_study_hours: 12,
          weak_skills: ["speaking", "writing"]
        }
      });
      expect(onboarding.statusCode).toBe(202);
      assessmentId = onboarding.json().assessment_id as string;
      planId = onboarding.json().plan_id as string;

      const questions = await server.app.inject({
        method: "GET",
        url: `/v1/users/onboarding/${assessmentId}/questions`,
        headers: {
          authorization: `Bearer ${session.accessToken}`
        }
      });
      expect(questions.statusCode).toBe(200);
      const questionId = questions.json().questions[0].question_id as string;

      const answer = await server.app.inject({
        method: "POST",
        url: `/v1/users/onboarding/${assessmentId}/answers`,
        headers: {
          authorization: `Bearer ${session.accessToken}`
        },
        payload: {
          question_id: questionId,
          answer: "time location purpose"
        }
      });
      expect(answer.statusCode).toBe(200);

      const complete = await server.app.inject({
        method: "POST",
        url: `/v1/users/onboarding/${assessmentId}/complete`,
        headers: {
          authorization: `Bearer ${session.accessToken}`
        }
      });
      expect(complete.statusCode).toBe(200);
      expect(complete.json().plan_id).toBe(planId);

      const sync = await server.app.inject({
        method: "POST",
        url: "/v1/users/me/progress/sync",
        headers: {
          authorization: `Bearer ${session.accessToken}`
        },
        payload: {
          client_updated_at: new Date().toISOString(),
          progress: {
            listening_completed: 2,
            speaking_completed: 1,
            reading_completed: 3,
            writing_completed: 1,
            total_study_minutes: 95,
            streak_days: 4
          }
        }
      });
      expect(sync.statusCode).toBe(200);
      expect(sync.json().server_version).toBe(2);
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

      const status = await server.app.inject({
        method: "GET",
        url: `/v1/users/onboarding/${assessmentId}/status`,
        headers: {
          authorization: `Bearer ${accessToken}`
        }
      });
      expect(status.statusCode).toBe(200);
      expect(status.json().plan_id).toBe(planId);
      expect(status.json().status).toBe("completed");

      const plan = await server.app.inject({
        method: "GET",
        url: "/v1/users/plans/active",
        headers: {
          authorization: `Bearer ${accessToken}`
        }
      });
      expect(plan.statusCode).toBe(200);
      expect(plan.json().plan_id).toBe(planId);
      expect(plan.json().weeks.length).toBe(8);

      const progress = await server.app.inject({
        method: "GET",
        url: "/v1/users/me/progress",
        headers: {
          authorization: `Bearer ${accessToken}`
        }
      });
      expect(progress.statusCode).toBe(200);
      expect(progress.json().total_study_minutes).toBe(95);
      expect(progress.json().server_version).toBe(2);
    } finally {
      await server.app.close();
      await dropSchema(schema);
    }
  });
});
