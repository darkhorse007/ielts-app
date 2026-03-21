import { afterEach, beforeEach, describe, expect, test } from "vitest";
import { buildServer } from "../src/app.js";

type TestWebSocket = {
  once: (event: "message" | "close", listener: (raw?: unknown) => void) => void;
  on: (event: "message", listener: (raw: Buffer) => void) => void;
  off: (event: "message", listener: (raw: Buffer) => void) => void;
  send: (data: string) => void;
  close: () => void;
};

const readMessage = async (ws: TestWebSocket): Promise<Record<string, unknown>> =>
  new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      reject(new Error("websocket message timeout"));
    }, 2000);

    ws.once("message", (raw: unknown) => {
      clearTimeout(timer);
      try {
        const text = typeof raw === "string" ? raw : Buffer.isBuffer(raw) ? raw.toString() : String(raw);
        resolve(JSON.parse(text) as Record<string, unknown>);
      } catch (error) {
        reject(error);
      }
    });
  });

const collectMessages = async (ws: TestWebSocket, count: number): Promise<Record<string, unknown>[]> =>
  new Promise((resolve, reject) => {
    const messages: Record<string, unknown>[] = [];
    const timer = setTimeout(() => {
      ws.off("message", onMessage);
      reject(new Error("websocket message timeout"));
    }, 2500);

    const onMessage = (raw: Buffer) => {
      try {
        messages.push(JSON.parse(raw.toString()) as Record<string, unknown>);
      } catch (error) {
        clearTimeout(timer);
        ws.off("message", onMessage);
        reject(error);
        return;
      }

      if (messages.length >= count) {
        clearTimeout(timer);
        ws.off("message", onMessage);
        resolve(messages);
      }
    };

    ws.on("message", onMessage);
  });

const waitClose = async (ws: TestWebSocket): Promise<void> =>
  new Promise((resolve) => {
    ws.once("close", () => resolve());
  });

describe("S3 realtime speaking websocket base flow", () => {
  const nextEmail = () => `candidate-${crypto.randomUUID()}@example.com`;

  const build = async (overrides?: Parameters<typeof buildServer>[0]) => {
    const server = buildServer(overrides);
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

  const registerAndLogin = async () => {
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

    const login = await context.app.inject({
      method: "POST",
      url: "/v1/auth/login",
      payload: {
        identifier: email,
        password: "StrongPass123",
        device_id: "ios"
      }
    });
    expect(login.statusCode).toBe(200);
    return {
      accessToken: login.json().access_token as string,
      userId: login.json().user_id as string
    };
  };

  test("supports connect, transcript, reconnect within 5 minutes and event traceability", async () => {
    const auth = await registerAndLogin();
    const accessToken = auth.accessToken;

    const createSession = await context.app.inject({
      method: "POST",
      url: "/v1/realtime/speaking/sessions",
      headers: {
        authorization: `Bearer ${accessToken}`
      }
    });
    expect(createSession.statusCode).toBe(201);
    const speakingSession = createSession.json();

    const connectUrl =
      `/v1/realtime/speaking?session_id=${speakingSession.session_id}` +
      `&resume_token=${speakingSession.resume_token}`;

    const ws = await context.app.injectWS(connectUrl);
    await new Promise((resolve) => setTimeout(resolve, 20));

    const transcriptMessages = collectMessages(ws, 2);
    ws.send(
      JSON.stringify({
        type: "partial_transcript",
        text: "I improved my English because I created a weekly study system and kept it for three months."
      })
    );

    const [messageOne, messageTwo] = await transcriptMessages;
    const returnedTypes = [messageOne.type, messageTwo.type];
    expect(returnedTypes).toContain("coach_question");
    expect(returnedTypes).toContain("score_update");

    ws.send(JSON.stringify({ type: "heartbeat" }));
    const heartbeatAck = await readMessage(ws);
    expect(heartbeatAck.type).toBe("heartbeat_ack");

    ws.close();
    await waitClose(ws);

    context.speakingRealtimeService.disconnectSession({
      userId: auth.userId,
      sessionId: speakingSession.session_id,
      reason: "network_drop_for_test"
    });

    const statusAfterClose = await context.app.inject({
      method: "GET",
      url: `/v1/realtime/speaking/sessions/${speakingSession.session_id}`,
      headers: {
        authorization: `Bearer ${accessToken}`
      }
    });
    expect(statusAfterClose.statusCode).toBe(200);
    expect(statusAfterClose.json().status).toBe("disconnected");

    const wsResume = await context.app.injectWS(connectUrl);
    const endMessage = readMessage(wsResume);
    wsResume.send(JSON.stringify({ type: "session_end" }));
    const endedByWs = await endMessage;
    expect(endedByWs.type).toBe("session_end");
    await waitClose(wsResume);

    const events = await context.app.inject({
      method: "GET",
      url: `/v1/realtime/speaking/sessions/${speakingSession.session_id}/events`,
      headers: {
        authorization: `Bearer ${accessToken}`
      }
    });

    expect(events.statusCode).toBe(200);
    const types = (events.json().items as Array<{ type: string }>).map((item) => item.type);
    expect(types).toContain("session_start");
    expect(types).toContain("partial_transcript");
    expect(types).toContain("coach_question");
    expect(types).toContain("score_update");
    expect(types).toContain("session_resume");
    expect(types).toContain("session_end");
  });

  test("rejects websocket upgrades from disallowed browser origins", async () => {
    await context.app.close();
    context = await build({
      allowedBrowserOrigins: ["https://app.example.com"]
    });

    const auth = await registerAndLogin();
    const createSession = await context.app.inject({
      method: "POST",
      url: "/v1/realtime/speaking/sessions",
      headers: {
        authorization: `Bearer ${auth.accessToken}`
      }
    });
    expect(createSession.statusCode).toBe(201);

    const speakingSession = createSession.json();
    const connectUrl =
      `/v1/realtime/speaking?session_id=${speakingSession.session_id}` +
      `&resume_token=${speakingSession.resume_token}`;

    const ws = await context.app.injectWS(connectUrl, {
      headers: {
        origin: "https://evil.example.com"
      }
    });
    await waitClose(ws);
  });
});
