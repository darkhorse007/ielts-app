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
    speakingStateStorageBackend: "postgres",
    speakingStateStorageConnectionString: postgresUrl,
    speakingStateStorageSchema: schema
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

type InjectWebSocket = {
  on: (event: "message" | "close", listener: (payload?: unknown) => void) => void;
  send: (payload: string) => void;
  close: () => void;
};

const waitForMessageType = async (ws: InjectWebSocket, type: string): Promise<Record<string, unknown>> =>
  new Promise((resolve, reject) => {
    const timeout = setTimeout(() => {
      reject(new Error(`timeout waiting for ${type}`));
    }, 3000);
    ws.on("message", (raw?: unknown) => {
      try {
        const payload = JSON.parse(Buffer.isBuffer(raw) ? raw.toString() : String(raw));
        if (payload.type === type) {
          clearTimeout(timeout);
          resolve(payload as Record<string, unknown>);
        }
      } catch {
        // ignore
      }
    });
  });

const waitClose = async (ws: InjectWebSocket) =>
  new Promise((resolve) => {
    ws.on("close", () => resolve(undefined));
  });

const sleep = async (durationMs: number): Promise<void> =>
  new Promise((resolve) => {
    setTimeout(resolve, durationMs);
  });

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

describe("S30 speaking-state postgres persistence", () => {
  test("rejects speaking-state postgres backend without connection string", () => {
    expect(() =>
      buildServer({
        speakingStateStorageBackend: "postgres",
        speakingStateStorageConnectionString: ""
      })
    ).toThrowError("SPEAKING_STATE_POSTGRES_CONNECTION_STRING_REQUIRED");
  });

  test("rejects speaking-state postgres backend with invalid schema", () => {
    expect(() =>
      buildServer({
        speakingStateStorageBackend: "postgres",
        speakingStateStorageConnectionString: "postgres://u:p@localhost:5432/ielts",
        speakingStateStorageSchema: "invalid-schema"
      })
    ).toThrowError("SPEAKING_STATE_POSTGRES_SCHEMA_INVALID");
  });

  runIfPostgres("persists speaking session resume and score history across server restarts", async () => {
    const schema = `speaking_${randomUUID().replace(/-/g, "").slice(0, 12)}`;
    const password = "StrongPass123";
    let server = buildPostgresServer(schema);
    let email = "";
    let resumeToken = "";
    let sessionId = "";

    try {
      await server.app.ready();
      const session = await registerAndLogin(server, "candidate", password);
      email = session.email;

      const create = await server.app.inject({
        method: "POST",
        url: "/v1/realtime/speaking/sessions",
        headers: {
          authorization: `Bearer ${session.accessToken}`
        },
        payload: {
          task_type: "role_play",
          scenario_type: "job_interview"
        }
      });
      expect(create.statusCode).toBe(201);
      sessionId = create.json().session_id as string;
      resumeToken = create.json().resume_token as string;

      const ws = await server.app.injectWS(
        `/v1/realtime/speaking?session_id=${sessionId}&resume_token=${resumeToken}&access_token=${session.accessToken}`
      );
      await sleep(20);
      ws.send(
        JSON.stringify({
          type: "partial_transcript",
          part_no: 1,
          text: "I can explain my internship background and communicate with confidence."
        })
      );
      await waitForMessageType(ws, "score_update");
      ws.close();
      await waitClose(ws);
      await sleep(50);
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

      const beforeResume = await server.app.inject({
        method: "GET",
        url: `/v1/realtime/speaking/sessions/${sessionId}`,
        headers: {
          authorization: `Bearer ${accessToken}`
        }
      });
      expect(beforeResume.statusCode).toBe(200);
      expect(["connected", "disconnected"]).toContain(beforeResume.json().status);
      expect(beforeResume.json().turns).toBeGreaterThanOrEqual(1);

      const ws = await server.app.injectWS(
        `/v1/realtime/speaking?session_id=${sessionId}&resume_token=${resumeToken}&access_token=${accessToken}`
      );
      await sleep(20);
      ws.send(JSON.stringify({ type: "session_end" }));
      await waitForMessageType(ws, "session_end");
      ws.close();
      await waitClose(ws);

      const detail = await server.app.inject({
        method: "GET",
        url: `/v1/realtime/speaking/sessions/${sessionId}`,
        headers: {
          authorization: `Bearer ${accessToken}`
        }
      });
      expect(detail.statusCode).toBe(200);
      expect(detail.json().status).toBe("ended");
      expect(detail.json().turns).toBeGreaterThanOrEqual(1);

      const events = await server.app.inject({
        method: "GET",
        url: `/v1/realtime/speaking/sessions/${sessionId}/events`,
        headers: {
          authorization: `Bearer ${accessToken}`
        }
      });
      expect(events.statusCode).toBe(200);
      expect(events.json().items.some((item: { type: string }) => item.type === "score_update")).toBe(true);
    } finally {
      await server.app.close();
      await dropSchema(schema);
    }
  });
});
