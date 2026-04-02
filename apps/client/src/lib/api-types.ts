export type RegisterPayload = {
  email?: string;
  phone?: string;
  password: string;
  display_name?: string;
};

export type LoginPayload = {
  identifier: string;
  password: string;
  device_id?: string;
};

export type TokenResponse = {
  access_token: string;
  refresh_token: string;
  expires_in: number;
  user_id: string;
  session_id: string;
};

export type OnboardingPayload = {
  target_overall_band: number;
  target_exam_date: string;
  weekly_study_hours: number;
  weak_skills: Array<"listening" | "speaking" | "reading" | "writing">;
};

export type AssessmentStatus = "processing" | "in_progress" | "paused" | "completed" | "failed";

export type OnboardingResponse = {
  assessment_id: string;
  plan_id: string;
  status: "processing" | "completed" | "failed";
};

export type OnboardingStatusResponse = {
  assessment_id: string;
  plan_id: string;
  status: AssessmentStatus;
  updated_at: string;
  answered_count: number;
  total_questions: number;
  elapsed_seconds: number;
  error_message?: string;
};

export type DiagnosticQuestionsResponse = {
  assessment_id: string;
  status: "in_progress" | "paused" | "completed";
  answered_count: number;
  total_questions: number;
  elapsed_seconds: number;
  current_question_index: number;
  questions: Array<{
    question_id: string;
    skill: "listening" | "speaking" | "reading" | "writing";
    prompt: string;
  }>;
};

export type DiagnosticAnswerResponse = {
  assessment_id: string;
  answered_count: number;
  total_questions: number;
  current_question_index: number;
  status: "in_progress" | "paused" | "completed";
};

export type DiagnosticCompletionResponse = {
  assessment_id: string;
  plan_id: string;
  status: "completed";
  elapsed_seconds: number;
  skill_bands: {
    listening: number;
    speaking: number;
    reading: number;
    writing: number;
  };
};

export type ProgressResponse = {
  listening_completed: number;
  speaking_completed: number;
  reading_completed: number;
  writing_completed: number;
  total_study_minutes: number;
  streak_days: number;
  server_version: number;
  updated_at: string;
  last_synced_device_id?: string;
};

export type ProgressSyncPayload = {
  device_id?: string;
  client_updated_at: string;
  progress: {
    listening_completed: number;
    speaking_completed: number;
    reading_completed: number;
    writing_completed: number;
    total_study_minutes: number;
    streak_days: number;
  };
};

export type ProgressSyncResponse = ProgressResponse & {
  stale_request: boolean;
  conflict_count: number;
};

export type ProgressConflictHistoryResponse = {
  items: Array<{
    id: string;
    field: string;
    incoming_value: number;
    server_value: number;
    client_updated_at: string;
    server_updated_at: string;
    created_at: string;
    device_id?: string;
  }>;
};

export type UserProfileResponse = {
  id: string;
  email?: string;
  phone?: string;
  status: "active" | "frozen" | "pending_deletion" | "deleted";
  deletion_requested_at?: string;
  deleted_at?: string;
  created_at: string;
  updated_at: string;
};

export type RequestDeletionResponse = {
  user_id: string;
  status: "pending_deletion";
  deletion_requested_at: string;
};

export type DeleteAccountResponse = {
  user_id: string;
  status: "deleted";
  deleted_at: string;
  revoked_sessions: number;
  removed_assessments: number;
  removed_plans: number;
  removed_goal_profiles: number;
  removed_progress_conflicts: number;
  removed_practice_sessions?: number;
  removed_retry_queue_items?: number;
  removed_speaking_sessions?: number;
  removed_writing_evaluations?: number;
  removed_writing_rewrite_archives?: number;
  removed_mock_exams?: number;
  removed_mock_exam_reports?: number;
  removed_entitlements?: number;
  removed_subscription_orders?: number;
  removed_subscription_events?: number;
  removed_entitlement_adjustments?: number;
};

export type UserDataExportResponse = {
  filename: string;
  content: string;
};

export type ReminderPreferenceResponse = {
  subscribed: boolean;
  active_hour_utc: number;
  updated_at: string;
};

export type ReminderRecommendationResponse = {
  subscribed: boolean;
  active_hour_utc: number;
  reminder_id?: string;
  scheduled_at?: string;
  reason?: string;
  deep_link?: string;
  plan_id?: string;
  task_id?: string;
  created_at?: string;
};

export type ReminderClickResponse = {
  reminder_id: string;
  deep_link: string;
  plan_id?: string;
  task_id?: string;
  clicked_at?: string;
};

export type ReminderDeviceRegistrationResponse = {
  installation_id: string;
  platform: "ios" | "android";
  permission_status: "granted" | "provisional" | "undetermined" | "denied" | "unsupported";
  push_provider?: "apns" | "fcm";
  push_token_preview?: string;
  device_label?: string;
  app_build?: string;
  environment: "development" | "preview" | "production";
  delivery_ready: boolean;
  created_at: string;
  updated_at: string;
  last_delivery_attempt?: {
    attempt_id: string;
    reminder_id: string;
    status: "sent" | "skipped" | "duplicate" | "failed";
    push_provider?: "apns" | "fcm";
    provider_message_id?: string;
    duplicate_of_attempt_id?: string;
    skip_reason?: string;
    failure_code?:
      | "SENDER_UNAVAILABLE"
      | "NETWORK_ERROR"
      | "AUTH_ERROR"
      | "INVALID_REQUEST"
      | "DEVICE_UNREGISTERED"
      | "RATE_LIMITED"
      | "PROVIDER_UNAVAILABLE"
      | "PROVIDER_ERROR";
    failure_message?: string;
    retry_count: number;
    device_removed?: boolean;
    created_at: string;
    updated_at: string;
  };
};

export type ReminderDeviceRegistrationListResponse = {
  total_count: number;
  deliverable_count: number;
  items: ReminderDeviceRegistrationResponse[];
};

export type ReminderDeviceDeleteResponse = {
  installation_id: string;
  removed: boolean;
};

export type StudyPlanResponse = {
  plan_id: string;
  status: "active" | "archived";
  horizon_weeks: number;
  version: number;
  created_at: string;
  updated_at: string;
  weeks: Array<{
    week_id: string;
    week_no: number;
    goals: string[];
    tasks: Array<{
      task_id: string;
      skill: "listening" | "speaking" | "reading" | "writing";
      task_type: string;
      title: string;
      target_minutes: number;
      completion_criteria: string;
      day_of_week: number;
      status: "todo" | "doing" | "done" | "skipped";
    }>;
  }>;
  adjustment_history: Array<{
    adjustment_id: string;
    source_type: "manual_task_adjustment" | "practice_session" | "speaking_session" | "writing_evaluation" | "mock_exam_report";
    source_id: string;
    skill?: "listening" | "speaking" | "reading" | "writing";
    reason: string;
    score?: number;
    created_at: string;
    changed_tasks: Array<{
      task_id: string;
      skill: "listening" | "speaking" | "reading" | "writing";
      before_target_minutes: number;
      after_target_minutes: number;
      before_completion_criteria: string;
      after_completion_criteria: string;
    }>;
  }>;
};

export type StudyPlanAdjustmentHistoryResponse = {
  total: number;
  page: number;
  page_size: number;
  items: StudyPlanResponse["adjustment_history"];
};

export type PracticeSkill = "listening" | "reading";

export type PracticeSessionResponse = {
  session_id: string;
  skill: PracticeSkill;
  task_type: string;
  training_mode: "training" | "exam";
  mode: "core_training" | "retry";
  status: "in_progress" | "submitted";
  created_at: string;
  updated_at: string;
  timer?: {
    status: "idle" | "running" | "paused" | "ended";
    limit_seconds?: number;
    elapsed_seconds: number;
    started_at?: string;
    paused_at?: string;
    submitted_elapsed_seconds?: number;
    recovered_at?: string;
    remaining_seconds?: number;
  };
  questions: Array<{
    question_id: string;
    type:
      | "multiple_choice"
      | "fill_blank"
      | "matching"
      | "map_label"
      | "dictation_sentence"
      | "tfng"
      | "paragraph_match"
      | "heading_match"
      | "summary_cloze";
    prompt: string;
    options?: string[];
    audio_segment_index?: number;
  }>;
  submission?: {
    submitted_at: string;
    score_breakdown: {
      correct_count: number;
      total_questions: number;
      accuracy: number;
      elapsed_seconds?: number;
      mode: "training" | "exam";
    };
    question_results: Array<{
      question_id: string;
      type: string;
      user_answer: string;
      correct_answer: string;
      is_correct: boolean;
      explanation: string;
      error_tags: string[];
      improvement_actions: string[];
      evidence?: {
        sentence: string;
        paragraph: number;
        span_start: number;
        span_end: number;
      };
      dictation_feedback?: {
        expected_token_count: number;
        answer_token_count: number;
        spelling_mismatches: Array<{
          position: number;
          expected: string;
          actual: string;
        }>;
        missing_chunks: string[];
        extra_chunks: string[];
      };
    }>;
    next_actions: string[];
    dictation_summary?: {
      total_sentences: number;
      high_frequency_spelling_errors: Array<{
        token: string;
        count: number;
      }>;
      high_frequency_chunk_errors: Array<{
        chunk: string;
        count: number;
      }>;
    };
  };
};

export type PlaybackStateResponse = {
  playback_rate: number;
  segment_index: number;
  position_seconds: number;
  replay_wrong_only: boolean;
  last_replayed_question_id?: string;
  last_recovered_at?: string;
  recovered?: boolean;
};

export type RetryQueueResponse = {
  items: Array<{
    queue_item_id: string;
    skill: PracticeSkill;
    source_session_id: string;
    question_id: string;
    status: "queued" | "in_progress" | "completed";
    error_tags: string[];
    improvement_actions: string[];
    proficiency_before: number;
    proficiency_after?: number;
    created_at: string;
    updated_at: string;
    completed_at?: string;
  }>;
};

export type SpeakingSessionResponse = {
  session_id: string;
  status: "created" | "connected" | "disconnected" | "ended";
  task_type?: "core_training" | "role_play";
  scenario_type?: "campus_service" | "travel_support" | "job_interview" | "academic_tutor" | "community_event";
  resume_token?: string;
  resume_until: string;
  current_part?: 1 | 2 | 3;
  topic?: string;
  source_session_id?: string;
  turns?: number;
  summary?: {
    fluency: number;
    lexical: number;
    grammar: number;
    pronunciation: number;
    turns: number;
  };
  connected_at?: string;
  disconnected_at?: string;
  ended_at?: string;
  created_at?: string;
  updated_at?: string;
};

export type SpeakingRolePlayScenariosResponse = {
  items: Array<{
    scenario_type: "campus_service" | "travel_support" | "job_interview" | "academic_tutor" | "community_event";
    title: string;
    opening_prompt: string;
    npc_role: string;
  }>;
};

export type SpeakingSessionEventsResponse = {
  items: Array<{
    id: string;
    type: string;
    payload: Record<string, unknown>;
    created_at: string;
  }>;
};

export type SpeakingPronunciationFeedbackResponse = {
  turns: Array<{
    turn_no: number;
    part_no: 1 | 2 | 3;
    word_issues: Array<{
      word: string;
      position: number;
      phoneme: string;
      severity: "low" | "medium" | "high";
      issue_tag: string;
      suggestion: string;
      replay_segment_id: string;
    }>;
    phoneme_issues: Array<{
      phoneme: string;
      issue_tag: string;
      suggestion: string;
      severity: "low" | "medium" | "high";
      count: number;
      example_words: string[];
    }>;
    replay_segments: Array<{
      segment_id: string;
      turn_no: number;
      start_ms: number;
      end_ms: number;
      reference_text: string;
      user_text: string;
      reference_audio_url: string;
      user_audio_url: string;
    }>;
  }>;
  hotspot_words: Array<{
    word: string;
    count: number;
    max_severity: "low" | "medium" | "high";
  }>;
  hotspot_phonemes: Array<{
    phoneme: string;
    issue_tag: string;
    suggestion: string;
    severity: "low" | "medium" | "high";
    count: number;
    example_words: string[];
  }>;
  tasks: Array<{
    task_id: string;
    title: string;
    description: string;
    phoneme: string;
    status: "todo" | "doing" | "done";
    linked_turn_nos: number[];
  }>;
};

export type SpeakingPronunciationTaskTrackResponse = {
  task_id: string;
  status: "todo" | "doing" | "done";
  linked_turn_nos: number[];
};

export type SpeakingComparisonResponse = {
  source_session_id: string;
  retry_session_id: string;
  source_scores: {
    fluency: number;
    lexical: number;
    grammar: number;
    pronunciation: number;
  };
  retry_scores: {
    fluency: number;
    lexical: number;
    grammar: number;
    pronunciation: number;
  };
  delta: {
    fluency: number;
    lexical: number;
    grammar: number;
    pronunciation: number;
  };
  next_actions: string[];
};

export type WritingEvaluationResponse = {
  evaluation_id: string;
  task_type: "task1" | "task2";
  prompt: string;
  source_evaluation_id?: string;
  scores: {
    tr: number;
    cc: number;
    lr: number;
    gra: number;
    overall: number;
  };
  suggestions: Array<{
    suggestion_id: string;
    issue: string;
    evidence_sentence: string;
    recommendation: string;
    revised_sample: string;
  }>;
  latency_ms: number;
  fallback_triggered: boolean;
  created_at: string;
  updated_at: string;
};

export type WritingRewriteResponse = {
  evaluation: WritingEvaluationResponse;
  comparison: {
    source_evaluation_id: string;
    rewrite_evaluation_id: string;
    source_scores: WritingEvaluationResponse["scores"];
    rewrite_scores: WritingEvaluationResponse["scores"];
    delta: WritingEvaluationResponse["scores"];
    next_actions: string[];
  };
  archive: {
    archive_id: string;
    task_type: "task1" | "task2";
    source_evaluation_id: string;
    rewrite_evaluation_id: string;
    delta_overall: number;
    created_at: string;
  };
};

export type WritingArchiveResponse = {
  items: Array<{
    archive_id: string;
    task_type: "task1" | "task2";
    source_evaluation_id: string;
    rewrite_evaluation_id: string;
    delta_overall: number;
    created_at: string;
  }>;
};

export type WritingTemplateListResponse = {
  items: Array<{
    template_id: string;
    task_type: "task1" | "task2";
    title: string;
    argument_framework: string;
    scenario_tag: string;
    usage_tips: string[];
    sections: Array<{
      section_id: string;
      title: string;
      content: string;
    }>;
    usage_count: number;
    adoption_rate: number;
  }>;
};

export type WritingTemplateInsertResponse = {
  template: WritingTemplateListResponse["items"][number];
  merged_essay: string;
  preserved_original: boolean;
  usage: {
    usage_id: string;
    template_id: string;
    inserted_at: string;
    original_essay_length: number;
    merged_essay_length: number;
  };
};

export type WritingTemplateAdoptionResponse = {
  total_insertions: number;
  items: Array<{
    template_id: string;
    title: string;
    task_type: "task1" | "task2";
    usage_count: number;
    adoption_rate: number;
  }>;
};

export type MockExamResponse = {
  exam_id: string;
  status: "in_progress" | "submitted" | "completed";
  time_limit_seconds: number;
  elapsed_seconds: number;
  remaining_seconds: number;
  current_skill: "listening" | "speaking" | "reading" | "writing";
  sections: Array<{
    skill: "listening" | "speaking" | "reading" | "writing";
    status: "not_started" | "in_progress" | "submitted";
    answered_count: number;
    last_checkpoint_at?: string;
  }>;
  recovered_at?: string;
  submitted_at?: string;
  report_id?: string;
  created_at: string;
  updated_at: string;
  recovered?: boolean;
};

export type MockExamReportResponse = {
  report_id: string;
  exam_id: string;
  total_estimated_band: number;
  skill_band_estimates: {
    listening: number;
    speaking: number;
    reading: number;
    writing: number;
  };
  error_distribution: {
    listening: number;
    speaking: number;
    reading: number;
    writing: number;
  };
  next_actions: string[];
  generated_at: string;
  plan_writeback?: {
    applied: boolean;
    applied_at?: string;
    reasons: string[];
    undo_available: boolean;
    undone_at?: string;
    changed_tasks: Array<{
      task_id: string;
      target_minutes_before: number;
      completion_criteria_before: string;
      target_minutes_after: number;
      completion_criteria_after: string;
    }>;
  };
  created_at: string;
  updated_at: string;
};

export type MockExamSubmitResponse = {
  exam: MockExamResponse;
  report: MockExamReportResponse;
};

export type MockExamExportResponse = {
  filename: string;
  content: string;
};

export type AnalyticsBatchResponse = {
  accepted_count: number;
  rejected_count: number;
  core_coverage_percent: number;
  field_completeness_percent: number;
};

export type AnalyticsSummaryResponse = {
  total_events: number;
  core_coverage_percent: number;
  field_completeness_percent: number;
  by_platform: Record<string, number>;
  by_skill: Record<string, number>;
  recent_events: Array<{
    id: string;
    platform: "windows" | "macos" | "ios" | "android" | "web";
    skill?: "listening" | "speaking" | "reading" | "writing";
    event_type: string;
    trace_id: string;
    provider_name?: string;
    fallback_triggered?: boolean;
    latency_ms?: number;
    created_at: string;
  }>;
};

export type AnalyticsExperimentResponse = {
  key: string;
  name: string;
  description?: string;
  status: "draft" | "running" | "stopped";
  traffic_percent: number;
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
  created_at: string;
  updated_at: string;
  started_at?: string;
  stopped_at?: string;
  stop_reason?: string;
};

export type AnalyticsExperimentAssignmentResponse = {
  experiment_key: string;
  status: "draft" | "running" | "stopped";
  holdout: boolean;
  variant_key?: string;
  assignment_source: "existing" | "new";
};

export type AnalyticsExperimentBoardResponse = {
  total: number;
  items: Array<{
    experiment: AnalyticsExperimentResponse;
    metrics: {
      sample_size: number;
      running_days: number;
      variants: Array<{
        variant_key: string;
        label: string;
        assigned_users: number;
        exposure_count: number;
        conversion_count: number;
        conversion_rate: number;
        lift_percent?: number;
      }>;
    };
    stop_recommendation: {
      should_stop: boolean;
      reasons: string[];
      evaluated_at: string;
    };
  }>;
};
