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

const minorGuardianSchema = z.object({
  age_band: z.enum(["unknown", "under_18", "adult"]),
  source: z.enum(["register", "account"]).default("account")
});

const minorGuardianSupportRequestSchema = z.object({
  topic: z.enum(["account_review", "data_deletion", "usage_concern", "other"]),
  contact_channel: z.enum(["email", "phone"]),
  contact_value: z.string().trim().min(3).max(120),
  message: z.string().trim().min(8).max(600)
});

const toError = (code: string, message: string): { code: string; message: string } => ({
  code,
  message
});

const serializeMinorGuardian = (record: {
  ageBand: "unknown" | "under_18" | "adult";
  source?: "register" | "account";
  updatedAt?: string;
  guardianNoticeAcceptedAt?: string;
  guardianNoticeAcceptedUserId?: string;
}) => ({
  age_band: record.ageBand,
  source: record.source,
  updated_at: record.updatedAt,
  guardian_notice_accepted_at: record.guardianNoticeAcceptedAt,
  guardian_notice_accepted_user_id: record.guardianNoticeAcceptedUserId
});

const serializeMinorGuardianSupportRequest = (request: {
  id: string;
  topic: "account_review" | "data_deletion" | "usage_concern" | "other";
  contactChannel: "email" | "phone";
  contactValue: string;
  message: string;
  status: "pending_review" | "contacted" | "closed";
  createdAt: string;
  updatedAt: string;
  resolvedAt?: string;
}) => ({
  request_id: request.id,
  topic: request.topic,
  contact_channel: request.contactChannel,
  contact_value: request.contactValue,
  message: request.message,
  status: request.status,
  created_at: request.createdAt,
  updated_at: request.updatedAt,
  resolved_at: request.resolvedAt
});

const accountDebugLog = (...parts: unknown[]): void => {
  if (process.env.ACCOUNT_DEBUG_LOG === "true") {
    console.log("[account-debug]", ...parts);
  }
};

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
        system_roles: profile.systemRoles,
        status: profile.status,
        minor_guardian: serializeMinorGuardian(profile.minorGuardian),
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

  app.put("/v1/users/me/minor-guardian", { preHandler: authenticate(services.authService) }, async (request, reply) => {
    const parsed = minorGuardianSchema.safeParse(request.body ?? {});
    if (!parsed.success) {
      reply.code(400).send(toError("VALIDATION_ERROR", "minor guardian payload is invalid"));
      return;
    }

    const authRequest = request as AuthenticatedRequest;
    try {
      const minorGuardian = services.accountService.updateMinorGuardian(authRequest.auth.userId, {
        ageBand: parsed.data.age_band,
        source: parsed.data.source
      });
      try {
        await services.authAccountRepository?.flush();
      } catch {
        reply.code(503).send(toError("AUTH_ACCOUNT_STORAGE_UNAVAILABLE", "Auth/account storage is unavailable"));
        return;
      }
      reply.code(200).send({
        minor_guardian: serializeMinorGuardian(minorGuardian)
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
  });

  app.get(
    "/v1/users/me/minor-guardian/support-requests",
    { preHandler: authenticate(services.authService) },
    async (request, reply) => {
      const authRequest = request as AuthenticatedRequest;
      try {
        const items = services.accountService
          .listMinorGuardianSupportRequests(authRequest.auth.userId)
          .map((item) => serializeMinorGuardianSupportRequest(item));
        reply.code(200).send({
          total_count: items.length,
          items
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

  app.post(
    "/v1/users/me/minor-guardian/support-requests",
    { preHandler: authenticate(services.authService) },
    async (request, reply) => {
      const parsed = minorGuardianSupportRequestSchema.safeParse(request.body ?? {});
      if (!parsed.success) {
        reply.code(400).send(toError("VALIDATION_ERROR", "minor guardian support request payload is invalid"));
        return;
      }

      const authRequest = request as AuthenticatedRequest;
      try {
        const supportRequest = services.accountService.submitMinorGuardianSupportRequest(authRequest.auth.userId, {
          topic: parsed.data.topic,
          contactChannel: parsed.data.contact_channel,
          contactValue: parsed.data.contact_value,
          message: parsed.data.message
        });
        try {
          await services.authAccountRepository?.flush();
        } catch {
          reply.code(503).send(toError("AUTH_ACCOUNT_STORAGE_UNAVAILABLE", "Auth/account storage is unavailable"));
          return;
        }
        reply.code(201).send({
          request: serializeMinorGuardianSupportRequest(supportRequest)
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

  app.post(
    "/v1/users/me/minor-guardian/acknowledge",
    { preHandler: authenticate(services.authService) },
    async (request, reply) => {
      const authRequest = request as AuthenticatedRequest;
      try {
        const minorGuardian = services.accountService.acknowledgeMinorGuardianNotice(authRequest.auth.userId);
        try {
          await services.authAccountRepository?.flush();
        } catch {
          reply.code(503).send(toError("AUTH_ACCOUNT_STORAGE_UNAVAILABLE", "Auth/account storage is unavailable"));
          return;
        }
        reply.code(200).send({
          minor_guardian: serializeMinorGuardian(minorGuardian)
        });
      } catch (error) {
        if (error instanceof Error && error.message === "MINOR_GUARDIAN_NOTICE_NOT_REQUIRED") {
          reply.code(409).send(toError("MINOR_GUARDIAN_NOTICE_NOT_REQUIRED", "Minor guardian notice is not required"));
          return;
        }
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

  app.post(
    "/v1/users/me/deletion-request",
    { preHandler: authenticate(services.authService) },
    async (request, reply) => {
      const authRequest = request as AuthenticatedRequest;
      accountDebugLog("deletion-request:start", authRequest.auth.userId);
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
        accountDebugLog("deletion-request:success", result.userId, result.status, result.deletionRequestedAt);
      } catch (error) {
        accountDebugLog("deletion-request:error", authRequest.auth.userId, error instanceof Error ? error.message : error);
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
    accountDebugLog("delete:start", authRequest.auth.userId);

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
      accountDebugLog("delete:success", result.userId, result.deletedAt);
    } catch (error) {
      accountDebugLog("delete:error", authRequest.auth.userId, error instanceof Error ? error.message : error);
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
