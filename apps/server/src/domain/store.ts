import type {
  AbExperiment,
  AnalyticsEvent,
  AdminEntitlementAdjustment,
  AdminReviewRequest,
  AdminReportExport,
  BetaFeedback,
  BetaWhitelistEntry,
  AdminSession,
  AdminUser,
  AssessmentJob,
  AuditEvent,
  CanaryRelease,
  ChurnRiskSnapshot,
  ChurnStrategyTrigger,
  ContentItem,
  ContentImportBatch,
  CouponRule,
  FamilyGroup,
  FamilyInvitation,
  FailedLoginCounter,
  GoalProfile,
  MockExam,
  MockExamReport,
  PracticeSession,
  ProviderHealthSnapshot,
  ReminderPreference,
  ReminderRecommendation,
  ReleaseGateEvaluation,
  StabilityAlert,
  StabilityCheckpoint,
  StabilitySoakRun,
  SystemActionIdempotencyRecord,
  ProgressConflict,
  RefreshBlacklistEntry,
  RetryQueueItem,
  Session,
  SpeakingSession,
  SubscriptionEvent,
  SubscriptionOrder,
  StudyPlan,
  User,
  UserEntitlement,
  UserProgressSnapshot,
  WritingEvaluation,
  WritingTemplateUsage,
  WritingRewriteArchiveItem
} from "./types.js";

export type InMemoryStoreOverrides = {
  usersById?: Map<string, User>;
  userIdByEmail?: Map<string, string>;
  userIdByPhone?: Map<string, string>;
  sessionsById?: Map<string, Session>;
  sessionIdByRefreshHash?: Map<string, string>;
  refreshBlacklist?: Map<string, RefreshBlacklistEntry>;
  failedLoginByIdentifier?: Map<string, FailedLoginCounter>;
  goalProfilesById?: Map<string, GoalProfile>;
  goalProfileByUserAndIdempotency?: Map<string, string>;
  assessmentJobsById?: Map<string, AssessmentJob>;
  studyPlansById?: Map<string, StudyPlan>;
  activePlanIdByUserId?: Map<string, string>;
  userProgressByUserId?: Map<string, UserProgressSnapshot>;
  progressConflicts?: ProgressConflict[];
  practiceSessionsById?: Map<string, PracticeSession>;
  retryQueueById?: Map<string, RetryQueueItem>;
  skillProficiencyByUserAndSkill?: Map<string, number>;
  speakingSessionsById?: Map<string, SpeakingSession>;
  writingEvaluationsById?: Map<string, WritingEvaluation>;
  writingRewriteArchivesByUserId?: Map<string, WritingRewriteArchiveItem[]>;
  writingTemplateUsagesByUserId?: Map<string, WritingTemplateUsage[]>;
  mockExamsById?: Map<string, MockExam>;
  mockExamReportsById?: Map<string, MockExamReport>;
  analyticsEvents?: AnalyticsEvent[];
};

export class InMemoryStore {
  readonly usersById: Map<string, User>;
  readonly userIdByEmail: Map<string, string>;
  readonly userIdByPhone: Map<string, string>;

  readonly sessionsById: Map<string, Session>;
  readonly sessionIdByRefreshHash: Map<string, string>;
  readonly refreshBlacklist: Map<string, RefreshBlacklistEntry>;

  readonly failedLoginByIdentifier: Map<string, FailedLoginCounter>;
  readonly auditEvents: AuditEvent[] = [];
  readonly goalProfilesById: Map<string, GoalProfile>;
  readonly goalProfileByUserAndIdempotency: Map<string, string>;
  readonly assessmentJobsById: Map<string, AssessmentJob>;
  readonly studyPlansById: Map<string, StudyPlan>;
  readonly activePlanIdByUserId: Map<string, string>;
  readonly userProgressByUserId: Map<string, UserProgressSnapshot>;
  readonly progressConflicts: ProgressConflict[];
  readonly practiceSessionsById: Map<string, PracticeSession>;
  readonly retryQueueById: Map<string, RetryQueueItem>;
  readonly skillProficiencyByUserAndSkill: Map<string, number>;
  readonly speakingSessionsById: Map<string, SpeakingSession>;
  readonly writingEvaluationsById: Map<string, WritingEvaluation>;
  readonly writingRewriteArchivesByUserId: Map<string, WritingRewriteArchiveItem[]>;
  readonly writingTemplateUsagesByUserId: Map<string, WritingTemplateUsage[]>;
  readonly mockExamsById: Map<string, MockExam>;
  readonly mockExamReportsById: Map<string, MockExamReport>;

  constructor(overrides: InMemoryStoreOverrides = {}) {
    this.usersById = overrides.usersById ?? new Map<string, User>();
    this.userIdByEmail = overrides.userIdByEmail ?? new Map<string, string>();
    this.userIdByPhone = overrides.userIdByPhone ?? new Map<string, string>();
    this.sessionsById = overrides.sessionsById ?? new Map<string, Session>();
    this.sessionIdByRefreshHash = overrides.sessionIdByRefreshHash ?? new Map<string, string>();
    this.refreshBlacklist = overrides.refreshBlacklist ?? new Map<string, RefreshBlacklistEntry>();
    this.failedLoginByIdentifier = overrides.failedLoginByIdentifier ?? new Map<string, FailedLoginCounter>();
    this.goalProfilesById = overrides.goalProfilesById ?? new Map<string, GoalProfile>();
    this.goalProfileByUserAndIdempotency = overrides.goalProfileByUserAndIdempotency ?? new Map<string, string>();
    this.assessmentJobsById = overrides.assessmentJobsById ?? new Map<string, AssessmentJob>();
    this.studyPlansById = overrides.studyPlansById ?? new Map<string, StudyPlan>();
    this.activePlanIdByUserId = overrides.activePlanIdByUserId ?? new Map<string, string>();
    this.userProgressByUserId = overrides.userProgressByUserId ?? new Map<string, UserProgressSnapshot>();
    this.progressConflicts = overrides.progressConflicts ?? [];
    this.practiceSessionsById = overrides.practiceSessionsById ?? new Map<string, PracticeSession>();
    this.retryQueueById = overrides.retryQueueById ?? new Map<string, RetryQueueItem>();
    this.skillProficiencyByUserAndSkill = overrides.skillProficiencyByUserAndSkill ?? new Map<string, number>();
    this.speakingSessionsById = overrides.speakingSessionsById ?? new Map<string, SpeakingSession>();
    this.writingEvaluationsById = overrides.writingEvaluationsById ?? new Map<string, WritingEvaluation>();
    this.writingRewriteArchivesByUserId =
      overrides.writingRewriteArchivesByUserId ?? new Map<string, WritingRewriteArchiveItem[]>();
    this.writingTemplateUsagesByUserId =
      overrides.writingTemplateUsagesByUserId ?? new Map<string, WritingTemplateUsage[]>();
    this.mockExamsById = overrides.mockExamsById ?? new Map<string, MockExam>();
    this.mockExamReportsById = overrides.mockExamReportsById ?? new Map<string, MockExamReport>();
    this.analyticsEvents = overrides.analyticsEvents ?? [];
  }

  readonly subscriptionEntitlementsByUserId = new Map<string, UserEntitlement>();
  readonly subscriptionOrdersById = new Map<string, SubscriptionOrder>();
  readonly subscriptionEventsById = new Map<string, SubscriptionEvent>();
  readonly subscriptionCouponRulesByCode = new Map<string, CouponRule>();
  readonly subscriptionFamilyGroupsById = new Map<string, FamilyGroup>();
  readonly subscriptionFamilyGroupIdByOwnerUserId = new Map<string, string>();
  readonly subscriptionFamilyInvitationsById = new Map<string, FamilyInvitation>();
  readonly processedPaymentEventIds = new Set<string>();

  readonly adminUsersById = new Map<string, AdminUser>();
  readonly adminUserIdByEmail = new Map<string, string>();
  readonly adminSessionsByToken = new Map<string, AdminSession>();
  readonly adminFailedLoginByEmail = new Map<string, FailedLoginCounter>();
  readonly adminEntitlementAdjustmentsById = new Map<string, AdminEntitlementAdjustment>();
  readonly adminReviewRequestsById = new Map<string, AdminReviewRequest>();
  readonly adminReportExportsById = new Map<string, AdminReportExport>();

  readonly analyticsEvents: AnalyticsEvent[];
  readonly reminderPreferencesByUserId = new Map<string, ReminderPreference>();
  readonly reminderRecommendationsById = new Map<string, ReminderRecommendation>();
  readonly churnRiskSnapshotsByUserId = new Map<string, ChurnRiskSnapshot>();
  readonly churnStrategyTriggersById = new Map<string, ChurnStrategyTrigger>();
  readonly abExperimentsByKey = new Map<string, AbExperiment>();
  readonly abExperimentAssignmentByExperimentAndUser = new Map<string, string>();
  readonly abExperimentExposureCountByExperimentAndVariant = new Map<string, number>();
  readonly abExperimentConversionCountByExperimentAndVariant = new Map<string, number>();
  readonly providerHealthByName = new Map<string, ProviderHealthSnapshot>();
  readonly betaWhitelistEntriesById = new Map<string, BetaWhitelistEntry>();
  readonly betaWhitelistEntryIdByUserAndRelease = new Map<string, string>();
  readonly betaFeedbacksById = new Map<string, BetaFeedback>();
  readonly stabilitySoakRunsById = new Map<string, StabilitySoakRun>();
  readonly stabilityCheckpointsByRunId = new Map<string, StabilityCheckpoint[]>();
  readonly stabilityAlertsById = new Map<string, StabilityAlert>();
  readonly systemActionIdempotencyByKey = new Map<string, SystemActionIdempotencyRecord>();
  readonly latestReleaseGateByReleaseId = new Map<string, ReleaseGateEvaluation>();
  readonly canaryReleasesById = new Map<string, CanaryRelease>();
  readonly contentItemsById = new Map<string, ContentItem>();
  readonly contentImportBatchesById = new Map<string, ContentImportBatch>();
}
