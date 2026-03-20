import { afterEach, beforeEach, describe, expect, test } from "vitest";
import { buildServer } from "../src/app.js";

describe("US-3201 listening dictation mode", () => {
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

  test("supports sentence-level dictation with spelling/chunk comparison and frequency summary", async () => {
    const accessToken = await registerAndLogin();

    const create = await context.app.inject({
      method: "POST",
      url: "/v1/practice/sessions",
      headers: {
        authorization: `Bearer ${accessToken}`
      },
      payload: {
        skill: "listening",
        task_type: "dictation"
      }
    });
    expect(create.statusCode).toBe(201);
    const created = create.json();
    expect(created.task_type).toBe("dictation");
    expect(created.questions.length).toBe(4);
    expect(created.questions.every((item: { type: string }) => item.type === "dictation_sentence")).toBe(true);

    const dictationAnswers = [
      "The advisor sugested booking the trial lesson before friday morning.",
      "You should enter through south gate and report reception desk three.",
      "Their final report highlighted how community project improved student confidence.",
      "If weather turns bad the outdoor interview will move online."
    ];

    const submit = await context.app.inject({
      method: "POST",
      url: `/v1/practice/sessions/${created.session_id}/submit`,
      headers: {
        authorization: `Bearer ${accessToken}`
      },
      payload: {
        answers: created.questions.map((question: { question_id: string }, index: number) => ({
          question_id: question.question_id,
          answer: dictationAnswers[index] ?? ""
        }))
      }
    });
    expect(submit.statusCode).toBe(200);

    const submitted = submit.json();
    expect(submitted.submission.dictation_summary.total_sentences).toBe(4);
    expect(submitted.submission.dictation_summary.high_frequency_spelling_errors.length).toBeGreaterThan(0);
    expect(submitted.submission.dictation_summary.high_frequency_chunk_errors.length).toBeGreaterThan(0);

    const feedbackResults = submitted.submission.question_results as Array<{
      dictation_feedback?: {
        spelling_mismatches: unknown[];
        missing_chunks: unknown[];
      };
    }>;
    expect(feedbackResults.every((item) => Boolean(item.dictation_feedback))).toBe(true);
    expect(feedbackResults.some((item) => (item.dictation_feedback?.spelling_mismatches.length ?? 0) > 0)).toBe(true);
    expect(feedbackResults.some((item) => (item.dictation_feedback?.missing_chunks.length ?? 0) > 0)).toBe(true);
  });

  test("keeps core listening response compatible without dictation payload", async () => {
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
    expect(created.task_type).toBe("core_training");

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

    const submitted = submit.json();
    expect(submitted.submission.dictation_summary).toBeUndefined();
    expect(
      submitted.submission.question_results.every(
        (item: {
          dictation_feedback?: unknown;
        }) => item.dictation_feedback === undefined
      )
    ).toBe(true);
  });
});
