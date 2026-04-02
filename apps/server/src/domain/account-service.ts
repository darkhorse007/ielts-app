import { randomUUID } from "node:crypto";
import { appendAudit } from "./audit.js";
import { hashPassword } from "./crypto.js";
import { nowIso } from "./time.js";
import { InMemoryStore } from "./store.js";
import type { AuthService } from "./auth-service.js";
import type { ProgressService } from "./progress-service.js";

export class AccountService {
  constructor(
    private readonly store: InMemoryStore,
    private readonly authService: AuthService,
    private readonly progressService: ProgressService
  ) {}

  requestDeletion(userId: string): {
    userId: string;
    status: "pending_deletion";
    deletionRequestedAt: string;
  } {
    const user = this.store.usersById.get(userId);
    if (!user) {
      throw new Error("USER_NOT_FOUND");
    }
    if (user.status === "deleted") {
      throw new Error("USER_ALREADY_DELETED");
    }

    const timestamp = nowIso();
    user.status = "pending_deletion";
    user.deletionRequestedAt = timestamp;
    user.updatedAt = timestamp;
    this.store.usersById.set(user.id, user);

    appendAudit(this.store, "deletion_requested", {
      userId,
      metadata: {
        deletionRequestedAt: timestamp
      }
    });

    return {
      userId,
      status: "pending_deletion",
      deletionRequestedAt: timestamp
    };
  }

  deleteUser(userId: string): {
    userId: string;
    status: "deleted";
    deletedAt: string;
    revokedSessions: number;
    removedAssessments: number;
    removedPlans: number;
    removedGoalProfiles: number;
    removedProgressConflicts: number;
    removedPracticeSessions: number;
    removedRetryQueueItems: number;
    removedSpeakingSessions: number;
    removedWritingEvaluations: number;
    removedWritingRewriteArchives: number;
    removedMockExams: number;
    removedMockExamReports: number;
  } {
    const user = this.store.usersById.get(userId);
    if (!user) {
      throw new Error("USER_NOT_FOUND");
    }
    if (user.status === "deleted") {
      throw new Error("USER_ALREADY_DELETED");
    }

    const timestamp = nowIso();
    const revokedSessions = this.authService.revokeAllSessionsForUser(userId);

    if (user.email) {
      this.store.userIdByEmail.delete(user.email);
    }
    if (user.phone) {
      this.store.userIdByPhone.delete(user.phone);
    }

    user.email = undefined;
    user.phone = undefined;
    user.displayName = undefined;
    user.passwordHash = hashPassword(randomUUID());
    user.status = "deleted";
    user.deletedAt = timestamp;
    user.updatedAt = timestamp;
    this.store.usersById.set(user.id, user);

    const goalProfileIdsToRemove: string[] = [];
    for (const [goalId, goalProfile] of this.store.goalProfilesById.entries()) {
      if (goalProfile.userId === userId) {
        goalProfileIdsToRemove.push(goalId);
      }
    }
    for (const goalId of goalProfileIdsToRemove) {
      this.store.goalProfilesById.delete(goalId);
    }

    const dedupeKeysToRemove: string[] = [];
    for (const [key] of this.store.goalProfileByUserAndIdempotency.entries()) {
      if (key.startsWith(`${userId}:`)) {
        dedupeKeysToRemove.push(key);
      }
    }
    for (const key of dedupeKeysToRemove) {
      this.store.goalProfileByUserAndIdempotency.delete(key);
    }

    const assessmentIdsToRemove: string[] = [];
    for (const [assessmentId, assessment] of this.store.assessmentJobsById.entries()) {
      if (assessment.userId === userId) {
        assessmentIdsToRemove.push(assessmentId);
      }
    }
    for (const assessmentId of assessmentIdsToRemove) {
      this.store.assessmentJobsById.delete(assessmentId);
    }

    const planIdsToRemove: string[] = [];
    for (const [planId, plan] of this.store.studyPlansById.entries()) {
      if (plan.userId === userId) {
        planIdsToRemove.push(planId);
      }
    }
    for (const planId of planIdsToRemove) {
      this.store.studyPlansById.delete(planId);
    }
    this.store.activePlanIdByUserId.delete(userId);

    const progressCleanup = this.progressService.removeUserProgressData(userId);

    const practiceSessionIdsToRemove: string[] = [];
    for (const [sessionId, session] of this.store.practiceSessionsById.entries()) {
      if (session.userId === userId) {
        practiceSessionIdsToRemove.push(sessionId);
      }
    }
    for (const sessionId of practiceSessionIdsToRemove) {
      this.store.practiceSessionsById.delete(sessionId);
    }

    const retryQueueIdsToRemove: string[] = [];
    for (const [queueItemId, item] of this.store.retryQueueById.entries()) {
      if (item.userId === userId) {
        retryQueueIdsToRemove.push(queueItemId);
      }
    }
    for (const queueItemId of retryQueueIdsToRemove) {
      this.store.retryQueueById.delete(queueItemId);
    }

    const speakingSessionIdsToRemove: string[] = [];
    for (const [sessionId, session] of this.store.speakingSessionsById.entries()) {
      if (session.userId === userId) {
        speakingSessionIdsToRemove.push(sessionId);
      }
    }
    for (const sessionId of speakingSessionIdsToRemove) {
      this.store.speakingSessionsById.delete(sessionId);
    }

    const proficiencyKeysToRemove: string[] = [];
    for (const [key] of this.store.skillProficiencyByUserAndSkill.entries()) {
      if (key.startsWith(`${userId}:`)) {
        proficiencyKeysToRemove.push(key);
      }
    }
    for (const key of proficiencyKeysToRemove) {
      this.store.skillProficiencyByUserAndSkill.delete(key);
    }

    const writingEvaluationIdsToRemove: string[] = [];
    for (const [evaluationId, evaluation] of this.store.writingEvaluationsById.entries()) {
      if (evaluation.userId === userId) {
        writingEvaluationIdsToRemove.push(evaluationId);
      }
    }
    for (const evaluationId of writingEvaluationIdsToRemove) {
      this.store.writingEvaluationsById.delete(evaluationId);
    }

    const writingRewriteArchivesRemoved = this.store.writingRewriteArchivesByUserId.get(userId)?.length ?? 0;
    this.store.writingRewriteArchivesByUserId.delete(userId);

    const mockExamIdsToRemove: string[] = [];
    for (const [examId, exam] of this.store.mockExamsById.entries()) {
      if (exam.userId === userId) {
        mockExamIdsToRemove.push(examId);
      }
    }
    for (const examId of mockExamIdsToRemove) {
      this.store.mockExamsById.delete(examId);
    }

    const mockReportIdsToRemove: string[] = [];
    for (const [reportId, report] of this.store.mockExamReportsById.entries()) {
      if (report.userId === userId) {
        mockReportIdsToRemove.push(reportId);
      }
    }
    for (const reportId of mockReportIdsToRemove) {
      this.store.mockExamReportsById.delete(reportId);
    }

    const removedReminderPreferences = this.store.reminderPreferencesByUserId.has(userId) ? 1 : 0;
    this.store.reminderPreferencesByUserId.delete(userId);

    let removedReminderRecommendations = 0;
    for (const [reminderId, reminder] of this.store.reminderRecommendationsById.entries()) {
      if (reminder.userId !== userId) {
        continue;
      }
      this.store.reminderRecommendationsById.delete(reminderId);
      removedReminderRecommendations += 1;
    }

    let removedReminderDevices = 0;
    for (const [key, device] of this.store.reminderDevicesByUserAndInstallation.entries()) {
      if (device.userId !== userId) {
        continue;
      }
      this.store.reminderDevicesByUserAndInstallation.delete(key);
      removedReminderDevices += 1;
    }

    let removedReminderDeliveryAttempts = 0;
    for (const [attemptId, attempt] of this.store.reminderDeliveryAttemptsById.entries()) {
      if (attempt.userId !== userId) {
        continue;
      }
      this.store.reminderDeliveryAttemptsById.delete(attemptId);
      removedReminderDeliveryAttempts += 1;
    }

    appendAudit(this.store, "user_deleted", {
      userId,
      metadata: {
        deletedAt: timestamp,
        revokedSessions,
        removedAssessments: assessmentIdsToRemove.length,
        removedPlans: planIdsToRemove.length,
        removedGoalProfiles: goalProfileIdsToRemove.length,
        removedProgressConflicts: progressCleanup.removedConflicts,
        removedPracticeSessions: practiceSessionIdsToRemove.length,
        removedRetryQueueItems: retryQueueIdsToRemove.length,
        removedSpeakingSessions: speakingSessionIdsToRemove.length,
        removedWritingEvaluations: writingEvaluationIdsToRemove.length,
        removedWritingRewriteArchives: writingRewriteArchivesRemoved,
        removedMockExams: mockExamIdsToRemove.length,
        removedMockExamReports: mockReportIdsToRemove.length,
        removedReminderPreferences,
        removedReminderRecommendations,
        removedReminderDevices,
        removedReminderDeliveryAttempts
      }
    });

    return {
      userId,
      status: "deleted",
      deletedAt: timestamp,
      revokedSessions,
      removedAssessments: assessmentIdsToRemove.length,
      removedPlans: planIdsToRemove.length,
      removedGoalProfiles: goalProfileIdsToRemove.length,
      removedProgressConflicts: progressCleanup.removedConflicts,
      removedPracticeSessions: practiceSessionIdsToRemove.length,
      removedRetryQueueItems: retryQueueIdsToRemove.length,
      removedSpeakingSessions: speakingSessionIdsToRemove.length,
      removedWritingEvaluations: writingEvaluationIdsToRemove.length,
      removedWritingRewriteArchives: writingRewriteArchivesRemoved,
      removedMockExams: mockExamIdsToRemove.length,
      removedMockExamReports: mockReportIdsToRemove.length
    };
  }

  getProfile(userId: string): {
    id: string;
    email?: string;
    phone?: string;
    status: string;
    deletionRequestedAt?: string;
    deletedAt?: string;
    createdAt: string;
    updatedAt: string;
  } {
    return this.authService.getUserById(userId);
  }

  exportUserData(userId: string): {
    exportId: string;
    generatedAt: string;
    filename: string;
    content: string;
  } {
    const user = this.store.usersById.get(userId);
    if (!user || user.status === "deleted") {
      throw new Error("USER_NOT_FOUND");
    }

    const clone = <T>(value: T): T => JSON.parse(JSON.stringify(value)) as T;
    const generatedAt = nowIso();
    const exportId = randomUUID();
    const profile = this.authService.getUserById(userId);

    const sessions = Array.from(this.store.sessionsById.values())
      .filter((session) => session.userId === userId)
      .map((session) => ({
        id: session.id,
        deviceId: session.deviceId,
        ipAddress: session.ipAddress,
        userAgent: session.userAgent,
        expiresAt: session.expiresAt,
        revokedAt: session.revokedAt,
        createdAt: session.createdAt,
        updatedAt: session.updatedAt
      }));

    const goalProfiles = Array.from(this.store.goalProfilesById.values()).filter((item) => item.userId === userId);
    const assessmentJobs = Array.from(this.store.assessmentJobsById.values()).filter((item) => item.userId === userId);
    const studyPlans = Array.from(this.store.studyPlansById.values()).filter((item) => item.userId === userId);
    const progressSnapshot = this.store.userProgressByUserId.get(userId);
    const progressConflicts = this.store.progressConflicts.filter((item) => item.userId === userId);

    const practiceSessions = Array.from(this.store.practiceSessionsById.values()).filter((item) => item.userId === userId);
    const retryQueueItems = Array.from(this.store.retryQueueById.values()).filter((item) => item.userId === userId);
    const skillProficiencyBySkill = Object.fromEntries(
      Array.from(this.store.skillProficiencyByUserAndSkill.entries())
        .filter(([key]) => key.startsWith(`${userId}:`))
        .map(([key, value]) => [key.slice(userId.length + 1), value])
    );

    const speakingSessions = Array.from(this.store.speakingSessionsById.values()).filter((item) => item.userId === userId);
    const writingEvaluations = Array.from(this.store.writingEvaluationsById.values()).filter((item) => item.userId === userId);
    const writingRewriteArchives = this.store.writingRewriteArchivesByUserId.get(userId) ?? [];
    const writingTemplateUsages = this.store.writingTemplateUsagesByUserId.get(userId) ?? [];

    const mockExams = Array.from(this.store.mockExamsById.values()).filter((item) => item.userId === userId);
    const mockExamReports = Array.from(this.store.mockExamReportsById.values()).filter((item) => item.userId === userId);

    const reminderPreference = this.store.reminderPreferencesByUserId.get(userId);
    const reminderRecommendations = Array.from(this.store.reminderRecommendationsById.values()).filter(
      (item) => item.userId === userId
    );
    const reminderDevices = Array.from(this.store.reminderDevicesByUserAndInstallation.values()).filter(
      (item) => item.userId === userId
    );
    const reminderDeliveryAttempts = Array.from(this.store.reminderDeliveryAttemptsById.values()).filter(
      (item) => item.userId === userId
    );

    const analyticsEvents = this.store.analyticsEvents.filter((item) => item.userId === userId);

    const payload = {
      export_id: exportId,
      generated_at: generatedAt,
      export_scope: "user_domain_data_v1",
      profile: {
        id: profile.id,
        email: profile.email,
        phone: profile.phone,
        display_name: profile.displayName,
        system_roles: profile.systemRoles,
        status: profile.status,
        deletion_requested_at: profile.deletionRequestedAt,
        deleted_at: profile.deletedAt,
        created_at: profile.createdAt,
        updated_at: profile.updatedAt
      },
      auth: {
        sessions
      },
      learner: {
        goal_profiles: clone(goalProfiles),
        assessment_jobs: clone(assessmentJobs),
        study_plans: clone(studyPlans),
        active_plan_id: this.store.activePlanIdByUserId.get(userId),
        progress_snapshot: progressSnapshot ? clone(progressSnapshot) : undefined,
        progress_conflicts: clone(progressConflicts)
      },
      practice: {
        sessions: clone(practiceSessions),
        retry_queue_items: clone(retryQueueItems),
        skill_proficiency_by_skill: clone(skillProficiencyBySkill)
      },
      speaking: {
        sessions: clone(speakingSessions)
      },
      writing: {
        evaluations: clone(writingEvaluations),
        rewrite_archives: clone(writingRewriteArchives),
        template_usages: clone(writingTemplateUsages)
      },
      mock_exam: {
        exams: clone(mockExams),
        reports: clone(mockExamReports)
      },
      reminders: {
        preference: reminderPreference ? clone(reminderPreference) : undefined,
        recommendations: clone(reminderRecommendations),
        devices: clone(reminderDevices),
        delivery_attempts: clone(reminderDeliveryAttempts)
      },
      analytics: {
        total_events: analyticsEvents.length,
        events: clone(analyticsEvents)
      },
      exclusions: [
        "password_hash",
        "refresh_token_hash",
        "internal_audit_events",
        "backup_copies"
      ]
    };

    appendAudit(this.store, "user_data_exported", {
      userId,
      metadata: {
        exportId,
        generatedAt,
        analyticsEventCount: analyticsEvents.length,
        studyPlanCount: studyPlans.length,
        reminderRecommendationCount: reminderRecommendations.length,
        reminderDeviceCount: reminderDevices.length,
        reminderDeliveryAttemptCount: reminderDeliveryAttempts.length
      }
    });

    const filename = `user-data-export-${userId}-${generatedAt.slice(0, 10)}.json`;
    return {
      exportId,
      generatedAt,
      filename,
      content: `${JSON.stringify(payload, null, 2)}\n`
    };
  }
}
