import type {
  AdminCouponRuleResponse,
  AdminCouponRulesResponse,
  AdminAuditLogsResponse,
  AdminContentItemsResponse,
  AdminContentImportBatchResponse,
  AdminContentImportRollbackResponse,
  AdminContentUpdateResponse,
  AdminEntitlementAdjustResponse,
  AdminLoginResponse,
  AdminOrdersResponse,
  AdminReviewListResponse,
  AdminReviewRequestResponse,
  AdminReportDownloadResponse,
  AdminReportExportResponse,
  AdminUserFreezeResponse,
  AdminUsersResponse,
  AnalyticsBatchResponse,
  AnalyticsExperimentAssignmentResponse,
  AnalyticsExperimentBoardResponse,
  AnalyticsExperimentResponse,
  AnalyticsSummaryResponse,
  BetaFeedbackListResponse,
  BetaFeedbackResponse,
  BetaWhitelistEntryResponse,
  BetaWhitelistListResponse,
  CanaryResponse,
  ChurnEffectResponse,
  ChurnRiskListResponse,
  ChurnStrategyTriggerResponse,
  DeleteAccountResponse,
  DiagnosticAnswerResponse,
  DiagnosticCompletionResponse,
  DiagnosticQuestionsResponse,
  EntitlementResponse,
  FamilyInvitationResponse,
  FamilyMembersResponse,
  LoginPayload,
  MockExamExportResponse,
  MockExamReportResponse,
  MockExamResponse,
  MockExamSubmitResponse,
  OnboardingPayload,
  OnboardingResponse,
  OnboardingStatusResponse,
  PaymentWebhookResponse,
  PlaybackStateResponse,
  PracticeSessionResponse,
  PracticeSkill,
  ProviderHealthResponse,
  ReleaseOperationalMetricsResponse,
  ProgressConflictHistoryResponse,
  ProgressResponse,
  ProgressSyncPayload,
  ProgressSyncResponse,
  ReminderClickResponse,
  ReminderPreferenceResponse,
  ReminderRecommendationResponse,
  ReleaseGateResponse,
  RegisterPayload,
  RetryQueueResponse,
  RequestDeletionResponse,
  StabilityCheckpointResponse,
  StabilityAlertListResponse,
  StabilityAlertResponse,
  StabilityCompareResponse,
  StabilityReportExportResponse,
  StabilityReportResponse,
  StabilitySoakRunResponse,
  SystemRoleAuditListResponse,
  SystemUserRolesResponse,
  SubscriptionUpgradeResponse,
  SpeakingComparisonResponse,
  SpeakingPronunciationFeedbackResponse,
  SpeakingPronunciationTaskTrackResponse,
  SpeakingSessionEventsResponse,
  SpeakingRolePlayScenariosResponse,
  SpeakingSessionResponse,
  StudyPlanAdjustmentHistoryResponse,
  StudyPlanResponse,
  TokenResponse,
  UserProfileResponse,
  WritingArchiveResponse,
  WritingEvaluationResponse,
  WritingTemplateAdoptionResponse,
  WritingTemplateInsertResponse,
  WritingTemplateListResponse,
  WritingRewriteResponse
} from "./api-types";

export type FetchFn = typeof fetch;

export class ApiRequestError extends Error {
  constructor(
    message: string,
    readonly statusCode: number,
    readonly code?: string
  ) {
    super(message);
    this.name = "ApiRequestError";
  }
}

export class ApiClient {
  constructor(
    private readonly baseUrl: string,
    private readonly fetchFn: FetchFn = fetch
  ) {}

  async register(payload: RegisterPayload): Promise<{ user_id: string }> {
    return this.request<{ user_id: string }>("/v1/auth/register", {
      method: "POST",
      body: JSON.stringify(payload)
    });
  }

  async login(payload: LoginPayload): Promise<TokenResponse> {
    return this.request<TokenResponse>("/v1/auth/login", {
      method: "POST",
      body: JSON.stringify(payload)
    });
  }

  async refresh(refreshToken: string): Promise<TokenResponse> {
    return this.request<TokenResponse>("/v1/auth/refresh", {
      method: "POST",
      body: JSON.stringify({
        refresh_token: refreshToken
      })
    });
  }

  async logout(accessToken: string, refreshToken?: string): Promise<{ success: boolean }> {
    return this.request<{ success: boolean }>("/v1/auth/logout", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${accessToken}`
      },
      body: JSON.stringify(
        refreshToken
          ? {
              refresh_token: refreshToken
            }
          : {}
      )
    });
  }

  async submitOnboarding(
    accessToken: string,
    payload: OnboardingPayload,
    idempotencyKey?: string
  ): Promise<OnboardingResponse> {
    const headers: Record<string, string> = {
      Authorization: `Bearer ${accessToken}`
    };
    if (idempotencyKey) {
      headers["Idempotency-Key"] = idempotencyKey;
    }

    return this.request<OnboardingResponse>("/v1/users/onboarding", {
      method: "POST",
      headers,
      body: JSON.stringify(payload)
    });
  }

  async fetchOnboardingStatus(accessToken: string, assessmentId: string): Promise<OnboardingStatusResponse> {
    return this.request<OnboardingStatusResponse>(`/v1/users/onboarding/${assessmentId}/status`, {
      method: "GET",
      headers: {
        Authorization: `Bearer ${accessToken}`
      }
    });
  }

  async fetchDiagnosticQuestions(accessToken: string, assessmentId: string): Promise<DiagnosticQuestionsResponse> {
    return this.request<DiagnosticQuestionsResponse>(`/v1/users/onboarding/${assessmentId}/questions`, {
      method: "GET",
      headers: {
        Authorization: `Bearer ${accessToken}`
      }
    });
  }

  async submitDiagnosticAnswer(
    accessToken: string,
    assessmentId: string,
    questionId: string,
    answer: string
  ): Promise<DiagnosticAnswerResponse> {
    return this.request<DiagnosticAnswerResponse>(`/v1/users/onboarding/${assessmentId}/answers`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${accessToken}`
      },
      body: JSON.stringify({
        question_id: questionId,
        answer
      })
    });
  }

  async pauseDiagnostic(accessToken: string, assessmentId: string): Promise<{
    assessment_id: string;
    status: "paused";
    elapsed_seconds: number;
  }> {
    return this.request<{ assessment_id: string; status: "paused"; elapsed_seconds: number }>(
      `/v1/users/onboarding/${assessmentId}/pause`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${accessToken}`
        }
      }
    );
  }

  async resumeDiagnostic(accessToken: string, assessmentId: string): Promise<{
    assessment_id: string;
    status: "in_progress";
    elapsed_seconds: number;
  }> {
    return this.request<{ assessment_id: string; status: "in_progress"; elapsed_seconds: number }>(
      `/v1/users/onboarding/${assessmentId}/resume`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${accessToken}`
        }
      }
    );
  }

  async completeDiagnostic(accessToken: string, assessmentId: string): Promise<DiagnosticCompletionResponse> {
    return this.request<DiagnosticCompletionResponse>(`/v1/users/onboarding/${assessmentId}/complete`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${accessToken}`
      }
    });
  }

  async fetchActivePlan(accessToken: string): Promise<StudyPlanResponse> {
    return this.request<StudyPlanResponse>("/v1/users/plans/active", {
      method: "GET",
      headers: {
        Authorization: `Bearer ${accessToken}`
      }
    });
  }

  async adjustPlanTask(
    accessToken: string,
    planId: string,
    taskId: string,
    payload: {
      target_minutes?: number;
      completion_criteria?: string;
    }
  ): Promise<StudyPlanResponse> {
    return this.request<StudyPlanResponse>(`/v1/users/plans/${planId}/tasks/${taskId}`, {
      method: "PATCH",
      headers: {
        Authorization: `Bearer ${accessToken}`
      },
      body: JSON.stringify(payload)
    });
  }

  async getPlanAdjustmentHistory(
    accessToken: string,
    planId: string,
    params?: {
      source_type?: "manual_task_adjustment" | "practice_session" | "speaking_session" | "writing_evaluation" | "mock_exam_report";
      skill?: "listening" | "speaking" | "reading" | "writing";
      page?: number;
      page_size?: number;
    }
  ): Promise<StudyPlanAdjustmentHistoryResponse> {
    const query = new URLSearchParams();
    if (params?.source_type) {
      query.set("source_type", params.source_type);
    }
    if (params?.skill) {
      query.set("skill", params.skill);
    }
    if (typeof params?.page === "number") {
      query.set("page", String(params.page));
    }
    if (typeof params?.page_size === "number") {
      query.set("page_size", String(params.page_size));
    }
    const suffix = query.toString() ? `?${query.toString()}` : "";
    return this.request<StudyPlanAdjustmentHistoryResponse>(`/v1/users/plans/${planId}/adjustments${suffix}`, {
      method: "GET",
      headers: {
        Authorization: `Bearer ${accessToken}`
      }
    });
  }

  async getProgress(accessToken: string): Promise<ProgressResponse> {
    return this.request<ProgressResponse>("/v1/users/me/progress", {
      method: "GET",
      headers: {
        Authorization: `Bearer ${accessToken}`
      }
    });
  }

  async syncProgress(accessToken: string, payload: ProgressSyncPayload): Promise<ProgressSyncResponse> {
    return this.request<ProgressSyncResponse>("/v1/users/me/progress/sync", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${accessToken}`
      },
      body: JSON.stringify(payload)
    });
  }

  async getProgressConflicts(accessToken: string): Promise<ProgressConflictHistoryResponse> {
    return this.request<ProgressConflictHistoryResponse>("/v1/users/me/progress/conflicts", {
      method: "GET",
      headers: {
        Authorization: `Bearer ${accessToken}`
      }
    });
  }

  async getProfile(accessToken: string): Promise<UserProfileResponse> {
    return this.request<UserProfileResponse>("/v1/users/me/profile", {
      method: "GET",
      headers: {
        Authorization: `Bearer ${accessToken}`
      }
    });
  }

  async requestDeletion(accessToken: string): Promise<RequestDeletionResponse> {
    return this.request<RequestDeletionResponse>("/v1/users/me/deletion-request", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${accessToken}`
      }
    });
  }

  async deleteAccount(accessToken: string): Promise<DeleteAccountResponse> {
    return this.request<DeleteAccountResponse>("/v1/users/me/delete", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${accessToken}`
      },
      body: JSON.stringify({
        confirm_text: "DELETE"
      })
    });
  }

  async getReminderPreference(accessToken: string): Promise<ReminderPreferenceResponse> {
    return this.request<ReminderPreferenceResponse>("/v1/reminders/preferences", {
      method: "GET",
      headers: {
        Authorization: `Bearer ${accessToken}`
      }
    });
  }

  async updateReminderPreference(
    accessToken: string,
    payload: {
      subscribed: boolean;
    }
  ): Promise<ReminderPreferenceResponse> {
    return this.request<ReminderPreferenceResponse>("/v1/reminders/preferences", {
      method: "PUT",
      headers: {
        Authorization: `Bearer ${accessToken}`
      },
      body: JSON.stringify(payload)
    });
  }

  async getReminderRecommendation(accessToken: string): Promise<ReminderRecommendationResponse> {
    return this.request<ReminderRecommendationResponse>("/v1/reminders/recommendation", {
      method: "GET",
      headers: {
        Authorization: `Bearer ${accessToken}`
      }
    });
  }

  async clickReminder(accessToken: string, reminderId: string): Promise<ReminderClickResponse> {
    return this.request<ReminderClickResponse>(`/v1/reminders/${encodeURIComponent(reminderId)}/click`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${accessToken}`
      }
    });
  }

  async createPracticeSession(
    accessToken: string,
    payload: {
      skill: PracticeSkill;
      task_type?: string;
      training_mode?: "training" | "exam";
      time_limit_seconds?: number;
    }
  ): Promise<PracticeSessionResponse> {
    return this.request<PracticeSessionResponse>("/v1/practice/sessions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${accessToken}`
      },
      body: JSON.stringify(payload)
    });
  }

  async switchReadingMode(
    accessToken: string,
    sessionId: string,
    payload: {
      training_mode: "training" | "exam";
      time_limit_seconds?: number;
    }
  ): Promise<PracticeSessionResponse & { recovered: boolean }> {
    return this.request<PracticeSessionResponse & { recovered: boolean }>(`/v1/practice/sessions/${sessionId}/mode`, {
      method: "PATCH",
      headers: {
        Authorization: `Bearer ${accessToken}`
      },
      body: JSON.stringify(payload)
    });
  }

  async getReadingTimer(
    accessToken: string,
    sessionId: string
  ): Promise<{
    timer: PracticeSessionResponse["timer"];
    recovered: boolean;
  }> {
    return this.request<{
      timer: PracticeSessionResponse["timer"];
      recovered: boolean;
    }>(`/v1/practice/sessions/${sessionId}/timer`, {
      method: "GET",
      headers: {
        Authorization: `Bearer ${accessToken}`
      }
    });
  }

  async pauseReadingTimer(
    accessToken: string,
    sessionId: string
  ): Promise<{
    timer: PracticeSessionResponse["timer"];
  }> {
    return this.request<{
      timer: PracticeSessionResponse["timer"];
    }>(`/v1/practice/sessions/${sessionId}/timer/pause`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${accessToken}`
      }
    });
  }

  async resumeReadingTimer(
    accessToken: string,
    sessionId: string
  ): Promise<{
    timer: PracticeSessionResponse["timer"];
  }> {
    return this.request<{
      timer: PracticeSessionResponse["timer"];
    }>(`/v1/practice/sessions/${sessionId}/timer/resume`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${accessToken}`
      }
    });
  }

  async recoverReadingTimer(
    accessToken: string,
    sessionId: string
  ): Promise<{
    timer: PracticeSessionResponse["timer"];
    recovered: boolean;
  }> {
    return this.request<{
      timer: PracticeSessionResponse["timer"];
      recovered: boolean;
    }>(`/v1/practice/sessions/${sessionId}/timer/recover`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${accessToken}`
      }
    });
  }

  async getPracticeSession(accessToken: string, sessionId: string): Promise<PracticeSessionResponse> {
    return this.request<PracticeSessionResponse>(`/v1/practice/sessions/${sessionId}`, {
      method: "GET",
      headers: {
        Authorization: `Bearer ${accessToken}`
      }
    });
  }

  async submitPracticeSession(
    accessToken: string,
    sessionId: string,
    answers: Array<{
      question_id: string;
      answer: string;
    }>
  ): Promise<PracticeSessionResponse> {
    return this.request<PracticeSessionResponse>(`/v1/practice/sessions/${sessionId}/submit`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${accessToken}`
      },
      body: JSON.stringify({
        answers
      })
    });
  }

  async getPlaybackState(accessToken: string, sessionId: string): Promise<PlaybackStateResponse> {
    return this.request<PlaybackStateResponse>(`/v1/practice/sessions/${sessionId}/playback`, {
      method: "GET",
      headers: {
        Authorization: `Bearer ${accessToken}`
      }
    });
  }

  async updatePlaybackState(
    accessToken: string,
    sessionId: string,
    payload: {
      playback_rate?: number;
      segment_index?: number;
      position_seconds?: number;
      replay_wrong_only?: boolean;
      replay_question_id?: string;
    }
  ): Promise<PlaybackStateResponse> {
    return this.request<PlaybackStateResponse>(`/v1/practice/sessions/${sessionId}/playback`, {
      method: "PATCH",
      headers: {
        Authorization: `Bearer ${accessToken}`
      },
      body: JSON.stringify(payload)
    });
  }

  async addRetryQueue(
    accessToken: string,
    sessionId: string,
    payload?: {
      question_ids?: string[];
    }
  ): Promise<RetryQueueResponse> {
    return this.request<RetryQueueResponse>(`/v1/practice/sessions/${sessionId}/retry-queue`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${accessToken}`
      },
      body: JSON.stringify(payload ?? {})
    });
  }

  async getRetryQueue(accessToken: string): Promise<RetryQueueResponse> {
    return this.request<RetryQueueResponse>("/v1/practice/retry-queue", {
      method: "GET",
      headers: {
        Authorization: `Bearer ${accessToken}`
      }
    });
  }

  async startRetrySession(accessToken: string, queueItemId: string): Promise<PracticeSessionResponse> {
    return this.request<PracticeSessionResponse>(`/v1/practice/retry-queue/${queueItemId}/start`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${accessToken}`
      }
    });
  }

  async createSpeakingSession(
    accessToken: string,
    payload?: {
      topic?: string;
      task_type?: "core_training" | "role_play";
      scenario_type?: "campus_service" | "travel_support" | "job_interview" | "academic_tutor" | "community_event";
    }
  ): Promise<SpeakingSessionResponse> {
    return this.request<SpeakingSessionResponse>("/v1/realtime/speaking/sessions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${accessToken}`
      },
      body: JSON.stringify(payload ?? {})
    });
  }

  async getSpeakingRolePlayScenarios(accessToken: string): Promise<SpeakingRolePlayScenariosResponse> {
    return this.request<SpeakingRolePlayScenariosResponse>("/v1/realtime/speaking/scenarios", {
      method: "GET",
      headers: {
        Authorization: `Bearer ${accessToken}`
      }
    });
  }

  async createSpeakingRetrySession(accessToken: string, sourceSessionId: string): Promise<SpeakingSessionResponse> {
    return this.request<SpeakingSessionResponse>(`/v1/realtime/speaking/sessions/${sourceSessionId}/retry`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${accessToken}`
      }
    });
  }

  async getSpeakingSession(accessToken: string, sessionId: string): Promise<SpeakingSessionResponse> {
    return this.request<SpeakingSessionResponse>(`/v1/realtime/speaking/sessions/${sessionId}`, {
      method: "GET",
      headers: {
        Authorization: `Bearer ${accessToken}`
      }
    });
  }

  async getSpeakingSessionEvents(accessToken: string, sessionId: string): Promise<SpeakingSessionEventsResponse> {
    return this.request<SpeakingSessionEventsResponse>(`/v1/realtime/speaking/sessions/${sessionId}/events`, {
      method: "GET",
      headers: {
        Authorization: `Bearer ${accessToken}`
      }
    });
  }

  async getSpeakingPronunciationFeedback(
    accessToken: string,
    sessionId: string
  ): Promise<SpeakingPronunciationFeedbackResponse> {
    return this.request<SpeakingPronunciationFeedbackResponse>(
      `/v1/realtime/speaking/sessions/${sessionId}/pronunciation-feedback`,
      {
        method: "GET",
        headers: {
          Authorization: `Bearer ${accessToken}`
        }
      }
    );
  }

  async trackSpeakingPronunciationTask(
    accessToken: string,
    sessionId: string,
    taskId: string,
    status: "todo" | "doing" | "done"
  ): Promise<SpeakingPronunciationTaskTrackResponse> {
    return this.request<SpeakingPronunciationTaskTrackResponse>(
      `/v1/realtime/speaking/sessions/${sessionId}/pronunciation-feedback/tasks/${taskId}/track`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${accessToken}`
        },
        body: JSON.stringify({
          status
        })
      }
    );
  }

  async endSpeakingSession(accessToken: string, sessionId: string): Promise<SpeakingSessionResponse> {
    return this.request<SpeakingSessionResponse>(`/v1/realtime/speaking/sessions/${sessionId}/end`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${accessToken}`
      }
    });
  }

  async switchSpeakingPart(
    accessToken: string,
    sessionId: string,
    partNo: 1 | 2 | 3
  ): Promise<{
    session_id: string;
    current_part: 1 | 2 | 3;
    status: string;
    updated_at: string;
  }> {
    return this.request<{
      session_id: string;
      current_part: 1 | 2 | 3;
      status: string;
      updated_at: string;
    }>(`/v1/realtime/speaking/sessions/${sessionId}/part`, {
      method: "PATCH",
      headers: {
        Authorization: `Bearer ${accessToken}`
      },
      body: JSON.stringify({
        part_no: partNo
      })
    });
  }

  async getSpeakingComparison(accessToken: string, sessionId: string): Promise<SpeakingComparisonResponse> {
    return this.request<SpeakingComparisonResponse>(`/v1/realtime/speaking/sessions/${sessionId}/comparison`, {
      method: "GET",
      headers: {
        Authorization: `Bearer ${accessToken}`
      }
    });
  }

  async evaluateWriting(
    accessToken: string,
    payload: {
      task_type: "task1" | "task2";
      prompt: string;
      essay: string;
    }
  ): Promise<WritingEvaluationResponse> {
    return this.request<WritingEvaluationResponse>("/v1/writing/evaluations", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${accessToken}`
      },
      body: JSON.stringify(payload)
    });
  }

  async getWritingEvaluation(accessToken: string, evaluationId: string): Promise<WritingEvaluationResponse> {
    return this.request<WritingEvaluationResponse>(`/v1/writing/evaluations/${evaluationId}`, {
      method: "GET",
      headers: {
        Authorization: `Bearer ${accessToken}`
      }
    });
  }

  async rewriteWriting(
    accessToken: string,
    evaluationId: string,
    payload: {
      essay: string;
    }
  ): Promise<WritingRewriteResponse> {
    return this.request<WritingRewriteResponse>(`/v1/writing/evaluations/${evaluationId}/rewrite`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${accessToken}`
      },
      body: JSON.stringify(payload)
    });
  }

  async getWritingArchives(accessToken: string): Promise<WritingArchiveResponse> {
    return this.request<WritingArchiveResponse>("/v1/writing/archives", {
      method: "GET",
      headers: {
        Authorization: `Bearer ${accessToken}`
      }
    });
  }

  async getWritingTemplates(
    accessToken: string,
    params?: {
      task_type?: "task1" | "task2";
    }
  ): Promise<WritingTemplateListResponse> {
    const query = new URLSearchParams();
    if (params?.task_type) {
      query.set("task_type", params.task_type);
    }
    const suffix = query.toString() ? `?${query.toString()}` : "";
    return this.request<WritingTemplateListResponse>(`/v1/writing/templates${suffix}`, {
      method: "GET",
      headers: {
        Authorization: `Bearer ${accessToken}`
      }
    });
  }

  async insertWritingTemplate(
    accessToken: string,
    templateId: string,
    payload: {
      essay: string;
      insertion_mode?: "append" | "prepend";
    }
  ): Promise<WritingTemplateInsertResponse> {
    return this.request<WritingTemplateInsertResponse>(`/v1/writing/templates/${templateId}/insert`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${accessToken}`
      },
      body: JSON.stringify(payload)
    });
  }

  async getWritingTemplateAdoption(accessToken: string): Promise<WritingTemplateAdoptionResponse> {
    return this.request<WritingTemplateAdoptionResponse>("/v1/writing/templates/adoption", {
      method: "GET",
      headers: {
        Authorization: `Bearer ${accessToken}`
      }
    });
  }

  async createMockExam(
    accessToken: string,
    payload?: {
      time_limit_seconds?: number;
    }
  ): Promise<MockExamResponse> {
    return this.request<MockExamResponse>("/v1/mock-exams", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${accessToken}`
      },
      body: JSON.stringify(payload ?? {})
    });
  }

  async getMockExam(accessToken: string, examId: string): Promise<MockExamResponse> {
    return this.request<MockExamResponse>(`/v1/mock-exams/${examId}`, {
      method: "GET",
      headers: {
        Authorization: `Bearer ${accessToken}`
      }
    });
  }

  async saveMockExamProgress(
    accessToken: string,
    examId: string,
    payload: {
      skill: "listening" | "speaking" | "reading" | "writing";
      answered_count: number;
      completed?: boolean;
    }
  ): Promise<MockExamResponse> {
    return this.request<MockExamResponse>(`/v1/mock-exams/${examId}/progress`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${accessToken}`
      },
      body: JSON.stringify(payload)
    });
  }

  async recoverMockExam(accessToken: string, examId: string): Promise<MockExamResponse> {
    return this.request<MockExamResponse>(`/v1/mock-exams/${examId}/recover`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${accessToken}`
      }
    });
  }

  async submitMockExam(
    accessToken: string,
    examId: string,
    payload?: {
      skill_bands?: {
        listening?: number;
        speaking?: number;
        reading?: number;
        writing?: number;
      };
    }
  ): Promise<MockExamSubmitResponse> {
    return this.request<MockExamSubmitResponse>(`/v1/mock-exams/${examId}/submit`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${accessToken}`
      },
      body: JSON.stringify(payload ?? {})
    });
  }

  async getMockExamReport(accessToken: string, examId: string): Promise<MockExamReportResponse> {
    return this.request<MockExamReportResponse>(`/v1/mock-exams/${examId}/report`, {
      method: "GET",
      headers: {
        Authorization: `Bearer ${accessToken}`
      }
    });
  }

  async undoMockExamWriteback(accessToken: string, examId: string): Promise<MockExamReportResponse> {
    return this.request<MockExamReportResponse>(`/v1/mock-exams/${examId}/report/writeback/undo`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${accessToken}`
      }
    });
  }

  async exportMockExamReport(accessToken: string, examId: string): Promise<MockExamExportResponse> {
    return this.request<MockExamExportResponse>(`/v1/mock-exams/${examId}/report/export`, {
      method: "GET",
      headers: {
        Authorization: `Bearer ${accessToken}`
      }
    });
  }

  async getEntitlement(accessToken: string, deviceId?: string): Promise<EntitlementResponse> {
    const query = deviceId ? `?device_id=${encodeURIComponent(deviceId)}` : "";
    return this.request<EntitlementResponse>(`/v1/subscription/entitlement${query}`, {
      method: "GET",
      headers: {
        Authorization: `Bearer ${accessToken}`
      }
    });
  }

  async upgradeSubscription(
    accessToken: string,
    payload: {
      plan_code: "pro_monthly" | "pro_yearly" | "family_duo_monthly";
      provider: "mockpay" | "stripe" | "alipay";
      coupon_code?: string;
    }
  ): Promise<SubscriptionUpgradeResponse> {
    return this.request<SubscriptionUpgradeResponse>("/v1/subscription/upgrade", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${accessToken}`
      },
      body: JSON.stringify(payload)
    });
  }

  async cancelSubscription(accessToken: string): Promise<EntitlementResponse> {
    return this.request<EntitlementResponse>("/v1/subscription/cancel", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${accessToken}`
      }
    });
  }

  async resumeSubscription(accessToken: string): Promise<EntitlementResponse> {
    return this.request<EntitlementResponse>("/v1/subscription/resume", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${accessToken}`
      }
    });
  }

  async sendPaymentWebhook(payload: {
    event_id: string;
    order_id: string;
    status: "paid" | "failed" | "refunded";
    provider_order_id?: string;
  }): Promise<PaymentWebhookResponse> {
    return this.request<PaymentWebhookResponse>("/v1/payments/webhooks/provider", {
      method: "POST",
      body: JSON.stringify(payload)
    });
  }

  async createFamilyInvitation(
    accessToken: string,
    payload: {
      invitee_user_id: string;
    }
  ): Promise<FamilyInvitationResponse> {
    return this.request<FamilyInvitationResponse>("/v1/subscription/family/invitations", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${accessToken}`
      },
      body: JSON.stringify(payload)
    });
  }

  async acceptFamilyInvitation(accessToken: string, invitationId: string): Promise<FamilyInvitationResponse> {
    return this.request<FamilyInvitationResponse>(`/v1/subscription/family/invitations/${invitationId}/accept`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${accessToken}`
      }
    });
  }

  async getFamilyMembers(accessToken: string): Promise<FamilyMembersResponse> {
    return this.request<FamilyMembersResponse>("/v1/subscription/family/members", {
      method: "GET",
      headers: {
        Authorization: `Bearer ${accessToken}`
      }
    });
  }

  async removeFamilyMember(
    accessToken: string,
    memberUserId: string
  ): Promise<{
    removed_user_id: string;
    group: FamilyMembersResponse["group"];
  }> {
    return this.request<{
      removed_user_id: string;
      group: FamilyMembersResponse["group"];
    }>(`/v1/subscription/family/members/${memberUserId}`, {
      method: "DELETE",
      headers: {
        Authorization: `Bearer ${accessToken}`
      }
    });
  }

  async adminLogin(payload: { email: string; password: string }): Promise<AdminLoginResponse> {
    return this.request<AdminLoginResponse>("/v1/admin/auth/login", {
      method: "POST",
      body: JSON.stringify(payload)
    });
  }

  async getAdminOrders(
    adminAccessToken: string,
    params?: {
      user_id?: string;
      status?: "created" | "paid" | "failed" | "cancelled" | "refunded";
      page?: number;
      page_size?: number;
    }
  ): Promise<AdminOrdersResponse> {
    const query = new URLSearchParams();
    if (params?.user_id) {
      query.set("user_id", params.user_id);
    }
    if (params?.status) {
      query.set("status", params.status);
    }
    if (typeof params?.page === "number") {
      query.set("page", String(params.page));
    }
    if (typeof params?.page_size === "number") {
      query.set("page_size", String(params.page_size));
    }
    const suffix = query.toString() ? `?${query.toString()}` : "";
    return this.request<AdminOrdersResponse>(`/v1/admin/orders${suffix}`, {
      method: "GET",
      headers: {
        Authorization: `Bearer ${adminAccessToken}`
      }
    });
  }

  async getAdminCoupons(
    adminAccessToken: string,
    params?: {
      code?: string;
      status?: "active" | "inactive";
      page?: number;
      page_size?: number;
    }
  ): Promise<AdminCouponRulesResponse> {
    const query = new URLSearchParams();
    if (params?.code) {
      query.set("code", params.code);
    }
    if (params?.status) {
      query.set("status", params.status);
    }
    if (typeof params?.page === "number") {
      query.set("page", String(params.page));
    }
    if (typeof params?.page_size === "number") {
      query.set("page_size", String(params.page_size));
    }
    const suffix = query.toString() ? `?${query.toString()}` : "";
    return this.request<AdminCouponRulesResponse>(`/v1/admin/coupons${suffix}`, {
      method: "GET",
      headers: {
        Authorization: `Bearer ${adminAccessToken}`
      }
    });
  }

  async upsertAdminCoupon(
    adminAccessToken: string,
    couponCode: string,
    payload: {
      status?: "active" | "inactive";
      description?: string;
      discount_type: "percentage" | "fixed_amount";
      discount_value: number;
      max_discount_cny?: number;
      plan_codes?: Array<"pro_monthly" | "pro_yearly" | "family_duo_monthly">;
      starts_at?: string;
      expires_at?: string;
    }
  ): Promise<AdminCouponRuleResponse> {
    return this.request<AdminCouponRuleResponse>(`/v1/admin/coupons/${encodeURIComponent(couponCode)}`, {
      method: "PUT",
      headers: {
        Authorization: `Bearer ${adminAccessToken}`
      },
      body: JSON.stringify(payload)
    });
  }

  async adjustAdminEntitlement(
    adminAccessToken: string,
    userId: string,
    payload: {
      reason: string;
      set_tier?: "free" | "pro";
      delta_days?: number;
      rollback_of_adjustment_id?: string;
    }
  ): Promise<AdminEntitlementAdjustResponse> {
    return this.request<AdminEntitlementAdjustResponse>(`/v1/admin/entitlements/${userId}/adjust`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${adminAccessToken}`
      },
      body: JSON.stringify(payload)
    });
  }

  async listAdminUsers(
    adminAccessToken: string,
    params?: {
      email?: string;
      phone?: string;
      status?: "active" | "frozen" | "pending_deletion" | "deleted";
      page?: number;
      page_size?: number;
    }
  ): Promise<AdminUsersResponse> {
    const query = new URLSearchParams();
    if (params?.email) {
      query.set("email", params.email);
    }
    if (params?.phone) {
      query.set("phone", params.phone);
    }
    if (params?.status) {
      query.set("status", params.status);
    }
    if (typeof params?.page === "number") {
      query.set("page", String(params.page));
    }
    if (typeof params?.page_size === "number") {
      query.set("page_size", String(params.page_size));
    }
    const suffix = query.toString() ? `?${query.toString()}` : "";
    return this.request<AdminUsersResponse>(`/v1/admin/users${suffix}`, {
      method: "GET",
      headers: {
        Authorization: `Bearer ${adminAccessToken}`
      }
    });
  }

  async freezeAdminUser(
    adminAccessToken: string,
    userId: string,
    reason: string
  ): Promise<AdminUserFreezeResponse> {
    return this.request<AdminUserFreezeResponse>(`/v1/admin/users/${userId}/freeze`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${adminAccessToken}`
      },
      body: JSON.stringify({
        reason
      })
    });
  }

  async unfreezeAdminUser(
    adminAccessToken: string,
    userId: string,
    reason: string
  ): Promise<AdminUserFreezeResponse> {
    return this.request<AdminUserFreezeResponse>(`/v1/admin/users/${userId}/unfreeze`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${adminAccessToken}`
      },
      body: JSON.stringify({
        reason
      })
    });
  }

  async listAdminContentItems(
    adminAccessToken: string,
    params?: {
      skill?: "listening" | "speaking" | "reading" | "writing";
      status?: "draft" | "published" | "unpublished";
      page?: number;
      page_size?: number;
    }
  ): Promise<AdminContentItemsResponse> {
    const query = new URLSearchParams();
    if (params?.skill) {
      query.set("skill", params.skill);
    }
    if (params?.status) {
      query.set("status", params.status);
    }
    if (typeof params?.page === "number") {
      query.set("page", String(params.page));
    }
    if (typeof params?.page_size === "number") {
      query.set("page_size", String(params.page_size));
    }
    const suffix = query.toString() ? `?${query.toString()}` : "";
    return this.request<AdminContentItemsResponse>(`/v1/admin/content/items${suffix}`, {
      method: "GET",
      headers: {
        Authorization: `Bearer ${adminAccessToken}`
      }
    });
  }

  async publishAdminContentItem(
    adminAccessToken: string,
    itemId: string,
    payload?: {
      note?: string;
      simulate_failure?: boolean;
    }
  ): Promise<AdminContentUpdateResponse> {
    return this.request<AdminContentUpdateResponse>(`/v1/admin/content/items/${itemId}/publish`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${adminAccessToken}`
      },
      body: JSON.stringify(payload ?? {})
    });
  }

  async importAdminContentBatch(
    adminAccessToken: string,
    payload: {
      template_version: string;
      atomic?: boolean;
      items: Array<{
        title: string;
        skill: "listening" | "speaking" | "reading" | "writing";
        payload: Record<string, unknown>;
      }>;
    }
  ): Promise<AdminContentImportBatchResponse> {
    return this.request<AdminContentImportBatchResponse>("/v1/admin/content/import/batches", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${adminAccessToken}`
      },
      body: JSON.stringify(payload)
    });
  }

  async rollbackAdminContentImportBatch(
    adminAccessToken: string,
    batchId: string,
    payload?: {
      item_ids?: string[];
    }
  ): Promise<AdminContentImportRollbackResponse> {
    return this.request<AdminContentImportRollbackResponse>(`/v1/admin/content/import/batches/${batchId}/rollback`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${adminAccessToken}`
      },
      body: JSON.stringify(payload ?? {})
    });
  }

  async reviewAdminContentItem(
    adminAccessToken: string,
    itemId: string,
    payload: {
      decision: "approve" | "reject";
      note?: string;
      auto_publish?: boolean;
      simulate_failure?: boolean;
    }
  ): Promise<AdminContentUpdateResponse & { published: boolean }> {
    return this.request<AdminContentUpdateResponse & { published: boolean }>(`/v1/admin/content/items/${itemId}/review`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${adminAccessToken}`
      },
      body: JSON.stringify(payload)
    });
  }

  async unpublishAdminContentItem(
    adminAccessToken: string,
    itemId: string,
    payload?: {
      note?: string;
    }
  ): Promise<AdminContentUpdateResponse> {
    return this.request<AdminContentUpdateResponse>(`/v1/admin/content/items/${itemId}/unpublish`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${adminAccessToken}`
      },
      body: JSON.stringify(payload ?? {})
    });
  }

  async getAdminAuditLogs(
    adminAccessToken: string,
    params?: {
      type?: string;
      user_id?: string;
      actor_admin_user_id?: string;
      page?: number;
      page_size?: number;
    }
  ): Promise<AdminAuditLogsResponse> {
    const query = new URLSearchParams();
    if (params?.type) {
      query.set("type", params.type);
    }
    if (params?.user_id) {
      query.set("user_id", params.user_id);
    }
    if (params?.actor_admin_user_id) {
      query.set("actor_admin_user_id", params.actor_admin_user_id);
    }
    if (typeof params?.page === "number") {
      query.set("page", String(params.page));
    }
    if (typeof params?.page_size === "number") {
      query.set("page_size", String(params.page_size));
    }
    const suffix = query.toString() ? `?${query.toString()}` : "";
    return this.request<AdminAuditLogsResponse>(`/v1/admin/audit-logs${suffix}`, {
      method: "GET",
      headers: {
        Authorization: `Bearer ${adminAccessToken}`
      }
    });
  }

  async exportAdminReport(
    adminAccessToken: string,
    payload: {
      report_type: "operation" | "business";
      from_at?: string;
      to_at?: string;
      role?: "super_admin" | "finance" | "ops";
    }
  ): Promise<AdminReportExportResponse> {
    return this.request<AdminReportExportResponse>("/v1/admin/reports/export", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${adminAccessToken}`
      },
      body: JSON.stringify(payload)
    });
  }

  async downloadAdminReport(
    adminAccessToken: string,
    exportId: string
  ): Promise<AdminReportDownloadResponse> {
    return this.request<AdminReportDownloadResponse>(`/v1/admin/reports/exports/${exportId}/download`, {
      method: "GET",
      headers: {
        Authorization: `Bearer ${adminAccessToken}`
      }
    });
  }

  async createAdminReviewRequest(
    adminAccessToken: string,
    payload: {
      operation_type: "user_freeze" | "entitlement_adjust" | "content_publish";
      request_reason: string;
      target_user_id?: string;
      target_content_item_id?: string;
      freeze?: {
        reason: string;
      };
      entitlement_adjust?: {
        reason: string;
        set_tier?: "free" | "pro";
        delta_days?: number;
        rollback_of_adjustment_id?: string;
      };
      content_publish?: {
        note?: string;
        simulate_failure?: boolean;
      };
    }
  ): Promise<AdminReviewRequestResponse> {
    return this.request<AdminReviewRequestResponse>("/v1/admin/reviews", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${adminAccessToken}`
      },
      body: JSON.stringify(payload)
    });
  }

  async listAdminReviewRequests(
    adminAccessToken: string,
    params?: {
      status?: "pending" | "approved" | "rejected";
      operation_type?: "user_freeze" | "entitlement_adjust" | "content_publish";
      requester_admin_user_id?: string;
      reviewer_admin_user_id?: string;
      page?: number;
      page_size?: number;
    }
  ): Promise<AdminReviewListResponse> {
    const query = new URLSearchParams();
    if (params?.status) {
      query.set("status", params.status);
    }
    if (params?.operation_type) {
      query.set("operation_type", params.operation_type);
    }
    if (params?.requester_admin_user_id) {
      query.set("requester_admin_user_id", params.requester_admin_user_id);
    }
    if (params?.reviewer_admin_user_id) {
      query.set("reviewer_admin_user_id", params.reviewer_admin_user_id);
    }
    if (typeof params?.page === "number") {
      query.set("page", String(params.page));
    }
    if (typeof params?.page_size === "number") {
      query.set("page_size", String(params.page_size));
    }
    const suffix = query.toString() ? `?${query.toString()}` : "";
    return this.request<AdminReviewListResponse>(`/v1/admin/reviews${suffix}`, {
      method: "GET",
      headers: {
        Authorization: `Bearer ${adminAccessToken}`
      }
    });
  }

  async approveAdminReviewRequest(
    adminAccessToken: string,
    reviewId: string,
    payload?: {
      comment?: string;
    }
  ): Promise<AdminReviewRequestResponse> {
    return this.request<AdminReviewRequestResponse>(`/v1/admin/reviews/${reviewId}/approve`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${adminAccessToken}`
      },
      body: JSON.stringify(payload ?? {})
    });
  }

  async rejectAdminReviewRequest(
    adminAccessToken: string,
    reviewId: string,
    payload: {
      comment: string;
    }
  ): Promise<AdminReviewRequestResponse> {
    return this.request<AdminReviewRequestResponse>(`/v1/admin/reviews/${reviewId}/reject`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${adminAccessToken}`
      },
      body: JSON.stringify(payload)
    });
  }

  async analyticsBatch(
    accessToken: string,
    payload: {
      events: Array<{
        platform: "windows" | "macos" | "ios" | "android" | "web";
        skill?: "listening" | "speaking" | "reading" | "writing";
        event_type: string;
        trace_id?: string;
        provider_name?: string;
        success?: boolean;
        fallback_triggered?: boolean;
        latency_ms?: number;
        metadata?: Record<string, unknown>;
        created_at?: string;
      }>;
    }
  ): Promise<AnalyticsBatchResponse> {
    return this.request<AnalyticsBatchResponse>("/v1/analytics/events/batch", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${accessToken}`
      },
      body: JSON.stringify(payload)
    });
  }

  async getAnalyticsSummary(
    accessToken: string,
    params?: {
      platform?: "windows" | "macos" | "ios" | "android" | "web";
      skill?: "listening" | "speaking" | "reading" | "writing";
    }
  ): Promise<AnalyticsSummaryResponse> {
    const query = new URLSearchParams();
    if (params?.platform) {
      query.set("platform", params.platform);
    }
    if (params?.skill) {
      query.set("skill", params.skill);
    }
    const suffix = query.toString() ? `?${query.toString()}` : "";
    return this.request<AnalyticsSummaryResponse>(`/v1/analytics/summary${suffix}`, {
      method: "GET",
      headers: {
        Authorization: `Bearer ${accessToken}`
      }
    });
  }

  async upsertAnalyticsExperiment(
    accessToken: string,
    experimentKey: string,
    payload: {
      name: string;
      description?: string;
      status?: "draft" | "running" | "stopped";
      traffic_percent?: number;
      variants: Array<{
        key: string;
        label: string;
        weight: number;
      }>;
      metric_event_type: string;
      stop_condition: {
        min_sample_size: number;
        target_lift_percent: number;
        max_duration_days: number;
      };
    }
  ): Promise<AnalyticsExperimentResponse> {
    return this.request<AnalyticsExperimentResponse>(`/v1/analytics/experiments/${encodeURIComponent(experimentKey)}`, {
      method: "PUT",
      headers: {
        Authorization: `Bearer ${accessToken}`
      },
      body: JSON.stringify(payload)
    });
  }

  async stopAnalyticsExperiment(
    accessToken: string,
    experimentKey: string,
    reason?: string
  ): Promise<AnalyticsExperimentResponse> {
    return this.request<AnalyticsExperimentResponse>(`/v1/analytics/experiments/${encodeURIComponent(experimentKey)}/stop`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${accessToken}`
      },
      body: JSON.stringify(
        reason
          ? {
              reason
            }
          : {}
      )
    });
  }

  async getAnalyticsExperiments(
    accessToken: string,
    params?: {
      status?: "draft" | "running" | "stopped";
    }
  ): Promise<AnalyticsExperimentBoardResponse> {
    const query = new URLSearchParams();
    if (params?.status) {
      query.set("status", params.status);
    }
    const suffix = query.toString() ? `?${query.toString()}` : "";
    return this.request<AnalyticsExperimentBoardResponse>(`/v1/analytics/experiments${suffix}`, {
      method: "GET",
      headers: {
        Authorization: `Bearer ${accessToken}`
      }
    });
  }

  async getAnalyticsExperimentAssignment(
    accessToken: string,
    experimentKey: string
  ): Promise<AnalyticsExperimentAssignmentResponse> {
    return this.request<AnalyticsExperimentAssignmentResponse>(
      `/v1/analytics/experiments/${encodeURIComponent(experimentKey)}/assignment`,
      {
        method: "GET",
        headers: {
          Authorization: `Bearer ${accessToken}`
        }
      }
    );
  }

  async getChurnRisks(
    accessToken: string,
    params?: {
      min_score?: number;
      level?: "low" | "medium" | "high";
      limit?: number;
    }
  ): Promise<ChurnRiskListResponse> {
    const query = new URLSearchParams();
    if (typeof params?.min_score === "number") {
      query.set("min_score", String(params.min_score));
    }
    if (params?.level) {
      query.set("level", params.level);
    }
    if (typeof params?.limit === "number") {
      query.set("limit", String(params.limit));
    }
    const suffix = query.toString() ? `?${query.toString()}` : "";
    return this.request<ChurnRiskListResponse>(`/v1/analytics/churn/risks${suffix}`, {
      method: "GET",
      headers: {
        Authorization: `Bearer ${accessToken}`
      }
    });
  }

  async triggerChurnStrategy(
    accessToken: string,
    payload: {
      user_id: string;
      strategy_type: "smart_reminder" | "mock_exam_boost" | "coupon_nudge";
      reason?: string;
      conversion_window_days?: number;
    }
  ): Promise<ChurnStrategyTriggerResponse> {
    return this.request<ChurnStrategyTriggerResponse>("/v1/analytics/churn/strategies/trigger", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${accessToken}`
      },
      body: JSON.stringify(payload)
    });
  }

  async getChurnEffect(
    accessToken: string,
    params?: {
      since?: string;
      strategy_type?: "smart_reminder" | "mock_exam_boost" | "coupon_nudge";
    }
  ): Promise<ChurnEffectResponse> {
    const query = new URLSearchParams();
    if (params?.since) {
      query.set("since", params.since);
    }
    if (params?.strategy_type) {
      query.set("strategy_type", params.strategy_type);
    }
    const suffix = query.toString() ? `?${query.toString()}` : "";
    return this.request<ChurnEffectResponse>(`/v1/analytics/churn/effect${suffix}`, {
      method: "GET",
      headers: {
        Authorization: `Bearer ${accessToken}`
      }
    });
  }

  async getProviderHealth(accessToken: string): Promise<ProviderHealthResponse> {
    return this.request<ProviderHealthResponse>("/v1/system/health/providers", {
      method: "GET",
      headers: {
        Authorization: `Bearer ${accessToken}`
      }
    });
  }

  async evaluateReleaseGate(
    accessToken: string,
    payload: {
      release_id: string;
      p0_defects: number;
      regression_pass_rate: number;
      api_success_rate: number;
      provider_healthy: boolean;
    }
  ): Promise<ReleaseGateResponse> {
    return this.request<ReleaseGateResponse>("/v1/system/release/gate/evaluate", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${accessToken}`
      },
      body: JSON.stringify(payload)
    });
  }

  async getReleaseOperationalMetrics(accessToken: string): Promise<ReleaseOperationalMetricsResponse> {
    return this.request<ReleaseOperationalMetricsResponse>("/v1/system/release/metrics", {
      method: "GET",
      headers: {
        Authorization: `Bearer ${accessToken}`
      }
    });
  }

  async startCanary(
    accessToken: string,
    payload: {
      release_id: string;
      target_percent: number;
      metrics: {
        error_rate: number;
        latency_p95_ms: number;
        provider_healthy: boolean;
      };
    }
  ): Promise<CanaryResponse> {
    return this.request<CanaryResponse>("/v1/system/release/canary/start", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${accessToken}`
      },
      body: JSON.stringify(payload)
    });
  }

  async promoteCanary(
    accessToken: string,
    canaryId: string,
    payload: {
      metrics: {
        error_rate: number;
        latency_p95_ms: number;
        provider_healthy: boolean;
      };
      expected_version?: number;
    }
  ): Promise<CanaryResponse> {
    const execute = (expectedVersion: number | undefined): Promise<CanaryResponse> =>
      this.request<CanaryResponse>(`/v1/system/release/canary/${canaryId}/promote`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${accessToken}`
        },
        body: JSON.stringify({
          ...payload,
          expected_version: expectedVersion
        })
      });

    try {
      return await execute(payload.expected_version);
    } catch (error) {
      if (!(error instanceof ApiRequestError) || error.code !== "CANARY_VERSION_CONFLICT") {
        throw error;
      }
      if (typeof payload.expected_version !== "number") {
        throw error;
      }
      const latest = await this.getCanary(accessToken, canaryId);
      return execute(latest.version);
    }
  }

  async rollbackCanary(
    accessToken: string,
    canaryId: string,
    reason: string,
    expectedVersion?: number
  ): Promise<CanaryResponse> {
    const execute = (version: number | undefined): Promise<CanaryResponse> =>
      this.request<CanaryResponse>(`/v1/system/release/canary/${canaryId}/rollback`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${accessToken}`
        },
        body: JSON.stringify({
          reason,
          expected_version: version
        })
      });

    try {
      return await execute(expectedVersion);
    } catch (error) {
      if (!(error instanceof ApiRequestError) || error.code !== "CANARY_VERSION_CONFLICT") {
        throw error;
      }
      if (typeof expectedVersion !== "number") {
        throw error;
      }
      const latest = await this.getCanary(accessToken, canaryId);
      return execute(latest.version);
    }
  }

  async getCanary(accessToken: string, canaryId: string): Promise<CanaryResponse> {
    return this.request<CanaryResponse>(`/v1/system/release/canary/${canaryId}`, {
      method: "GET",
      headers: {
        Authorization: `Bearer ${accessToken}`
      }
    });
  }

  async upsertBetaWhitelist(
    accessToken: string,
    userId: string,
    payload: {
      release_id: string;
      status?: "active" | "disabled";
      note?: string;
      expected_version?: number;
    }
  ): Promise<BetaWhitelistEntryResponse> {
    const execute = (expectedVersion: number | undefined): Promise<BetaWhitelistEntryResponse> =>
      this.request<BetaWhitelistEntryResponse>(`/v1/system/beta/whitelist/${userId}`, {
        method: "PUT",
        headers: {
          Authorization: `Bearer ${accessToken}`
        },
        body: JSON.stringify({
          ...payload,
          expected_version: expectedVersion
        })
      });

    try {
      return await execute(payload.expected_version);
    } catch (error) {
      if (!(error instanceof ApiRequestError) || error.code !== "BETA_WHITELIST_VERSION_CONFLICT") {
        throw error;
      }
      if (typeof payload.expected_version !== "number") {
        throw error;
      }
      const latest = await this.listBetaWhitelist(accessToken, {
        user_id: userId,
        release_id: payload.release_id,
        page: 1,
        page_size: 1
      });
      const latestVersion = latest.items[0]?.version ?? 0;
      return execute(latestVersion);
    }
  }

  async listBetaWhitelist(
    accessToken: string,
    params?: {
      user_id?: string;
      release_id?: string;
      status?: "active" | "disabled";
      page?: number;
      page_size?: number;
    }
  ): Promise<BetaWhitelistListResponse> {
    const query = new URLSearchParams();
    if (params?.user_id) {
      query.set("user_id", params.user_id);
    }
    if (params?.release_id) {
      query.set("release_id", params.release_id);
    }
    if (params?.status) {
      query.set("status", params.status);
    }
    if (typeof params?.page === "number") {
      query.set("page", String(params.page));
    }
    if (typeof params?.page_size === "number") {
      query.set("page_size", String(params.page_size));
    }
    const suffix = query.toString() ? `?${query.toString()}` : "";
    return this.request<BetaWhitelistListResponse>(`/v1/system/beta/whitelist${suffix}`, {
      method: "GET",
      headers: {
        Authorization: `Bearer ${accessToken}`
      }
    });
  }

  async submitBetaFeedback(
    accessToken: string,
    payload: {
      title: string;
      description: string;
      category: "bug" | "ux" | "performance" | "other";
      severity: "low" | "medium" | "high" | "critical";
      app_version?: string;
    }
  ): Promise<BetaFeedbackResponse> {
    return this.request<BetaFeedbackResponse>("/v1/system/beta/feedback", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${accessToken}`
      },
      body: JSON.stringify(payload)
    });
  }

  async listBetaFeedback(
    accessToken: string,
    params?: {
      user_id?: string;
      release_id?: string;
      status?: "open" | "triaged" | "resolved";
      priority?: "low" | "medium" | "high" | "critical";
      page?: number;
      page_size?: number;
    }
  ): Promise<BetaFeedbackListResponse> {
    const query = new URLSearchParams();
    if (params?.user_id) {
      query.set("user_id", params.user_id);
    }
    if (params?.release_id) {
      query.set("release_id", params.release_id);
    }
    if (params?.status) {
      query.set("status", params.status);
    }
    if (params?.priority) {
      query.set("priority", params.priority);
    }
    if (typeof params?.page === "number") {
      query.set("page", String(params.page));
    }
    if (typeof params?.page_size === "number") {
      query.set("page_size", String(params.page_size));
    }
    const suffix = query.toString() ? `?${query.toString()}` : "";
    return this.request<BetaFeedbackListResponse>(`/v1/system/beta/feedback${suffix}`, {
      method: "GET",
      headers: {
        Authorization: `Bearer ${accessToken}`
      }
    });
  }

  async getBetaFeedback(accessToken: string, feedbackId: string): Promise<BetaFeedbackResponse> {
    return this.request<BetaFeedbackResponse>(`/v1/system/beta/feedback/${feedbackId}`, {
      method: "GET",
      headers: {
        Authorization: `Bearer ${accessToken}`
      }
    });
  }

  async escalateBetaFeedbackPriority(
    accessToken: string,
    feedbackId: string,
    payload: {
      priority: "high" | "critical";
      reason: string;
      expected_version?: number;
    }
  ): Promise<BetaFeedbackResponse> {
    const execute = (expectedVersion: number | undefined): Promise<BetaFeedbackResponse> =>
      this.request<BetaFeedbackResponse>(`/v1/system/beta/feedback/${feedbackId}/escalate`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${accessToken}`
        },
        body: JSON.stringify({
          ...payload,
          expected_version: expectedVersion
        })
      });

    try {
      return await execute(payload.expected_version);
    } catch (error) {
      if (!(error instanceof ApiRequestError) || error.code !== "BETA_FEEDBACK_VERSION_CONFLICT") {
        throw error;
      }
      if (typeof payload.expected_version !== "number") {
        throw error;
      }
      const latest = await this.getBetaFeedback(accessToken, feedbackId);
      return execute(latest.version);
    }
  }

  async startStabilitySoakTest(
    accessToken: string,
    payload: {
      release_id: string;
      planned_duration_hours?: number;
    }
  ): Promise<StabilitySoakRunResponse> {
    return this.request<StabilitySoakRunResponse>("/v1/system/stability/soak-tests/start", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${accessToken}`
      },
      body: JSON.stringify(payload)
    });
  }

  async recordStabilityCheckpoint(
    accessToken: string,
    runId: string,
    payload: {
      at_hour: number;
      crash_count: number;
      active_sessions: number;
      api_success_rate: number;
      latency_p95_ms: number;
      expected_version?: number;
    }
  ): Promise<StabilityCheckpointResponse> {
    return this.request<StabilityCheckpointResponse>(`/v1/system/stability/soak-tests/${runId}/checkpoints`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${accessToken}`
      },
      body: JSON.stringify(payload)
    });
  }

  async getStabilityReport(accessToken: string, runId: string): Promise<StabilityReportResponse> {
    return this.request<StabilityReportResponse>(`/v1/system/stability/soak-tests/${runId}/report`, {
      method: "GET",
      headers: {
        Authorization: `Bearer ${accessToken}`
      }
    });
  }

  async compareStabilityReports(
    accessToken: string,
    params: {
      baseline_release_id: string;
      target_release_id: string;
    }
  ): Promise<StabilityCompareResponse> {
    const query = new URLSearchParams({
      baseline_release_id: params.baseline_release_id,
      target_release_id: params.target_release_id
    });
    return this.request<StabilityCompareResponse>(`/v1/system/stability/reports/compare?${query.toString()}`, {
      method: "GET",
      headers: {
        Authorization: `Bearer ${accessToken}`
      }
    });
  }

  async exportStabilityReport(
    accessToken: string,
    params: {
      baseline_release_id: string;
      target_release_id: string;
    }
  ): Promise<StabilityReportExportResponse> {
    const query = new URLSearchParams({
      baseline_release_id: params.baseline_release_id,
      target_release_id: params.target_release_id
    });
    return this.request<StabilityReportExportResponse>(`/v1/system/stability/reports/export?${query.toString()}`, {
      method: "GET",
      headers: {
        Authorization: `Bearer ${accessToken}`
      }
    });
  }

  async listStabilityAlerts(
    accessToken: string,
    params?: {
      run_id?: string;
      release_id?: string;
      level?: "yellow" | "red";
      status?: "open" | "acknowledged" | "resolved";
      page?: number;
      page_size?: number;
    }
  ): Promise<StabilityAlertListResponse> {
    const query = new URLSearchParams();
    if (params?.run_id) {
      query.set("run_id", params.run_id);
    }
    if (params?.release_id) {
      query.set("release_id", params.release_id);
    }
    if (params?.level) {
      query.set("level", params.level);
    }
    if (params?.status) {
      query.set("status", params.status);
    }
    if (typeof params?.page === "number") {
      query.set("page", String(params.page));
    }
    if (typeof params?.page_size === "number") {
      query.set("page_size", String(params.page_size));
    }
    const suffix = query.toString() ? `?${query.toString()}` : "";
    return this.request<StabilityAlertListResponse>(`/v1/system/stability/alerts${suffix}`, {
      method: "GET",
      headers: {
        Authorization: `Bearer ${accessToken}`
      }
    });
  }

  async handleStabilityAlert(
    accessToken: string,
    alertId: string,
    payload: {
      action: "acknowledge" | "resolve";
      note?: string;
      expected_version?: number;
    }
  ): Promise<StabilityAlertResponse> {
    return this.request<StabilityAlertResponse>(`/v1/system/stability/alerts/${alertId}/handle`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${accessToken}`
      },
      body: JSON.stringify(payload)
    });
  }

  async getSystemUserRoles(accessToken: string, userId: string): Promise<SystemUserRolesResponse> {
    return this.request<SystemUserRolesResponse>(`/v1/system/users/${userId}/roles`, {
      method: "GET",
      headers: {
        Authorization: `Bearer ${accessToken}`
      }
    });
  }

  async setSystemUserRoles(
    accessToken: string,
    userId: string,
    payload: {
      roles: Array<"learner" | "qa" | "ops" | "admin">;
    }
  ): Promise<SystemUserRolesResponse> {
    return this.request<SystemUserRolesResponse>(`/v1/system/users/${userId}/roles`, {
      method: "PUT",
      headers: {
        Authorization: `Bearer ${accessToken}`
      },
      body: JSON.stringify(payload)
    });
  }

  async listSystemRoleAuditLogs(
    accessToken: string,
    params?: {
      target_user_id?: string;
      operator_user_id?: string;
      page?: number;
      page_size?: number;
    }
  ): Promise<SystemRoleAuditListResponse> {
    const query = new URLSearchParams();
    if (params?.target_user_id) {
      query.set("target_user_id", params.target_user_id);
    }
    if (params?.operator_user_id) {
      query.set("operator_user_id", params.operator_user_id);
    }
    if (typeof params?.page === "number") {
      query.set("page", String(params.page));
    }
    if (typeof params?.page_size === "number") {
      query.set("page_size", String(params.page_size));
    }
    const suffix = query.toString() ? `?${query.toString()}` : "";
    return this.request<SystemRoleAuditListResponse>(`/v1/system/users/roles/audit${suffix}`, {
      method: "GET",
      headers: {
        Authorization: `Bearer ${accessToken}`
      }
    });
  }

  async request<T>(path: string, init: RequestInit): Promise<T> {
    const headers = new Headers(init.headers ?? {});
    if (init.body !== undefined && init.body !== null && !headers.has("Content-Type")) {
      headers.set("Content-Type", "application/json");
    }

    const response = await this.fetchFn.call(globalThis, `${this.baseUrl}${path}`, {
      ...init,
      headers
    });

    const body = (await response.json().catch(() => ({}))) as Record<string, unknown>;

    if (!response.ok) {
      const message = typeof body.message === "string" ? body.message : "Request failed";
      const code = typeof body.code === "string" ? body.code : undefined;
      throw new ApiRequestError(message, response.status, code);
    }

    return body as T;
  }
}
