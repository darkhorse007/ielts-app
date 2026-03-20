import { afterEach, beforeEach, describe, expect, test } from "vitest";
import { buildServer } from "../src/app.js";

type TestWebSocket = {
  once: (event: "message" | "close", listener: (raw?: unknown) => void) => void;
  on: (event: "message", listener: (raw: Buffer) => void) => void;
  off: (event: "message", listener: (raw: Buffer) => void) => void;
  send: (data: string) => void;
  close: () => void;
};

const waitForMessageType = async (
  ws: TestWebSocket,
  type: string,
  timeoutMs = 3000
): Promise<Record<string, unknown>> =>
  new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      ws.off("message", onMessage);
      reject(new Error(`websocket timeout waiting for ${type}`));
    }, timeoutMs);

    const onMessage = (raw: Buffer) => {
      try {
        const payload = JSON.parse(raw.toString()) as Record<string, unknown>;
        if (payload.type !== type) {
          return;
        }
        clearTimeout(timer);
        ws.off("message", onMessage);
        resolve(payload);
      } catch {
        // ignore malformed payload
      }
    };

    ws.on("message", onMessage);
  });

const waitClose = async (ws: TestWebSocket): Promise<void> =>
  new Promise((resolve) => {
    ws.once("close", () => resolve());
  });

describe("S4 speaking part/score/retry flow", () => {
  const nextEmail = () => `candidate-${crypto.randomUUID()}@example.com`;

  const build = async () => {
    const server = buildServer();
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
        device_id: "macbook"
      }
    });
    expect(login.statusCode).toBe(200);
    return login.json().access_token as string;
  };

  test("supports part1/2/3 follow-up, score feedback and same-topic retry comparison", async () => {
    const accessToken = await registerAndLogin();

    const create = await context.app.inject({
      method: "POST",
      url: "/v1/realtime/speaking/sessions",
      headers: {
        authorization: `Bearer ${accessToken}`
      },
      payload: {
        topic: "Talk about a learning method that improved your IELTS score."
      }
    });
    expect(create.statusCode).toBe(201);
    const session = create.json();

    const wsUrl =
      `/v1/realtime/speaking?session_id=${session.session_id}` +
      `&resume_token=${session.resume_token}` +
      `&access_token=${accessToken}`;

    const ws = await context.app.injectWS(wsUrl);
    await new Promise((resolve) => {
      setTimeout(resolve, 20);
    });

    ws.send(JSON.stringify({ type: "part_switch", part_no: 2 }));
    const switched2 = await waitForMessageType(ws, "part_switch");
    expect(switched2.current_part).toBe(2);

    ws.send(
      JSON.stringify({
        type: "partial_transcript",
        part_no: 2,
        text: "Because I kept a strict weekly schedule, my listening accuracy improved and I could review mistakes with my teacher."
      })
    );

    const scoreUpdate2 = await waitForMessageType(ws, "score_update");
    expect(scoreUpdate2.part_no).toBe(2);
    expect(Array.isArray(scoreUpdate2.suggestions)).toBe(true);
    expect((scoreUpdate2.suggestions as string[]).length).toBeGreaterThanOrEqual(2);
    expect(Number(scoreUpdate2.latency_ms)).toBeLessThanOrEqual(3000);
    expect(Array.isArray((scoreUpdate2.pronunciation_feedback as { word_issues?: unknown[] })?.word_issues)).toBe(true);
    expect(Array.isArray((scoreUpdate2.pronunciation_feedback as { phoneme_issues?: unknown[] })?.phoneme_issues)).toBe(true);
    expect(Array.isArray((scoreUpdate2.pronunciation_feedback as { replay_segments?: unknown[] })?.replay_segments)).toBe(true);

    ws.send(JSON.stringify({ type: "part_switch", part_no: 3 }));
    const switched3 = await waitForMessageType(ws, "part_switch");
    expect(switched3.current_part).toBe(3);

    ws.send(
      JSON.stringify({
        type: "partial_transcript",
        part_no: 3,
        text: "In a broader view, schools should balance independent learning and teacher guidance to build long-term language ability."
      })
    );

    const scoreUpdate3 = await waitForMessageType(ws, "score_update");
    expect(scoreUpdate3.part_no).toBe(3);
    expect(Number(scoreUpdate3.fluency)).toBeGreaterThan(0);

    ws.send(JSON.stringify({ type: "session_end" }));
    const ended = await waitForMessageType(ws, "session_end");
    expect(ended.turns).toBeGreaterThanOrEqual(2);
    ws.close();
    await waitClose(ws);

    const pronunciationFeedback = await context.app.inject({
      method: "GET",
      url: `/v1/realtime/speaking/sessions/${session.session_id}/pronunciation-feedback`,
      headers: {
        authorization: `Bearer ${accessToken}`
      }
    });
    expect(pronunciationFeedback.statusCode).toBe(200);
    const feedbackPayload = pronunciationFeedback.json();
    expect(feedbackPayload.turns.length).toBeGreaterThanOrEqual(2);
    expect(feedbackPayload.hotspot_words.length).toBeGreaterThanOrEqual(1);
    expect(feedbackPayload.hotspot_phonemes.length).toBeGreaterThanOrEqual(1);
    expect(feedbackPayload.tasks.length).toBeGreaterThanOrEqual(1);

    const trackTask = await context.app.inject({
      method: "POST",
      url: `/v1/realtime/speaking/sessions/${session.session_id}/pronunciation-feedback/tasks/${feedbackPayload.tasks[0].task_id}/track`,
      headers: {
        authorization: `Bearer ${accessToken}`
      },
      payload: {
        status: "done"
      }
    });
    expect(trackTask.statusCode).toBe(200);
    expect(trackTask.json().status).toBe("done");

    const retryCreate = await context.app.inject({
      method: "POST",
      url: `/v1/realtime/speaking/sessions/${session.session_id}/retry`,
      headers: {
        authorization: `Bearer ${accessToken}`
      }
    });
    expect(retryCreate.statusCode).toBe(201);
    const retrySession = retryCreate.json();
    expect(retrySession.source_session_id).toBe(session.session_id);

    const retryWsUrl =
      `/v1/realtime/speaking?session_id=${retrySession.session_id}` +
      `&resume_token=${retrySession.resume_token}` +
      `&access_token=${accessToken}`;
    const retryWs = await context.app.injectWS(retryWsUrl);
    await new Promise((resolve) => {
      setTimeout(resolve, 20);
    });

    retryWs.send(
      JSON.stringify({
        type: "partial_transcript",
        part_no: 3,
        text: "I improved this answer by adding clearer comparisons and a stronger conclusion."
      })
    );
    await waitForMessageType(retryWs, "score_update");
    retryWs.send(JSON.stringify({ type: "session_end" }));
    await waitForMessageType(retryWs, "session_end");
    retryWs.close();
    await waitClose(retryWs);

    const comparison = await context.app.inject({
      method: "GET",
      url: `/v1/realtime/speaking/sessions/${retrySession.session_id}/comparison`,
      headers: {
        authorization: `Bearer ${accessToken}`
      }
    });
    expect(comparison.statusCode).toBe(200);
    expect(comparison.json().source_session_id).toBe(session.session_id);
    expect(comparison.json().retry_session_id).toBe(retrySession.session_id);
    expect(comparison.json().delta).toBeDefined();
    expect(comparison.json().next_actions.length).toBeGreaterThanOrEqual(1);
  });

  test("supports role-play scenarios with dynamic follow-up and consistent score structure", async () => {
    const accessToken = await registerAndLogin();

    const scenarios = await context.app.inject({
      method: "GET",
      url: "/v1/realtime/speaking/scenarios",
      headers: {
        authorization: `Bearer ${accessToken}`
      }
    });
    expect(scenarios.statusCode).toBe(200);
    expect(scenarios.json().items.length).toBeGreaterThanOrEqual(5);

    const create = await context.app.inject({
      method: "POST",
      url: "/v1/realtime/speaking/sessions",
      headers: {
        authorization: `Bearer ${accessToken}`
      },
      payload: {
        task_type: "role_play",
        scenario_type: "job_interview"
      }
    });
    expect(create.statusCode).toBe(201);
    const session = create.json();
    expect(session.task_type).toBe("role_play");
    expect(session.scenario_type).toBe("job_interview");

    const detail = await context.app.inject({
      method: "GET",
      url: `/v1/realtime/speaking/sessions/${session.session_id}`,
      headers: {
        authorization: `Bearer ${accessToken}`
      }
    });
    expect(detail.statusCode).toBe(200);
    expect(detail.json().task_type).toBe("role_play");
    expect(detail.json().scenario_type).toBe("job_interview");

    const wsUrl =
      `/v1/realtime/speaking?session_id=${session.session_id}` +
      `&resume_token=${session.resume_token}` +
      `&access_token=${accessToken}`;
    const ws = await context.app.injectWS(wsUrl);
    await new Promise((resolve) => {
      setTimeout(resolve, 20);
    });

    const firstQuestionPromise = waitForMessageType(ws, "coach_question");
    const firstScorePromise = waitForMessageType(ws, "score_update");
    ws.send(
      JSON.stringify({
        type: "partial_transcript",
        part_no: 1,
        text: "I can introduce myself and explain my internship background briefly."
      })
    );
    const firstQuestion = await firstQuestionPromise;
    const firstScore = await firstScorePromise;
    expect(typeof firstQuestion.text).toBe("string");
    expect(typeof firstScore.fluency).toBe("number");
    expect(typeof firstScore.lexical).toBe("number");
    expect(typeof firstScore.grammar).toBe("number");
    expect(typeof firstScore.pronunciation).toBe("number");

    ws.send(
      JSON.stringify({
        type: "partial_transcript",
        part_no: 1,
        text: "Because I handled cross-team communication, I can solve client issues efficiently."
      })
    );
    const secondQuestion = await waitForMessageType(ws, "coach_question");
    expect(secondQuestion.text).not.toBe(firstQuestion.text);

    ws.send(JSON.stringify({ type: "session_end" }));
    await waitForMessageType(ws, "session_end");
    ws.close();
    await waitClose(ws);
  });
});
