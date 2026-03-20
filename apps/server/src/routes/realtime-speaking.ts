import type { FastifyInstance } from "fastify";
import { z } from "zod";
import type { AuthService } from "../domain/auth-service.js";
import type { SpeakingStateRepository } from "../domain/speaking-state-repository.js";
import type { SpeakingRealtimeService } from "../domain/speaking-realtime-service.js";
import { authenticate, type AuthenticatedRequest } from "../middleware/auth.js";

const sessionParamsSchema = z.object({
  session_id: z.string().uuid()
});

const pronunciationTaskParamsSchema = z.object({
  session_id: z.string().uuid(),
  task_id: z.string().trim().min(3).max(64)
});

const createSessionSchema = z.object({
  topic: z.string().trim().min(1).max(300).optional(),
  task_type: z.enum(["core_training", "role_play"]).optional(),
  scenario_type: z
    .enum(["campus_service", "travel_support", "job_interview", "academic_tutor", "community_event"])
    .optional()
});

const partSwitchSchema = z.object({
  part_no: z.union([z.literal(1), z.literal(2), z.literal(3)])
});

const trackPronunciationTaskSchema = z.object({
  status: z.enum(["todo", "doing", "done"])
});

const wsQuerySchema = z.object({
  session_id: z.string().uuid(),
  resume_token: z.string().min(20),
  access_token: z.string().min(20)
});

const toError = (code: string, message: string): { code: string; message: string } => ({
  code,
  message
});

const serializePronunciationFeedback = (
  feedback: {
    turns: Array<{
      turnNo: number;
      partNo: 1 | 2 | 3;
      wordIssues: Array<{
        word: string;
        position: number;
        phoneme: string;
        severity: "low" | "medium" | "high";
        issueTag: string;
        suggestion: string;
        replaySegmentId: string;
      }>;
      phonemeIssues: Array<{
        phoneme: string;
        issueTag: string;
        suggestion: string;
        severity: "low" | "medium" | "high";
        count: number;
        exampleWords: string[];
      }>;
      replaySegments: Array<{
        segmentId: string;
        turnNo: number;
        startMs: number;
        endMs: number;
        referenceText: string;
        userText: string;
        referenceAudioUrl: string;
        userAudioUrl: string;
      }>;
    }>;
    hotspotWords: Array<{
      word: string;
      count: number;
      maxSeverity: "low" | "medium" | "high";
    }>;
    hotspotPhonemes: Array<{
      phoneme: string;
      issueTag: string;
      suggestion: string;
      severity: "low" | "medium" | "high";
      count: number;
      exampleWords: string[];
    }>;
    tasks: Array<{
      taskId: string;
      title: string;
      description: string;
      phoneme: string;
      status: "todo" | "doing" | "done";
      linkedTurnNos: number[];
    }>;
  }
) => ({
  turns: feedback.turns.map((turn) => ({
    turn_no: turn.turnNo,
    part_no: turn.partNo,
    word_issues: turn.wordIssues.map((item) => ({
      word: item.word,
      position: item.position,
      phoneme: item.phoneme,
      severity: item.severity,
      issue_tag: item.issueTag,
      suggestion: item.suggestion,
      replay_segment_id: item.replaySegmentId
    })),
    phoneme_issues: turn.phonemeIssues.map((item) => ({
      phoneme: item.phoneme,
      issue_tag: item.issueTag,
      suggestion: item.suggestion,
      severity: item.severity,
      count: item.count,
      example_words: item.exampleWords
    })),
    replay_segments: turn.replaySegments.map((item) => ({
      segment_id: item.segmentId,
      turn_no: item.turnNo,
      start_ms: item.startMs,
      end_ms: item.endMs,
      reference_text: item.referenceText,
      user_text: item.userText,
      reference_audio_url: item.referenceAudioUrl,
      user_audio_url: item.userAudioUrl
    }))
  })),
  hotspot_words: feedback.hotspotWords.map((item) => ({
    word: item.word,
    count: item.count,
    max_severity: item.maxSeverity
  })),
  hotspot_phonemes: feedback.hotspotPhonemes.map((item) => ({
    phoneme: item.phoneme,
    issue_tag: item.issueTag,
    suggestion: item.suggestion,
    severity: item.severity,
    count: item.count,
    example_words: item.exampleWords
  })),
  tasks: feedback.tasks.map((item) => ({
    task_id: item.taskId,
    title: item.title,
    description: item.description,
    phoneme: item.phoneme,
    status: item.status,
    linked_turn_nos: item.linkedTurnNos
  }))
});

const safeSend = (socket: { send: (raw: string) => void }, payload: Record<string, unknown>): void => {
  socket.send(JSON.stringify(payload));
};

export const registerRealtimeSpeakingRoutes = async (
  app: FastifyInstance,
  services: {
    authService: AuthService;
    speakingRealtimeService: SpeakingRealtimeService;
    speakingStateRepository?: SpeakingStateRepository;
  }
): Promise<void> => {
  const flushSpeakingStateRepository = async (
    reply: { code: (statusCode: number) => { send: (payload: { code: string; message: string }) => void } }
  ): Promise<boolean> => {
    try {
      await services.speakingStateRepository?.flush();
      return true;
    } catch {
      reply.code(503).send(toError("SPEAKING_STATE_STORAGE_UNAVAILABLE", "Speaking state storage is unavailable"));
      return false;
    }
  };

  app.get("/v1/realtime/speaking/scenarios", { preHandler: authenticate(services.authService) }, async (_, reply) => {
    const scenarios = services.speakingRealtimeService.getRolePlayScenarios();
    reply.code(200).send({
      items: scenarios.map((item) => ({
        scenario_type: item.scenarioType,
        title: item.title,
        opening_prompt: item.openingPrompt,
        npc_role: item.npcRole
      }))
    });
  });

  app.post(
    "/v1/realtime/speaking/sessions",
    { preHandler: authenticate(services.authService) },
    async (request, reply) => {
      const parsed = createSessionSchema.safeParse(request.body ?? {});
      if (!parsed.success) {
        reply.code(400).send(toError("VALIDATION_ERROR", "topic is invalid"));
        return;
      }
      if (parsed.data.scenario_type && parsed.data.task_type !== "role_play") {
        reply.code(400).send(toError("VALIDATION_ERROR", "scenario_type requires task_type=role_play"));
        return;
      }

      const authRequest = request as AuthenticatedRequest;
      const session = services.speakingRealtimeService.createSession(authRequest.auth.userId, {
        topic: parsed.data.topic,
        taskType: parsed.data.task_type,
        scenarioType: parsed.data.scenario_type
      });
      if (!(await flushSpeakingStateRepository(reply))) {
        return;
      }
      reply.code(201).send({
        session_id: session.id,
        status: session.status,
        task_type: session.taskType,
        scenario_type: session.scenarioType,
        resume_token: session.resumeToken,
        resume_until: session.resumeUntil,
        current_part: session.currentPart,
        topic: session.topic,
        source_session_id: session.sourceSessionId,
        created_at: session.createdAt,
        updated_at: session.updatedAt
      });
    }
  );

  app.post(
    "/v1/realtime/speaking/sessions/:session_id/retry",
    { preHandler: authenticate(services.authService) },
    async (request, reply) => {
      const parsed = sessionParamsSchema.safeParse(request.params);
      if (!parsed.success) {
        reply.code(400).send(toError("VALIDATION_ERROR", "session_id is invalid"));
        return;
      }

      const authRequest = request as AuthenticatedRequest;
      try {
        const session = services.speakingRealtimeService.createRetrySession(
          authRequest.auth.userId,
          parsed.data.session_id
        );
        if (!(await flushSpeakingStateRepository(reply))) {
          return;
        }
        reply.code(201).send({
          session_id: session.id,
          status: session.status,
          task_type: session.taskType,
          scenario_type: session.scenarioType,
          resume_token: session.resumeToken,
          resume_until: session.resumeUntil,
          current_part: session.currentPart,
          topic: session.topic,
          source_session_id: session.sourceSessionId,
          created_at: session.createdAt,
          updated_at: session.updatedAt
        });
      } catch (error) {
        if (error instanceof Error && error.message === "SOURCE_SESSION_NOT_ENDED") {
          reply.code(409).send(toError("SOURCE_SESSION_NOT_ENDED", "Source speaking session must be ended first"));
          return;
        }
        reply.code(404).send(toError("SESSION_NOT_FOUND", "Speaking session not found"));
      }
    }
  );

  app.get(
    "/v1/realtime/speaking/sessions/:session_id",
    { preHandler: authenticate(services.authService) },
    async (request, reply) => {
      const parsed = sessionParamsSchema.safeParse(request.params);
      if (!parsed.success) {
        reply.code(400).send(toError("VALIDATION_ERROR", "session_id is invalid"));
        return;
      }

      const authRequest = request as AuthenticatedRequest;
      try {
        const session = services.speakingRealtimeService.getSession(authRequest.auth.userId, parsed.data.session_id);
        const summary = services.speakingRealtimeService.getSessionSummary(
          authRequest.auth.userId,
          parsed.data.session_id
        );
        reply.code(200).send({
          session_id: session.id,
          status: session.status,
          task_type: session.taskType,
          scenario_type: session.scenarioType,
          resume_until: session.resumeUntil,
          current_part: session.currentPart,
          topic: session.topic,
          source_session_id: session.sourceSessionId,
          connected_at: session.connectedAt,
          disconnected_at: session.disconnectedAt,
          ended_at: session.endedAt,
          turns: session.conversationTurns,
          summary,
          created_at: session.createdAt,
          updated_at: session.updatedAt
        });
      } catch {
        reply.code(404).send(toError("SESSION_NOT_FOUND", "Speaking session not found"));
      }
    }
  );

  app.patch(
    "/v1/realtime/speaking/sessions/:session_id/part",
    { preHandler: authenticate(services.authService) },
    async (request, reply) => {
      const paramsParsed = sessionParamsSchema.safeParse(request.params);
      const bodyParsed = partSwitchSchema.safeParse(request.body);
      if (!paramsParsed.success || !bodyParsed.success) {
        reply.code(400).send(toError("VALIDATION_ERROR", "part switch payload is invalid"));
        return;
      }

      const authRequest = request as AuthenticatedRequest;
      try {
        const session = services.speakingRealtimeService.switchPart({
          userId: authRequest.auth.userId,
          sessionId: paramsParsed.data.session_id,
          partNo: bodyParsed.data.part_no
        });
        if (!(await flushSpeakingStateRepository(reply))) {
          return;
        }
        reply.code(200).send({
          session_id: session.id,
          current_part: session.currentPart,
          status: session.status,
          updated_at: session.updatedAt
        });
      } catch (error) {
        if (error instanceof Error && error.message === "SESSION_ENDED") {
          reply.code(409).send(toError("SESSION_ENDED", "Speaking session already ended"));
          return;
        }
        reply.code(404).send(toError("SESSION_NOT_FOUND", "Speaking session not found"));
      }
    }
  );

  app.get(
    "/v1/realtime/speaking/sessions/:session_id/comparison",
    { preHandler: authenticate(services.authService) },
    async (request, reply) => {
      const parsed = sessionParamsSchema.safeParse(request.params);
      if (!parsed.success) {
        reply.code(400).send(toError("VALIDATION_ERROR", "session_id is invalid"));
        return;
      }

      const authRequest = request as AuthenticatedRequest;
      try {
        const comparison = services.speakingRealtimeService.getComparison(
          authRequest.auth.userId,
          parsed.data.session_id
        );
        reply.code(200).send({
          source_session_id: comparison.sourceSessionId,
          retry_session_id: comparison.retrySessionId,
          source_scores: comparison.sourceScores,
          retry_scores: comparison.retryScores,
          delta: comparison.delta,
          next_actions: comparison.nextActions
        });
      } catch (error) {
        if (error instanceof Error && error.message === "NOT_RETRY_SESSION") {
          reply.code(409).send(toError("NOT_RETRY_SESSION", "Comparison is available for retry sessions only"));
          return;
        }
        reply.code(404).send(toError("SESSION_NOT_FOUND", "Speaking session not found"));
      }
    }
  );

  app.get(
    "/v1/realtime/speaking/sessions/:session_id/pronunciation-feedback",
    { preHandler: authenticate(services.authService) },
    async (request, reply) => {
      const parsed = sessionParamsSchema.safeParse(request.params);
      if (!parsed.success) {
        reply.code(400).send(toError("VALIDATION_ERROR", "session_id is invalid"));
        return;
      }

      const authRequest = request as AuthenticatedRequest;
      try {
        const feedback = services.speakingRealtimeService.getPronunciationFeedback(
          authRequest.auth.userId,
          parsed.data.session_id
        );
        reply.code(200).send(serializePronunciationFeedback(feedback));
      } catch {
        reply.code(404).send(toError("SESSION_NOT_FOUND", "Speaking session not found"));
      }
    }
  );

  app.post(
    "/v1/realtime/speaking/sessions/:session_id/pronunciation-feedback/tasks/:task_id/track",
    { preHandler: authenticate(services.authService) },
    async (request, reply) => {
      const paramsParsed = pronunciationTaskParamsSchema.safeParse(request.params);
      const bodyParsed = trackPronunciationTaskSchema.safeParse(request.body);
      if (!paramsParsed.success || !bodyParsed.success) {
        reply.code(400).send(toError("VALIDATION_ERROR", "task tracking payload is invalid"));
        return;
      }

      const authRequest = request as AuthenticatedRequest;
      try {
        const task = services.speakingRealtimeService.trackPronunciationTask({
          userId: authRequest.auth.userId,
          sessionId: paramsParsed.data.session_id,
          taskId: paramsParsed.data.task_id,
          status: bodyParsed.data.status
        });
        if (!(await flushSpeakingStateRepository(reply))) {
          return;
        }
        reply.code(200).send({
          task_id: task.taskId,
          status: task.status,
          linked_turn_nos: task.linkedTurnNos
        });
      } catch (error) {
        if (error instanceof Error && error.message === "TASK_NOT_FOUND") {
          reply.code(404).send(toError("TASK_NOT_FOUND", "Pronunciation task not found"));
          return;
        }
        reply.code(404).send(toError("SESSION_NOT_FOUND", "Speaking session not found"));
      }
    }
  );

  app.get(
    "/v1/realtime/speaking/sessions/:session_id/events",
    { preHandler: authenticate(services.authService) },
    async (request, reply) => {
      const parsed = sessionParamsSchema.safeParse(request.params);
      if (!parsed.success) {
        reply.code(400).send(toError("VALIDATION_ERROR", "session_id is invalid"));
        return;
      }

      const authRequest = request as AuthenticatedRequest;
      try {
        const items = services.speakingRealtimeService.getSessionEvents(authRequest.auth.userId, parsed.data.session_id);
        reply.code(200).send({
          items: items.map((item) => ({
            id: item.id,
            type: item.type,
            payload: item.payload,
            created_at: item.createdAt
          }))
        });
      } catch {
        reply.code(404).send(toError("SESSION_NOT_FOUND", "Speaking session not found"));
      }
    }
  );

  app.post(
    "/v1/realtime/speaking/sessions/:session_id/end",
    { preHandler: authenticate(services.authService) },
    async (request, reply) => {
      const parsed = sessionParamsSchema.safeParse(request.params);
      if (!parsed.success) {
        reply.code(400).send(toError("VALIDATION_ERROR", "session_id is invalid"));
        return;
      }

      const authRequest = request as AuthenticatedRequest;
      try {
        const session = services.speakingRealtimeService.endSession({
          userId: authRequest.auth.userId,
          sessionId: parsed.data.session_id
        });
        if (!(await flushSpeakingStateRepository(reply))) {
          return;
        }
        const summary = services.speakingRealtimeService.getSessionSummary(
          authRequest.auth.userId,
          parsed.data.session_id
        );
        reply.code(200).send({
          session_id: session.id,
          status: session.status,
          ended_at: session.endedAt,
          turns: session.conversationTurns,
          summary
        });
      } catch {
        reply.code(404).send(toError("SESSION_NOT_FOUND", "Speaking session not found"));
      }
    }
  );

  app.get("/v1/realtime/speaking", { websocket: true }, (socket, request) => {
    const queryParsed = wsQuerySchema.safeParse(request.query);
    if (!queryParsed.success) {
      safeSend(socket, {
        type: "error",
        code: "VALIDATION_ERROR",
        message: "session_id/resume_token/access_token is required"
      });
      socket.close(1008, "validation_failed");
      return;
    }

    let userId: string;
    try {
      const payload = services.authService.verifyAccessToken(queryParsed.data.access_token);
      userId = payload.userId;
    } catch {
      safeSend(socket, {
        type: "error",
        code: "UNAUTHORIZED",
        message: "Invalid access token"
      });
      socket.close(1008, "unauthorized");
      return;
    }

    try {
      const connected = services.speakingRealtimeService.connectSession({
        userId,
        sessionId: queryParsed.data.session_id,
        resumeToken: queryParsed.data.resume_token
      });
      void services.speakingStateRepository?.flush();

      safeSend(socket, {
        type: connected.resumed ? "session_resume" : "session_start",
        session_id: connected.session.id,
        task_type: connected.session.taskType,
        scenario_type: connected.session.scenarioType,
        resume_until: connected.session.resumeUntil,
        turns: connected.session.conversationTurns,
        current_part: connected.session.currentPart,
        topic: connected.session.topic
      });
    } catch (error) {
      const message =
        error instanceof Error && error.message === "RESUME_WINDOW_EXPIRED"
          ? "Resume window expired"
          : "Session connect failed";
      safeSend(socket, {
        type: "error",
        code: "SESSION_CONNECT_FAILED",
        message
      });
      socket.close(1008, "session_connect_failed");
      return;
    }

    let closedByServer = false;

    const heartbeatMonitor = setInterval(() => {
      const timeoutResult = services.speakingRealtimeService.handleHeartbeatTimeout(queryParsed.data.session_id);
      if (timeoutResult.timedOut) {
        safeSend(socket, {
          type: "session_timeout",
          session_id: queryParsed.data.session_id
        });
        closedByServer = true;
        socket.close(1011, "heartbeat_timeout");
        clearInterval(heartbeatMonitor);
        return;
      }

      safeSend(socket, {
        type: "heartbeat",
        session_id: queryParsed.data.session_id,
        server_time: new Date().toISOString()
      });
    }, 20000);

    socket.on("message", (raw: unknown) => {
      try {
        const text = typeof raw === "string" ? raw : Buffer.isBuffer(raw) ? raw.toString() : String(raw);
        const payload = JSON.parse(text) as {
          type?: string;
          text?: string;
          part_no?: 1 | 2 | 3;
        };

        if (payload.type === "heartbeat") {
          services.speakingRealtimeService.heartbeat({
            userId,
            sessionId: queryParsed.data.session_id
          });
          void services.speakingStateRepository?.flush();
          safeSend(socket, {
            type: "heartbeat_ack",
            session_id: queryParsed.data.session_id
          });
          return;
        }

        if (payload.type === "part_switch") {
          if (payload.part_no !== 1 && payload.part_no !== 2 && payload.part_no !== 3) {
            safeSend(socket, {
              type: "error",
              code: "INVALID_PART",
              message: "part_no must be 1/2/3"
            });
            return;
          }

          const session = services.speakingRealtimeService.switchPart({
            userId,
            sessionId: queryParsed.data.session_id,
            partNo: payload.part_no
          });
          void services.speakingStateRepository?.flush();

          safeSend(socket, {
            type: "part_switch",
            session_id: queryParsed.data.session_id,
            current_part: session.currentPart
          });
          return;
        }

        if (payload.type === "partial_transcript") {
          if (!payload.text || payload.text.trim().length === 0) {
            safeSend(socket, {
              type: "error",
              code: "EMPTY_TRANSCRIPT",
              message: "text is required"
            });
            return;
          }

          const result = services.speakingRealtimeService.recordTranscript({
            userId,
            sessionId: queryParsed.data.session_id,
            text: payload.text,
            partNo: payload.part_no
          });
          void services.speakingStateRepository?.flush();

          safeSend(socket, {
            type: "coach_question",
            session_id: queryParsed.data.session_id,
            turn_no: result.turnNo,
            part_no: result.partNo,
            text: result.coachQuestion
          });
          safeSend(socket, {
            type: "score_update",
            session_id: queryParsed.data.session_id,
            turn_no: result.turnNo,
            part_no: result.partNo,
            ...result.scoreUpdate,
            suggestions: result.suggestions,
            latency_ms: result.latencyMs,
            fallback_triggered: result.fallbackTriggered,
            pronunciation_feedback: {
              word_issues: result.pronunciationFeedback.wordIssues.map((item) => ({
                word: item.word,
                position: item.position,
                phoneme: item.phoneme,
                severity: item.severity,
                issue_tag: item.issueTag,
                suggestion: item.suggestion,
                replay_segment_id: item.replaySegmentId
              })),
              phoneme_issues: result.pronunciationFeedback.phonemeIssues.map((item) => ({
                phoneme: item.phoneme,
                issue_tag: item.issueTag,
                suggestion: item.suggestion,
                severity: item.severity,
                count: item.count,
                example_words: item.exampleWords
              })),
              replay_segments: result.pronunciationFeedback.replaySegments.map((item) => ({
                segment_id: item.segmentId,
                turn_no: item.turnNo,
                start_ms: item.startMs,
                end_ms: item.endMs,
                reference_text: item.referenceText,
                user_text: item.userText,
                reference_audio_url: item.referenceAudioUrl,
                user_audio_url: item.userAudioUrl
              })),
              task_recommendations: result.pronunciationFeedback.taskRecommendations.map((item) => ({
                task_id: item.taskId,
                title: item.title,
                description: item.description,
                phoneme: item.phoneme,
                status: item.status,
                linked_turn_nos: item.linkedTurnNos
              }))
            }
          });
          return;
        }

        if (payload.type === "session_end") {
          const session = services.speakingRealtimeService.endSession({
            userId,
            sessionId: queryParsed.data.session_id
          });
          void services.speakingStateRepository?.flush();
          const summary = services.speakingRealtimeService.getSessionSummary(userId, queryParsed.data.session_id);
          safeSend(socket, {
            type: "session_end",
            session_id: session.id,
            turns: session.conversationTurns,
            summary
          });
          closedByServer = true;
          socket.close(1000, "session_end");
          clearInterval(heartbeatMonitor);
          return;
        }

        safeSend(socket, {
          type: "error",
          code: "UNSUPPORTED_EVENT",
          message: "Unsupported websocket event type"
        });
      } catch {
        safeSend(socket, {
          type: "error",
          code: "BAD_PAYLOAD",
          message: "Payload must be a valid JSON object"
        });
      }
    });

    socket.on("close", () => {
      clearInterval(heartbeatMonitor);
      if (closedByServer) {
        return;
      }

      try {
        const session = services.speakingRealtimeService.getSession(userId, queryParsed.data.session_id);
        if (session.status === "connected") {
          services.speakingRealtimeService.disconnectSession({
            userId,
            sessionId: queryParsed.data.session_id,
            reason: "client_disconnected"
          });
          void services.speakingStateRepository?.flush();
        }
      } catch {
        // ignore
      }
    });
  });
};
