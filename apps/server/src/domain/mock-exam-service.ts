import { randomUUID } from "node:crypto";
import { appendAudit } from "./audit.js";
import { nowIso } from "./time.js";
import { InMemoryStore } from "./store.js";
import type { MockExam, MockExamReport, MockExamSkill, MockExamStatus, StudyTask } from "./types.js";

const EXAM_SKILLS: MockExamSkill[] = ["listening", "speaking", "reading", "writing"];
const DEFAULT_LIMIT_SECONDS = 2 * 60 * 60;

const roundHalf = (value: number): number => Number((Math.round(value * 2) / 2).toFixed(1));

const average = (values: number[]): number => {
  if (values.length === 0) {
    return 0;
  }
  return values.reduce((sum, item) => sum + item, 0) / values.length;
};

export class MockExamService {
  constructor(private readonly store: InMemoryStore) {}

  createExam(input: { userId: string; timeLimitSeconds?: number }): MockExam {
    const now = nowIso();
    const exam: MockExam = {
      id: randomUUID(),
      userId: input.userId,
      status: "in_progress",
      timeLimitSeconds:
        typeof input.timeLimitSeconds === "number" && Number.isFinite(input.timeLimitSeconds)
          ? Math.max(1800, Math.min(4 * 3600, Math.trunc(input.timeLimitSeconds)))
          : DEFAULT_LIMIT_SECONDS,
      elapsedSeconds: 0,
      startedAt: now,
      lastCheckpointAt: now,
      currentSkillIndex: 0,
      sections: EXAM_SKILLS.map((skill, index) => ({
        skill,
        status: index === 0 ? "in_progress" : "not_started",
        answeredCount: 0
      })),
      createdAt: now,
      updatedAt: now
    };

    this.store.mockExamsById.set(exam.id, exam);

    appendAudit(this.store, "mock_exam_created", {
      userId: input.userId,
      metadata: {
        examId: exam.id,
        timeLimitSeconds: exam.timeLimitSeconds
      }
    });

    return exam;
  }

  getExam(userId: string, examId: string): MockExam {
    const exam = this.requireExam(userId, examId);
    this.syncElapsed(exam);
    return exam;
  }

  saveProgress(input: {
    userId: string;
    examId: string;
    skill: MockExamSkill;
    answeredCount: number;
    completed?: boolean;
  }): MockExam {
    const exam = this.requireExam(input.userId, input.examId);
    this.syncElapsed(exam);
    if (exam.status !== "in_progress") {
      throw new Error("EXAM_ALREADY_SUBMITTED");
    }

    const section = exam.sections.find((item) => item.skill === input.skill);
    if (!section) {
      throw new Error("SECTION_NOT_FOUND");
    }

    section.answeredCount = Math.max(0, Math.trunc(input.answeredCount));
    section.lastCheckpointAt = nowIso();
    if (section.status === "not_started") {
      section.status = "in_progress";
    }

    if (input.completed) {
      section.status = "submitted";
      const nextIndex = exam.sections.findIndex((item) => item.status === "not_started");
      if (nextIndex >= 0) {
        exam.sections[nextIndex].status = "in_progress";
        exam.currentSkillIndex = nextIndex;
      } else {
        exam.currentSkillIndex = exam.sections.length - 1;
      }
    }

    exam.lastCheckpointAt = nowIso();
    exam.updatedAt = nowIso();
    this.store.mockExamsById.set(exam.id, exam);

    appendAudit(this.store, "mock_exam_progress_saved", {
      userId: input.userId,
      metadata: {
        examId: exam.id,
        skill: input.skill,
        answeredCount: section.answeredCount,
        completed: Boolean(input.completed)
      }
    });

    return exam;
  }

  recoverExam(userId: string, examId: string): MockExam {
    const exam = this.requireExam(userId, examId);
    if (exam.status !== "in_progress") {
      throw new Error("EXAM_NOT_RECOVERABLE");
    }
    exam.recoveredAt = nowIso();
    exam.lastCheckpointAt = nowIso();
    exam.updatedAt = nowIso();
    this.store.mockExamsById.set(exam.id, exam);

    appendAudit(this.store, "mock_exam_recovered", {
      userId,
      metadata: {
        examId: exam.id,
        elapsedSeconds: exam.elapsedSeconds
      }
    });

    return exam;
  }

  submitExam(input: {
    userId: string;
    examId: string;
    skillBands?: Partial<Record<MockExamSkill, number>>;
  }): {
    exam: MockExam;
    report: MockExamReport;
  } {
    const exam = this.requireExam(input.userId, input.examId);
    this.syncElapsed(exam);
    if (exam.status === "completed" && exam.reportId) {
      const report = this.store.mockExamReportsById.get(exam.reportId);
      if (report) {
        return { exam, report };
      }
    }

    for (const section of exam.sections) {
      if (section.status === "not_started") {
        section.status = "submitted";
      }
      if (section.status === "in_progress") {
        section.status = "submitted";
      }
    }

    exam.status = "submitted";
    exam.submittedAt = nowIso();
    exam.updatedAt = nowIso();

    const report = this.generateReport(exam, input.skillBands);
    exam.reportId = report.id;
    exam.status = "completed";
    exam.updatedAt = nowIso();
    this.store.mockExamsById.set(exam.id, exam);

    appendAudit(this.store, "mock_exam_submitted", {
      userId: input.userId,
      metadata: {
        examId: exam.id,
        elapsedSeconds: exam.elapsedSeconds,
        reportId: report.id
      }
    });

    return {
      exam,
      report
    };
  }

  getReport(userId: string, examId: string): MockExamReport {
    const exam = this.requireExam(userId, examId);
    if (!exam.reportId) {
      throw new Error("REPORT_NOT_READY");
    }
    const report = this.store.mockExamReportsById.get(exam.reportId);
    if (!report || report.userId !== userId) {
      throw new Error("REPORT_NOT_FOUND");
    }
    return report;
  }

  applyReportWritebackToPlan(userId: string, examId: string): MockExamReport {
    const report = this.getReport(userId, examId);
    if (report.planWriteback) {
      return report;
    }

    const activePlanId = this.store.activePlanIdByUserId.get(userId);
    if (!activePlanId) {
      report.planWriteback = {
        applied: false,
        reasons: ["未找到活动学习计划，未执行回写。"],
        undoAvailable: false,
        changedTasks: []
      };
      report.updatedAt = nowIso();
      this.store.mockExamReportsById.set(report.id, report);
      return report;
    }

    const plan = this.store.studyPlansById.get(activePlanId);
    if (!plan) {
      report.planWriteback = {
        applied: false,
        reasons: ["活动计划不存在，未执行回写。"],
        undoAvailable: false,
        changedTasks: []
      };
      report.updatedAt = nowIso();
      this.store.mockExamReportsById.set(report.id, report);
      return report;
    }

    const weakest = [...EXAM_SKILLS].sort(
      (left, right) => report.skillBandEstimates[left] - report.skillBandEstimates[right]
    )[0] as MockExamSkill;
    const firstWeek = plan.weeks[0];
    const targets = firstWeek.tasks.filter((task) => task.skill === weakest);
    const selectedTargets = targets.length > 0 ? targets : firstWeek.tasks.slice(0, 1);

    const changedTasks: Array<{
      taskId: string;
      targetMinutesBefore: number;
      completionCriteriaBefore: string;
      targetMinutesAfter: number;
      completionCriteriaAfter: string;
    }> = [];

    for (const task of selectedTargets) {
      const before = this.snapshotTask(task);
      task.targetMinutes = Math.min(240, task.targetMinutes + 20);
      task.completionCriteria = `${before.completionCriteria}（基于模考回写强化 ${weakest}）`;
      changedTasks.push({
        taskId: task.id,
        targetMinutesBefore: before.targetMinutes,
        completionCriteriaBefore: before.completionCriteria,
        targetMinutesAfter: task.targetMinutes,
        completionCriteriaAfter: task.completionCriteria
      });
    }

    plan.version += 1;
    plan.updatedAt = nowIso();

    report.planWriteback = {
      applied: true,
      appliedAt: nowIso(),
      reasons: [
        `模考最弱项为 ${weakest}，系统已自动提高下周对应训练任务强度。`,
        "改动支持一次撤销。"
      ],
      undoAvailable: changedTasks.length > 0,
      changedTasks
    };
    report.updatedAt = nowIso();
    this.store.studyPlansById.set(plan.id, plan);
    this.store.mockExamReportsById.set(report.id, report);

    appendAudit(this.store, "mock_exam_plan_written_back", {
      userId,
      metadata: {
        examId,
        planId: plan.id,
        weakestSkill: weakest,
        changedTaskCount: changedTasks.length
      }
    });

    return report;
  }

  undoReportWriteback(userId: string, examId: string): MockExamReport {
    const report = this.getReport(userId, examId);
    if (!report.planWriteback || !report.planWriteback.applied) {
      throw new Error("WRITEBACK_NOT_APPLIED");
    }
    if (!report.planWriteback.undoAvailable) {
      throw new Error("WRITEBACK_NOT_UNDOABLE");
    }
    if (report.planWriteback.undoneAt) {
      throw new Error("WRITEBACK_ALREADY_UNDONE");
    }

    const activePlanId = this.store.activePlanIdByUserId.get(userId);
    const plan = activePlanId ? this.store.studyPlansById.get(activePlanId) : undefined;
    if (!plan) {
      throw new Error("PLAN_NOT_FOUND");
    }

    for (const changed of report.planWriteback.changedTasks) {
      const found = this.findTask(plan.weeks.flatMap((week) => week.tasks), changed.taskId);
      if (!found) {
        continue;
      }
      found.targetMinutes = changed.targetMinutesBefore;
      found.completionCriteria = changed.completionCriteriaBefore;
    }
    plan.version += 1;
    plan.updatedAt = nowIso();

    report.planWriteback.undoneAt = nowIso();
    report.planWriteback.undoAvailable = false;
    report.updatedAt = nowIso();
    this.store.studyPlansById.set(plan.id, plan);
    this.store.mockExamReportsById.set(report.id, report);

    appendAudit(this.store, "mock_exam_plan_writeback_undone", {
      userId,
      metadata: {
        examId,
        planId: plan.id,
        changedTaskCount: report.planWriteback.changedTasks.length
      }
    });

    return report;
  }

  getReportExport(userId: string, examId: string): {
    filename: string;
    content: string;
  } {
    const report = this.getReport(userId, examId);
    return {
      filename: `mock-exam-report-${examId}.txt`,
      content: report.exportText
    };
  }

  private requireExam(userId: string, examId: string): MockExam {
    const exam = this.store.mockExamsById.get(examId);
    if (!exam || exam.userId !== userId) {
      throw new Error("EXAM_NOT_FOUND");
    }
    return exam;
  }

  private syncElapsed(exam: MockExam): void {
    if (exam.status !== "in_progress") {
      return;
    }
    const baseIso = exam.lastCheckpointAt ?? exam.startedAt;
    const base = new Date(baseIso).getTime();
    if (!Number.isFinite(base)) {
      exam.lastCheckpointAt = nowIso();
      exam.recoveredAt = nowIso();
      return;
    }
    const delta = Math.max(0, Math.floor((Date.now() - base) / 1000));
    exam.elapsedSeconds = Math.max(0, exam.elapsedSeconds + Math.min(delta, 3600));
    if (exam.elapsedSeconds > exam.timeLimitSeconds * 2) {
      exam.elapsedSeconds = exam.timeLimitSeconds;
      exam.recoveredAt = nowIso();
    }
    exam.lastCheckpointAt = nowIso();
    exam.updatedAt = nowIso();
  }

  private generateReport(
    exam: MockExam,
    inputBands?: Partial<Record<MockExamSkill, number>>
  ): MockExamReport {
    const generatedAt = nowIso();
    const derivedSkillBands = Object.fromEntries(
      EXAM_SKILLS.map((skill) => {
        const section = exam.sections.find((item) => item.skill === skill);
        const answered = section?.answeredCount ?? 0;
        const estimated = roundHalf(Math.max(4.5, Math.min(8.5, 5 + answered / 15)));
        const provided = inputBands?.[skill];
        return [skill, typeof provided === "number" ? roundHalf(provided) : estimated];
      })
    ) as Record<MockExamSkill, number>;

    const totalEstimatedBand = roundHalf(average(Object.values(derivedSkillBands)));
    const errorDistribution = Object.fromEntries(
      EXAM_SKILLS.map((skill) => [skill, Math.max(5, Math.round((9 - derivedSkillBands[skill]) * 12))])
    ) as Record<MockExamSkill, number>;

    const weakest = [...EXAM_SKILLS].sort((a, b) => derivedSkillBands[a] - derivedSkillBands[b])[0] as MockExamSkill;
    const nextActions = [
      `优先提升 ${weakest}，建议未来 7 天增加 2 次针对性训练。`,
      "保持听说读写均衡输入，避免单科过载导致总分波动。",
      "每次训练后记录错因并在 24 小时内完成一次重练。"
    ];

    const report: MockExamReport = {
      id: randomUUID(),
      examId: exam.id,
      userId: exam.userId,
      totalEstimatedBand,
      skillBandEstimates: derivedSkillBands,
      errorDistribution,
      nextActions,
      generatedAt,
      exportText: [
        `Mock Exam Report ${exam.id}`,
        `Generated At: ${generatedAt}`,
        `Overall: ${totalEstimatedBand}`,
        `Listening: ${derivedSkillBands.listening}`,
        `Speaking: ${derivedSkillBands.speaking}`,
        `Reading: ${derivedSkillBands.reading}`,
        `Writing: ${derivedSkillBands.writing}`,
        `Weakest Skill: ${weakest}`,
        `Actions: ${nextActions.join(" | ")}`
      ].join("\n"),
      createdAt: generatedAt,
      updatedAt: generatedAt
    };

    this.store.mockExamReportsById.set(report.id, report);

    appendAudit(this.store, "mock_exam_report_generated", {
      userId: exam.userId,
      metadata: {
        examId: exam.id,
        reportId: report.id,
        overall: report.totalEstimatedBand
      }
    });

    return report;
  }

  private snapshotTask(task: StudyTask): {
    targetMinutes: number;
    completionCriteria: string;
  } {
    return {
      targetMinutes: task.targetMinutes,
      completionCriteria: task.completionCriteria
    };
  }

  private findTask(tasks: StudyTask[], taskId: string): StudyTask | undefined {
    return tasks.find((task) => task.id === taskId);
  }
}
