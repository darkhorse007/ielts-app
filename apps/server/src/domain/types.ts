export type SkillType = "listening" | "speaking" | "reading" | "writing";

export type UserStatus = "active" | "frozen" | "pending_deletion" | "deleted";

export type SystemRole = "learner" | "qa" | "ops" | "admin";

export type User = {
  id: string;
  email?: string;
  phone?: string;
  displayName?: string;
  systemRoles: SystemRole[];
  passwordHash: string;
  status: UserStatus;
  frozenAt?: string;
  unfrozenAt?: string;
  deletionRequestedAt?: string;
  deletedAt?: string;
  createdAt: string;
  updatedAt: string;
};

export type Session = {
  id: string;
  userId: string;
  refreshTokenHash: string;
  deviceId?: string;
  ipAddress?: string;
  userAgent?: string;
  expiresAt: string;
  revokedAt?: string;
  createdAt: string;
  updatedAt: string;
};

export type RefreshBlacklistEntry = {
  tokenHash: string;
  expiresAt: string;
};

export type AuditEventType =
  | "auth_register"
  | "auth_login_success"
  | "auth_login_failure"
  | "auth_login_rate_limited"
  | "auth_refresh"
  | "auth_refresh_rejected"
  | "auth_logout"
  | "anomalous_login"
  | "goal_profile_created"
  | "assessment_enqueued"
  | "assessment_started"
  | "assessment_paused"
  | "assessment_resumed"
  | "assessment_answer_submitted"
  | "assessment_completed"
  | "plan_generated"
  | "plan_adjusted"
  | "plan_auto_adjusted"
  | "progress_synced"
  | "progress_conflict"
  | "user_data_exported"
  | "deletion_requested"
  | "user_deleted"
  | "practice_session_created"
  | "practice_submitted"
  | "playback_state_updated"
  | "retry_queue_added"
  | "retry_session_started"
  | "retry_session_completed"
  | "speaking_session_created"
  | "speaking_session_connected"
  | "speaking_session_resumed"
  | "speaking_part_switched"
  | "speaking_transcript_received"
  | "speaking_session_disconnected"
  | "speaking_session_ended"
  | "speaking_retry_created"
  | "speaking_comparison_generated"
  | "speaking_pronunciation_feedback_queried"
  | "speaking_pronunciation_task_tracked"
  | "reading_mode_switched"
  | "reading_timer_paused"
  | "reading_timer_resumed"
  | "reading_timer_recovered"
  | "writing_evaluated"
  | "writing_rewrite_compared"
  | "writing_template_inserted"
  | "writing_template_adoption_queried"
  | "mock_exam_created"
  | "mock_exam_progress_saved"
  | "mock_exam_recovered"
  | "mock_exam_submitted"
  | "mock_exam_report_generated"
  | "mock_exam_plan_written_back"
  | "mock_exam_plan_writeback_undone"
  | "entitlement_checked"
  | "entitlement_consumed"
  | "subscription_upgrade_created"
  | "subscription_cancelled"
  | "subscription_resumed"
  | "payment_webhook_received"
  | "subscription_family_invitation_created"
  | "subscription_family_invitation_accepted"
  | "subscription_family_member_removed"
  | "admin_login_success"
  | "admin_login_failure"
  | "admin_order_query"
  | "admin_entitlement_adjusted"
  | "admin_entitlement_adjust_rolled_back"
  | "analytics_events_ingested"
  | "ab_experiment_upserted"
  | "ab_experiment_stopped"
  | "ab_experiment_assigned"
  | "reminder_preference_updated"
  | "reminder_recommendation_generated"
  | "reminder_clicked"
  | "reminder_device_registered"
  | "reminder_device_removed"
  | "reminder_dispatch_previewed"
  | "reminder_dispatch_executed"
  | "churn_risk_scored"
  | "churn_strategy_triggered"
  | "churn_effect_queried"
  | "provider_health_checked"
  | "release_gate_evaluated"
  | "canary_release_started"
  | "canary_release_promoted"
  | "canary_release_rolled_back"
  | "beta_whitelist_upserted"
  | "beta_feedback_submitted"
  | "beta_feedback_priority_escalated"
  | "beta_feedback_queried"
  | "beta_cohort_metrics_generated"
  | "beta_cohort_exported"
  | "stability_soak_started"
  | "stability_soak_checkpoint_recorded"
  | "stability_report_generated"
  | "stability_report_compared"
  | "stability_report_exported"
  | "stability_alert_triggered"
  | "stability_alert_handled"
  | "release_write_latency_alerted"
  | "release_write_circuit_opened"
  | "release_write_circuit_prolonged"
  | "release_write_circuit_recovered"
  | "system_user_roles_updated"
  | "admin_user_frozen"
  | "admin_user_unfrozen"
  | "admin_content_published"
  | "admin_content_unpublished"
  | "admin_content_publish_rollback"
  | "admin_content_batch_imported"
  | "admin_content_reviewed"
  | "admin_content_batch_rolled_back"
  | "admin_report_exported"
  | "admin_report_downloaded"
  | "admin_audit_logs_queried"
  | "admin_review_requested"
  | "admin_review_approved"
  | "admin_review_rejected";

export type AuditEvent = {
  id: string;
  type: AuditEventType;
  userId?: string;
  sessionId?: string;
  createdAt: string;
  metadata: Record<string, unknown>;
};

export type FailedLoginCounter = {
  count: number;
  firstFailedAt: number;
};

export type GoalProfile = {
  id: string;
  userId: string;
  targetOverallBand: number;
  targetExamDate: string;
  weeklyStudyHours: number;
  weakSkills: SkillType[];
  assessmentId: string;
  planId: string;
  idempotencyKey: string;
  createdAt: string;
  updatedAt: string;
};

export type DiagnosticQuestion = {
  id: string;
  skill: SkillType;
  prompt: string;
  expectedKeywords: string[];
  maxScore: number;
};

export type DiagnosticAnswer = {
  questionId: string;
  answer: string;
  score: number;
  answeredAt: string;
};

export type BandEstimate = Record<SkillType, number>;

export type AssessmentStatus = "processing" | "in_progress" | "paused" | "completed" | "failed";

export type AssessmentJob = {
  id: string;
  userId: string;
  planId: string;
  status: AssessmentStatus;
  questionSet: DiagnosticQuestion[];
  answersByQuestionId: Record<string, DiagnosticAnswer>;
  currentQuestionIndex: number;
  accumulatedActiveSeconds: number;
  activeStartedAt?: string;
  startedAt?: string;
  pausedAt?: string;
  completedAt?: string;
  skillBandEstimates?: BandEstimate;
  createdAt: string;
  updatedAt: string;
  errorMessage?: string;
};

export type StudyTaskStatus = "todo" | "doing" | "done" | "skipped";

export type StudyTask = {
  id: string;
  skill: SkillType;
  taskType: string;
  title: string;
  targetMinutes: number;
  completionCriteria: string;
  dayOfWeek: number;
  status: StudyTaskStatus;
};

export type StudyPlanWeek = {
  id: string;
  weekNo: number;
  goals: string[];
  tasks: StudyTask[];
};

export type StudyPlanStatus = "active" | "archived";

export type StudyPlanAdjustmentSource =
  | "manual_task_adjustment"
  | "practice_session"
  | "speaking_session"
  | "writing_evaluation"
  | "mock_exam_report";

export type StudyPlanTaskChange = {
  taskId: string;
  skill: SkillType;
  beforeTargetMinutes: number;
  afterTargetMinutes: number;
  beforeCompletionCriteria: string;
  afterCompletionCriteria: string;
};

export type StudyPlanAdjustment = {
  id: string;
  userId: string;
  planId: string;
  sourceType: StudyPlanAdjustmentSource;
  sourceId: string;
  skill?: SkillType;
  reason: string;
  score?: number;
  changedTasks: StudyPlanTaskChange[];
  createdAt: string;
};

export type StudyPlan = {
  id: string;
  userId: string;
  assessmentId: string;
  status: StudyPlanStatus;
  horizonWeeks: number;
  weeks: StudyPlanWeek[];
  adjustmentHistory: StudyPlanAdjustment[];
  version: number;
  createdAt: string;
  updatedAt: string;
};

export type UserProgressSnapshot = {
  userId: string;
  listeningCompleted: number;
  speakingCompleted: number;
  readingCompleted: number;
  writingCompleted: number;
  totalStudyMinutes: number;
  streakDays: number;
  lastSyncedDeviceId?: string;
  serverVersion: number;
  updatedAt: string;
};

export type ProgressConflict = {
  id: string;
  userId: string;
  deviceId?: string;
  field:
    | "listeningCompleted"
    | "speakingCompleted"
    | "readingCompleted"
    | "writingCompleted"
    | "totalStudyMinutes"
    | "streakDays";
  incomingValue: number;
  serverValue: number;
  clientUpdatedAt: string;
  serverUpdatedAt: string;
  createdAt: string;
};

export type PracticeSkill = "listening" | "reading";

export type PracticeTrainingMode = "training" | "exam";

export type PracticeTimerStatus = "idle" | "running" | "paused" | "ended";

export type PracticeTimingState = {
  status: PracticeTimerStatus;
  limitSeconds?: number;
  elapsedSeconds: number;
  startedAt?: string;
  pausedAt?: string;
  submittedElapsedSeconds?: number;
  recoveredAt?: string;
};

export type PracticeQuestionType =
  | "multiple_choice"
  | "fill_blank"
  | "matching"
  | "map_label"
  | "dictation_sentence"
  | "tfng"
  | "paragraph_match"
  | "heading_match"
  | "summary_cloze";

export type PracticeQuestion = {
  id: string;
  skill: PracticeSkill;
  type: PracticeQuestionType;
  prompt: string;
  options?: string[];
  correctAnswer: string;
  explanation: string;
  errorTags: string[];
  improvementActions: string[];
  evidence?: {
    sentence: string;
    paragraph: number;
    spanStart: number;
    spanEnd: number;
  };
  audioSegmentIndex?: number;
};

export type PracticePlaybackState = {
  playbackRate: number;
  segmentIndex: number;
  positionSeconds: number;
  replayWrongOnly: boolean;
  lastReplayedQuestionId?: string;
  lastRecoveredAt?: string;
};

export type PracticeDictationSpellingMismatch = {
  position: number;
  expected: string;
  actual: string;
};

export type PracticeDictationFeedback = {
  expectedTokenCount: number;
  answerTokenCount: number;
  spellingMismatches: PracticeDictationSpellingMismatch[];
  missingChunks: string[];
  extraChunks: string[];
};

export type PracticeDictationSummary = {
  totalSentences: number;
  highFrequencySpellingErrors: Array<{
    token: string;
    count: number;
  }>;
  highFrequencyChunkErrors: Array<{
    chunk: string;
    count: number;
  }>;
};

export type PracticeQuestionResult = {
  questionId: string;
  type: PracticeQuestionType;
  userAnswer: string;
  correctAnswer: string;
  isCorrect: boolean;
  explanation: string;
  errorTags: string[];
  improvementActions: string[];
  evidence?: {
    sentence: string;
    paragraph: number;
    spanStart: number;
    spanEnd: number;
  };
  dictationFeedback?: PracticeDictationFeedback;
};

export type PracticeSubmission = {
  submittedAt: string;
  scoreBreakdown: {
    correctCount: number;
    totalQuestions: number;
    accuracy: number;
    elapsedSeconds?: number;
    mode: PracticeTrainingMode;
  };
  questionResults: PracticeQuestionResult[];
  nextActions: string[];
  dictationSummary?: PracticeDictationSummary;
};

export type PracticeSessionMode = "core_training" | "retry";

export type PracticeSessionStatus = "in_progress" | "submitted";

export type PracticeSession = {
  id: string;
  userId: string;
  skill: PracticeSkill;
  taskType: string;
  trainingMode: PracticeTrainingMode;
  mode: PracticeSessionMode;
  status: PracticeSessionStatus;
  questionSet: PracticeQuestion[];
  timing?: PracticeTimingState;
  playbackState?: PracticePlaybackState;
  sourceSessionId?: string;
  sourceQueueItemId?: string;
  submission?: PracticeSubmission;
  createdAt: string;
  updatedAt: string;
};

export type RetryQueueStatus = "queued" | "in_progress" | "completed";

export type RetryQueueItem = {
  id: string;
  userId: string;
  skill: PracticeSkill;
  sourceSessionId: string;
  questionId: string;
  status: RetryQueueStatus;
  errorTags: string[];
  improvementActions: string[];
  proficiencyBefore: number;
  proficiencyAfter?: number;
  createdAt: string;
  updatedAt: string;
  completedAt?: string;
};

export type SpeakingSessionStatus = "created" | "connected" | "disconnected" | "ended";

export type SpeakingPartNo = 1 | 2 | 3;

export type SpeakingTaskType = "core_training" | "role_play";

export type SpeakingScenarioType =
  | "campus_service"
  | "travel_support"
  | "job_interview"
  | "academic_tutor"
  | "community_event";

export type SpeakingPartState = {
  partNo: SpeakingPartNo;
  turns: number;
  lastTranscript?: string;
  lastCoachQuestion?: string;
};

export type SpeakingPronunciationSeverity = "low" | "medium" | "high";

export type SpeakingPronunciationTaskStatus = "todo" | "doing" | "done";

export type SpeakingPronunciationWordIssue = {
  word: string;
  position: number;
  phoneme: string;
  severity: SpeakingPronunciationSeverity;
  issueTag: string;
  suggestion: string;
  replaySegmentId: string;
};

export type SpeakingPronunciationPhonemeIssue = {
  phoneme: string;
  issueTag: string;
  suggestion: string;
  severity: SpeakingPronunciationSeverity;
  count: number;
  exampleWords: string[];
};

export type SpeakingPronunciationReplaySegment = {
  segmentId: string;
  turnNo: number;
  startMs: number;
  endMs: number;
  referenceText: string;
  userText: string;
  referenceAudioUrl: string;
  userAudioUrl: string;
};

export type SpeakingPronunciationTask = {
  taskId: string;
  title: string;
  description: string;
  phoneme: string;
  status: SpeakingPronunciationTaskStatus;
  linkedTurnNos: number[];
};

export type SpeakingPronunciationFeedback = {
  wordIssues: SpeakingPronunciationWordIssue[];
  phonemeIssues: SpeakingPronunciationPhonemeIssue[];
  replaySegments: SpeakingPronunciationReplaySegment[];
  taskRecommendations: SpeakingPronunciationTask[];
};

export type SpeakingScoreSnapshot = {
  turnNo: number;
  partNo: SpeakingPartNo;
  fluency: number;
  lexical: number;
  grammar: number;
  pronunciation: number;
  suggestions: string[];
  pronunciationFeedback: SpeakingPronunciationFeedback;
  latencyMs: number;
  fallbackTriggered: boolean;
  createdAt: string;
};

export type SpeakingSessionEventType =
  | "session_start"
  | "session_resume"
  | "part_switch"
  | "partial_transcript"
  | "coach_question"
  | "score_update"
  | "heartbeat"
  | "session_disconnect"
  | "session_timeout"
  | "session_end";

export type SpeakingSessionEvent = {
  id: string;
  type: SpeakingSessionEventType;
  payload: Record<string, unknown>;
  createdAt: string;
};

export type SpeakingSession = {
  id: string;
  userId: string;
  resumeToken: string;
  status: SpeakingSessionStatus;
  taskType: SpeakingTaskType;
  scenarioType?: SpeakingScenarioType;
  currentPart: SpeakingPartNo;
  topic: string;
  partStates: SpeakingPartState[];
  scoreHistory: SpeakingScoreSnapshot[];
  resumeUntil: string;
  conversationTurns: number;
  sourceSessionId?: string;
  createdAt: string;
  updatedAt: string;
  connectedAt?: string;
  disconnectedAt?: string;
  endedAt?: string;
  lastHeartbeatAt?: string;
  events: SpeakingSessionEvent[];
  pronunciationTasks: SpeakingPronunciationTask[];
};

export type WritingTaskType = "task1" | "task2";

export type WritingScoreBreakdown = {
  tr: number;
  cc: number;
  lr: number;
  gra: number;
  overall: number;
};

export type WritingSuggestion = {
  id: string;
  issue: string;
  evidenceSentence: string;
  recommendation: string;
  revisedSample: string;
};

export type WritingTemplateSection = {
  id: string;
  title: string;
  content: string;
};

export type WritingTemplate = {
  id: string;
  taskType: WritingTaskType;
  title: string;
  argumentFramework: string;
  scenarioTag: string;
  usageTips: string[];
  sections: WritingTemplateSection[];
};

export type WritingTemplateUsage = {
  id: string;
  userId: string;
  templateId: string;
  taskType: WritingTaskType;
  insertedAt: string;
  originalEssayLength: number;
  mergedEssayLength: number;
};

export type WritingEvaluation = {
  id: string;
  userId: string;
  taskType: WritingTaskType;
  prompt: string;
  essay: string;
  sourceEvaluationId?: string;
  scores: WritingScoreBreakdown;
  suggestions: WritingSuggestion[];
  fallbackTriggered: boolean;
  latencyMs: number;
  createdAt: string;
  updatedAt: string;
};

export type WritingComparison = {
  sourceEvaluationId: string;
  rewriteEvaluationId: string;
  sourceScores: WritingScoreBreakdown;
  rewriteScores: WritingScoreBreakdown;
  delta: WritingScoreBreakdown;
  nextActions: string[];
};

export type WritingRewriteArchiveItem = {
  id: string;
  userId: string;
  taskType: WritingTaskType;
  sourceEvaluationId: string;
  rewriteEvaluationId: string;
  deltaOverall: number;
  createdAt: string;
};

export type MockExamSkill = "listening" | "speaking" | "reading" | "writing";

export type MockExamSectionStatus = "not_started" | "in_progress" | "submitted";

export type MockExamSection = {
  skill: MockExamSkill;
  status: MockExamSectionStatus;
  answeredCount: number;
  lastCheckpointAt?: string;
};

export type MockExamStatus = "in_progress" | "submitted" | "completed";

export type MockExam = {
  id: string;
  userId: string;
  status: MockExamStatus;
  timeLimitSeconds: number;
  elapsedSeconds: number;
  startedAt: string;
  lastCheckpointAt?: string;
  recoveredAt?: string;
  currentSkillIndex: number;
  sections: MockExamSection[];
  submittedAt?: string;
  reportId?: string;
  createdAt: string;
  updatedAt: string;
};

export type MockExamPlanWriteback = {
  applied: boolean;
  appliedAt?: string;
  reasons: string[];
  undoAvailable: boolean;
  undoneAt?: string;
  changedTasks: Array<{
    taskId: string;
    targetMinutesBefore: number;
    completionCriteriaBefore: string;
    targetMinutesAfter: number;
    completionCriteriaAfter: string;
  }>;
};

export type MockExamReport = {
  id: string;
  examId: string;
  userId: string;
  totalEstimatedBand: number;
  skillBandEstimates: Record<MockExamSkill, number>;
  errorDistribution: Record<MockExamSkill, number>;
  nextActions: string[];
  generatedAt: string;
  exportText: string;
  planWriteback?: MockExamPlanWriteback;
  createdAt: string;
  updatedAt: string;
};

export type EntitlementTier = "free" | "pro" | "family_owner" | "family_member";

export type EntitlementStatus = "active" | "cancelled" | "expired";

export type SubscriptionPlanCode = "pro_monthly" | "pro_yearly" | "family_duo_monthly";

export type CouponRuleStatus = "active" | "inactive";

export type CouponDiscountType = "percentage" | "fixed_amount";

export type UserEntitlement = {
  id: string;
  userId: string;
  tier: EntitlementTier;
  status: EntitlementStatus;
  dailyQuota: number;
  usedToday: number;
  quotaDate: string;
  autoRenew: boolean;
  expiresAt?: string;
  familyGroupId?: string;
  version: number;
  lastSyncedDeviceId?: string;
  createdAt: string;
  updatedAt: string;
};

export type SubscriptionOrderStatus = "created" | "paid" | "failed" | "cancelled" | "refunded";

export type CouponRule = {
  code: string;
  description?: string;
  status: CouponRuleStatus;
  discountType: CouponDiscountType;
  discountValue: number;
  maxDiscountCny?: number;
  planCodes?: SubscriptionPlanCode[];
  startsAt?: string;
  expiresAt?: string;
  createdAt: string;
  updatedAt: string;
};

export type FamilyGroupStatus = "active" | "inactive";

export type FamilyGroup = {
  id: string;
  ownerUserId: string;
  planCode: Extract<SubscriptionPlanCode, "family_duo_monthly">;
  status: FamilyGroupStatus;
  seatLimit: number;
  memberUserIds: string[];
  expiresAt?: string;
  createdAt: string;
  updatedAt: string;
};

export type FamilyInvitationStatus = "pending" | "accepted" | "revoked" | "expired";

export type FamilyInvitation = {
  id: string;
  groupId: string;
  inviterUserId: string;
  inviteeUserId: string;
  status: FamilyInvitationStatus;
  acceptedAt?: string;
  revokedAt?: string;
  createdAt: string;
  updatedAt: string;
};

export type SubscriptionOrder = {
  id: string;
  userId: string;
  planCode: SubscriptionPlanCode;
  provider: string;
  status: SubscriptionOrderStatus;
  listPriceCny: number;
  discountCny: number;
  payableAmountCny: number;
  paidAmountCny: number;
  refundedAmountCny: number;
  couponCode?: string;
  amountCny: number;
  paymentToken: string;
  providerOrderId?: string;
  createdAt: string;
  updatedAt: string;
};

export type SubscriptionEvent = {
  id: string;
  userId: string;
  orderId?: string;
  eventId?: string;
  type: string;
  payload: Record<string, unknown>;
  createdAt: string;
};

export type AdminRoleCode = "super_admin" | "finance" | "ops";

export type AdminUserStatus = "active" | "disabled";

export type AdminUser = {
  id: string;
  email: string;
  passwordHash: string;
  displayName: string;
  status: AdminUserStatus;
  roles: AdminRoleCode[];
  createdAt: string;
  updatedAt: string;
};

export type AdminSession = {
  token: string;
  adminUserId: string;
  expiresAt: string;
  createdAt: string;
  updatedAt: string;
};

export type AdminEntitlementAdjustment = {
  id: string;
  userId: string;
  adminUserId: string;
  reason: string;
  setTier?: EntitlementTier;
  deltaDays?: number;
  previousTier: EntitlementTier;
  previousExpiresAt?: string;
  newTier: EntitlementTier;
  newExpiresAt?: string;
  rolledBack: boolean;
  rolledBackAt?: string;
  rollbackOfAdjustmentId?: string;
  createdAt: string;
  updatedAt: string;
};

export type AdminReviewOperationType = "user_freeze" | "entitlement_adjust" | "content_publish";

export type AdminReviewStatus = "pending" | "approved" | "rejected";

export type AdminReviewPayload =
  | {
      operationType: "user_freeze";
      userId: string;
      reason: string;
    }
  | {
      operationType: "entitlement_adjust";
      userId: string;
      reason: string;
      setTier?: "free" | "pro";
      deltaDays?: number;
      rollbackOfAdjustmentId?: string;
    }
  | {
      operationType: "content_publish";
      itemId: string;
      note?: string;
      simulateFailure?: boolean;
    };

export type AdminReviewRequest = {
  id: string;
  operationType: AdminReviewOperationType;
  status: AdminReviewStatus;
  requesterAdminUserId: string;
  requesterRoles: AdminRoleCode[];
  payload: AdminReviewPayload;
  requestedAt: string;
  reviewedAt?: string;
  reviewerAdminUserId?: string;
  reviewComment?: string;
  execution?: {
    success: boolean;
    executedAt?: string;
    result?: Record<string, unknown>;
    errorCode?: string;
    errorMessage?: string;
  };
};

export type AdminReportType = "operation" | "business";

export type AdminReportExport = {
  id: string;
  reportType: AdminReportType;
  createdByAdminUserId: string;
  filter: {
    fromAt?: string;
    toAt?: string;
    role?: AdminRoleCode;
  };
  rowCount: number;
  maskedFields: string[];
  filename: string;
  content: string;
  createdAt: string;
  lastDownloadedAt?: string;
  downloadCount: number;
};

export type AnalyticsPlatform = "windows" | "macos" | "ios" | "android" | "web";

export type AbExperimentStatus = "draft" | "running" | "stopped";

export type AbExperimentVariant = {
  key: string;
  label: string;
  weight: number;
};

export type AbExperimentStopCondition = {
  minSampleSize: number;
  targetLiftPercent: number;
  maxDurationDays: number;
};

export type AbExperiment = {
  key: string;
  name: string;
  description?: string;
  status: AbExperimentStatus;
  trafficPercent: number;
  variants: AbExperimentVariant[];
  metricEventType: string;
  stopCondition: AbExperimentStopCondition;
  createdAt: string;
  updatedAt: string;
  startedAt?: string;
  stoppedAt?: string;
  stopReason?: string;
};

export type AnalyticsEvent = {
  id: string;
  userId?: string;
  platform: AnalyticsPlatform;
  skill?: SkillType;
  eventType: string;
  traceId: string;
  providerName?: string;
  success?: boolean;
  fallbackTriggered?: boolean;
  latencyMs?: number;
  metadata: Record<string, unknown>;
  createdAt: string;
};

export type ReminderPreference = {
  userId: string;
  subscribed: boolean;
  updatedAt: string;
};

export type ReminderRecommendation = {
  id: string;
  userId: string;
  activeHourUtc: number;
  scheduledAt: string;
  reason: string;
  deepLink: string;
  planId?: string;
  taskId?: string;
  createdAt: string;
  clickedAt?: string;
};

export type ReminderDevicePlatform = "ios" | "android";

export type ReminderPushProvider = "apns" | "fcm";

export type ReminderDevicePermissionStatus = "granted" | "provisional" | "undetermined" | "denied" | "unsupported";

export type ReminderBuildEnvironment = "development" | "preview" | "production";

export type ReminderDeviceRegistration = {
  userId: string;
  installationId: string;
  platform: ReminderDevicePlatform;
  permissionStatus: ReminderDevicePermissionStatus;
  pushProvider?: ReminderPushProvider;
  pushToken?: string;
  deviceLabel?: string;
  appBuild?: string;
  environment: ReminderBuildEnvironment;
  createdAt: string;
  updatedAt: string;
};

export type ReminderDispatchStatus = "sent" | "skipped" | "duplicate" | "failed";

export type ReminderDispatchFailureCode = "SENDER_UNAVAILABLE" | "PROVIDER_ERROR";

export type ReminderDeliveryAttempt = {
  id: string;
  userId: string;
  reminderId: string;
  installationId: string;
  dedupeKey: string;
  status: ReminderDispatchStatus;
  pushProvider?: ReminderPushProvider;
  providerMessageId?: string;
  duplicateOfAttemptId?: string;
  skipReason?: string;
  failureCode?: ReminderDispatchFailureCode;
  failureMessage?: string;
  createdAt: string;
  updatedAt: string;
};

export type ChurnRiskLevel = "low" | "medium" | "high";

export type ChurnRiskSnapshot = {
  id: string;
  userId: string;
  score: number;
  level: ChurnRiskLevel;
  factors: string[];
  lastActiveAt?: string;
  weeklyLearningEvents: number;
  reminderClicksIn30Days: number;
  computedAt: string;
};

export type ChurnStrategyType = "smart_reminder" | "mock_exam_boost" | "coupon_nudge";

export type ChurnStrategyTrigger = {
  id: string;
  userId: string;
  riskSnapshotId: string;
  strategyType: ChurnStrategyType;
  reason?: string;
  status: "triggered" | "converted";
  triggeredAt: string;
  conversionWindowDays: number;
  convertedAt?: string;
  payload: Record<string, unknown>;
};

export type ProviderHealthSnapshot = {
  providerName: string;
  successRate: number;
  fallbackRate: number;
  p95LatencyMs: number;
  totalCalls: number;
  alertLevel: "green" | "yellow" | "red";
  alertReasons: string[];
  recentTraces: Array<{
    traceId: string;
    source: "speaking" | "writing" | "analytics";
    latencyMs?: number;
    fallbackTriggered?: boolean;
    createdAt: string;
    sessionId?: string;
    evaluationId?: string;
  }>;
  updatedAt: string;
};

export type ReleaseGateCheck = {
  name: string;
  threshold: string;
  actual: string;
  passed: boolean;
};

export type BetaWhitelistStatus = "active" | "disabled";

export type BetaWhitelistEntry = {
  id: string;
  userId: string;
  releaseId: string;
  version: number;
  status: BetaWhitelistStatus;
  note?: string;
  createdByUserId: string;
  updatedByUserId: string;
  createdAt: string;
  updatedAt: string;
};

export type BetaFeedbackCategory = "bug" | "ux" | "performance" | "other";

export type BetaFeedbackSeverity = "low" | "medium" | "high" | "critical";

export type BetaFeedbackPriority = "low" | "medium" | "high" | "critical";

export type BetaFeedbackStatus = "open" | "triaged" | "resolved";

export type BetaFeedback = {
  id: string;
  userId: string;
  releaseId: string;
  version: number;
  appVersion?: string;
  category: BetaFeedbackCategory;
  severity: BetaFeedbackSeverity;
  priority: BetaFeedbackPriority;
  status: BetaFeedbackStatus;
  title: string;
  description: string;
  createdAt: string;
  updatedAt: string;
  escalatedAt?: string;
  escalatedByUserId?: string;
  escalationReason?: string;
};

export type StabilitySoakRunStatus = "running" | "completed" | "failed";

export type StabilitySoakRun = {
  id: string;
  releaseId: string;
  plannedDurationHours: number;
  status: StabilitySoakRunStatus;
  startedAt: string;
  completedAt?: string;
  createdByUserId: string;
  createdAt: string;
  updatedAt: string;
};

export type StabilityCheckpoint = {
  id: string;
  runId: string;
  releaseId: string;
  version: number;
  atHour: number;
  crashCount: number;
  activeSessions: number;
  apiSuccessRate: number;
  latencyP95Ms: number;
  createdByUserId: string;
  createdAt: string;
};

export type StabilityAlertLevel = "yellow" | "red";

export type StabilityAlertStatus = "open" | "acknowledged" | "resolved";

export type StabilityAlertType = "crash_rate_per_1k" | "api_success_rate" | "latency_p95_ms";

export type StabilityAlert = {
  id: string;
  runId: string;
  releaseId: string;
  checkpointId: string;
  version: number;
  atHour: number;
  type: StabilityAlertType;
  level: StabilityAlertLevel;
  status: StabilityAlertStatus;
  threshold: number;
  actual: number;
  reason: string;
  triggeredAt: string;
  updatedAt: string;
  handledAt?: string;
  handledByUserId?: string;
  handlingAction?: "acknowledge" | "resolve";
  handlingNote?: string;
};

export type ReleaseGateEvaluation = {
  id: string;
  releaseId: string;
  checks: ReleaseGateCheck[];
  passed: boolean;
  createdAt: string;
};

export type CanaryReleaseStatus = "running" | "promoted" | "rolled_back";

export type CanaryRelease = {
  id: string;
  releaseId: string;
  version: number;
  targetPercent: number;
  status: CanaryReleaseStatus;
  startedAt: string;
  promotedAt?: string;
  rolledBackAt?: string;
  rollbackReason?: string;
  metrics: {
    errorRate: number;
    latencyP95Ms: number;
    providerHealthy: boolean;
  };
  createdAt: string;
  updatedAt: string;
};

export type SystemActionIdempotencyRecord = {
  idempotencyKey: string;
  actionName: string;
  resourceId: string;
  fingerprint: string;
  responseJson: string;
  createdAt: string;
  updatedAt: string;
};

export type ContentSkill = "listening" | "speaking" | "reading" | "writing";

export type ContentItemStatus = "draft" | "published" | "unpublished";
export type ContentReviewStatus = "pending" | "approved" | "rejected";

export type ContentPublishHistoryItem = {
  id: string;
  action: "publish" | "unpublish" | "rollback";
  version: number;
  operatorAdminUserId: string;
  note?: string;
  createdAt: string;
};

export type ContentReviewHistoryItem = {
  id: string;
  decision: "approve" | "reject";
  reviewerAdminUserId: string;
  note?: string;
  createdAt: string;
};

export type ContentImportFailureItem = {
  index: number;
  title?: string;
  errorCode: string;
  errorMessage: string;
};

export type ContentImportBatchStatus = "completed" | "rolled_back" | "partial_rolled_back";

export type ContentImportBatch = {
  id: string;
  templateVersion: string;
  createdByAdminUserId: string;
  atomic: boolean;
  totalCount: number;
  importedItemIds: string[];
  failedItems: ContentImportFailureItem[];
  rollbackItemIds: string[];
  status: ContentImportBatchStatus;
  createdAt: string;
  updatedAt: string;
};

export type ContentItem = {
  id: string;
  title: string;
  skill: ContentSkill;
  status: ContentItemStatus;
  reviewStatus: ContentReviewStatus;
  reviewHistory: ContentReviewHistoryItem[];
  version: number;
  sourceType: "manual" | "batch_import";
  importBatchId?: string;
  currentPayload: Record<string, unknown>;
  lastPublishedPayload?: Record<string, unknown>;
  lastPublishedAt?: string;
  lastRollbackAt?: string;
  lastOperatorAdminUserId?: string;
  publishHistory: ContentPublishHistoryItem[];
  createdAt: string;
  updatedAt: string;
};

export type AccessTokenPayload = {
  type: "access";
  userId: string;
  sessionId: string;
  exp: number;
};
