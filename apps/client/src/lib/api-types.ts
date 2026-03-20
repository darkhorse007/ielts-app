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

export type EntitlementResponse = {
  entitlement_id: string;
  tier: "free" | "pro" | "family_owner" | "family_member";
  status: "active" | "cancelled" | "expired";
  daily_quota: number;
  used_today: number;
  remaining_today: number;
  quota_date: string;
  auto_renew: boolean;
  expires_at?: string;
  version: number;
  last_synced_device_id?: string;
  created_at: string;
  updated_at: string;
};

export type SubscriptionUpgradeResponse = {
  order_id: string;
  plan_code: "pro_monthly" | "pro_yearly" | "family_duo_monthly";
  provider: string;
  status: "created" | "paid" | "failed" | "cancelled" | "refunded";
  list_price_cny: number;
  discount_cny: number;
  payable_amount_cny: number;
  paid_amount_cny: number;
  refunded_amount_cny: number;
  coupon_code?: string;
  amount_cny: number;
  payment_token: string;
  provider_order_id?: string;
  payment_retry_supported: boolean;
  created_at: string;
  updated_at: string;
};

export type PaymentWebhookResponse = {
  idempotent: boolean;
  order: SubscriptionUpgradeResponse;
  entitlement: EntitlementResponse;
};

export type AdminLoginResponse = {
  access_token: string;
  expires_in: number;
  admin_user_id: string;
  email: string;
  display_name: string;
  roles: Array<"super_admin" | "finance" | "ops">;
  menus: string[];
};

export type AdminOrdersResponse = {
  total: number;
  page: number;
  page_size: number;
  items: Array<{
    order_id: string;
    user_id: string;
    plan_code: "pro_monthly" | "pro_yearly" | "family_duo_monthly";
    provider: string;
    status: "created" | "paid" | "failed" | "cancelled" | "refunded";
    list_price_cny: number;
    discount_cny: number;
    payable_amount_cny: number;
    paid_amount_cny: number;
    refunded_amount_cny: number;
    coupon_code?: string;
    amount_cny: number;
    provider_order_id?: string;
    created_at: string;
    updated_at: string;
  }>;
};

export type AdminCouponRulesResponse = {
  total: number;
  page: number;
  page_size: number;
  items: Array<{
    code: string;
    status: "active" | "inactive";
    description?: string;
    discount_type: "percentage" | "fixed_amount";
    discount_value: number;
    max_discount_cny?: number;
    plan_codes?: Array<"pro_monthly" | "pro_yearly" | "family_duo_monthly">;
    starts_at?: string;
    expires_at?: string;
    created_at: string;
    updated_at: string;
  }>;
};

export type AdminCouponRuleResponse = AdminCouponRulesResponse["items"][number];

export type AdminEntitlementAdjustResponse = {
  entitlement: {
    entitlement_id: string;
    user_id: string;
    tier: "free" | "pro" | "family_owner" | "family_member";
    status: "active" | "cancelled" | "expired";
    daily_quota: number;
    used_today: number;
    remaining_today: number;
    expires_at?: string;
    version: number;
    updated_at: string;
  };
  adjustment: {
    adjustment_id: string;
    user_id: string;
    admin_user_id: string;
    reason: string;
    set_tier?: "free" | "pro";
    delta_days?: number;
    previous_tier: "free" | "pro" | "family_owner" | "family_member";
    previous_expires_at?: string;
    new_tier: "free" | "pro" | "family_owner" | "family_member";
    new_expires_at?: string;
    rolled_back: boolean;
    rolled_back_at?: string;
    rollback_of_adjustment_id?: string;
    created_at: string;
    updated_at: string;
  };
};

export type FamilyInvitationResponse = {
  invitation_id: string;
  invitee_user_id: string;
  status: "pending" | "accepted" | "revoked" | "expired";
  created_at?: string;
  accepted_at?: string;
  group: {
    group_id: string;
    owner_user_id: string;
    seat_limit: number;
    used_seats: number;
    available_seats: number;
    status: "active" | "inactive";
    member_user_ids: string[];
    expires_at?: string;
    updated_at: string;
  };
  entitlement?: EntitlementResponse;
};

export type FamilyMembersResponse = {
  group: {
    group_id: string;
    owner_user_id: string;
    seat_limit: number;
    used_seats: number;
    available_seats: number;
    status: "active" | "inactive";
    member_user_ids: string[];
    expires_at?: string;
    updated_at: string;
  };
  members: Array<{
    user_id: string;
    tier: "free" | "pro" | "family_owner" | "family_member";
    status: "active" | "cancelled" | "expired";
    expires_at?: string;
  }>;
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

export type ChurnRiskListResponse = {
  total: number;
  items: Array<{
    risk_id: string;
    user_id: string;
    score: number;
    level: "low" | "medium" | "high";
    factors: string[];
    last_active_at?: string;
    weekly_learning_events: number;
    reminder_clicks_30d: number;
    computed_at: string;
  }>;
};

export type ChurnStrategyTriggerResponse = {
  trigger_id: string;
  user_id: string;
  risk: {
    risk_id: string;
    score: number;
    level: "low" | "medium" | "high";
    factors: string[];
    computed_at: string;
  };
  strategy_type: "smart_reminder" | "mock_exam_boost" | "coupon_nudge";
  status: "triggered" | "converted";
  conversion_window_days: number;
  reason?: string;
  payload: Record<string, unknown>;
  triggered_at: string;
};

export type ChurnEffectResponse = {
  total_triggers: number;
  converted_triggers: number;
  recall_rate_percent: number;
  by_strategy: Array<{
    strategy_type: "smart_reminder" | "mock_exam_boost" | "coupon_nudge";
    total_triggers: number;
    converted_triggers: number;
    recall_rate_percent: number;
  }>;
  items: Array<{
    trigger_id: string;
    user_id: string;
    strategy_type: "smart_reminder" | "mock_exam_boost" | "coupon_nudge";
    status: "triggered" | "converted";
    reason?: string;
    conversion_window_days: number;
    payload: Record<string, unknown>;
    triggered_at: string;
    converted_at?: string;
  }>;
};

export type ProviderHealthResponse = {
  healthy: boolean;
  providers: Array<{
    provider_name: string;
    success_rate: number;
    fallback_rate: number;
    p95_latency_ms: number;
    total_calls: number;
    alert_level: "green" | "yellow" | "red";
    alert_reasons: string[];
    recent_traces: Array<{
      trace_id: string;
      source: "speaking" | "writing" | "analytics";
      latency_ms?: number;
      fallback_triggered?: boolean;
      created_at: string;
      session_id?: string;
      evaluation_id?: string;
    }>;
    updated_at: string;
  }>;
  alerts: Array<{
    provider_name: string;
    level: "yellow" | "red";
    reasons: string[];
  }>;
};

export type ReleaseGateResponse = {
  gate_id: string;
  release_id: string;
  passed: boolean;
  checks: Array<{
    name: string;
    threshold: string;
    actual: string;
    passed: boolean;
  }>;
  created_at: string;
};

export type ReleaseOperationalMetricsResponse = {
  idempotency: {
    totals: {
      attempts: number;
      replay_hits: number;
      conflict_count: number;
      replay_rate: number;
      conflict_rate: number;
    };
    actions: Array<{
      action_name: string;
      attempts: number;
      replay_hits: number;
      conflict_count: number;
      replay_rate: number;
      conflict_rate: number;
    }>;
  };
  write_latency: {
    total_writes: number;
    failed_writes: number;
    avg_latency_ms: number;
    p95_latency_ms: number;
    max_latency_ms: number;
    thresholds_ms: {
      yellow: number;
      red: number;
    };
    alerts: {
      yellow_count: number;
      red_count: number;
      recent: Array<{
        operation: string;
        latency_ms: number;
        level: "yellow" | "red";
        failed: boolean;
        threshold_ms: number;
        recorded_at: string;
      }>;
    };
    recent_samples: Array<{
      operation: string;
      latency_ms: number;
      failed: boolean;
      recorded_at: string;
    }>;
  };
  storage_resilience: {
    backend: "memory" | "sqlite" | "postgres";
    mode: "synchronous" | "async_buffered";
    circuit_open: boolean;
    circuit_open_until: string | null;
    consecutive_write_failures: number;
    max_attempts: number;
    retry_base_delay_ms: number;
    retry_max_delay_ms: number;
    circuit_failure_threshold: number;
    circuit_cooldown_ms: number;
    last_error: string | null;
    alerting: {
      circuit_open_threshold_ms: number;
      recent_limit: number;
      recent_count: number;
      capped_count: number;
      opened_count: number;
      prolonged_count: number;
      recovered_count: number;
      recent: Array<{
        event: "circuit_opened" | "circuit_prolonged" | "circuit_recovered";
        backend: "memory" | "sqlite" | "postgres";
        operation: string;
        write_failed: boolean;
        consecutive_write_failures: number;
        duration_ms?: number;
        last_error?: string;
        recorded_at: string;
      }>;
    };
  };
};

export type CanaryResponse = {
  canary_id: string;
  release_id: string;
  version: number;
  target_percent?: number;
  status: "running" | "promoted" | "rolled_back";
  metrics?: {
    error_rate: number;
    latency_p95_ms: number;
    provider_healthy: boolean;
  };
  started_at?: string;
  promoted_at?: string;
  rolled_back_at?: string;
  rollback_reason?: string;
  updated_at?: string;
};

export type BetaWhitelistEntryResponse = {
  whitelist_id: string;
  user_id: string;
  release_id: string;
  version: number;
  status: "active" | "disabled";
  note?: string;
  created_by_user_id: string;
  updated_by_user_id: string;
  created_at: string;
  updated_at: string;
};

export type BetaWhitelistListResponse = {
  total: number;
  page: number;
  page_size: number;
  items: BetaWhitelistEntryResponse[];
};

export type BetaFeedbackResponse = {
  feedback_id: string;
  user_id: string;
  release_id: string;
  version: number;
  app_version?: string;
  category: "bug" | "ux" | "performance" | "other";
  severity: "low" | "medium" | "high" | "critical";
  priority: "low" | "medium" | "high" | "critical";
  status: "open" | "triaged" | "resolved";
  title: string;
  description: string;
  escalated_at?: string;
  escalated_by_user_id?: string;
  escalation_reason?: string;
  created_at: string;
  updated_at: string;
};

export type BetaFeedbackListResponse = {
  total: number;
  page: number;
  page_size: number;
  items: BetaFeedbackResponse[];
};

export type StabilitySoakRunResponse = {
  run_id: string;
  release_id: string;
  planned_duration_hours: number;
  status: "running" | "completed" | "failed";
  started_at: string;
  completed_at?: string;
  created_by_user_id: string;
  created_at: string;
  updated_at: string;
};

export type StabilityCheckpointResponse = {
  checkpoint_id: string;
  run_id: string;
  release_id: string;
  version: number;
  at_hour: number;
  crash_count: number;
  active_sessions: number;
  api_success_rate: number;
  latency_p95_ms: number;
  created_by_user_id: string;
  created_at: string;
  run_status: "running" | "completed" | "failed";
  run_completed_at?: string;
  alerts?: Array<{
    alert_id: string;
    type: "crash_rate_per_1k" | "api_success_rate" | "latency_p95_ms";
    level: "yellow" | "red";
    status: "open" | "acknowledged" | "resolved";
    version: number;
    reason: string;
  }>;
};

export type StabilityReportResponse = {
  run: StabilitySoakRunResponse;
  summary: {
    checkpoint_count: number;
    collected_duration_hours: number;
    last_checkpoint_at: string;
    total_crashes: number;
    max_crash_count: number;
    avg_crash_rate_per_1k: number;
    min_api_success_rate: number;
    avg_api_success_rate: number;
    max_latency_p95_ms: number;
    avg_latency_p95_ms: number;
  };
  trend: Array<{
    checkpoint_id: string;
    at_hour: number;
    crash_count: number;
    active_sessions: number;
    crash_rate_per_1k: number;
    api_success_rate: number;
    latency_p95_ms: number;
    recorded_at: string;
  }>;
  generated_at: string;
};

export type StabilityCompareResponse = {
  baseline_release_id: string;
  target_release_id: string;
  baseline_report: {
    run_id: string;
    release_id: string;
    status: "running" | "completed" | "failed";
    summary: {
      checkpoint_count: number;
      total_crashes: number;
      avg_crash_rate_per_1k: number;
      avg_api_success_rate: number;
      avg_latency_p95_ms: number;
    };
  };
  target_report: {
    run_id: string;
    release_id: string;
    status: "running" | "completed" | "failed";
    summary: {
      checkpoint_count: number;
      total_crashes: number;
      avg_crash_rate_per_1k: number;
      avg_api_success_rate: number;
      avg_latency_p95_ms: number;
    };
  };
  delta: {
    total_crashes: number;
    avg_crash_rate_per_1k: number;
    avg_api_success_rate: number;
    avg_latency_p95_ms: number;
  };
  conclusion: "improved" | "regressed" | "no_change";
  compared_at: string;
};

export type StabilityReportExportResponse = {
  filename: string;
  content: string;
  compared_at: string;
};

export type StabilityAlertResponse = {
  alert_id: string;
  run_id: string;
  release_id: string;
  checkpoint_id: string;
  version: number;
  at_hour: number;
  type: "crash_rate_per_1k" | "api_success_rate" | "latency_p95_ms";
  level: "yellow" | "red";
  status: "open" | "acknowledged" | "resolved";
  threshold: number;
  actual: number;
  reason: string;
  triggered_at: string;
  updated_at: string;
  handled_at?: string;
  handled_by_user_id?: string;
  handling_action?: "acknowledge" | "resolve";
  handling_note?: string;
};

export type StabilityAlertListResponse = {
  total: number;
  page: number;
  page_size: number;
  thresholds: {
    crash_rate_per_1k: {
      yellow: number;
      red: number;
    };
    api_success_rate: {
      yellow: number;
      red: number;
    };
    latency_p95_ms: {
      yellow: number;
      red: number;
    };
  };
  items: StabilityAlertResponse[];
};

export type SystemUserRolesResponse = {
  user_id: string;
  roles: Array<"learner" | "qa" | "ops" | "admin">;
  updated_at: string;
};

export type SystemRoleAuditListResponse = {
  total: number;
  page: number;
  page_size: number;
  items: Array<{
    audit_id: string;
    operator_user_id?: string;
    target_user_id?: string;
    roles: Array<"learner" | "qa" | "ops" | "admin">;
    created_at: string;
  }>;
};

export type AdminUsersResponse = {
  total: number;
  page: number;
  page_size: number;
  items: Array<{
    user_id: string;
    email?: string;
    phone?: string;
    status: "active" | "frozen" | "pending_deletion" | "deleted";
    frozen_at?: string;
    unfrozen_at?: string;
    created_at: string;
    updated_at: string;
  }>;
};

export type AdminUserFreezeResponse = {
  user_id: string;
  status: "active" | "frozen" | "pending_deletion" | "deleted";
  frozen_at?: string;
  unfrozen_at?: string;
  revoked_sessions?: number;
  updated_at: string;
};

export type AdminContentItemsResponse = {
  total: number;
  page: number;
  page_size: number;
  items: Array<{
    item_id: string;
    title: string;
    skill: "listening" | "speaking" | "reading" | "writing";
    status: "draft" | "published" | "unpublished";
    review_status?: "pending" | "approved" | "rejected";
    source_type?: "manual" | "batch_import";
    import_batch_id?: string;
    version: number;
    last_published_at?: string;
    last_rollback_at?: string;
    last_operator_admin_user_id?: string;
    updated_at: string;
  }>;
};

export type AdminContentUpdateResponse = {
  item_id: string;
  status: "draft" | "published" | "unpublished";
  review_status?: "pending" | "approved" | "rejected";
  version: number;
  last_published_at?: string;
  updated_at: string;
};

export type AdminContentImportBatchResponse = {
  batch_id: string;
  template_version: string;
  atomic: boolean;
  status: "completed" | "rolled_back" | "partial_rolled_back";
  total_count: number;
  imported_count: number;
  failed_count: number;
  imported_items: Array<{
    item_id: string;
    title: string;
    skill: "listening" | "speaking" | "reading" | "writing";
    status: "draft" | "published" | "unpublished";
    review_status: "pending" | "approved" | "rejected";
    version: number;
  }>;
  failed_items: Array<{
    index: number;
    title?: string;
    error_code: string;
    error_message: string;
  }>;
  rollback_item_ids: string[];
  created_at: string;
};

export type AdminContentImportRollbackResponse = {
  batch_id: string;
  status: "completed" | "rolled_back" | "partial_rolled_back";
  rolled_back_item_ids: string[];
  rollback_count: number;
  updated_at: string;
};

export type AdminReportExportResponse = {
  export_id: string;
  report_type: "operation" | "business";
  row_count: number;
  masked_fields: string[];
  filename: string;
  generated_at: string;
  download_url: string;
};

export type AdminReportDownloadResponse = {
  export_id: string;
  report_type: "operation" | "business";
  filename: string;
  content: string;
  row_count: number;
  download_count: number;
  last_downloaded_at?: string;
};

export type AdminAuditLogsResponse = {
  total: number;
  page: number;
  page_size: number;
  items: Array<{
    id: string;
    type: string;
    user_id?: string;
    metadata: Record<string, unknown>;
    created_at: string;
  }>;
};

export type AdminReviewOperationType = "user_freeze" | "entitlement_adjust" | "content_publish";

export type AdminReviewStatus = "pending" | "approved" | "rejected";

export type AdminReviewRequestResponse = {
  review_id: string;
  operation_type: AdminReviewOperationType;
  status: AdminReviewStatus;
  requester_admin_user_id: string;
  requester_roles: Array<"super_admin" | "finance" | "ops">;
  payload: Record<string, unknown>;
  requested_at: string;
  reviewed_at?: string;
  reviewer_admin_user_id?: string;
  review_comment?: string;
  execution?: {
    success: boolean;
    executed_at?: string;
    result?: Record<string, unknown>;
    error_code?: string;
    error_message?: string;
  };
};

export type AdminReviewListResponse = {
  total: number;
  page: number;
  page_size: number;
  items: AdminReviewRequestResponse[];
};
