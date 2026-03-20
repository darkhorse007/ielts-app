import type { FastifyInstance } from "fastify";
import { z } from "zod";
import type { AuthService } from "../domain/auth-service.js";
import type { WritingStateRepository } from "../domain/writing-state-repository.js";
import type { WritingService } from "../domain/writing-service.js";
import { authenticate, type AuthenticatedRequest } from "../middleware/auth.js";
import type { WritingComparison, WritingEvaluation, WritingRewriteArchiveItem } from "../domain/types.js";

const evaluateSchema = z.object({
  task_type: z.enum(["task1", "task2"]),
  prompt: z.string().trim().min(5).max(2000),
  essay: z.string().trim().min(30).max(20000)
});

const evaluationParamsSchema = z.object({
  evaluation_id: z.string().uuid()
});

const rewriteSchema = z.object({
  essay: z.string().trim().min(30).max(20000)
});

const templateListQuerySchema = z.object({
  task_type: z.enum(["task1", "task2"]).optional()
});

const templateParamsSchema = z.object({
  template_id: z.string().trim().min(3).max(120)
});

const insertTemplateSchema = z.object({
  essay: z.string().trim().min(1).max(30000),
  insertion_mode: z.enum(["append", "prepend"]).optional()
});

const toError = (code: string, message: string): { code: string; message: string } => ({
  code,
  message
});

const serializeEvaluation = (evaluation: WritingEvaluation) => ({
  evaluation_id: evaluation.id,
  task_type: evaluation.taskType,
  prompt: evaluation.prompt,
  scores: {
    tr: evaluation.scores.tr,
    cc: evaluation.scores.cc,
    lr: evaluation.scores.lr,
    gra: evaluation.scores.gra,
    overall: evaluation.scores.overall
  },
  source_evaluation_id: evaluation.sourceEvaluationId,
  suggestions: evaluation.suggestions.map((item) => ({
    suggestion_id: item.id,
    issue: item.issue,
    evidence_sentence: item.evidenceSentence,
    recommendation: item.recommendation,
    revised_sample: item.revisedSample
  })),
  latency_ms: evaluation.latencyMs,
  fallback_triggered: evaluation.fallbackTriggered,
  created_at: evaluation.createdAt,
  updated_at: evaluation.updatedAt
});

const serializeComparison = (comparison: WritingComparison) => ({
  source_evaluation_id: comparison.sourceEvaluationId,
  rewrite_evaluation_id: comparison.rewriteEvaluationId,
  source_scores: comparison.sourceScores,
  rewrite_scores: comparison.rewriteScores,
  delta: comparison.delta,
  next_actions: comparison.nextActions
});

const serializeArchiveItem = (item: WritingRewriteArchiveItem) => ({
  archive_id: item.id,
  task_type: item.taskType,
  source_evaluation_id: item.sourceEvaluationId,
  rewrite_evaluation_id: item.rewriteEvaluationId,
  delta_overall: item.deltaOverall,
  created_at: item.createdAt
});

const serializeTemplate = (template: {
  id: string;
  taskType: "task1" | "task2";
  title: string;
  argumentFramework: string;
  scenarioTag: string;
  usageTips: string[];
  sections: Array<{
    id: string;
    title: string;
    content: string;
  }>;
}) => ({
  template_id: template.id,
  task_type: template.taskType,
  title: template.title,
  argument_framework: template.argumentFramework,
  scenario_tag: template.scenarioTag,
  usage_tips: template.usageTips,
  sections: template.sections.map((section) => ({
    section_id: section.id,
    title: section.title,
    content: section.content
  }))
});

export const registerWritingRoutes = async (
  app: FastifyInstance,
  services: {
    authService: AuthService;
    writingService: WritingService;
    writingStateRepository?: WritingStateRepository;
  }
): Promise<void> => {
  const flushWritingStateRepository = async (
    reply: { code: (statusCode: number) => { send: (payload: { code: string; message: string }) => void } }
  ): Promise<boolean> => {
    try {
      await services.writingStateRepository?.flush();
      return true;
    } catch {
      reply.code(503).send(toError("WRITING_STATE_STORAGE_UNAVAILABLE", "Writing state storage is unavailable"));
      return false;
    }
  };

  app.get("/v1/writing/templates", { preHandler: authenticate(services.authService) }, async (request, reply) => {
    const parsed = templateListQuerySchema.safeParse(request.query ?? {});
    if (!parsed.success) {
      reply.code(400).send(toError("VALIDATION_ERROR", "template query is invalid"));
      return;
    }
    const authRequest = request as AuthenticatedRequest;
    const templates = services.writingService.listTemplates(parsed.data.task_type);
    const adoption = services.writingService.getTemplateAdoption(authRequest.auth.userId);
    const usageMap = new Map(adoption.items.map((item) => [item.templateId, item]));
    reply.code(200).send({
      items: templates.map((template) => ({
        ...serializeTemplate(template),
        usage_count: usageMap.get(template.id)?.usageCount ?? 0,
        adoption_rate: usageMap.get(template.id)?.adoptionRate ?? 0
      }))
    });
  });

  app.post(
    "/v1/writing/templates/:template_id/insert",
    { preHandler: authenticate(services.authService) },
    async (request, reply) => {
      const paramsParsed = templateParamsSchema.safeParse(request.params);
      const bodyParsed = insertTemplateSchema.safeParse(request.body);
      if (!paramsParsed.success || !bodyParsed.success) {
        reply.code(400).send(toError("VALIDATION_ERROR", "template insert payload is invalid"));
        return;
      }

      const authRequest = request as AuthenticatedRequest;
      try {
        const inserted = services.writingService.insertTemplate({
          userId: authRequest.auth.userId,
          templateId: paramsParsed.data.template_id,
          essay: bodyParsed.data.essay,
          insertionMode: bodyParsed.data.insertion_mode
        });
        if (!(await flushWritingStateRepository(reply))) {
          return;
        }

        reply.code(200).send({
          template: serializeTemplate(inserted.template),
          merged_essay: inserted.mergedEssay,
          preserved_original: inserted.preservedOriginal,
          usage: {
            usage_id: inserted.usage.id,
            template_id: inserted.usage.templateId,
            inserted_at: inserted.usage.insertedAt,
            original_essay_length: inserted.usage.originalEssayLength,
            merged_essay_length: inserted.usage.mergedEssayLength
          }
        });
      } catch (error) {
        if (error instanceof Error && error.message === "TEMPLATE_NOT_FOUND") {
          reply.code(404).send(toError("TEMPLATE_NOT_FOUND", "Writing template not found"));
          return;
        }
        if (error instanceof Error && error.message === "EMPTY_ESSAY") {
          reply.code(400).send(toError("VALIDATION_ERROR", "essay is required"));
          return;
        }
        throw error;
      }
    }
  );

  app.get("/v1/writing/templates/adoption", { preHandler: authenticate(services.authService) }, async (request, reply) => {
    const authRequest = request as AuthenticatedRequest;
    const adoption = services.writingService.getTemplateAdoption(authRequest.auth.userId);
    reply.code(200).send({
      total_insertions: adoption.totalInsertions,
      items: adoption.items.map((item) => ({
        template_id: item.templateId,
        title: item.title,
        task_type: item.taskType,
        usage_count: item.usageCount,
        adoption_rate: item.adoptionRate
      }))
    });
  });

  app.post("/v1/writing/evaluations", { preHandler: authenticate(services.authService) }, async (request, reply) => {
    const parsed = evaluateSchema.safeParse(request.body);
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
      const evaluation = services.writingService.evaluateEssay({
        userId: authRequest.auth.userId,
        taskType: parsed.data.task_type,
        prompt: parsed.data.prompt,
        essay: parsed.data.essay
      });
      if (!(await flushWritingStateRepository(reply))) {
        return;
      }
      reply.code(201).send(serializeEvaluation(evaluation));
    } catch (error) {
      if (error instanceof Error && error.message === "EMPTY_ESSAY") {
        reply.code(400).send(toError("VALIDATION_ERROR", "essay is required"));
        return;
      }
      throw error;
    }
  });

  app.get(
    "/v1/writing/evaluations/:evaluation_id",
    { preHandler: authenticate(services.authService) },
    async (request, reply) => {
      const parsed = evaluationParamsSchema.safeParse(request.params);
      if (!parsed.success) {
        reply.code(400).send(toError("VALIDATION_ERROR", "evaluation_id is invalid"));
        return;
      }

      const authRequest = request as AuthenticatedRequest;
      try {
        const evaluation = services.writingService.getEvaluation(authRequest.auth.userId, parsed.data.evaluation_id);
        reply.code(200).send(serializeEvaluation(evaluation));
      } catch {
        reply.code(404).send(toError("EVALUATION_NOT_FOUND", "Writing evaluation not found"));
      }
    }
  );

  app.post(
    "/v1/writing/evaluations/:evaluation_id/rewrite",
    { preHandler: authenticate(services.authService) },
    async (request, reply) => {
      const paramsParsed = evaluationParamsSchema.safeParse(request.params);
      const bodyParsed = rewriteSchema.safeParse(request.body);
      if (!paramsParsed.success || !bodyParsed.success) {
        reply.code(400).send(toError("VALIDATION_ERROR", "rewrite payload is invalid"));
        return;
      }

      const authRequest = request as AuthenticatedRequest;
      try {
        const result = services.writingService.rewriteAndCompare({
          userId: authRequest.auth.userId,
          sourceEvaluationId: paramsParsed.data.evaluation_id,
          essay: bodyParsed.data.essay
        });
        if (!(await flushWritingStateRepository(reply))) {
          return;
        }
        reply.code(201).send({
          evaluation: serializeEvaluation(result.evaluation),
          comparison: serializeComparison(result.comparison),
          archive: serializeArchiveItem(result.archive)
        });
      } catch (error) {
        if (error instanceof Error && error.message === "EVALUATION_NOT_FOUND") {
          reply.code(404).send(toError("EVALUATION_NOT_FOUND", "Writing evaluation not found"));
          return;
        }
        throw error;
      }
    }
  );

  app.get("/v1/writing/archives", { preHandler: authenticate(services.authService) }, async (request, reply) => {
    const authRequest = request as AuthenticatedRequest;
    const items = services.writingService.getRewriteArchive(authRequest.auth.userId);
    reply.code(200).send({
      items: items.map(serializeArchiveItem)
    });
  });
};
