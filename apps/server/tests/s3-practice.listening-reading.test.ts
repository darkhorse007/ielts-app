import { afterEach, beforeEach, describe, expect, test } from "vitest";
import { buildServer } from "../src/app.js";

describe("S3 listening/reading core training loop", () => {
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

  test("supports listening core types, playback persistence and retry queue", async () => {
    const accessToken = await registerAndLogin();

    const create = await context.app.inject({
      method: "POST",
      url: "/v1/practice/sessions",
      headers: {
        authorization: `Bearer ${accessToken}`
      },
      payload: {
        skill: "listening"
      }
    });
    expect(create.statusCode).toBe(201);
    const created = create.json();
    expect(created.questions.length).toBe(4);

    const types = created.questions.map((item: { type: string }) => item.type);
    expect(types).toContain("multiple_choice");
    expect(types).toContain("fill_blank");
    expect(types).toContain("matching");
    expect(types).toContain("map_label");

    const patchPlayback = await context.app.inject({
      method: "PATCH",
      url: `/v1/practice/sessions/${created.session_id}/playback`,
      headers: {
        authorization: `Bearer ${accessToken}`
      },
      payload: {
        playback_rate: 1.1,
        segment_index: 2,
        position_seconds: 95,
        replay_wrong_only: true,
        replay_question_id: created.questions[1].question_id
      }
    });
    expect(patchPlayback.statusCode).toBe(200);
    expect(patchPlayback.json().recovered).toBe(true);
    expect(patchPlayback.json().playback_rate).toBe(1);

    const playbackState = await context.app.inject({
      method: "GET",
      url: `/v1/practice/sessions/${created.session_id}/playback`,
      headers: {
        authorization: `Bearer ${accessToken}`
      }
    });
    expect(playbackState.statusCode).toBe(200);
    expect(playbackState.json().segment_index).toBe(2);
    expect(playbackState.json().position_seconds).toBe(95);
    expect(playbackState.json().replay_wrong_only).toBe(true);

    const answerByType: Record<string, string> = {
      multiple_choice: "B",
      fill_blank: "Queen",
      matching: "1-a,2-c,3-b",
      map_label: "A"
    };

    const submit = await context.app.inject({
      method: "POST",
      url: `/v1/practice/sessions/${created.session_id}/submit`,
      headers: {
        authorization: `Bearer ${accessToken}`
      },
      payload: {
        answers: created.questions.map((question: { question_id: string; type: string }) => ({
          question_id: question.question_id,
          answer: answerByType[question.type] ?? ""
        }))
      }
    });

    expect(submit.statusCode).toBe(200);
    const submitted = submit.json();
    expect(submitted.status).toBe("submitted");
    expect(submitted.submission.score_breakdown.correct_count).toBe(2);
    expect(submitted.submission.question_results.some((item: { is_correct: boolean }) => !item.is_correct)).toBe(true);
    expect(submitted.submission.question_results.some((item: { error_tags: string[] }) => item.error_tags.length > 0)).toBe(true);

    const queue = await context.app.inject({
      method: "POST",
      url: `/v1/practice/sessions/${created.session_id}/retry-queue`,
      headers: {
        authorization: `Bearer ${accessToken}`
      },
      payload: {}
    });
    expect(queue.statusCode).toBe(200);
    expect(queue.json().items.length).toBe(2);

    const firstQueueItem = queue.json().items[0];
    const startRetry = await context.app.inject({
      method: "POST",
      url: `/v1/practice/retry-queue/${firstQueueItem.queue_item_id}/start`,
      headers: {
        authorization: `Bearer ${accessToken}`
      }
    });
    expect(startRetry.statusCode).toBe(201);
    const retrySession = startRetry.json();

    const submitRetry = await context.app.inject({
      method: "POST",
      url: `/v1/practice/sessions/${retrySession.session_id}/submit`,
      headers: {
        authorization: `Bearer ${accessToken}`
      },
      payload: {
        answers: [
          {
            question_id: retrySession.questions[0].question_id,
            answer: "retry answer"
          }
        ]
      }
    });
    expect(submitRetry.statusCode).toBe(200);

    const queueAfterRetry = await context.app.inject({
      method: "GET",
      url: "/v1/practice/retry-queue",
      headers: {
        authorization: `Bearer ${accessToken}`
      }
    });
    expect(queueAfterRetry.statusCode).toBe(200);

    const completedItem = queueAfterRetry
      .json()
      .items.find((item: { queue_item_id: string }) => item.queue_item_id === firstQueueItem.queue_item_id);
    expect(completedItem.status).toBe("completed");
    expect(completedItem.proficiency_after).toBeGreaterThan(completedItem.proficiency_before);
  });

  test("returns evidence-based feedback for reading mistakes", async () => {
    const accessToken = await registerAndLogin();

    const create = await context.app.inject({
      method: "POST",
      url: "/v1/practice/sessions",
      headers: {
        authorization: `Bearer ${accessToken}`
      },
      payload: {
        skill: "reading"
      }
    });
    expect(create.statusCode).toBe(201);
    const created = create.json();

    const types = created.questions.map((item: { type: string }) => item.type);
    expect(types).toContain("tfng");
    expect(types).toContain("paragraph_match");
    expect(types).toContain("heading_match");
    expect(types).toContain("summary_cloze");

    const submit = await context.app.inject({
      method: "POST",
      url: `/v1/practice/sessions/${created.session_id}/submit`,
      headers: {
        authorization: `Bearer ${accessToken}`
      },
      payload: {
        answers: created.questions.map((question: { question_id: string }) => ({
          question_id: question.question_id,
          answer: "wrong answer"
        }))
      }
    });
    expect(submit.statusCode).toBe(200);

    const results = submit.json().submission.question_results as Array<{
      is_correct: boolean;
      evidence?: {
        sentence: string;
        paragraph: number;
      };
      error_tags: string[];
      improvement_actions: string[];
    }>;

    expect(results.every((item) => item.is_correct === false)).toBe(true);
    expect(results.every((item) => Boolean(item.evidence?.sentence))).toBe(true);
    expect(results.every((item) => item.error_tags.length > 0)).toBe(true);
    expect(results.every((item) => item.improvement_actions.length > 0)).toBe(true);
  });
});
