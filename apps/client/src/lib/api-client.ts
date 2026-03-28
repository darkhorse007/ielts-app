import type {
  AnalyticsBatchResponse,
  AnalyticsExperimentAssignmentResponse,
  AnalyticsExperimentBoardResponse,
  AnalyticsExperimentResponse,
  AnalyticsSummaryResponse,
  DeleteAccountResponse,
  DiagnosticAnswerResponse,
  DiagnosticCompletionResponse,
  DiagnosticQuestionsResponse,
  LoginPayload,
  MockExamExportResponse,
  MockExamReportResponse,
  MockExamResponse,
  MockExamSubmitResponse,
  OnboardingPayload,
  OnboardingResponse,
  OnboardingStatusResponse,
  PlaybackStateResponse,
  PracticeSessionResponse,
  PracticeSkill,
  ProgressConflictHistoryResponse,
  ProgressResponse,
  ProgressSyncPayload,
  ProgressSyncResponse,
  ReminderClickResponse,
  ReminderPreferenceResponse,
  ReminderRecommendationResponse,
  RegisterPayload,
  RetryQueueResponse,
  RequestDeletionResponse,
  SpeakingComparisonResponse,
  SpeakingPronunciationFeedbackResponse,
  SpeakingPronunciationTaskTrackResponse,
  SpeakingSessionEventsResponse,
  SpeakingRolePlayScenariosResponse,
  SpeakingSessionResponse,
  StudyPlanAdjustmentHistoryResponse,
  StudyPlanResponse,
  TokenResponse,
  UserDataExportResponse,
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

  async exportUserData(accessToken: string): Promise<UserDataExportResponse> {
    return this.requestText("/v1/users/me/export?format=json", {
      method: "GET",
      headers: {
        Authorization: `Bearer ${accessToken}`
      }
    }, "user-data-export.json");
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

  async requestText(
    path: string,
    init: RequestInit,
    fallbackFilename: string
  ): Promise<{
    filename: string;
    content: string;
  }> {
    const headers = new Headers(init.headers ?? {});
    if (init.body !== undefined && init.body !== null && !headers.has("Content-Type")) {
      headers.set("Content-Type", "application/json");
    }

    const response = await this.fetchFn.call(globalThis, `${this.baseUrl}${path}`, {
      ...init,
      headers
    });
    const content = await response.text();

    if (!response.ok) {
      let message = "Request failed";
      let code: string | undefined;

      try {
        const body = JSON.parse(content) as Record<string, unknown>;
        message = typeof body.message === "string" ? body.message : message;
        code = typeof body.code === "string" ? body.code : undefined;
      } catch {
        if (content) {
          message = content;
        }
      }

      throw new ApiRequestError(message, response.status, code);
    }

    const disposition = response.headers.get("content-disposition");
    const filenameMatch = disposition?.match(/filename=\"([^\"]+)\"/);

    return {
      filename: filenameMatch?.[1] ?? fallbackFilename,
      content
    };
  }
}
