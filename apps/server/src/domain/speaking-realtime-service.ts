import { randomUUID } from "node:crypto";
import { appendAudit } from "./audit.js";
import { addSeconds, nowIso } from "./time.js";
import { InMemoryStore } from "./store.js";
import type { OnboardingService } from "./onboarding-service.js";
import type {
  SpeakingPartNo,
  SpeakingPronunciationFeedback,
  SpeakingPronunciationPhonemeIssue,
  SpeakingPronunciationReplaySegment,
  SpeakingScenarioType,
  SpeakingPronunciationSeverity,
  SpeakingPronunciationTask,
  SpeakingPronunciationTaskStatus,
  SpeakingTaskType,
  SpeakingPronunciationWordIssue,
  SpeakingScoreSnapshot,
  SpeakingSession,
  SpeakingSessionEventType
} from "./types.js";

const RESUME_WINDOW_SECONDS = 5 * 60;
const HEARTBEAT_TIMEOUT_SECONDS = 60;

const DEFAULT_TOPIC = "Describe a recent IELTS preparation experience that changed your learning habit.";
const MAX_PRONUNCIATION_ITEMS = 8;
const TOKEN_REGEX = /[a-z]+(?:'[a-z]+)?/gi;
const REFERENCE_AUDIO_BASE = "https://cdn.mock.ielts.app/reference";
const USER_AUDIO_BASE = "https://cdn.mock.ielts.app/user";

const ROLE_PLAY_SCENARIOS: Record<
  SpeakingScenarioType,
  {
    title: string;
    openingPrompt: string;
    npcRole: string;
    dynamicFollowUps: {
      start: string;
      askDetail: string;
      askReason: string;
      challenge: string;
      close: string;
    };
  }
> = {
  campus_service: {
    title: "校园服务咨询",
    openingPrompt: "You are asking a campus service desk to solve a schedule conflict for your IELTS prep class.",
    npcRole: "campus service staff",
    dynamicFollowUps: {
      start: "请先说明你的课程冲突和你希望的解决方案。",
      askDetail: "你可以补充具体时间和课程名称吗？",
      askReason: "为什么这个安排对你的雅思备考很关键？",
      challenge: "如果服务台只能提供一个备选时段，你会怎么取舍？",
      close: "请用一句话确认最终安排并表达感谢。"
    }
  },
  travel_support: {
    title: "出行问题处理",
    openingPrompt: "You are speaking with travel support to rebook a delayed trip before your IELTS exam date.",
    npcRole: "travel support agent",
    dynamicFollowUps: {
      start: "请先描述你的行程问题和目标到达时间。",
      askDetail: "请补充航班或车次的关键信息。",
      askReason: "为什么这个时间节点会影响你的考试准备？",
      challenge: "若只能改签到转机方案，你会如何评估风险？",
      close: "请总结你最终接受的方案和下一步行动。"
    }
  },
  job_interview: {
    title: "实习面试沟通",
    openingPrompt: "You are in a mock internship interview and need to explain your English communication strengths.",
    npcRole: "interviewer",
    dynamicFollowUps: {
      start: "请先做一个与英语学习相关的自我介绍。",
      askDetail: "请给一个具体案例说明你的沟通能力。",
      askReason: "你认为这个经历如何证明你适合该岗位？",
      challenge: "如果面试官质疑你的经验深度，你如何回应？",
      close: "请用一句话总结你的核心竞争力。"
    }
  },
  academic_tutor: {
    title: "学术导师讨论",
    openingPrompt: "You are discussing with an academic tutor how to improve weak speaking bands in two weeks.",
    npcRole: "academic tutor",
    dynamicFollowUps: {
      start: "请先说明你当前的薄弱项和目标分数。",
      askDetail: "请细化你计划中的每日训练安排。",
      askReason: "为什么你选择这些练习方式？",
      challenge: "若执行两天后效果不明显，你会怎么调整？",
      close: "请确认你接下来两周的执行承诺。"
    }
  },
  community_event: {
    title: "社区活动协调",
    openingPrompt: "You are coordinating a community event and must negotiate roles and timelines in English.",
    npcRole: "event coordinator",
    dynamicFollowUps: {
      start: "请先概述活动目标与分工需求。",
      askDetail: "请补充关键时间节点和负责人。",
      askReason: "为什么这个分工方式最可行？",
      challenge: "若有人无法按时完成任务，你会如何补位？",
      close: "请用一句话确认最终分工。"
    }
  }
};

const clamp = (value: number, min: number, max: number): number => Math.max(min, Math.min(max, value));

const wordCount = (text: string): number => text.trim().split(/\s+/).filter(Boolean).length;

const average = (items: number[]): number => {
  if (items.length === 0) {
    return 0;
  }
  return Number((items.reduce((sum, item) => sum + item, 0) / items.length).toFixed(2));
};

const roundedDelta = (value: number): number => Number(value.toFixed(2));

const slugifyPhoneme = (value: string): string =>
  value
    .replace(/\//g, "")
    .replace(/[^a-z0-9]+/gi, "-")
    .replace(/^-+|-+$/g, "")
    .toLowerCase();

const severityRank: Record<SpeakingPronunciationSeverity, number> = {
  high: 3,
  medium: 2,
  low: 1
};

const severityFromScore = (score: number): SpeakingPronunciationSeverity => {
  if (score >= 4) {
    return "high";
  }
  if (score >= 2.5) {
    return "medium";
  }
  return "low";
};

const pronunciationPatterns: Array<{
  phoneme: string;
  issueTag: string;
  detector: RegExp;
  weight: number;
  suggestion: string;
}> = [
  {
    phoneme: "/θ/",
    issueTag: "th_sound_substitution",
    detector: /th/,
    weight: 2.8,
    suggestion: "舌尖轻触上齿，保持气流摩擦发 /θ/，避免直接读成 /s/ 或 /t/。"
  },
  {
    phoneme: "/r/",
    issueTag: "r_coloring_inconsistent",
    detector: /r/,
    weight: 2.4,
    suggestion: "卷舌发 /r/，舌尖不要触碰上齿龈，保持元音后部共鸣。"
  },
  {
    phoneme: "/l/",
    issueTag: "l_dark_clear_confusion",
    detector: /l/,
    weight: 1.9,
    suggestion: "词首用清晰 /l/，词尾用暗 /l/，可通过 minimal pairs 训练区分。"
  },
  {
    phoneme: "/v/",
    issueTag: "v_w_confusion",
    detector: /v/,
    weight: 2.2,
    suggestion: "上齿轻触下唇发 /v/，确保有摩擦音，避免读成 /w/。"
  },
  {
    phoneme: "/w/",
    issueTag: "w_rounding_weak",
    detector: /w/,
    weight: 1.8,
    suggestion: "双唇圆展后快速过渡到元音，保持 /w/ 的唇形动作。"
  },
  {
    phoneme: "/ŋ/",
    issueTag: "ng_ending_dropped",
    detector: /ng$/,
    weight: 2.3,
    suggestion: "词尾 -ng 保持鼻腔共鸣，不要额外加 /g/ 音。"
  }
];

export class SpeakingRealtimeService {
  constructor(
    private readonly store: InMemoryStore,
    private readonly onboardingService: Pick<OnboardingService, "applyAdaptiveAdjustment">
  ) {}

  createSession(
    userId: string,
    options?: {
      sourceSessionId?: string;
      topic?: string;
      taskType?: SpeakingTaskType;
      scenarioType?: SpeakingScenarioType;
    }
  ): SpeakingSession {
    const now = nowIso();
    const taskType = options?.taskType ?? "core_training";
    const scenarioType = taskType === "role_play" ? options?.scenarioType ?? "campus_service" : undefined;
    const selectedScenario = scenarioType ? ROLE_PLAY_SCENARIOS[scenarioType] : undefined;
    const sessionTopic = options?.topic?.trim() || selectedScenario?.openingPrompt || DEFAULT_TOPIC;
    const session: SpeakingSession = {
      id: randomUUID(),
      userId,
      resumeToken: randomUUID().replaceAll("-", ""),
      status: "created",
      taskType,
      scenarioType,
      currentPart: 1,
      topic: sessionTopic,
      partStates: [
        {
          partNo: 1,
          turns: 0
        },
        {
          partNo: 2,
          turns: 0
        },
        {
          partNo: 3,
          turns: 0
        }
      ],
      scoreHistory: [],
      resumeUntil: addSeconds(now, RESUME_WINDOW_SECONDS),
      conversationTurns: 0,
      sourceSessionId: options?.sourceSessionId,
      createdAt: now,
      updatedAt: now,
      events: [],
      pronunciationTasks: []
    };

    this.store.speakingSessionsById.set(session.id, session);

    appendAudit(this.store, "speaking_session_created", {
      userId,
      metadata: {
        sessionId: session.id,
        resumeUntil: session.resumeUntil,
        sourceSessionId: session.sourceSessionId,
        topic: session.topic,
        taskType: session.taskType,
        scenarioType: session.scenarioType
      }
    });

    return session;
  }

  createRetrySession(userId: string, sourceSessionId: string): SpeakingSession {
    const source = this.requireSession(userId, sourceSessionId);
    if (source.status !== "ended") {
      throw new Error("SOURCE_SESSION_NOT_ENDED");
    }

    const retry = this.createSession(userId, {
      sourceSessionId: source.id,
      topic: source.topic,
      taskType: source.taskType,
      scenarioType: source.scenarioType
    });

    appendAudit(this.store, "speaking_retry_created", {
      userId,
      metadata: {
        sourceSessionId: source.id,
        retrySessionId: retry.id
      }
    });

    return retry;
  }

  getSessionOwnerByResume(sessionId: string, resumeToken: string): string {
    const session = this.store.speakingSessionsById.get(sessionId);
    if (!session || session.resumeToken !== resumeToken) {
      throw new Error("INVALID_RESUME_TOKEN");
    }
    return session.userId;
  }

  connectSession(input: { userId: string; sessionId: string; resumeToken: string }): { session: SpeakingSession; resumed: boolean } {
    const session = this.requireSession(input.userId, input.sessionId);
    if (session.resumeToken !== input.resumeToken) {
      throw new Error("INVALID_RESUME_TOKEN");
    }
    if (session.status === "ended") {
      throw new Error("SESSION_ENDED");
    }

    if (session.status === "disconnected" && Date.now() > new Date(session.resumeUntil).getTime()) {
      throw new Error("RESUME_WINDOW_EXPIRED");
    }

    const resumed = session.status === "disconnected";
    const now = nowIso();
    session.status = "connected";
    session.connectedAt = session.connectedAt ?? now;
    session.disconnectedAt = undefined;
    session.lastHeartbeatAt = now;
    session.resumeUntil = addSeconds(now, RESUME_WINDOW_SECONDS);
    session.updatedAt = now;

    this.pushEvent(session, resumed ? "session_resume" : "session_start", {
      resumed,
      current_part: session.currentPart,
      topic: session.topic,
      task_type: session.taskType,
      scenario_type: session.scenarioType
    });

    appendAudit(this.store, resumed ? "speaking_session_resumed" : "speaking_session_connected", {
      userId: input.userId,
      metadata: {
        sessionId: session.id,
        currentPart: session.currentPart
      }
    });
    this.store.speakingSessionsById.set(session.id, session);

    return {
      session,
      resumed
    };
  }

  switchPart(input: { userId: string; sessionId: string; partNo: SpeakingPartNo }): SpeakingSession {
    const session = this.requireSession(input.userId, input.sessionId);
    if (session.status === "ended") {
      throw new Error("SESSION_ENDED");
    }

    session.currentPart = input.partNo;
    session.updatedAt = nowIso();
    this.pushEvent(session, "part_switch", {
      part_no: input.partNo
    });

    appendAudit(this.store, "speaking_part_switched", {
      userId: input.userId,
      metadata: {
        sessionId: session.id,
        partNo: input.partNo
      }
    });
    this.store.speakingSessionsById.set(session.id, session);

    return session;
  }

  recordTranscript(input: {
    userId: string;
    sessionId: string;
    text: string;
    partNo?: SpeakingPartNo;
  }): {
    turnNo: number;
    partNo: SpeakingPartNo;
    coachQuestion: string;
    scoreUpdate: {
      fluency: number;
      lexical: number;
      grammar: number;
      pronunciation: number;
    };
    pronunciationFeedback: SpeakingPronunciationFeedback;
    suggestions: string[];
    latencyMs: number;
    fallbackTriggered: boolean;
  } {
    const session = this.requireSession(input.userId, input.sessionId);
    if (session.status !== "connected") {
      throw new Error("SESSION_NOT_CONNECTED");
    }

    const transcript = input.text.trim();
    if (!transcript) {
      throw new Error("EMPTY_TRANSCRIPT");
    }

    if (input.partNo && input.partNo !== session.currentPart) {
      this.switchPart({
        userId: input.userId,
        sessionId: input.sessionId,
        partNo: input.partNo
      });
    }

    const currentPart = session.currentPart;
    const partState = this.getPartState(session, currentPart);
    const startedAt = Date.now();
    let fallbackTriggered = false;

    session.conversationTurns += 1;
    partState.turns += 1;
    partState.lastTranscript = transcript;
    session.updatedAt = nowIso();

    this.pushEvent(session, "partial_transcript", {
      text: transcript,
      turnNo: session.conversationTurns,
      part_no: currentPart
    });

    let scoreUpdate: {
      fluency: number;
      lexical: number;
      grammar: number;
      pronunciation: number;
    };
    try {
      if (transcript.toLowerCase().includes("trigger_fallback")) {
        throw new Error("PRIMARY_SCORING_FAILED");
      }
      scoreUpdate = this.estimateScores(transcript, session.conversationTurns, currentPart);
    } catch {
      fallbackTriggered = true;
      scoreUpdate = this.fallbackScores(transcript, session.conversationTurns, currentPart);
    }

    const coachQuestion =
      session.taskType === "role_play"
        ? this.generateRolePlayFollowUp({
            session,
            transcript,
            turnsInPart: partState.turns
          })
        : this.generateFollowUpQuestion({
            partNo: currentPart,
            transcript,
            previousTranscript: partState.lastTranscript,
            turnsInPart: partState.turns
          });
    partState.lastCoachQuestion = coachQuestion;

    const suggestions = this.generateSuggestions(currentPart, transcript);
    const pronunciationFeedback = this.buildPronunciationFeedback({
      session,
      transcript,
      turnNo: session.conversationTurns,
      partNo: currentPart
    });
    const latencyMs = Date.now() - startedAt;
    const snapshot: SpeakingScoreSnapshot = {
      turnNo: session.conversationTurns,
      partNo: currentPart,
      fluency: scoreUpdate.fluency,
      lexical: scoreUpdate.lexical,
      grammar: scoreUpdate.grammar,
      pronunciation: scoreUpdate.pronunciation,
      suggestions,
      pronunciationFeedback,
      latencyMs,
      fallbackTriggered,
      createdAt: nowIso()
    };
    session.scoreHistory.push(snapshot);

    this.pushEvent(session, "coach_question", {
      text: coachQuestion,
      turnNo: session.conversationTurns,
      part_no: currentPart
    });
    this.pushEvent(session, "score_update", {
      ...scoreUpdate,
      turnNo: session.conversationTurns,
      part_no: currentPart,
      suggestions,
      latency_ms: latencyMs,
      fallback_triggered: fallbackTriggered
    });

    appendAudit(this.store, "speaking_transcript_received", {
      userId: input.userId,
      metadata: {
        sessionId: session.id,
        turnNo: session.conversationTurns,
        partNo: currentPart,
        latencyMs,
        fallbackTriggered
      }
    });
    this.store.speakingSessionsById.set(session.id, session);

    return {
      turnNo: session.conversationTurns,
      partNo: currentPart,
      coachQuestion,
      scoreUpdate,
      pronunciationFeedback,
      suggestions,
      latencyMs,
      fallbackTriggered
    };
  }

  heartbeat(input: { userId: string; sessionId: string }): SpeakingSession {
    const session = this.requireSession(input.userId, input.sessionId);
    if (session.status !== "connected") {
      throw new Error("SESSION_NOT_CONNECTED");
    }

    const now = nowIso();
    session.lastHeartbeatAt = now;
    session.resumeUntil = addSeconds(now, RESUME_WINDOW_SECONDS);
    session.updatedAt = now;
    this.pushEvent(session, "heartbeat", {});
    this.store.speakingSessionsById.set(session.id, session);
    return session;
  }

  disconnectSession(input: { userId: string; sessionId: string; reason: string; timeout?: boolean }): SpeakingSession {
    const session = this.requireSession(input.userId, input.sessionId);
    if (session.status === "ended") {
      return session;
    }

    const now = nowIso();
    session.status = "disconnected";
    session.disconnectedAt = now;
    session.resumeUntil = addSeconds(now, RESUME_WINDOW_SECONDS);
    session.updatedAt = now;

    this.pushEvent(session, input.timeout ? "session_timeout" : "session_disconnect", {
      reason: input.reason
    });

    appendAudit(this.store, "speaking_session_disconnected", {
      userId: input.userId,
      metadata: {
        sessionId: session.id,
        reason: input.reason,
        timeout: Boolean(input.timeout)
      }
    });
    this.store.speakingSessionsById.set(session.id, session);

    return session;
  }

  endSession(input: { userId: string; sessionId: string }): SpeakingSession {
    const session = this.requireSession(input.userId, input.sessionId);
    if (session.status === "ended") {
      return session;
    }

    const now = nowIso();
    session.status = "ended";
    session.endedAt = now;
    session.updatedAt = now;
    const summary = this.getSummaryFromSession(session);

    this.pushEvent(session, "session_end", {
      turns: session.conversationTurns,
      summary
    });

    appendAudit(this.store, "speaking_session_ended", {
      userId: input.userId,
      metadata: {
        sessionId: session.id,
        turns: session.conversationTurns
      }
    });
    this.store.speakingSessionsById.set(session.id, session);

    this.onboardingService.applyAdaptiveAdjustment({
      userId: input.userId,
      sourceType: "speaking_session",
      sourceId: session.id,
      skill: "speaking",
      score: (summary.fluency + summary.lexical + summary.grammar + summary.pronunciation) / 36
    });

    return session;
  }

  getSession(userId: string, sessionId: string): SpeakingSession {
    return this.requireSession(userId, sessionId);
  }

  getSessionEvents(userId: string, sessionId: string): SpeakingSession["events"] {
    const session = this.requireSession(userId, sessionId);
    return session.events;
  }

  getSessionSummary(userId: string, sessionId: string): {
    fluency: number;
    lexical: number;
    grammar: number;
    pronunciation: number;
    turns: number;
  } {
    const session = this.requireSession(userId, sessionId);
    return this.getSummaryFromSession(session);
  }

  getRolePlayScenarios(): Array<{
    scenarioType: SpeakingScenarioType;
    title: string;
    openingPrompt: string;
    npcRole: string;
  }> {
    return (Object.keys(ROLE_PLAY_SCENARIOS) as SpeakingScenarioType[]).map((scenarioType) => ({
      scenarioType,
      title: ROLE_PLAY_SCENARIOS[scenarioType].title,
      openingPrompt: ROLE_PLAY_SCENARIOS[scenarioType].openingPrompt,
      npcRole: ROLE_PLAY_SCENARIOS[scenarioType].npcRole
    }));
  }

  getPronunciationFeedback(userId: string, sessionId: string): {
    turns: Array<{
      turnNo: number;
      partNo: SpeakingPartNo;
      wordIssues: SpeakingPronunciationWordIssue[];
      phonemeIssues: SpeakingPronunciationPhonemeIssue[];
      replaySegments: SpeakingPronunciationReplaySegment[];
    }>;
    hotspotWords: Array<{
      word: string;
      count: number;
      maxSeverity: SpeakingPronunciationSeverity;
    }>;
    hotspotPhonemes: SpeakingPronunciationPhonemeIssue[];
    tasks: SpeakingPronunciationTask[];
  } {
    const session = this.requireSession(userId, sessionId);
    const turns = session.scoreHistory.map((snapshot) => ({
      turnNo: snapshot.turnNo,
      partNo: snapshot.partNo,
      wordIssues: snapshot.pronunciationFeedback.wordIssues,
      phonemeIssues: snapshot.pronunciationFeedback.phonemeIssues,
      replaySegments: snapshot.pronunciationFeedback.replaySegments
    }));

    const hotspotWordCounter = new Map<string, { count: number; severity: SpeakingPronunciationSeverity }>();
    const phonemeCounter = new Map<
      string,
      {
        issueTag: string;
        suggestion: string;
        count: number;
        severity: SpeakingPronunciationSeverity;
        exampleWords: Set<string>;
      }
    >();

    for (const turn of turns) {
      for (const issue of turn.wordIssues) {
        const existing = hotspotWordCounter.get(issue.word);
        if (!existing) {
          hotspotWordCounter.set(issue.word, {
            count: 1,
            severity: issue.severity
          });
          continue;
        }
        existing.count += 1;
        if (severityRank[issue.severity] > severityRank[existing.severity]) {
          existing.severity = issue.severity;
        }
      }

      for (const issue of turn.phonemeIssues) {
        const existing = phonemeCounter.get(issue.phoneme);
        if (!existing) {
          phonemeCounter.set(issue.phoneme, {
            issueTag: issue.issueTag,
            suggestion: issue.suggestion,
            count: issue.count,
            severity: issue.severity,
            exampleWords: new Set(issue.exampleWords)
          });
          continue;
        }
        existing.count += issue.count;
        if (severityRank[issue.severity] > severityRank[existing.severity]) {
          existing.severity = issue.severity;
        }
        for (const word of issue.exampleWords) {
          existing.exampleWords.add(word);
        }
      }
    }

    const hotspotWords = Array.from(hotspotWordCounter.entries())
      .map(([word, value]) => ({
        word,
        count: value.count,
        maxSeverity: value.severity
      }))
      .sort((a, b) => b.count - a.count || severityRank[b.maxSeverity] - severityRank[a.maxSeverity] || a.word.localeCompare(b.word))
      .slice(0, MAX_PRONUNCIATION_ITEMS);

    const hotspotPhonemes = Array.from(phonemeCounter.entries())
      .map(([phoneme, value]) => ({
        phoneme,
        issueTag: value.issueTag,
        suggestion: value.suggestion,
        severity: value.severity,
        count: value.count,
        exampleWords: Array.from(value.exampleWords).slice(0, 5)
      }))
      .sort((a, b) => b.count - a.count || severityRank[b.severity] - severityRank[a.severity] || a.phoneme.localeCompare(b.phoneme))
      .slice(0, MAX_PRONUNCIATION_ITEMS);

    appendAudit(this.store, "speaking_pronunciation_feedback_queried", {
      userId,
      metadata: {
        sessionId: session.id,
        turns: turns.length,
        taskCount: session.pronunciationTasks.length
      }
    });

    return {
      turns,
      hotspotWords,
      hotspotPhonemes,
      tasks: session.pronunciationTasks
    };
  }

  trackPronunciationTask(input: {
    userId: string;
    sessionId: string;
    taskId: string;
    status: SpeakingPronunciationTaskStatus;
  }): SpeakingPronunciationTask {
    const session = this.requireSession(input.userId, input.sessionId);
    const task = session.pronunciationTasks.find((item) => item.taskId === input.taskId);
    if (!task) {
      throw new Error("TASK_NOT_FOUND");
    }

    task.status = input.status;
    session.updatedAt = nowIso();

    appendAudit(this.store, "speaking_pronunciation_task_tracked", {
      userId: input.userId,
      metadata: {
        sessionId: session.id,
        taskId: task.taskId,
        status: task.status
      }
    });
    this.store.speakingSessionsById.set(session.id, session);

    return task;
  }

  getComparison(userId: string, retrySessionId: string): {
    sourceSessionId: string;
    retrySessionId: string;
    sourceScores: {
      fluency: number;
      lexical: number;
      grammar: number;
      pronunciation: number;
    };
    retryScores: {
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
    nextActions: string[];
  } {
    const retry = this.requireSession(userId, retrySessionId);
    if (!retry.sourceSessionId) {
      throw new Error("NOT_RETRY_SESSION");
    }

    const source = this.requireSession(userId, retry.sourceSessionId);
    const sourceSummary = this.getSummaryFromSession(source);
    const retrySummary = this.getSummaryFromSession(retry);

    const delta = {
      fluency: roundedDelta(retrySummary.fluency - sourceSummary.fluency),
      lexical: roundedDelta(retrySummary.lexical - sourceSummary.lexical),
      grammar: roundedDelta(retrySummary.grammar - sourceSummary.grammar),
      pronunciation: roundedDelta(retrySummary.pronunciation - sourceSummary.pronunciation)
    };

    const weakest = Object.entries(delta).sort((a, b) => a[1] - b[1])[0]?.[0] ?? "fluency";
    const nextActions = [
      `优先强化 ${weakest} 维度，继续同题再答并记录 2 个新表达。`,
      "保持 Part2 的细节展开，确保每次回答包含因果和结果。",
      "每轮结束后复述高频错误并做 60 秒纠音。"
    ];

    appendAudit(this.store, "speaking_comparison_generated", {
      userId,
      metadata: {
        sourceSessionId: source.id,
        retrySessionId: retry.id,
        delta
      }
    });

    return {
      sourceSessionId: source.id,
      retrySessionId: retry.id,
      sourceScores: {
        fluency: sourceSummary.fluency,
        lexical: sourceSummary.lexical,
        grammar: sourceSummary.grammar,
        pronunciation: sourceSummary.pronunciation
      },
      retryScores: {
        fluency: retrySummary.fluency,
        lexical: retrySummary.lexical,
        grammar: retrySummary.grammar,
        pronunciation: retrySummary.pronunciation
      },
      delta,
      nextActions
    };
  }

  handleHeartbeatTimeout(sessionId: string): { timedOut: boolean; userId?: string } {
    const session = this.store.speakingSessionsById.get(sessionId);
    if (!session || session.status !== "connected" || !session.lastHeartbeatAt) {
      return {
        timedOut: false
      };
    }

    const heartbeatAt = new Date(session.lastHeartbeatAt).getTime();
    if (Date.now() - heartbeatAt <= HEARTBEAT_TIMEOUT_SECONDS * 1000) {
      return {
        timedOut: false
      };
    }

    this.disconnectSession({
      userId: session.userId,
      sessionId: session.id,
      reason: "heartbeat_timeout",
      timeout: true
    });

    return {
      timedOut: true,
      userId: session.userId
    };
  }

  private requireSession(userId: string, sessionId: string): SpeakingSession {
    const session = this.store.speakingSessionsById.get(sessionId);
    if (!session || session.userId !== userId) {
      throw new Error("SESSION_NOT_FOUND");
    }
    return session;
  }

  private getPartState(session: SpeakingSession, partNo: SpeakingPartNo): SpeakingSession["partStates"][number] {
    const partState = session.partStates.find((item) => item.partNo === partNo);
    if (partState) {
      return partState;
    }
    const created = {
      partNo,
      turns: 0
    };
    session.partStates.push(created);
    return created;
  }

  private pushEvent(
    session: SpeakingSession,
    type: SpeakingSessionEventType,
    payload: Record<string, unknown>
  ): void {
    session.events.push({
      id: randomUUID(),
      type,
      payload,
      createdAt: nowIso()
    });
  }

  private estimateScores(
    transcript: string,
    turnNo: number,
    partNo: SpeakingPartNo
  ): {
    fluency: number;
    lexical: number;
    grammar: number;
    pronunciation: number;
  } {
    const words = wordCount(transcript);
    const base = clamp(4.2 + words / 12, 4.5, 8.8);
    const turnBoost = clamp(turnNo * 0.08, 0, 0.6);
    const partBoost = partNo === 1 ? 0 : partNo === 2 ? 0.2 : 0.35;
    return {
      fluency: Number(clamp(base + turnBoost + partBoost, 0, 9).toFixed(1)),
      lexical: Number(clamp(base - 0.1 + turnBoost + partBoost, 0, 9).toFixed(1)),
      grammar: Number(clamp(base - 0.2 + turnBoost + partBoost, 0, 9).toFixed(1)),
      pronunciation: Number(clamp(base - 0.25 + turnBoost + partBoost, 0, 9).toFixed(1))
    };
  }

  private fallbackScores(
    transcript: string,
    turnNo: number,
    partNo: SpeakingPartNo
  ): {
    fluency: number;
    lexical: number;
    grammar: number;
    pronunciation: number;
  } {
    const words = wordCount(transcript);
    const base = clamp(5 + words / 25 + turnNo * 0.05 + partNo * 0.05, 5, 7.5);
    return {
      fluency: Number(base.toFixed(1)),
      lexical: Number((base - 0.1).toFixed(1)),
      grammar: Number((base - 0.2).toFixed(1)),
      pronunciation: Number((base - 0.25).toFixed(1))
    };
  }

  private generateSuggestions(partNo: SpeakingPartNo, transcript: string): string[] {
    const suggestions: string[] = [];
    if (transcript.length < 50) {
      suggestions.push("回答再延展 1-2 句，优先补充原因和结果。");
    }
    if (!/\b(because|therefore|so)\b/i.test(transcript)) {
      suggestions.push("加入因果连接词（because/therefore）提升逻辑连贯。");
    }
    if (!/\bfor example|for instance|such as\b/i.test(transcript)) {
      suggestions.push("至少加入一个具体例子，增强观点说服力。");
    }
    if (partNo === 3) {
      suggestions.push("在 Part 3 中补充对比观点并给出结论句。");
    } else if (partNo === 2) {
      suggestions.push("Part 2 保持时间线清晰，按背景-过程-结果叙述。");
    } else {
      suggestions.push("Part 1 回答保持自然语速，并补充个人细节。");
    }

    return Array.from(new Set(suggestions)).slice(0, 3);
  }

  private generateFollowUpQuestion(input: {
    partNo: SpeakingPartNo;
    transcript: string;
    previousTranscript?: string;
    turnsInPart: number;
  }): string {
    const lowered = input.transcript.toLowerCase();
    if (input.partNo === 1) {
      if (input.turnsInPart <= 1) {
        return "你可以再补充一个与你日常学习相关的细节吗？";
      }
      return "这个习惯对你备考最直接的帮助是什么？";
    }
    if (input.partNo === 2) {
      if (lowered.includes("because")) {
        return "你提到了原因，请继续说明这个经历的最终结果。";
      }
      return "请按时间顺序补充事情的发展过程和关键节点。";
    }

    if (input.previousTranscript && input.previousTranscript.length > 0) {
      return "基于你刚才的观点，请比较一种相反看法并说明你为什么不同意。";
    }
    return "请从社会层面讨论这个话题，并给出可执行建议。";
  }

  private generateRolePlayFollowUp(input: {
    session: SpeakingSession;
    transcript: string;
    turnsInPart: number;
  }): string {
    const scenarioType = input.session.scenarioType;
    const scenario = scenarioType ? ROLE_PLAY_SCENARIOS[scenarioType] : undefined;
    if (!scenario) {
      return "请继续补充你的方案，并说明你将如何推进下一步。";
    }

    const lowered = input.transcript.toLowerCase();
    if (input.turnsInPart <= 1) {
      return scenario.dynamicFollowUps.start;
    }
    if (input.turnsInPart >= 4) {
      return scenario.dynamicFollowUps.close;
    }
    if (/\b(because|therefore|so|as a result)\b/.test(lowered)) {
      return scenario.dynamicFollowUps.challenge;
    }
    if (/\b(when|where|who|which|time|date|schedule|deadline)\b/.test(lowered)) {
      return scenario.dynamicFollowUps.askReason;
    }
    return scenario.dynamicFollowUps.askDetail;
  }

  private buildPronunciationFeedback(input: {
    session: SpeakingSession;
    transcript: string;
    turnNo: number;
    partNo: SpeakingPartNo;
  }): SpeakingPronunciationFeedback {
    const tokens = (input.transcript.toLowerCase().match(TOKEN_REGEX) ?? []).slice(0, 80);
    const normalizedTokens = tokens.length > 0 ? tokens : ["utterance"];
    const wordIssues: SpeakingPronunciationWordIssue[] = [];

    for (let index = 0; index < normalizedTokens.length; index += 1) {
      const word = normalizedTokens[index];
      let matched: (typeof pronunciationPatterns)[number] | undefined;
      for (const pattern of pronunciationPatterns) {
        if (!pattern.detector.test(word)) {
          continue;
        }
        if (!matched || pattern.weight > matched.weight) {
          matched = pattern;
        }
      }
      if (!matched) {
        continue;
      }

      const severity = severityFromScore(matched.weight + (word.length >= 8 ? 0.5 : 0) + (input.partNo === 3 ? 0.2 : 0));
      const segmentId = `turn-${input.turnNo}-seg-${wordIssues.length + 1}`;
      wordIssues.push({
        word,
        position: index + 1,
        phoneme: matched.phoneme,
        severity,
        issueTag: matched.issueTag,
        suggestion: matched.suggestion,
        replaySegmentId: segmentId
      });
    }

    if (wordIssues.length === 0) {
      const fallbackWord = normalizedTokens.sort((a, b) => b.length - a.length)[0] ?? "utterance";
      wordIssues.push({
        word: fallbackWord,
        position: 1,
        phoneme: "/ə/",
        severity: "medium",
        issueTag: "unstable_word_stress",
        suggestion: "先放慢语速并标注重音音节，保持重读词清晰、弱读词连贯。",
        replaySegmentId: `turn-${input.turnNo}-seg-1`
      });
    }

    const replaySegments = wordIssues.slice(0, MAX_PRONUNCIATION_ITEMS).map((issue, index) => {
      const startMs = Math.max(0, (issue.position - 1) * 420);
      const endMs = startMs + 900;
      return {
        segmentId: issue.replaySegmentId,
        turnNo: input.turnNo,
        startMs,
        endMs,
        referenceText: issue.word,
        userText: issue.word,
        referenceAudioUrl: `${REFERENCE_AUDIO_BASE}/${input.session.id}/${input.turnNo}/${index + 1}.mp3`,
        userAudioUrl: `${USER_AUDIO_BASE}/${input.session.id}/${input.turnNo}/${index + 1}.mp3`
      };
    });

    const phonemeCounter = new Map<
      string,
      {
        issueTag: string;
        suggestion: string;
        count: number;
        severity: SpeakingPronunciationSeverity;
        words: Set<string>;
      }
    >();
    for (const issue of wordIssues) {
      const existing = phonemeCounter.get(issue.phoneme);
      if (!existing) {
        phonemeCounter.set(issue.phoneme, {
          issueTag: issue.issueTag,
          suggestion: issue.suggestion,
          count: 1,
          severity: issue.severity,
          words: new Set([issue.word])
        });
        continue;
      }
      existing.count += 1;
      if (severityRank[issue.severity] > severityRank[existing.severity]) {
        existing.severity = issue.severity;
      }
      existing.words.add(issue.word);
    }

    const phonemeIssues: SpeakingPronunciationPhonemeIssue[] = Array.from(phonemeCounter.entries())
      .map(([phoneme, value]) => ({
        phoneme,
        issueTag: value.issueTag,
        suggestion: value.suggestion,
        severity: value.severity,
        count: value.count,
        exampleWords: Array.from(value.words).slice(0, 5)
      }))
      .sort((a, b) => b.count - a.count || severityRank[b.severity] - severityRank[a.severity] || a.phoneme.localeCompare(b.phoneme))
      .slice(0, MAX_PRONUNCIATION_ITEMS);

    const taskRecommendations = phonemeIssues
      .slice(0, 3)
      .map((issue) => this.upsertPronunciationTask(input.session, issue, input.turnNo));
    if (taskRecommendations.length > 0) {
      input.session.updatedAt = nowIso();
      this.store.speakingSessionsById.set(input.session.id, input.session);
    }

    return {
      wordIssues,
      phonemeIssues,
      replaySegments,
      taskRecommendations
    };
  }

  private upsertPronunciationTask(
    session: SpeakingSession,
    issue: SpeakingPronunciationPhonemeIssue,
    turnNo: number
  ): SpeakingPronunciationTask {
    const taskId = `pron-${slugifyPhoneme(issue.phoneme) || "core"}`;
    const existing = session.pronunciationTasks.find((item) => item.taskId === taskId);
    if (existing) {
      if (!existing.linkedTurnNos.includes(turnNo)) {
        existing.linkedTurnNos.push(turnNo);
        existing.linkedTurnNos.sort((left, right) => left - right);
      }
      return {
        ...existing,
        linkedTurnNos: [...existing.linkedTurnNos]
      };
    }

    const created: SpeakingPronunciationTask = {
      taskId,
      title: `纠音任务 ${issue.phoneme}`,
      description: `${issue.issueTag}：${issue.suggestion}`,
      phoneme: issue.phoneme,
      status: "todo",
      linkedTurnNos: [turnNo]
    };
    session.pronunciationTasks.push(created);
    return {
      ...created,
      linkedTurnNos: [...created.linkedTurnNos]
    };
  }

  private getSummaryFromSession(session: SpeakingSession): {
    fluency: number;
    lexical: number;
    grammar: number;
    pronunciation: number;
    turns: number;
  } {
    const history = session.scoreHistory;
    return {
      fluency: average(history.map((item) => item.fluency)),
      lexical: average(history.map((item) => item.lexical)),
      grammar: average(history.map((item) => item.grammar)),
      pronunciation: average(history.map((item) => item.pronunciation)),
      turns: session.conversationTurns
    };
  }
}
