import type { FastifyInstance } from "fastify";
import { z } from "zod";
import type { LearnerStateRepository } from "../domain/learner-state-repository.js";
import type { OnboardingService } from "../domain/onboarding-service.js";
import { authenticate, type AuthenticatedRequest } from "../middleware/auth.js";
import type { AuthService } from "../domain/auth-service.js";

const onboardingSchema = z.object({
  target_overall_band: z
    .number()
    .min(0)
    .max(9)
    .refine((value) => Number.isInteger(value * 2), "target_overall_band must use 0.5 steps"),
  target_exam_date: z.string().date(),
  weekly_study_hours: z.number().int().min(1).max(80),
  weak_skills: z
    .array(z.enum(["listening", "speaking", "reading", "writing"]))
    .max(4)
    .default([])
});

const assessmentParamsSchema = z.object({
  assessment_id: z.string().uuid()
});

const assessmentAnswerSchema = z.object({
  question_id: z.string().uuid(),
  answer: z.string().max(5000)
});

const planTaskParamsSchema = z.object({
  plan_id: z.string().uuid(),
  task_id: z.string().uuid()
});

const planParamsSchema = z.object({
  plan_id: z.string().uuid()
});

const planTaskAdjustSchema = z
  .object({
    target_minutes: z.number().int().min(5).max(240).optional(),
    completion_criteria: z.string().trim().min(1).max(500).optional()
  })
  .refine((value) => value.target_minutes !== undefined || value.completion_criteria !== undefined, {
    message: "Either target_minutes or completion_criteria is required"
  });

const adjustmentHistoryQuerySchema = z.object({
  source_type: z
    .enum(["manual_task_adjustment", "practice_session", "speaking_session", "writing_evaluation", "mock_exam_report"])
    .optional(),
  skill: z.enum(["listening", "speaking", "reading", "writing"]).optional(),
  page: z
    .string()
    .optional()
    .transform((value) => (value ? Number(value) : undefined)),
  page_size: z
    .string()
    .optional()
    .transform((value) => (value ? Number(value) : undefined))
});

const toError = (code: string, message: string): { code: string; message: string } => ({
  code,
  message
});

const serializePlan = (plan: {
  id: string;
  status: string;
  horizonWeeks: number;
  version: number;
  weeks: Array<{
    id: string;
    weekNo: number;
    goals: string[];
    tasks: Array<{
      id: string;
      skill: string;
      taskType: string;
      title: string;
      targetMinutes: number;
      completionCriteria: string;
      dayOfWeek: number;
      status: string;
    }>;
  }>;
  adjustmentHistory: Array<{
    id: string;
    sourceType: string;
    sourceId: string;
    skill?: string;
    reason: string;
    score?: number;
    createdAt: string;
    changedTasks: Array<{
      taskId: string;
      skill: string;
      beforeTargetMinutes: number;
      afterTargetMinutes: number;
      beforeCompletionCriteria: string;
      afterCompletionCriteria: string;
    }>;
  }>;
  updatedAt: string;
  createdAt: string;
}) => ({
  plan_id: plan.id,
  status: plan.status,
  horizon_weeks: plan.horizonWeeks,
  version: plan.version,
  created_at: plan.createdAt,
  updated_at: plan.updatedAt,
  weeks: plan.weeks.map((week) => ({
    week_id: week.id,
    week_no: week.weekNo,
    goals: week.goals,
    tasks: week.tasks.map((task) => ({
      task_id: task.id,
      skill: task.skill,
      task_type: task.taskType,
      title: task.title,
      target_minutes: task.targetMinutes,
      completion_criteria: task.completionCriteria,
      day_of_week: task.dayOfWeek,
      status: task.status
    }))
  })),
  adjustment_history: plan.adjustmentHistory.map((item) => ({
    adjustment_id: item.id,
    source_type: item.sourceType,
    source_id: item.sourceId,
    skill: item.skill,
    reason: item.reason,
    score: item.score,
    created_at: item.createdAt,
    changed_tasks: item.changedTasks.map((changed) => ({
      task_id: changed.taskId,
      skill: changed.skill,
      before_target_minutes: changed.beforeTargetMinutes,
      after_target_minutes: changed.afterTargetMinutes,
      before_completion_criteria: changed.beforeCompletionCriteria,
      after_completion_criteria: changed.afterCompletionCriteria
    }))
  }))
});

export const registerOnboardingRoutes = async (
  app: FastifyInstance,
  services: {
    authService: AuthService;
    onboardingService: OnboardingService;
    learnerStateRepository?: LearnerStateRepository;
  }
): Promise<void> => {
  const flushLearnerStateRepository = async (
    reply: { code: (statusCode: number) => { send: (payload: { code: string; message: string }) => void } }
  ): Promise<boolean> => {
    try {
      await services.learnerStateRepository?.flush();
      return true;
    } catch {
      reply.code(503).send(toError("LEARNER_STATE_STORAGE_UNAVAILABLE", "Learner state storage is unavailable"));
      return false;
    }
  };

  app.post("/v1/users/onboarding", { preHandler: authenticate(services.authService) }, async (request, reply) => {
    const parsed = onboardingSchema.safeParse(request.body);
    if (!parsed.success) {
      reply.code(400).send(
        toError(
          "VALIDATION_ERROR",
          parsed.error.issues.map((issue) => issue.message).join("; ")
        )
      );
      return;
    }

    const targetDate = new Date(parsed.data.target_exam_date);
    if (Number.isNaN(targetDate.getTime())) {
      reply.code(400).send(toError("VALIDATION_ERROR", "target_exam_date is invalid"));
      return;
    }

    const today = new Date();
    today.setHours(0, 0, 0, 0);
    if (targetDate.getTime() < today.getTime()) {
      reply.code(400).send(toError("VALIDATION_ERROR", "target_exam_date cannot be in the past"));
      return;
    }

    const authRequest = request as AuthenticatedRequest;
    const idempotencyKey =
      (request.headers["idempotency-key"] as string | undefined)?.trim() ||
      `${authRequest.auth.userId}-${parsed.data.target_exam_date}-${parsed.data.target_overall_band}-${parsed.data.weekly_study_hours}`;

    const result = services.onboardingService.upsertGoalAndEnqueueAssessment({
      userId: authRequest.auth.userId,
      idempotencyKey,
      targetOverallBand: parsed.data.target_overall_band,
      targetExamDate: parsed.data.target_exam_date,
      weeklyStudyHours: parsed.data.weekly_study_hours,
      weakSkills: parsed.data.weak_skills
    });
    if (!(await flushLearnerStateRepository(reply))) {
      return;
    }

    reply.code(202).send({
      assessment_id: result.assessmentId,
      plan_id: result.planId,
      status: result.status
    });
  });

  app.get(
    "/v1/users/onboarding/:assessment_id/status",
    { preHandler: authenticate(services.authService) },
    async (request, reply) => {
      const parsed = assessmentParamsSchema.safeParse(request.params);
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
        const status = services.onboardingService.getAssessmentStatus(
          authRequest.auth.userId,
          parsed.data.assessment_id
        );
        reply.code(200).send({
          assessment_id: status.assessmentId,
          plan_id: status.planId,
          status: status.status,
          updated_at: status.updatedAt,
          answered_count: status.answeredCount,
          total_questions: status.totalQuestions,
          elapsed_seconds: status.elapsedSeconds,
          error_message: status.errorMessage
        });
      } catch {
        reply.code(404).send(toError("ASSESSMENT_NOT_FOUND", "Assessment job not found"));
      }
    }
  );

  app.get(
    "/v1/users/onboarding/:assessment_id/questions",
    { preHandler: authenticate(services.authService) },
    async (request, reply) => {
      const parsed = assessmentParamsSchema.safeParse(request.params);
      if (!parsed.success) {
        reply.code(400).send(toError("VALIDATION_ERROR", "assessment_id is invalid"));
        return;
      }

      const authRequest = request as AuthenticatedRequest;
      try {
        const result = services.onboardingService.getDiagnosticQuestions(
          authRequest.auth.userId,
          parsed.data.assessment_id
        );
        if (!(await flushLearnerStateRepository(reply))) {
          return;
        }
        reply.code(200).send({
          assessment_id: result.assessmentId,
          status: result.status,
          answered_count: result.answeredCount,
          total_questions: result.totalQuestions,
          elapsed_seconds: result.elapsedSeconds,
          current_question_index: result.currentQuestionIndex,
          questions: result.questions.map((question) => ({
            question_id: question.id,
            skill: question.skill,
            prompt: question.prompt
          }))
        });
      } catch {
        reply.code(404).send(toError("ASSESSMENT_NOT_FOUND", "Assessment job not found"));
      }
    }
  );

  app.post(
    "/v1/users/onboarding/:assessment_id/answers",
    { preHandler: authenticate(services.authService) },
    async (request, reply) => {
      const paramsParsed = assessmentParamsSchema.safeParse(request.params);
      const bodyParsed = assessmentAnswerSchema.safeParse(request.body);
      if (!paramsParsed.success || !bodyParsed.success) {
        reply.code(400).send(toError("VALIDATION_ERROR", "assessment_id/question payload is invalid"));
        return;
      }

      const authRequest = request as AuthenticatedRequest;
      try {
        const result = services.onboardingService.submitDiagnosticAnswer({
          userId: authRequest.auth.userId,
          assessmentId: paramsParsed.data.assessment_id,
          questionId: bodyParsed.data.question_id,
          answer: bodyParsed.data.answer
        });
        if (!(await flushLearnerStateRepository(reply))) {
          return;
        }
        reply.code(200).send({
          assessment_id: result.assessmentId,
          answered_count: result.answeredCount,
          total_questions: result.totalQuestions,
          current_question_index: result.currentQuestionIndex,
          status: result.status
        });
      } catch (error) {
        if (error instanceof Error && error.message === "ASSESSMENT_PAUSED") {
          reply.code(409).send(toError("ASSESSMENT_PAUSED", "Assessment is paused"));
          return;
        }
        if (error instanceof Error && error.message === "ASSESSMENT_COMPLETED") {
          reply.code(409).send(toError("ASSESSMENT_COMPLETED", "Assessment is completed"));
          return;
        }
        if (error instanceof Error && error.message === "QUESTION_NOT_FOUND") {
          reply.code(404).send(toError("QUESTION_NOT_FOUND", "Question not found"));
          return;
        }
        reply.code(404).send(toError("ASSESSMENT_NOT_FOUND", "Assessment job not found"));
      }
    }
  );

  app.post(
    "/v1/users/onboarding/:assessment_id/pause",
    { preHandler: authenticate(services.authService) },
    async (request, reply) => {
      const parsed = assessmentParamsSchema.safeParse(request.params);
      if (!parsed.success) {
        reply.code(400).send(toError("VALIDATION_ERROR", "assessment_id is invalid"));
        return;
      }

      const authRequest = request as AuthenticatedRequest;
      try {
        const result = services.onboardingService.pauseDiagnostic(
          authRequest.auth.userId,
          parsed.data.assessment_id
        );
        if (!(await flushLearnerStateRepository(reply))) {
          return;
        }
        reply.code(200).send({
          assessment_id: result.assessmentId,
          status: result.status,
          elapsed_seconds: result.elapsedSeconds
        });
      } catch {
        reply.code(404).send(toError("ASSESSMENT_NOT_FOUND", "Assessment job not found"));
      }
    }
  );

  app.post(
    "/v1/users/onboarding/:assessment_id/resume",
    { preHandler: authenticate(services.authService) },
    async (request, reply) => {
      const parsed = assessmentParamsSchema.safeParse(request.params);
      if (!parsed.success) {
        reply.code(400).send(toError("VALIDATION_ERROR", "assessment_id is invalid"));
        return;
      }

      const authRequest = request as AuthenticatedRequest;
      try {
        const result = services.onboardingService.resumeDiagnostic(
          authRequest.auth.userId,
          parsed.data.assessment_id
        );
        if (!(await flushLearnerStateRepository(reply))) {
          return;
        }
        reply.code(200).send({
          assessment_id: result.assessmentId,
          status: result.status,
          elapsed_seconds: result.elapsedSeconds
        });
      } catch (error) {
        if (error instanceof Error && error.message === "ASSESSMENT_COMPLETED") {
          reply.code(409).send(toError("ASSESSMENT_COMPLETED", "Assessment is completed"));
          return;
        }
        reply.code(404).send(toError("ASSESSMENT_NOT_FOUND", "Assessment job not found"));
      }
    }
  );

  app.post(
    "/v1/users/onboarding/:assessment_id/complete",
    { preHandler: authenticate(services.authService) },
    async (request, reply) => {
      const parsed = assessmentParamsSchema.safeParse(request.params);
      if (!parsed.success) {
        reply.code(400).send(toError("VALIDATION_ERROR", "assessment_id is invalid"));
        return;
      }

      const authRequest = request as AuthenticatedRequest;
      try {
        const result = services.onboardingService.completeDiagnostic(
          authRequest.auth.userId,
          parsed.data.assessment_id
        );
        if (!(await flushLearnerStateRepository(reply))) {
          return;
        }
        reply.code(200).send({
          assessment_id: result.assessmentId,
          plan_id: result.planId,
          status: result.status,
          elapsed_seconds: result.elapsedSeconds,
          skill_bands: {
            listening: result.skillBands.listening,
            speaking: result.skillBands.speaking,
            reading: result.skillBands.reading,
            writing: result.skillBands.writing
          }
        });
      } catch {
        reply.code(404).send(toError("ASSESSMENT_NOT_FOUND", "Assessment job not found"));
      }
    }
  );

  app.get("/v1/users/plans/active", { preHandler: authenticate(services.authService) }, async (request, reply) => {
    const authRequest = request as AuthenticatedRequest;

    try {
      const plan = services.onboardingService.getActiveStudyPlan(authRequest.auth.userId);
      reply.code(200).send(serializePlan(plan));
    } catch {
      reply.code(404).send(toError("PLAN_NOT_FOUND", "Active study plan not found"));
    }
  });

  app.patch(
    "/v1/users/plans/:plan_id/tasks/:task_id",
    { preHandler: authenticate(services.authService) },
    async (request, reply) => {
      const paramsParsed = planTaskParamsSchema.safeParse(request.params);
      const bodyParsed = planTaskAdjustSchema.safeParse(request.body);

      if (!paramsParsed.success || !bodyParsed.success) {
        reply.code(400).send(toError("VALIDATION_ERROR", "plan/task payload is invalid"));
        return;
      }

      const authRequest = request as AuthenticatedRequest;
      try {
        const plan = services.onboardingService.adjustStudyTask({
          userId: authRequest.auth.userId,
          planId: paramsParsed.data.plan_id,
          taskId: paramsParsed.data.task_id,
          targetMinutes: bodyParsed.data.target_minutes,
          completionCriteria: bodyParsed.data.completion_criteria
        });
        if (!(await flushLearnerStateRepository(reply))) {
          return;
        }
        reply.code(200).send(serializePlan(plan));
      } catch (error) {
        if (error instanceof Error && error.message === "TASK_NOT_FOUND") {
          reply.code(404).send(toError("TASK_NOT_FOUND", "Task not found"));
          return;
        }
        reply.code(404).send(toError("PLAN_NOT_FOUND", "Plan not found"));
      }
    }
  );

  app.get(
    "/v1/users/plans/:plan_id/adjustments",
    { preHandler: authenticate(services.authService) },
    async (request, reply) => {
      const paramsParsed = planParamsSchema.safeParse(request.params);
      const queryParsed = adjustmentHistoryQuerySchema.safeParse(request.query ?? {});
      if (!paramsParsed.success || !queryParsed.success) {
        reply.code(400).send(toError("VALIDATION_ERROR", "plan adjustment query is invalid"));
        return;
      }

      const authRequest = request as AuthenticatedRequest;
      try {
        const history = services.onboardingService.getPlanAdjustmentHistory({
          userId: authRequest.auth.userId,
          planId: paramsParsed.data.plan_id,
          sourceType: queryParsed.data.source_type,
          skill: queryParsed.data.skill,
          page: queryParsed.data.page,
          pageSize: queryParsed.data.page_size
        });
        reply.code(200).send({
          total: history.total,
          page: history.page,
          page_size: history.pageSize,
          items: history.items.map((item) => ({
            adjustment_id: item.id,
            source_type: item.sourceType,
            source_id: item.sourceId,
            skill: item.skill,
            reason: item.reason,
            score: item.score,
            created_at: item.createdAt,
            changed_tasks: item.changedTasks.map((changed) => ({
              task_id: changed.taskId,
              skill: changed.skill,
              before_target_minutes: changed.beforeTargetMinutes,
              after_target_minutes: changed.afterTargetMinutes,
              before_completion_criteria: changed.beforeCompletionCriteria,
              after_completion_criteria: changed.afterCompletionCriteria
            }))
          }))
        });
      } catch {
        reply.code(404).send(toError("PLAN_NOT_FOUND", "Plan not found"));
      }
    }
  );
};
