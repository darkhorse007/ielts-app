import { randomUUID } from "node:crypto";
import { appendAudit } from "./audit.js";
import { nowIso } from "./time.js";
import { InMemoryStore } from "./store.js";
import type {
  AssessmentJob,
  AssessmentStatus,
  BandEstimate,
  DiagnosticQuestion,
  SkillType,
  StudyPlan,
  StudyPlanAdjustment,
  StudyPlanAdjustmentSource,
  StudyPlanWeek,
  StudyTask
} from "./types.js";

type UpsertGoalInput = {
  userId: string;
  idempotencyKey: string;
  targetOverallBand: number;
  targetExamDate: string;
  weeklyStudyHours: number;
  weakSkills: Array<"listening" | "speaking" | "reading" | "writing">;
};

const SKILLS: SkillType[] = ["listening", "speaking", "reading", "writing"];
const MAX_PLAN_ADJUSTMENT_HISTORY = 100;

const roundHalf = (value: number): number => Math.round(value * 2) / 2;

const clampBand = (value: number): number => {
  return Math.max(0, Math.min(9, roundHalf(value)));
};

const clamp01 = (value: number): number => {
  if (!Number.isFinite(value)) {
    return 0;
  }
  return Math.max(0, Math.min(1, value));
};

export class OnboardingService {
  constructor(private readonly store: InMemoryStore) {}

  upsertGoalAndEnqueueAssessment(input: UpsertGoalInput): {
    assessmentId: string;
    planId: string;
    status: "processing" | "completed" | "failed";
  } {
    const dedupeKey = `${input.userId}:${input.idempotencyKey}`;
    const existingGoalId = this.store.goalProfileByUserAndIdempotency.get(dedupeKey);
    if (existingGoalId) {
      const existingGoal = this.store.goalProfilesById.get(existingGoalId);
      const existingJob = existingGoal
        ? this.store.assessmentJobsById.get(existingGoal.assessmentId)
        : undefined;

      if (existingGoal && existingJob) {
        return {
          assessmentId: existingJob.id,
          planId: existingGoal.planId,
          status: existingJob.status === "completed" ? "completed" : "processing"
        };
      }
    }

    const now = nowIso();
    const assessmentId = randomUUID();
    const planId = randomUUID();

    const goalProfileId = randomUUID();
    this.store.goalProfilesById.set(goalProfileId, {
      id: goalProfileId,
      userId: input.userId,
      targetOverallBand: input.targetOverallBand,
      targetExamDate: input.targetExamDate,
      weeklyStudyHours: input.weeklyStudyHours,
      weakSkills: input.weakSkills,
      assessmentId,
      planId,
      idempotencyKey: input.idempotencyKey,
      createdAt: now,
      updatedAt: now
    });
    this.store.goalProfileByUserAndIdempotency.set(dedupeKey, goalProfileId);

    this.store.assessmentJobsById.set(assessmentId, {
      id: assessmentId,
      userId: input.userId,
      planId,
      status: "processing",
      questionSet: this.createQuestionSet(),
      answersByQuestionId: {},
      currentQuestionIndex: 0,
      accumulatedActiveSeconds: 0,
      createdAt: now,
      updatedAt: now
    });

    appendAudit(this.store, "goal_profile_created", {
      userId: input.userId,
      metadata: {
        goalProfileId,
        targetOverallBand: input.targetOverallBand,
        targetExamDate: input.targetExamDate
      }
    });

    appendAudit(this.store, "assessment_enqueued", {
      userId: input.userId,
      metadata: {
        assessmentId,
        planId,
        questionCount: 8
      }
    });

    return {
      assessmentId,
      planId,
      status: "processing"
    };
  }

  getAssessmentStatus(userId: string, assessmentId: string): {
    assessmentId: string;
    planId: string;
    status: "processing" | "in_progress" | "paused" | "completed" | "failed";
    updatedAt: string;
    answeredCount: number;
    totalQuestions: number;
    elapsedSeconds: number;
    errorMessage?: string;
  } {
    const job = this.requireAssessment(userId, assessmentId);

    return {
      assessmentId: job.id,
      planId: job.planId,
      status: job.status,
      updatedAt: job.updatedAt,
      answeredCount: Object.keys(job.answersByQuestionId).length,
      totalQuestions: job.questionSet.length,
      elapsedSeconds: this.getElapsedSeconds(job),
      errorMessage: job.errorMessage
    };
  }

  getDiagnosticQuestions(userId: string, assessmentId: string): {
    assessmentId: string;
    status: Exclude<AssessmentStatus, "processing">;
    questions: Array<{ id: string; skill: SkillType; prompt: string }>;
    answeredCount: number;
    totalQuestions: number;
    elapsedSeconds: number;
    currentQuestionIndex: number;
  } {
    const job = this.requireAssessment(userId, assessmentId);
    this.ensureStarted(job);
    const status: Exclude<AssessmentStatus, "processing"> = job.status === "processing" ? "in_progress" : job.status;

    return {
      assessmentId: job.id,
      status,
      questions: job.questionSet.map((item) => ({
        id: item.id,
        skill: item.skill,
        prompt: item.prompt
      })),
      answeredCount: Object.keys(job.answersByQuestionId).length,
      totalQuestions: job.questionSet.length,
      elapsedSeconds: this.getElapsedSeconds(job),
      currentQuestionIndex: job.currentQuestionIndex
    };
  }

  submitDiagnosticAnswer(input: {
    userId: string;
    assessmentId: string;
    questionId: string;
    answer: string;
  }): {
    assessmentId: string;
    answeredCount: number;
    totalQuestions: number;
    currentQuestionIndex: number;
    status: Exclude<AssessmentStatus, "processing">;
  } {
    const job = this.requireAssessment(input.userId, input.assessmentId);
    this.ensureStarted(job);
    const status: Exclude<AssessmentStatus, "processing"> = job.status === "processing" ? "in_progress" : job.status;

    if (job.status === "paused") {
      throw new Error("ASSESSMENT_PAUSED");
    }
    if (job.status === "completed") {
      throw new Error("ASSESSMENT_COMPLETED");
    }

    const question = job.questionSet.find((item) => item.id === input.questionId);
    if (!question) {
      throw new Error("QUESTION_NOT_FOUND");
    }

    const answer = input.answer.trim();
    const normalizedAnswer = answer.toLowerCase();
    const matchedKeywordCount = question.expectedKeywords.filter((keyword) =>
      normalizedAnswer.includes(keyword.toLowerCase())
    ).length;

    const baseScoreRatio = question.expectedKeywords.length === 0
      ? 0
      : matchedKeywordCount / question.expectedKeywords.length;
    const score = answer.length === 0 ? 0 : Number((Math.max(0.1, baseScoreRatio) * question.maxScore).toFixed(2));

    job.answersByQuestionId[input.questionId] = {
      questionId: input.questionId,
      answer,
      score,
      answeredAt: nowIso()
    };

    const questionIndex = job.questionSet.findIndex((item) => item.id === input.questionId);
    job.currentQuestionIndex = Math.max(job.currentQuestionIndex, questionIndex + 1);
    job.updatedAt = nowIso();
    this.store.assessmentJobsById.set(job.id, job);

    appendAudit(this.store, "assessment_answer_submitted", {
      userId: input.userId,
      metadata: {
        assessmentId: input.assessmentId,
        questionId: input.questionId,
        score
      }
    });

    return {
      assessmentId: job.id,
      answeredCount: Object.keys(job.answersByQuestionId).length,
      totalQuestions: job.questionSet.length,
      currentQuestionIndex: job.currentQuestionIndex,
      status
    };
  }

  pauseDiagnostic(userId: string, assessmentId: string): {
    assessmentId: string;
    status: "paused";
    elapsedSeconds: number;
  } {
    const job = this.requireAssessment(userId, assessmentId);
    this.ensureStarted(job);

    if (job.status === "paused") {
      return {
        assessmentId: job.id,
        status: "paused",
        elapsedSeconds: this.getElapsedSeconds(job)
      };
    }

    if (job.status === "in_progress" && job.activeStartedAt) {
      const segmentSeconds = Math.floor((Date.now() - new Date(job.activeStartedAt).getTime()) / 1000);
      job.accumulatedActiveSeconds += Math.max(0, segmentSeconds);
      job.activeStartedAt = undefined;
    }

    job.status = "paused";
    job.pausedAt = nowIso();
    job.updatedAt = nowIso();
    this.store.assessmentJobsById.set(job.id, job);

    appendAudit(this.store, "assessment_paused", {
      userId,
      metadata: {
        assessmentId
      }
    });

    return {
      assessmentId: job.id,
      status: "paused",
      elapsedSeconds: this.getElapsedSeconds(job)
    };
  }

  resumeDiagnostic(userId: string, assessmentId: string): {
    assessmentId: string;
    status: "in_progress";
    elapsedSeconds: number;
  } {
    const job = this.requireAssessment(userId, assessmentId);
    this.ensureStarted(job);

    if (job.status === "completed") {
      throw new Error("ASSESSMENT_COMPLETED");
    }

    job.status = "in_progress";
    job.pausedAt = undefined;
    if (!job.activeStartedAt) {
      job.activeStartedAt = nowIso();
    }
    job.updatedAt = nowIso();
    this.store.assessmentJobsById.set(job.id, job);

    appendAudit(this.store, "assessment_resumed", {
      userId,
      metadata: {
        assessmentId
      }
    });

    return {
      assessmentId: job.id,
      status: "in_progress",
      elapsedSeconds: this.getElapsedSeconds(job)
    };
  }

  completeDiagnostic(userId: string, assessmentId: string): {
    assessmentId: string;
    planId: string;
    status: "completed";
    elapsedSeconds: number;
    skillBands: BandEstimate;
  } {
    const job = this.requireAssessment(userId, assessmentId);
    this.ensureStarted(job);

    if (job.status !== "completed") {
      if (job.status === "in_progress" && job.activeStartedAt) {
        const segmentSeconds = Math.floor((Date.now() - new Date(job.activeStartedAt).getTime()) / 1000);
        job.accumulatedActiveSeconds += Math.max(0, segmentSeconds);
      }
      job.activeStartedAt = undefined;
      job.status = "completed";
      job.completedAt = nowIso();
      job.updatedAt = nowIso();

      const skillBands = this.calculateSkillBands(job);
      job.skillBandEstimates = skillBands;
      this.store.assessmentJobsById.set(job.id, job);

      appendAudit(this.store, "assessment_completed", {
        userId,
        metadata: {
          assessmentId,
          elapsedSeconds: job.accumulatedActiveSeconds,
          answeredCount: Object.keys(job.answersByQuestionId).length
        }
      });

      this.generatePlanFromAssessment(job, userId, skillBands);
    }

    if (!job.skillBandEstimates) {
      throw new Error("ASSESSMENT_NOT_READY");
    }

    return {
      assessmentId: job.id,
      planId: job.planId,
      status: "completed",
      elapsedSeconds: this.getElapsedSeconds(job),
      skillBands: job.skillBandEstimates
    };
  }

  getActiveStudyPlan(userId: string): StudyPlan {
    const activePlanId = this.store.activePlanIdByUserId.get(userId);
    if (!activePlanId) {
      throw new Error("PLAN_NOT_FOUND");
    }

    const plan = this.store.studyPlansById.get(activePlanId);
    if (!plan || plan.userId !== userId) {
      throw new Error("PLAN_NOT_FOUND");
    }

    return plan;
  }

  adjustStudyTask(input: {
    userId: string;
    planId: string;
    taskId: string;
    targetMinutes?: number;
    completionCriteria?: string;
  }): StudyPlan {
    const plan = this.requirePlan(input.userId, input.planId);

    let taskMatched = false;
    let beforeTargetMinutes = 0;
    let afterTargetMinutes = 0;
    let beforeCompletionCriteria = "";
    let afterCompletionCriteria = "";
    let taskSkill: SkillType = "reading";

    for (const week of plan.weeks) {
      for (const task of week.tasks) {
        if (task.id !== input.taskId) {
          continue;
        }
        taskMatched = true;
        taskSkill = task.skill;
        beforeTargetMinutes = task.targetMinutes;
        beforeCompletionCriteria = task.completionCriteria;

        if (typeof input.targetMinutes === "number") {
          task.targetMinutes = Math.max(5, Math.min(240, Math.trunc(input.targetMinutes)));
        }
        if (typeof input.completionCriteria === "string" && input.completionCriteria.trim().length > 0) {
          task.completionCriteria = input.completionCriteria.trim();
        }
        afterTargetMinutes = task.targetMinutes;
        afterCompletionCriteria = task.completionCriteria;
      }
    }

    if (!taskMatched) {
      throw new Error("TASK_NOT_FOUND");
    }

    plan.version += 1;
    plan.updatedAt = nowIso();
    this.pushAdjustmentHistory(plan, {
      sourceType: "manual_task_adjustment",
      sourceId: input.taskId,
      skill: taskSkill,
      score: undefined,
      reason: "手动调整学习任务",
      changedTasks: [
        {
          taskId: input.taskId,
          skill: taskSkill,
          beforeTargetMinutes,
          afterTargetMinutes,
          beforeCompletionCriteria,
          afterCompletionCriteria
        }
      ]
    });
    this.store.studyPlansById.set(plan.id, plan);

    appendAudit(this.store, "plan_adjusted", {
      userId: input.userId,
      metadata: {
        planId: input.planId,
        taskId: input.taskId,
        targetMinutes: input.targetMinutes,
        completionCriteria: input.completionCriteria
      }
    });

    return plan;
  }

  applyAdaptiveAdjustment(input: {
    userId: string;
    sourceType: Exclude<StudyPlanAdjustmentSource, "manual_task_adjustment">;
    sourceId: string;
    skill: SkillType;
    score: number;
  }): {
    applied: boolean;
    reason: string;
    planId?: string;
    adjustmentId?: string;
    version?: number;
  } {
    const activePlanId = this.store.activePlanIdByUserId.get(input.userId);
    if (!activePlanId) {
      return {
        applied: false,
        reason: "no_active_plan"
      };
    }
    const plan = this.store.studyPlansById.get(activePlanId);
    if (!plan || plan.userId !== input.userId || plan.status !== "active") {
      return {
        applied: false,
        reason: "no_active_plan"
      };
    }

    const task = plan.weeks
      .flatMap((week) => week.tasks)
      .find((item) => item.skill === input.skill && item.status !== "done" && item.status !== "skipped");
    if (!task) {
      return {
        applied: false,
        reason: "no_matching_task"
      };
    }

    const score = clamp01(input.score);
    const adaptive = this.decideAdaptiveDelta(score);
    if (adaptive.deltaMinutes === 0) {
      return {
        applied: false,
        reason: adaptive.reason
      };
    }

    const beforeTargetMinutes = task.targetMinutes;
    const afterTargetMinutes = Math.max(5, Math.min(240, beforeTargetMinutes + adaptive.deltaMinutes));
    if (afterTargetMinutes === beforeTargetMinutes) {
      return {
        applied: false,
        reason: adaptive.reason
      };
    }

    task.targetMinutes = afterTargetMinutes;
    plan.version += 1;
    plan.updatedAt = nowIso();

    const deltaLabel = adaptive.deltaMinutes > 0 ? `+${adaptive.deltaMinutes}` : String(adaptive.deltaMinutes);
    const reason = `${input.skill} 最近表现 ${Math.round(score * 100)}%，任务时长 ${deltaLabel} 分钟。${adaptive.reason}`;

    const adjustment = this.pushAdjustmentHistory(plan, {
      sourceType: input.sourceType,
      sourceId: input.sourceId,
      skill: input.skill,
      score,
      reason,
      changedTasks: [
        {
          taskId: task.id,
          skill: task.skill,
          beforeTargetMinutes,
          afterTargetMinutes,
          beforeCompletionCriteria: task.completionCriteria,
          afterCompletionCriteria: task.completionCriteria
        }
      ]
    });
    this.store.studyPlansById.set(plan.id, plan);

    appendAudit(this.store, "plan_auto_adjusted", {
      userId: input.userId,
      metadata: {
        planId: plan.id,
        adjustmentId: adjustment.id,
        sourceType: input.sourceType,
        sourceId: input.sourceId,
        skill: input.skill,
        score,
        beforeTargetMinutes,
        afterTargetMinutes
      }
    });

    return {
      applied: true,
      reason,
      planId: plan.id,
      adjustmentId: adjustment.id,
      version: plan.version
    };
  }

  getPlanAdjustmentHistory(input: {
    userId: string;
    planId: string;
    sourceType?: StudyPlanAdjustmentSource;
    skill?: SkillType;
    page?: number;
    pageSize?: number;
  }): {
    items: StudyPlanAdjustment[];
    total: number;
    page: number;
    pageSize: number;
  } {
    const plan = this.requirePlan(input.userId, input.planId);
    const page = Math.max(1, input.page ?? 1);
    const pageSize = Math.max(1, Math.min(100, input.pageSize ?? 20));
    const filtered = plan.adjustmentHistory
      .filter((item) => (input.sourceType ? item.sourceType === input.sourceType : true))
      .filter((item) => (input.skill ? item.skill === input.skill : true))
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
    const start = (page - 1) * pageSize;

    return {
      items: filtered.slice(start, start + pageSize),
      total: filtered.length,
      page,
      pageSize
    };
  }

  private requireAssessment(userId: string, assessmentId: string): AssessmentJob {
    const job = this.store.assessmentJobsById.get(assessmentId);
    if (!job || job.userId !== userId) {
      throw new Error("ASSESSMENT_NOT_FOUND");
    }
    return job;
  }

  private requirePlan(userId: string, planId: string): StudyPlan {
    const plan = this.store.studyPlansById.get(planId);
    if (!plan || plan.userId !== userId) {
      throw new Error("PLAN_NOT_FOUND");
    }
    return plan;
  }

  private ensureStarted(job: AssessmentJob): void {
    if (job.status !== "processing") {
      return;
    }

    const timestamp = nowIso();
    job.status = "in_progress";
    job.startedAt = timestamp;
    job.activeStartedAt = timestamp;
    job.updatedAt = timestamp;
    this.store.assessmentJobsById.set(job.id, job);

    appendAudit(this.store, "assessment_started", {
      userId: job.userId,
      metadata: {
        assessmentId: job.id
      }
    });
  }

  private getElapsedSeconds(job: AssessmentJob): number {
    if (job.status === "in_progress" && job.activeStartedAt) {
      const activeSegment = Math.floor((Date.now() - new Date(job.activeStartedAt).getTime()) / 1000);
      return job.accumulatedActiveSeconds + Math.max(0, activeSegment);
    }
    return job.accumulatedActiveSeconds;
  }

  private calculateSkillBands(job: AssessmentJob): BandEstimate {
    const totalBySkill: Record<SkillType, number> = {
      listening: 0,
      speaking: 0,
      reading: 0,
      writing: 0
    };
    const maxBySkill: Record<SkillType, number> = {
      listening: 0,
      speaking: 0,
      reading: 0,
      writing: 0
    };

    for (const question of job.questionSet) {
      maxBySkill[question.skill] += question.maxScore;
      const answer = job.answersByQuestionId[question.id];
      totalBySkill[question.skill] += answer ? answer.score : 0;
    }

    const result: BandEstimate = {
      listening: 5,
      speaking: 5,
      reading: 5,
      writing: 5
    };

    for (const skill of SKILLS) {
      const max = maxBySkill[skill] || 1;
      const ratio = totalBySkill[skill] / max;
      result[skill] = clampBand(4.5 + ratio * 3.5);
    }

    return result;
  }

  private generatePlanFromAssessment(job: AssessmentJob, userId: string, skillBands: BandEstimate): void {
    const existingActivePlanId = this.store.activePlanIdByUserId.get(userId);
    if (existingActivePlanId) {
      const existing = this.store.studyPlansById.get(existingActivePlanId);
      if (existing) {
        existing.status = "archived";
        existing.updatedAt = nowIso();
        this.store.studyPlansById.set(existing.id, existing);
      }
    }

    const goalProfile = Array.from(this.store.goalProfilesById.values()).find(
      (profile) => profile.userId === userId && profile.assessmentId === job.id
    );

    const weeklyStudyHours = goalProfile?.weeklyStudyHours ?? 10;
    const totalWeeklyMinutes = Math.max(60, weeklyStudyHours * 60);

    const skillOrder = [...SKILLS].sort((a, b) => skillBands[a] - skillBands[b]);

    const weeks: StudyPlanWeek[] = [];
    for (let weekNo = 1; weekNo <= 8; weekNo += 1) {
      const goals = [
        `Week ${weekNo}: 提升最弱项 ${skillOrder[0]} 的正确率`,
        `Week ${weekNo}: 完成四科最小训练闭环`,
        `Week ${weekNo}: 输出一轮错因复盘与复练`,
        `Week ${weekNo}: 周末完成阶段测评并记录分项趋势`
      ];

      const tasks: StudyTask[] = skillOrder.map((skill, index) => {
        const weight = 1.2 - index * 0.1;
        const minutes = Math.max(20, Math.round((totalWeeklyMinutes / 4) * weight));
        return {
          id: randomUUID(),
          skill,
          taskType: weekNo <= 2 ? "foundation" : weekNo <= 6 ? "intensive" : "sprint",
          title: `${skill} 专项训练 Week ${weekNo}`,
          targetMinutes: minutes,
          completionCriteria: `完成 ${skill} 训练并提交复盘，目标学习时长 ${minutes} 分钟`,
          dayOfWeek: index + 1,
          status: "todo"
        };
      });

      weeks.push({
        id: randomUUID(),
        weekNo,
        goals,
        tasks
      });
    }

    const timestamp = nowIso();
    const plan: StudyPlan = {
      id: job.planId,
      userId,
      assessmentId: job.id,
      status: "active",
      horizonWeeks: 8,
      weeks,
      adjustmentHistory: [],
      version: 1,
      createdAt: timestamp,
      updatedAt: timestamp
    };

    this.store.studyPlansById.set(plan.id, plan);
    this.store.activePlanIdByUserId.set(userId, plan.id);

    appendAudit(this.store, "plan_generated", {
      userId,
      metadata: {
        planId: plan.id,
        assessmentId: job.id,
        weekCount: plan.weeks.length
      }
    });
  }

  private decideAdaptiveDelta(score: number): {
    deltaMinutes: number;
    reason: string;
  } {
    if (score < 0.55) {
      return {
        deltaMinutes: 20,
        reason: "正确率偏低，先补基础再提升速度。"
      };
    }
    if (score < 0.7) {
      return {
        deltaMinutes: 10,
        reason: "表现未达标，增加训练量巩固薄弱点。"
      };
    }
    if (score > 0.9) {
      return {
        deltaMinutes: -10,
        reason: "表现稳定，可释放部分时长给其他弱项。"
      };
    }
    if (score > 0.82) {
      return {
        deltaMinutes: -5,
        reason: "表现良好，适度减量保持节奏。"
      };
    }
    return {
      deltaMinutes: 0,
      reason: "表现平稳，维持当前训练强度。"
    };
  }

  private pushAdjustmentHistory(
    plan: StudyPlan,
    input: {
      sourceType: StudyPlanAdjustmentSource;
      sourceId: string;
      skill?: SkillType;
      score?: number;
      reason: string;
      changedTasks: StudyPlanAdjustment["changedTasks"];
    }
  ): StudyPlanAdjustment {
    const adjustment: StudyPlanAdjustment = {
      id: randomUUID(),
      userId: plan.userId,
      planId: plan.id,
      sourceType: input.sourceType,
      sourceId: input.sourceId,
      skill: input.skill,
      score: input.score,
      reason: input.reason,
      changedTasks: input.changedTasks,
      createdAt: nowIso()
    };
    plan.adjustmentHistory = [adjustment, ...plan.adjustmentHistory].slice(0, MAX_PLAN_ADJUSTMENT_HISTORY);
    return adjustment;
  }

  private createQuestionSet(): DiagnosticQuestion[] {
    const baseQuestions: Array<Pick<DiagnosticQuestion, "skill" | "prompt" | "expectedKeywords" | "maxScore">> = [
      {
        skill: "listening",
        prompt: "听力题1: 根据音频摘要写出核心信息点。",
        expectedKeywords: ["time", "location", "purpose"],
        maxScore: 5
      },
      {
        skill: "listening",
        prompt: "听力题2: 识别同义替换并写出答案。",
        expectedKeywords: ["synonym", "detail", "number"],
        maxScore: 5
      },
      {
        skill: "speaking",
        prompt: "口语题1: 描述你最近一次高效学习经历。",
        expectedKeywords: ["experience", "reason", "result"],
        maxScore: 5
      },
      {
        skill: "speaking",
        prompt: "口语题2: 回答一个追问并给出观点。",
        expectedKeywords: ["opinion", "example", "conclusion"],
        maxScore: 5
      },
      {
        skill: "reading",
        prompt: "阅读题1: 判断 T/F/NG 并给出依据。",
        expectedKeywords: ["evidence", "true", "false"],
        maxScore: 5
      },
      {
        skill: "reading",
        prompt: "阅读题2: 段落匹配并说明定位路径。",
        expectedKeywords: ["paragraph", "match", "reason"],
        maxScore: 5
      },
      {
        skill: "writing",
        prompt: "写作题1: 生成 Task 1 段落结构。",
        expectedKeywords: ["overview", "trend", "data"],
        maxScore: 5
      },
      {
        skill: "writing",
        prompt: "写作题2: 给出 Task 2 论证框架。",
        expectedKeywords: ["thesis", "argument", "example"],
        maxScore: 5
      }
    ];

    return baseQuestions.map((question) => ({
      ...question,
      id: randomUUID()
    }));
  }
}
