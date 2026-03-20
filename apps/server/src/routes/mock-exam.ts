import type { FastifyInstance } from "fastify";
import { z } from "zod";
import type { AuthService } from "../domain/auth-service.js";
import type { LearnerStateRepository } from "../domain/learner-state-repository.js";
import type { MockStateRepository } from "../domain/mock-state-repository.js";
import type { MockExamService } from "../domain/mock-exam-service.js";
import type { SubscriptionService } from "../domain/subscription-service.js";
import { authenticate, type AuthenticatedRequest } from "../middleware/auth.js";
import type { MockExam, MockExamReport, MockExamSkill } from "../domain/types.js";

const createSchema = z.object({
  time_limit_seconds: z.number().int().min(1800).max(14400).optional()
});

const examParamsSchema = z.object({
  exam_id: z.string().uuid()
});

const progressSchema = z.object({
  skill: z.enum(["listening", "speaking", "reading", "writing"]),
  answered_count: z.number().int().min(0),
  completed: z.boolean().optional()
});

const submitSchema = z.object({
  skill_bands: z
    .object({
      listening: z.number().min(0).max(9).optional(),
      speaking: z.number().min(0).max(9).optional(),
      reading: z.number().min(0).max(9).optional(),
      writing: z.number().min(0).max(9).optional()
    })
    .optional()
});

const toError = (code: string, message: string): { code: string; message: string } => ({
  code,
  message
});

const serializeExam = (exam: MockExam) => ({
  exam_id: exam.id,
  status: exam.status,
  time_limit_seconds: exam.timeLimitSeconds,
  elapsed_seconds: exam.elapsedSeconds,
  remaining_seconds: Math.max(0, exam.timeLimitSeconds - exam.elapsedSeconds),
  current_skill: exam.sections[exam.currentSkillIndex]?.skill ?? "listening",
  sections: exam.sections.map((section) => ({
    skill: section.skill,
    status: section.status,
    answered_count: section.answeredCount,
    last_checkpoint_at: section.lastCheckpointAt
  })),
  recovered_at: exam.recoveredAt,
  submitted_at: exam.submittedAt,
  report_id: exam.reportId,
  created_at: exam.createdAt,
  updated_at: exam.updatedAt
});

const serializeReport = (report: MockExamReport) => ({
  report_id: report.id,
  exam_id: report.examId,
  total_estimated_band: report.totalEstimatedBand,
  skill_band_estimates: {
    listening: report.skillBandEstimates.listening,
    speaking: report.skillBandEstimates.speaking,
    reading: report.skillBandEstimates.reading,
    writing: report.skillBandEstimates.writing
  },
  error_distribution: {
    listening: report.errorDistribution.listening,
    speaking: report.errorDistribution.speaking,
    reading: report.errorDistribution.reading,
    writing: report.errorDistribution.writing
  },
  next_actions: report.nextActions,
  generated_at: report.generatedAt,
  plan_writeback: report.planWriteback
    ? {
        applied: report.planWriteback.applied,
        applied_at: report.planWriteback.appliedAt,
        reasons: report.planWriteback.reasons,
        undo_available: report.planWriteback.undoAvailable,
        undone_at: report.planWriteback.undoneAt,
        changed_tasks: report.planWriteback.changedTasks.map((item) => ({
          task_id: item.taskId,
          target_minutes_before: item.targetMinutesBefore,
          completion_criteria_before: item.completionCriteriaBefore,
          target_minutes_after: item.targetMinutesAfter,
          completion_criteria_after: item.completionCriteriaAfter
        }))
      }
    : undefined,
  created_at: report.createdAt,
  updated_at: report.updatedAt
});

export const registerMockExamRoutes = async (
  app: FastifyInstance,
  services: {
    authService: AuthService;
    mockExamService: MockExamService;
    subscriptionService: SubscriptionService;
    learnerStateRepository?: LearnerStateRepository;
    mockStateRepository?: MockStateRepository;
  }
): Promise<void> => {
  const flushMockAndLearnerState = async (
    reply: { code: (statusCode: number) => { send: (payload: { code: string; message: string }) => void } }
  ): Promise<boolean> => {
    try {
      await services.mockStateRepository?.flush();
      await services.learnerStateRepository?.flush();
      return true;
    } catch {
      reply.code(503).send(toError("MOCK_STATE_STORAGE_UNAVAILABLE", "Mock exam storage is unavailable"));
      return false;
    }
  };

  app.post("/v1/mock-exams", { preHandler: authenticate(services.authService) }, async (request, reply) => {
    const parsed = createSchema.safeParse(request.body ?? {});
    if (!parsed.success) {
      reply.code(400).send(toError("VALIDATION_ERROR", "mock exam create payload is invalid"));
      return;
    }

    const authRequest = request as AuthenticatedRequest;
    try {
      services.subscriptionService.consumeDailyQuotaForSessionStart(
        authRequest.auth.userId,
        "mock_exam_start",
        request.headers["x-device-id"] as string | undefined
      );
    } catch (error) {
      if (error instanceof Error && error.message === "ENTITLEMENT_LIMIT_REACHED") {
        reply.code(429).send(toError("ENTITLEMENT_LIMIT_REACHED", "Daily free quota reached"));
        return;
      }
      throw error;
    }

    const exam = services.mockExamService.createExam({
      userId: authRequest.auth.userId,
      timeLimitSeconds: parsed.data.time_limit_seconds
    });
    if (!(await flushMockAndLearnerState(reply))) {
      return;
    }
    reply.code(201).send(serializeExam(exam));
  });

  app.get("/v1/mock-exams/:exam_id", { preHandler: authenticate(services.authService) }, async (request, reply) => {
    const parsed = examParamsSchema.safeParse(request.params);
    if (!parsed.success) {
      reply.code(400).send(toError("VALIDATION_ERROR", "exam_id is invalid"));
      return;
    }

    const authRequest = request as AuthenticatedRequest;
    try {
      const exam = services.mockExamService.getExam(authRequest.auth.userId, parsed.data.exam_id);
      reply.code(200).send(serializeExam(exam));
    } catch {
      reply.code(404).send(toError("EXAM_NOT_FOUND", "Mock exam not found"));
    }
  });

  app.post(
    "/v1/mock-exams/:exam_id/progress",
    { preHandler: authenticate(services.authService) },
    async (request, reply) => {
      const paramsParsed = examParamsSchema.safeParse(request.params);
      const bodyParsed = progressSchema.safeParse(request.body);
      if (!paramsParsed.success || !bodyParsed.success) {
        reply.code(400).send(toError("VALIDATION_ERROR", "mock exam progress payload is invalid"));
        return;
      }

      const authRequest = request as AuthenticatedRequest;
      try {
        const exam = services.mockExamService.saveProgress({
          userId: authRequest.auth.userId,
          examId: paramsParsed.data.exam_id,
          skill: bodyParsed.data.skill as MockExamSkill,
          answeredCount: bodyParsed.data.answered_count,
          completed: bodyParsed.data.completed
        });
        if (!(await flushMockAndLearnerState(reply))) {
          return;
        }
        reply.code(200).send(serializeExam(exam));
      } catch (error) {
        if (error instanceof Error && error.message === "EXAM_ALREADY_SUBMITTED") {
          reply.code(409).send(toError("EXAM_ALREADY_SUBMITTED", "Mock exam already submitted"));
          return;
        }
        reply.code(404).send(toError("EXAM_NOT_FOUND", "Mock exam not found"));
      }
    }
  );

  app.post(
    "/v1/mock-exams/:exam_id/recover",
    { preHandler: authenticate(services.authService) },
    async (request, reply) => {
      const paramsParsed = examParamsSchema.safeParse(request.params);
      if (!paramsParsed.success) {
        reply.code(400).send(toError("VALIDATION_ERROR", "exam_id is invalid"));
        return;
      }

      const authRequest = request as AuthenticatedRequest;
      try {
        const exam = services.mockExamService.recoverExam(authRequest.auth.userId, paramsParsed.data.exam_id);
        if (!(await flushMockAndLearnerState(reply))) {
          return;
        }
        reply.code(200).send({
          ...serializeExam(exam),
          recovered: true
        });
      } catch (error) {
        if (error instanceof Error && error.message === "EXAM_NOT_RECOVERABLE") {
          reply.code(409).send(toError("EXAM_NOT_RECOVERABLE", "Mock exam is not recoverable"));
          return;
        }
        reply.code(404).send(toError("EXAM_NOT_FOUND", "Mock exam not found"));
      }
    }
  );

  app.post(
    "/v1/mock-exams/:exam_id/submit",
    { preHandler: authenticate(services.authService) },
    async (request, reply) => {
      const paramsParsed = examParamsSchema.safeParse(request.params);
      const bodyParsed = submitSchema.safeParse(request.body ?? {});
      if (!paramsParsed.success || !bodyParsed.success) {
        reply.code(400).send(toError("VALIDATION_ERROR", "mock exam submit payload is invalid"));
        return;
      }

      const authRequest = request as AuthenticatedRequest;
      try {
        const result = services.mockExamService.submitExam({
          userId: authRequest.auth.userId,
          examId: paramsParsed.data.exam_id,
          skillBands: bodyParsed.data.skill_bands
        });
        if (!(await flushMockAndLearnerState(reply))) {
          return;
        }
        reply.code(200).send({
          exam: serializeExam(result.exam),
          report: serializeReport(result.report)
        });
      } catch {
        reply.code(404).send(toError("EXAM_NOT_FOUND", "Mock exam not found"));
      }
    }
  );

  app.get(
    "/v1/mock-exams/:exam_id/report",
    { preHandler: authenticate(services.authService) },
    async (request, reply) => {
      const parsed = examParamsSchema.safeParse(request.params);
      if (!parsed.success) {
        reply.code(400).send(toError("VALIDATION_ERROR", "exam_id is invalid"));
        return;
      }

      const authRequest = request as AuthenticatedRequest;
      try {
        const report = services.mockExamService.applyReportWritebackToPlan(authRequest.auth.userId, parsed.data.exam_id);
        if (!(await flushMockAndLearnerState(reply))) {
          return;
        }
        reply.code(200).send(serializeReport(report));
      } catch (error) {
        if (error instanceof Error && error.message === "REPORT_NOT_READY") {
          reply.code(409).send(toError("REPORT_NOT_READY", "Mock exam report is not ready"));
          return;
        }
        reply.code(404).send(toError("EXAM_NOT_FOUND", "Mock exam/report not found"));
      }
    }
  );

  app.post(
    "/v1/mock-exams/:exam_id/report/writeback/undo",
    { preHandler: authenticate(services.authService) },
    async (request, reply) => {
      const parsed = examParamsSchema.safeParse(request.params);
      if (!parsed.success) {
        reply.code(400).send(toError("VALIDATION_ERROR", "exam_id is invalid"));
        return;
      }

      const authRequest = request as AuthenticatedRequest;
      try {
        const report = services.mockExamService.undoReportWriteback(authRequest.auth.userId, parsed.data.exam_id);
        if (!(await flushMockAndLearnerState(reply))) {
          return;
        }
        reply.code(200).send(serializeReport(report));
      } catch (error) {
        if (error instanceof Error && error.message === "WRITEBACK_NOT_APPLIED") {
          reply.code(409).send(toError("WRITEBACK_NOT_APPLIED", "Report writeback not applied"));
          return;
        }
        if (error instanceof Error && error.message === "WRITEBACK_NOT_UNDOABLE") {
          reply.code(409).send(toError("WRITEBACK_NOT_UNDOABLE", "Report writeback is not undoable"));
          return;
        }
        if (error instanceof Error && error.message === "WRITEBACK_ALREADY_UNDONE") {
          reply.code(409).send(toError("WRITEBACK_ALREADY_UNDONE", "Report writeback already undone"));
          return;
        }
        if (error instanceof Error && error.message === "PLAN_NOT_FOUND") {
          reply.code(404).send(toError("PLAN_NOT_FOUND", "Plan not found"));
          return;
        }
        reply.code(404).send(toError("EXAM_NOT_FOUND", "Mock exam/report not found"));
      }
    }
  );

  app.get(
    "/v1/mock-exams/:exam_id/report/export",
    { preHandler: authenticate(services.authService) },
    async (request, reply) => {
      const parsed = examParamsSchema.safeParse(request.params);
      if (!parsed.success) {
        reply.code(400).send(toError("VALIDATION_ERROR", "exam_id is invalid"));
        return;
      }
      const authRequest = request as AuthenticatedRequest;
      try {
        const exported = services.mockExamService.getReportExport(authRequest.auth.userId, parsed.data.exam_id);
        reply.code(200).send({
          filename: exported.filename,
          content: exported.content
        });
      } catch {
        reply.code(404).send(toError("EXAM_NOT_FOUND", "Mock exam/report not found"));
      }
    }
  );
};
