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
    practiceStateStorageBackend: "postgres",
    practiceStateStorageConnectionString: postgresUrl,
    practiceStateStorageSchema: schema,
    writingStateStorageBackend: "postgres",
    writingStateStorageConnectionString: postgresUrl,
    writingStateStorageSchema: schema,
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

const seedPlan = async (server: ReturnType<typeof buildServer>, accessToken: string): Promise<void> => {
  const onboarding = await server.app.inject({
    method: "POST",
    url: "/v1/users/onboarding",
    headers: {
      authorization: `Bearer ${accessToken}`
    },
    payload: {
      target_overall_band: 6.5,
      target_exam_date: "2026-12-31",
      weekly_study_hours: 10,
      weak_skills: ["speaking", "writing"]
    }
  });
  expect(onboarding.statusCode).toBe(202);

  const complete = await server.app.inject({
    method: "POST",
    url: `/v1/users/onboarding/${onboarding.json().assessment_id as string}/complete`,
    headers: {
      authorization: `Bearer ${accessToken}`
    }
  });
  expect(complete.statusCode).toBe(200);
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

describe("S30 content recovery postgres integration", () => {
  runIfPostgres("persists practice, writing and mock recovery chain across restarts", async () => {
    const schema = `content_${randomUUID().replace(/-/g, "").slice(0, 12)}`;
    const password = "StrongPass123";
    let server = buildPostgresServer(schema);
    let email = "";
    let practiceSessionId = "";
    let writingEvaluationId = "";
    let mockExamId = "";

    try {
      await server.app.ready();
      const session = await registerAndLogin(server, "content", password);
      email = session.email;
      await seedPlan(server, session.accessToken);

      const practice = await server.app.inject({
        method: "POST",
        url: "/v1/practice/sessions",
        headers: {
          authorization: `Bearer ${session.accessToken}`
        },
        payload: {
          skill: "listening"
        }
      });
      expect(practice.statusCode).toBe(201);
      practiceSessionId = practice.json().session_id as string;

      const practiceSubmit = await server.app.inject({
        method: "POST",
        url: `/v1/practice/sessions/${practiceSessionId}/submit`,
        headers: {
          authorization: `Bearer ${session.accessToken}`
        },
        payload: {
          answers: practice.json().questions.map((question: { question_id: string }) => ({
            question_id: question.question_id,
            answer: "wrong answer"
          }))
        }
      });
      expect(practiceSubmit.statusCode).toBe(200);

      const retryQueue = await server.app.inject({
        method: "POST",
        url: `/v1/practice/sessions/${practiceSessionId}/retry-queue`,
        headers: {
          authorization: `Bearer ${session.accessToken}`
        },
        payload: {}
      });
      expect(retryQueue.statusCode).toBe(200);

      const evaluation = await server.app.inject({
        method: "POST",
        url: "/v1/writing/evaluations",
        headers: {
          authorization: `Bearer ${session.accessToken}`
        },
        payload: {
          task_type: "task2",
          prompt: "Some people think online learning should replace classroom teaching.",
          essay:
            "I believe online learning is flexible and cost-effective, but face to face teaching is still important for communication, discipline and collaboration."
        }
      });
      expect(evaluation.statusCode).toBe(201);
      writingEvaluationId = evaluation.json().evaluation_id as string;

      const rewrite = await server.app.inject({
        method: "POST",
        url: `/v1/writing/evaluations/${writingEvaluationId}/rewrite`,
        headers: {
          authorization: `Bearer ${session.accessToken}`
        },
        payload: {
          essay:
            "Online learning offers flexibility and lower costs, yet classroom teaching remains valuable because it strengthens interaction, accountability and teamwork."
        }
      });
      expect(rewrite.statusCode).toBe(201);

      const templateInsert = await server.app.inject({
        method: "POST",
        url: "/v1/writing/templates/task2-balanced-opinion/insert",
        headers: {
          authorization: `Bearer ${session.accessToken}`
        },
        payload: {
          essay: "This is my baseline essay paragraph for insertion."
        }
      });
      expect(templateInsert.statusCode).toBe(200);

      const createExam = await server.app.inject({
        method: "POST",
        url: "/v1/mock-exams",
        headers: {
          authorization: `Bearer ${session.accessToken}`
        }
      });
      expect(createExam.statusCode).toBe(201);
      mockExamId = createExam.json().exam_id as string;

      const progress = await server.app.inject({
        method: "POST",
        url: `/v1/mock-exams/${mockExamId}/progress`,
        headers: {
          authorization: `Bearer ${session.accessToken}`
        },
        payload: {
          skill: "reading",
          answered_count: 20,
          completed: true
        }
      });
      expect(progress.statusCode).toBe(200);

      const submitExam = await server.app.inject({
        method: "POST",
        url: `/v1/mock-exams/${mockExamId}/submit`,
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
      expect(submitExam.statusCode).toBe(200);

      const report = await server.app.inject({
        method: "GET",
        url: `/v1/mock-exams/${mockExamId}/report`,
        headers: {
          authorization: `Bearer ${session.accessToken}`
        }
      });
      expect(report.statusCode).toBe(200);
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

      const practice = await server.app.inject({
        method: "GET",
        url: `/v1/practice/sessions/${practiceSessionId}`,
        headers: {
          authorization: `Bearer ${accessToken}`
        }
      });
      expect(practice.statusCode).toBe(200);
      expect(practice.json().status).toBe("submitted");

      const retryQueue = await server.app.inject({
        method: "GET",
        url: "/v1/practice/retry-queue",
        headers: {
          authorization: `Bearer ${accessToken}`
        }
      });
      expect(retryQueue.statusCode).toBe(200);
      expect(retryQueue.json().items.length).toBeGreaterThanOrEqual(1);

      const evaluation = await server.app.inject({
        method: "GET",
        url: `/v1/writing/evaluations/${writingEvaluationId}`,
        headers: {
          authorization: `Bearer ${accessToken}`
        }
      });
      expect(evaluation.statusCode).toBe(200);

      const archives = await server.app.inject({
        method: "GET",
        url: "/v1/writing/archives",
        headers: {
          authorization: `Bearer ${accessToken}`
        }
      });
      expect(archives.statusCode).toBe(200);
      expect(archives.json().items.length).toBeGreaterThanOrEqual(1);

      const exam = await server.app.inject({
        method: "GET",
        url: `/v1/mock-exams/${mockExamId}`,
        headers: {
          authorization: `Bearer ${accessToken}`
        }
      });
      expect(exam.statusCode).toBe(200);
      expect(exam.json().status).toBe("completed");

      const report = await server.app.inject({
        method: "GET",
        url: `/v1/mock-exams/${mockExamId}/report`,
        headers: {
          authorization: `Bearer ${accessToken}`
        }
      });
      expect(report.statusCode).toBe(200);
      expect(report.json().plan_writeback.applied).toBe(true);
      expect(report.json().plan_writeback.undo_available).toBe(true);
    } finally {
      await server.app.close();
      await dropSchema(schema);
    }
  });
});
