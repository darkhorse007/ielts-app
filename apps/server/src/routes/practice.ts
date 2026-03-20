import type { FastifyInstance } from "fastify";
import { z } from "zod";
import type { AuthService } from "../domain/auth-service.js";
import type { PracticeStateRepository } from "../domain/practice-state-repository.js";
import type { PracticeService } from "../domain/practice-service.js";
import { authenticate, type AuthenticatedRequest } from "../middleware/auth.js";
import type { PracticeSession } from "../domain/types.js";

const createSessionSchema = z.object({
  skill: z.enum(["listening", "reading"]),
  task_type: z.string().trim().min(1).max(64).optional(),
  training_mode: z.enum(["training", "exam"]).optional(),
  time_limit_seconds: z.number().int().min(300).max(7200).optional()
});

const sessionParamsSchema = z.object({
  session_id: z.string().uuid()
});

const submitSchema = z.object({
  answers: z
    .array(
      z.object({
        question_id: z.string().uuid(),
        answer: z.string().max(4000)
      })
    )
    .min(1)
});

const queueSchema = z.object({
  question_ids: z.array(z.string().uuid()).optional()
});

const queueParamsSchema = z.object({
  queue_item_id: z.string().uuid()
});

const modeSwitchSchema = z.object({
  training_mode: z.enum(["training", "exam"]),
  time_limit_seconds: z.number().int().min(300).max(7200).optional()
});

const updatePlaybackSchema = z
  .object({
    playback_rate: z.number().min(0.5).max(2.5).optional(),
    segment_index: z.number().int().min(0).optional(),
    position_seconds: z.number().int().min(0).optional(),
    replay_wrong_only: z.boolean().optional(),
    replay_question_id: z.string().uuid().optional()
  })
  .refine(
    (value) =>
      value.playback_rate !== undefined ||
      value.segment_index !== undefined ||
      value.position_seconds !== undefined ||
      value.replay_wrong_only !== undefined ||
      value.replay_question_id !== undefined,
    {
      message: "At least one playback field is required"
    }
  );

const toError = (code: string, message: string): { code: string; message: string } => ({
  code,
  message
});

const serializeTimer = (timer?: {
  status: string;
  limitSeconds?: number;
  elapsedSeconds: number;
  startedAt?: string;
  pausedAt?: string;
  submittedElapsedSeconds?: number;
  recoveredAt?: string;
}) =>
  timer
    ? {
        status: timer.status,
        limit_seconds: timer.limitSeconds,
        elapsed_seconds: timer.elapsedSeconds,
        started_at: timer.startedAt,
        paused_at: timer.pausedAt,
        submitted_elapsed_seconds: timer.submittedElapsedSeconds,
        recovered_at: timer.recoveredAt,
        remaining_seconds:
          typeof timer.limitSeconds === "number" ? Math.max(0, timer.limitSeconds - timer.elapsedSeconds) : undefined
      }
    : undefined;

const serializeSession = (session: PracticeSession) => ({
  session_id: session.id,
  skill: session.skill,
  task_type: session.taskType,
  training_mode: session.trainingMode,
  mode: session.mode,
  status: session.status,
  created_at: session.createdAt,
  updated_at: session.updatedAt,
  timer: serializeTimer(session.timing),
  questions: session.questionSet.map((question) => ({
    question_id: question.id,
    type: question.type,
    prompt: question.prompt,
    options: question.options,
    audio_segment_index: question.audioSegmentIndex
  })),
  submission: session.submission
    ? {
        submitted_at: session.submission.submittedAt,
        score_breakdown: {
          correct_count: session.submission.scoreBreakdown.correctCount,
          total_questions: session.submission.scoreBreakdown.totalQuestions,
          accuracy: session.submission.scoreBreakdown.accuracy,
          elapsed_seconds: session.submission.scoreBreakdown.elapsedSeconds,
          mode: session.submission.scoreBreakdown.mode
        },
        question_results: session.submission.questionResults.map((item) => ({
          question_id: item.questionId,
          type: item.type,
          user_answer: item.userAnswer,
          correct_answer: item.correctAnswer,
          is_correct: item.isCorrect,
          explanation: item.explanation,
          error_tags: item.errorTags,
          improvement_actions: item.improvementActions,
          evidence: item.evidence
            ? {
                sentence: item.evidence.sentence,
                paragraph: item.evidence.paragraph,
                span_start: item.evidence.spanStart,
                span_end: item.evidence.spanEnd
              }
            : undefined,
          dictation_feedback: item.dictationFeedback
            ? {
                expected_token_count: item.dictationFeedback.expectedTokenCount,
                answer_token_count: item.dictationFeedback.answerTokenCount,
                spelling_mismatches: item.dictationFeedback.spellingMismatches.map((mismatch) => ({
                  position: mismatch.position,
                  expected: mismatch.expected,
                  actual: mismatch.actual
                })),
                missing_chunks: item.dictationFeedback.missingChunks,
                extra_chunks: item.dictationFeedback.extraChunks
              }
            : undefined
        })),
        next_actions: session.submission.nextActions,
        dictation_summary: session.submission.dictationSummary
          ? {
              total_sentences: session.submission.dictationSummary.totalSentences,
              high_frequency_spelling_errors: session.submission.dictationSummary.highFrequencySpellingErrors.map(
                (item) => ({
                  token: item.token,
                  count: item.count
                })
              ),
              high_frequency_chunk_errors: session.submission.dictationSummary.highFrequencyChunkErrors.map((item) => ({
                chunk: item.chunk,
                count: item.count
              }))
            }
          : undefined
      }
    : undefined
});

const handleReadingModeError = (
  reply: { code: (statusCode: number) => { send: (payload: unknown) => void } },
  error: unknown
): boolean => {
  if (error instanceof Error && error.message === "READING_MODE_NOT_SUPPORTED") {
    reply.code(409).send(toError("READING_MODE_NOT_SUPPORTED", "Only reading session supports this operation"));
    return true;
  }
  if (error instanceof Error && error.message === "TIMER_NOT_AVAILABLE") {
    reply.code(409).send(toError("TIMER_NOT_AVAILABLE", "Timer resume only available in exam mode"));
    return true;
  }
  return false;
};

export const registerPracticeRoutes = async (
  app: FastifyInstance,
  services: {
    authService: AuthService;
    practiceService: PracticeService;
    practiceStateRepository?: PracticeStateRepository;
  }
): Promise<void> => {
  const flushPracticeStateRepository = async (
    reply: { code: (statusCode: number) => { send: (payload: { code: string; message: string }) => void } }
  ): Promise<boolean> => {
    try {
      await services.practiceStateRepository?.flush();
      return true;
    } catch {
      reply.code(503).send(toError("PRACTICE_STATE_STORAGE_UNAVAILABLE", "Practice state storage is unavailable"));
      return false;
    }
  };

  app.post("/v1/practice/sessions", { preHandler: authenticate(services.authService) }, async (request, reply) => {
    const parsed = createSessionSchema.safeParse(request.body);
    if (!parsed.success) {
      reply.code(400).send(
        toError(
          "VALIDATION_ERROR",
          parsed.error.issues.map((issue) => issue.message).join("; ")
        )
      );
      return;
    }

    const authRequest = request as AuthenticatedRequest;
    const session = services.practiceService.createSession({
      userId: authRequest.auth.userId,
      skill: parsed.data.skill,
      taskType: parsed.data.task_type,
      trainingMode: parsed.data.training_mode,
      timeLimitSeconds: parsed.data.time_limit_seconds
    });
    if (!(await flushPracticeStateRepository(reply))) {
      return;
    }
    reply.code(201).send(serializeSession(session));
  });

  app.get(
    "/v1/practice/sessions/:session_id",
    { preHandler: authenticate(services.authService) },
    async (request, reply) => {
      const parsed = sessionParamsSchema.safeParse(request.params);
      if (!parsed.success) {
        reply.code(400).send(toError("VALIDATION_ERROR", "session_id is invalid"));
        return;
      }

      const authRequest = request as AuthenticatedRequest;
      try {
        const session = services.practiceService.getSession(authRequest.auth.userId, parsed.data.session_id);
        if (!(await flushPracticeStateRepository(reply))) {
          return;
        }
        reply.code(200).send(serializeSession(session));
      } catch {
        reply.code(404).send(toError("SESSION_NOT_FOUND", "Practice session not found"));
      }
    }
  );

  app.post(
    "/v1/practice/sessions/:session_id/submit",
    { preHandler: authenticate(services.authService) },
    async (request, reply) => {
      const paramsParsed = sessionParamsSchema.safeParse(request.params);
      const bodyParsed = submitSchema.safeParse(request.body);
      if (!paramsParsed.success || !bodyParsed.success) {
        reply.code(400).send(toError("VALIDATION_ERROR", "submit payload is invalid"));
        return;
      }

      const authRequest = request as AuthenticatedRequest;
      try {
        const session = services.practiceService.submitSession({
          userId: authRequest.auth.userId,
          sessionId: paramsParsed.data.session_id,
          answers: bodyParsed.data.answers.map((item) => ({
            questionId: item.question_id,
            answer: item.answer
          }))
        });
        if (!(await flushPracticeStateRepository(reply))) {
          return;
        }

        reply.code(200).send(serializeSession(session));
      } catch {
        reply.code(404).send(toError("SESSION_NOT_FOUND", "Practice session not found"));
      }
    }
  );

  app.patch(
    "/v1/practice/sessions/:session_id/mode",
    { preHandler: authenticate(services.authService) },
    async (request, reply) => {
      const paramsParsed = sessionParamsSchema.safeParse(request.params);
      const bodyParsed = modeSwitchSchema.safeParse(request.body);
      if (!paramsParsed.success || !bodyParsed.success) {
        reply.code(400).send(toError("VALIDATION_ERROR", "mode switch payload is invalid"));
        return;
      }

      const authRequest = request as AuthenticatedRequest;
      try {
        const result = services.practiceService.switchReadingMode({
          userId: authRequest.auth.userId,
          sessionId: paramsParsed.data.session_id,
          trainingMode: bodyParsed.data.training_mode,
          timeLimitSeconds: bodyParsed.data.time_limit_seconds
        });
        if (!(await flushPracticeStateRepository(reply))) {
          return;
        }
        reply.code(200).send({
          ...serializeSession(result.session),
          recovered: result.recovered
        });
      } catch (error) {
        if (handleReadingModeError(reply, error)) {
          return;
        }
        reply.code(404).send(toError("SESSION_NOT_FOUND", "Practice session not found"));
      }
    }
  );

  app.get(
    "/v1/practice/sessions/:session_id/timer",
    { preHandler: authenticate(services.authService) },
    async (request, reply) => {
      const paramsParsed = sessionParamsSchema.safeParse(request.params);
      if (!paramsParsed.success) {
        reply.code(400).send(toError("VALIDATION_ERROR", "session_id is invalid"));
        return;
      }

      const authRequest = request as AuthenticatedRequest;
      try {
        const result = services.practiceService.getReadingTimerState(authRequest.auth.userId, paramsParsed.data.session_id);
        if (!(await flushPracticeStateRepository(reply))) {
          return;
        }
        reply.code(200).send({
          timer: serializeTimer(result.timing),
          recovered: result.recovered
        });
      } catch (error) {
        if (handleReadingModeError(reply, error)) {
          return;
        }
        reply.code(404).send(toError("SESSION_NOT_FOUND", "Practice session not found"));
      }
    }
  );

  app.post(
    "/v1/practice/sessions/:session_id/timer/pause",
    { preHandler: authenticate(services.authService) },
    async (request, reply) => {
      const paramsParsed = sessionParamsSchema.safeParse(request.params);
      if (!paramsParsed.success) {
        reply.code(400).send(toError("VALIDATION_ERROR", "session_id is invalid"));
        return;
      }

      const authRequest = request as AuthenticatedRequest;
      try {
        const timer = services.practiceService.pauseReadingTimer(authRequest.auth.userId, paramsParsed.data.session_id);
        if (!(await flushPracticeStateRepository(reply))) {
          return;
        }
        reply.code(200).send({
          timer: serializeTimer(timer)
        });
      } catch (error) {
        if (handleReadingModeError(reply, error)) {
          return;
        }
        reply.code(404).send(toError("SESSION_NOT_FOUND", "Practice session not found"));
      }
    }
  );

  app.post(
    "/v1/practice/sessions/:session_id/timer/resume",
    { preHandler: authenticate(services.authService) },
    async (request, reply) => {
      const paramsParsed = sessionParamsSchema.safeParse(request.params);
      if (!paramsParsed.success) {
        reply.code(400).send(toError("VALIDATION_ERROR", "session_id is invalid"));
        return;
      }

      const authRequest = request as AuthenticatedRequest;
      try {
        const timer = services.practiceService.resumeReadingTimer(authRequest.auth.userId, paramsParsed.data.session_id);
        if (!(await flushPracticeStateRepository(reply))) {
          return;
        }
        reply.code(200).send({
          timer: serializeTimer(timer)
        });
      } catch (error) {
        if (handleReadingModeError(reply, error)) {
          return;
        }
        reply.code(404).send(toError("SESSION_NOT_FOUND", "Practice session not found"));
      }
    }
  );

  app.post(
    "/v1/practice/sessions/:session_id/timer/recover",
    { preHandler: authenticate(services.authService) },
    async (request, reply) => {
      const paramsParsed = sessionParamsSchema.safeParse(request.params);
      if (!paramsParsed.success) {
        reply.code(400).send(toError("VALIDATION_ERROR", "session_id is invalid"));
        return;
      }

      const authRequest = request as AuthenticatedRequest;
      try {
        const timer = services.practiceService.recoverReadingTimer(authRequest.auth.userId, paramsParsed.data.session_id);
        if (!(await flushPracticeStateRepository(reply))) {
          return;
        }
        reply.code(200).send({
          timer: serializeTimer(timer),
          recovered: true
        });
      } catch (error) {
        if (handleReadingModeError(reply, error)) {
          return;
        }
        reply.code(404).send(toError("SESSION_NOT_FOUND", "Practice session not found"));
      }
    }
  );

  app.post(
    "/v1/practice/sessions/:session_id/retry-queue",
    { preHandler: authenticate(services.authService) },
    async (request, reply) => {
      const paramsParsed = sessionParamsSchema.safeParse(request.params);
      const bodyParsed = queueSchema.safeParse(request.body ?? {});
      if (!paramsParsed.success || !bodyParsed.success) {
        reply.code(400).send(toError("VALIDATION_ERROR", "retry queue payload is invalid"));
        return;
      }

      const authRequest = request as AuthenticatedRequest;
      try {
        const items = services.practiceService.addRetryQueue({
          userId: authRequest.auth.userId,
          sessionId: paramsParsed.data.session_id,
          questionIds: bodyParsed.data.question_ids
        });
        if (!(await flushPracticeStateRepository(reply))) {
          return;
        }
        reply.code(200).send({
          items: items.map((item) => ({
            queue_item_id: item.id,
            skill: item.skill,
            source_session_id: item.sourceSessionId,
            question_id: item.questionId,
            status: item.status,
            error_tags: item.errorTags,
            improvement_actions: item.improvementActions,
            proficiency_before: item.proficiencyBefore,
            proficiency_after: item.proficiencyAfter,
            created_at: item.createdAt,
            updated_at: item.updatedAt,
            completed_at: item.completedAt
          }))
        });
      } catch (error) {
        if (error instanceof Error && error.message === "SESSION_NOT_SUBMITTED") {
          reply.code(409).send(toError("SESSION_NOT_SUBMITTED", "Submit session before adding retry queue"));
          return;
        }
        reply.code(404).send(toError("SESSION_NOT_FOUND", "Practice session not found"));
      }
    }
  );

  app.get("/v1/practice/retry-queue", { preHandler: authenticate(services.authService) }, async (request, reply) => {
    const authRequest = request as AuthenticatedRequest;
    const items = services.practiceService.getRetryQueue(authRequest.auth.userId);
    reply.code(200).send({
      items: items.map((item) => ({
        queue_item_id: item.id,
        skill: item.skill,
        source_session_id: item.sourceSessionId,
        question_id: item.questionId,
        status: item.status,
        error_tags: item.errorTags,
        improvement_actions: item.improvementActions,
        proficiency_before: item.proficiencyBefore,
        proficiency_after: item.proficiencyAfter,
        created_at: item.createdAt,
        updated_at: item.updatedAt,
        completed_at: item.completedAt
      }))
    });
  });

  app.post(
    "/v1/practice/retry-queue/:queue_item_id/start",
    { preHandler: authenticate(services.authService) },
    async (request, reply) => {
      const paramsParsed = queueParamsSchema.safeParse(request.params);
      if (!paramsParsed.success) {
        reply.code(400).send(toError("VALIDATION_ERROR", "queue_item_id is invalid"));
        return;
      }

      const authRequest = request as AuthenticatedRequest;
      try {
        const session = services.practiceService.startRetrySession({
          userId: authRequest.auth.userId,
          queueItemId: paramsParsed.data.queue_item_id
        });
        if (!(await flushPracticeStateRepository(reply))) {
          return;
        }
        reply.code(201).send(serializeSession(session));
      } catch (error) {
        if (error instanceof Error && error.message === "QUEUE_ITEM_COMPLETED") {
          reply.code(409).send(toError("QUEUE_ITEM_COMPLETED", "Queue item is already completed"));
          return;
        }
        reply.code(404).send(toError("QUEUE_ITEM_NOT_FOUND", "Retry queue item not found"));
      }
    }
  );

  app.get(
    "/v1/practice/sessions/:session_id/playback",
    { preHandler: authenticate(services.authService) },
    async (request, reply) => {
      const paramsParsed = sessionParamsSchema.safeParse(request.params);
      if (!paramsParsed.success) {
        reply.code(400).send(toError("VALIDATION_ERROR", "session_id is invalid"));
        return;
      }

      const authRequest = request as AuthenticatedRequest;
      try {
        const state = services.practiceService.getPlaybackState(authRequest.auth.userId, paramsParsed.data.session_id);
        if (!(await flushPracticeStateRepository(reply))) {
          return;
        }
        reply.code(200).send({
          playback_rate: state.playbackRate,
          segment_index: state.segmentIndex,
          position_seconds: state.positionSeconds,
          replay_wrong_only: state.replayWrongOnly,
          last_replayed_question_id: state.lastReplayedQuestionId,
          last_recovered_at: state.lastRecoveredAt
        });
      } catch (error) {
        if (error instanceof Error && error.message === "PLAYBACK_NOT_SUPPORTED") {
          reply.code(409).send(toError("PLAYBACK_NOT_SUPPORTED", "Playback is only available for listening sessions"));
          return;
        }
        reply.code(404).send(toError("SESSION_NOT_FOUND", "Practice session not found"));
      }
    }
  );

  app.patch(
    "/v1/practice/sessions/:session_id/playback",
    { preHandler: authenticate(services.authService) },
    async (request, reply) => {
      const paramsParsed = sessionParamsSchema.safeParse(request.params);
      const bodyParsed = updatePlaybackSchema.safeParse(request.body);
      if (!paramsParsed.success || !bodyParsed.success) {
        reply.code(400).send(toError("VALIDATION_ERROR", "playback payload is invalid"));
        return;
      }

      const authRequest = request as AuthenticatedRequest;
      try {
        const result = services.practiceService.updatePlaybackState({
          userId: authRequest.auth.userId,
          sessionId: paramsParsed.data.session_id,
          playbackRate: bodyParsed.data.playback_rate,
          segmentIndex: bodyParsed.data.segment_index,
          positionSeconds: bodyParsed.data.position_seconds,
          replayWrongOnly: bodyParsed.data.replay_wrong_only,
          replayQuestionId: bodyParsed.data.replay_question_id
        });
        if (!(await flushPracticeStateRepository(reply))) {
          return;
        }

        reply.code(200).send({
          playback_rate: result.playbackState.playbackRate,
          segment_index: result.playbackState.segmentIndex,
          position_seconds: result.playbackState.positionSeconds,
          replay_wrong_only: result.playbackState.replayWrongOnly,
          last_replayed_question_id: result.playbackState.lastReplayedQuestionId,
          last_recovered_at: result.playbackState.lastRecoveredAt,
          recovered: result.recovered
        });
      } catch (error) {
        if (error instanceof Error && error.message === "PLAYBACK_NOT_SUPPORTED") {
          reply.code(409).send(toError("PLAYBACK_NOT_SUPPORTED", "Playback is only available for listening sessions"));
          return;
        }
        reply.code(404).send(toError("SESSION_NOT_FOUND", "Practice session not found"));
      }
    }
  );
};
