import type { FastifyInstance } from "fastify";
import { z } from "zod";
import type { AuthService } from "../domain/auth-service.js";
import type { LearnerStateRepository } from "../domain/learner-state-repository.js";
import type { ProgressService } from "../domain/progress-service.js";
import { authenticate, type AuthenticatedRequest } from "../middleware/auth.js";

const syncSchema = z.object({
  device_id: z.string().trim().min(1).max(128).optional(),
  client_updated_at: z.string().datetime(),
  progress: z.object({
    listening_completed: z.number().int().min(0),
    speaking_completed: z.number().int().min(0),
    reading_completed: z.number().int().min(0),
    writing_completed: z.number().int().min(0),
    total_study_minutes: z.number().int().min(0),
    streak_days: z.number().int().min(0)
  })
});

const toError = (code: string, message: string): { code: string; message: string } => ({
  code,
  message
});

const serializeProgress = (snapshot: {
  listeningCompleted: number;
  speakingCompleted: number;
  readingCompleted: number;
  writingCompleted: number;
  totalStudyMinutes: number;
  streakDays: number;
  serverVersion: number;
  updatedAt: string;
  lastSyncedDeviceId?: string;
}) => ({
  listening_completed: snapshot.listeningCompleted,
  speaking_completed: snapshot.speakingCompleted,
  reading_completed: snapshot.readingCompleted,
  writing_completed: snapshot.writingCompleted,
  total_study_minutes: snapshot.totalStudyMinutes,
  streak_days: snapshot.streakDays,
  server_version: snapshot.serverVersion,
  updated_at: snapshot.updatedAt,
  last_synced_device_id: snapshot.lastSyncedDeviceId
});

export const registerProgressRoutes = async (
  app: FastifyInstance,
  services: {
    authService: AuthService;
    progressService: ProgressService;
    learnerStateRepository?: LearnerStateRepository;
  }
): Promise<void> => {
  app.get("/v1/users/me/progress", { preHandler: authenticate(services.authService) }, async (request, reply) => {
    const authRequest = request as AuthenticatedRequest;
    const progress = services.progressService.getProgress(authRequest.auth.userId);
    try {
      await services.learnerStateRepository?.flush();
    } catch {
      reply.code(503).send(toError("LEARNER_STATE_STORAGE_UNAVAILABLE", "Learner state storage is unavailable"));
      return;
    }
    reply.code(200).send(serializeProgress(progress));
  });

  app.post("/v1/users/me/progress/sync", { preHandler: authenticate(services.authService) }, async (request, reply) => {
    const parsed = syncSchema.safeParse(request.body);
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

    try {
      const result = services.progressService.syncProgress({
        userId: authRequest.auth.userId,
        deviceId: parsed.data.device_id,
        clientUpdatedAt: parsed.data.client_updated_at,
        progress: {
          listeningCompleted: parsed.data.progress.listening_completed,
          speakingCompleted: parsed.data.progress.speaking_completed,
          readingCompleted: parsed.data.progress.reading_completed,
          writingCompleted: parsed.data.progress.writing_completed,
          totalStudyMinutes: parsed.data.progress.total_study_minutes,
          streakDays: parsed.data.progress.streak_days
        }
      });
      try {
        await services.learnerStateRepository?.flush();
      } catch {
        reply.code(503).send(toError("LEARNER_STATE_STORAGE_UNAVAILABLE", "Learner state storage is unavailable"));
        return;
      }

      reply.code(200).send({
        ...serializeProgress(result.snapshot),
        stale_request: result.staleRequest,
        conflict_count: result.conflictCount
      });
    } catch (error) {
      if (error instanceof Error && error.message === "INVALID_CLIENT_TIMESTAMP") {
        reply.code(400).send(toError("VALIDATION_ERROR", "client_updated_at is invalid"));
        return;
      }
      throw error;
    }
  });

  app.get(
    "/v1/users/me/progress/conflicts",
    { preHandler: authenticate(services.authService) },
    async (request, reply) => {
      const authRequest = request as AuthenticatedRequest;
      const items = services.progressService.getConflictHistory(authRequest.auth.userId);
      reply.code(200).send({
        items: items.map((item) => ({
          id: item.id,
          field: item.field,
          incoming_value: item.incomingValue,
          server_value: item.serverValue,
          client_updated_at: item.clientUpdatedAt,
          server_updated_at: item.serverUpdatedAt,
          created_at: item.createdAt,
          device_id: item.deviceId
        }))
      });
    }
  );
};
