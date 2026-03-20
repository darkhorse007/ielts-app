import type { FastifyInstance } from "fastify";
import { z } from "zod";
import type { AuthAccountRepository } from "../domain/auth-account-repository.js";
import type { AuthService } from "../domain/auth-service.js";
import type { AccountService } from "../domain/account-service.js";
import type { LearnerStateRepository } from "../domain/learner-state-repository.js";
import { authenticate, type AuthenticatedRequest } from "../middleware/auth.js";

const deleteSchema = z.object({
  confirm_text: z.literal("DELETE")
});

const exportSchema = z.object({
  format: z.enum(["json"]).default("json")
});

const toError = (code: string, message: string): { code: string; message: string } => ({
  code,
  message
});

export const registerAccountRoutes = async (
  app: FastifyInstance,
  services: {
    authService: AuthService;
    accountService: AccountService;
    authAccountRepository?: AuthAccountRepository;
    learnerStateRepository?: LearnerStateRepository;
  }
): Promise<void> => {
  app.get("/v1/users/me/profile", { preHandler: authenticate(services.authService) }, async (request, reply) => {
    const authRequest = request as AuthenticatedRequest;
    try {
      const profile = services.accountService.getProfile(authRequest.auth.userId);
      reply.code(200).send({
        id: profile.id,
        email: profile.email,
        phone: profile.phone,
        status: profile.status,
        deletion_requested_at: profile.deletionRequestedAt,
        deleted_at: profile.deletedAt,
        created_at: profile.createdAt,
        updated_at: profile.updatedAt
      });
    } catch {
      reply.code(404).send(toError("USER_NOT_FOUND", "User not found"));
    }
  });

  app.get("/v1/users/me/export", { preHandler: authenticate(services.authService) }, async (request, reply) => {
    const parsed = exportSchema.safeParse(request.query ?? {});
    if (!parsed.success) {
      reply.code(400).send(toError("VALIDATION_ERROR", "user export query is invalid"));
      return;
    }

    const authRequest = request as AuthenticatedRequest;
    try {
      const exported = services.accountService.exportUserData(authRequest.auth.userId);
      reply
        .code(200)
        .type("application/json; charset=utf-8")
        .header("content-disposition", `attachment; filename="${exported.filename}"`)
        .send(exported.content);
    } catch (error) {
      if (error instanceof Error && error.message === "USER_NOT_FOUND") {
        reply.code(404).send(toError("USER_NOT_FOUND", "User not found"));
        return;
      }
      throw error;
    }
  });

  app.post(
    "/v1/users/me/deletion-request",
    { preHandler: authenticate(services.authService) },
    async (request, reply) => {
      const authRequest = request as AuthenticatedRequest;
      try {
        const result = services.accountService.requestDeletion(authRequest.auth.userId);
        try {
          await services.authAccountRepository?.flush();
        } catch {
          reply.code(503).send(toError("AUTH_ACCOUNT_STORAGE_UNAVAILABLE", "Auth/account storage is unavailable"));
          return;
        }
        reply.code(202).send({
          user_id: result.userId,
          status: result.status,
          deletion_requested_at: result.deletionRequestedAt
        });
      } catch (error) {
        if (error instanceof Error && error.message === "USER_ALREADY_DELETED") {
          reply.code(409).send(toError("USER_ALREADY_DELETED", "User already deleted"));
          return;
        }
        if (error instanceof Error && error.message === "USER_NOT_FOUND") {
          reply.code(404).send(toError("USER_NOT_FOUND", "User not found"));
          return;
        }
        throw error;
      }
    }
  );

  app.post("/v1/users/me/delete", { preHandler: authenticate(services.authService) }, async (request, reply) => {
    const parsed = deleteSchema.safeParse(request.body);
    if (!parsed.success) {
      reply.code(400).send(toError("VALIDATION_ERROR", "confirm_text must be DELETE"));
      return;
    }

    const authRequest = request as AuthenticatedRequest;

    try {
      const result = services.accountService.deleteUser(authRequest.auth.userId);
      try {
        await services.authAccountRepository?.flush();
        await services.learnerStateRepository?.flush();
      } catch {
        reply.code(503).send(toError("AUTH_ACCOUNT_STORAGE_UNAVAILABLE", "Auth/account storage is unavailable"));
        return;
      }
      reply.code(200).send({
        user_id: result.userId,
        status: result.status,
        deleted_at: result.deletedAt,
        revoked_sessions: result.revokedSessions,
        removed_assessments: result.removedAssessments,
        removed_plans: result.removedPlans,
        removed_goal_profiles: result.removedGoalProfiles,
        removed_progress_conflicts: result.removedProgressConflicts,
        removed_practice_sessions: result.removedPracticeSessions,
        removed_retry_queue_items: result.removedRetryQueueItems,
        removed_speaking_sessions: result.removedSpeakingSessions,
        removed_writing_evaluations: result.removedWritingEvaluations,
        removed_writing_rewrite_archives: result.removedWritingRewriteArchives,
        removed_mock_exams: result.removedMockExams,
        removed_mock_exam_reports: result.removedMockExamReports
      });
    } catch (error) {
      if (error instanceof Error && error.message === "USER_NOT_FOUND") {
        reply.code(404).send(toError("USER_NOT_FOUND", "User not found"));
        return;
      }
      if (error instanceof Error && error.message === "USER_ALREADY_DELETED") {
        reply.code(409).send(toError("USER_ALREADY_DELETED", "User already deleted"));
        return;
      }
      throw error;
    }
  });
};
