import { randomUUID } from "node:crypto";
import { appendAudit } from "./audit.js";
import { nowIso } from "./time.js";
import { InMemoryStore } from "./store.js";
import type { OnboardingService } from "./onboarding-service.js";
import type {
  PracticeDictationFeedback,
  PracticeDictationSummary,
  PracticePlaybackState,
  PracticeQuestion,
  PracticeQuestionResult,
  PracticeSession,
  PracticeSkill,
  PracticeTimingState,
  PracticeTrainingMode,
  RetryQueueItem
} from "./types.js";

const PLAYBACK_RATES = [0.75, 1, 1.25, 1.5, 2];
const DEFAULT_EXAM_LIMIT_SECONDS = 1200;
const MIN_EXAM_LIMIT_SECONDS = 300;
const MAX_EXAM_LIMIT_SECONDS = 7200;
const MAX_DICTATION_ERROR_ITEMS = 5;

const clamp = (value: number, min: number, max: number): number => Math.max(min, Math.min(max, value));

const normalizeAnswer = (value: string): string => value.trim().toLowerCase().replace(/\s+/g, " ");

const tokenizeDictation = (value: string): string[] =>
  normalizeAnswer(value)
    .replace(/[^a-z0-9'\s-]/g, " ")
    .replace(/-/g, " ")
    .split(/\s+/)
    .filter((token) => token.length > 0);

const buildDictationChunks = (tokens: string[]): string[] => {
  if (tokens.length === 0) {
    return [];
  }
  if (tokens.length === 1) {
    return [tokens[0]];
  }

  const chunks: string[] = [];
  for (let index = 0; index < tokens.length - 1; index += 1) {
    chunks.push(`${tokens[index]} ${tokens[index + 1]}`);
  }
  return chunks;
};

const diffMissingItems = (expected: string[], actual: string[]): string[] => {
  const actualCounter = new Map<string, number>();
  for (const item of actual) {
    actualCounter.set(item, (actualCounter.get(item) ?? 0) + 1);
  }

  const missing: string[] = [];
  for (const item of expected) {
    const remaining = actualCounter.get(item) ?? 0;
    if (remaining <= 0) {
      missing.push(item);
      continue;
    }
    actualCounter.set(item, remaining - 1);
  }
  return missing;
};

const diffExtraItems = (expected: string[], actual: string[]): string[] => {
  const expectedCounter = new Map<string, number>();
  for (const item of expected) {
    expectedCounter.set(item, (expectedCounter.get(item) ?? 0) + 1);
  }

  const extra: string[] = [];
  for (const item of actual) {
    const remaining = expectedCounter.get(item) ?? 0;
    if (remaining <= 0) {
      extra.push(item);
      continue;
    }
    expectedCounter.set(item, remaining - 1);
  }
  return extra;
};

const levenshteinDistance = (left: string, right: string): number => {
  if (left === right) {
    return 0;
  }
  if (left.length === 0) {
    return right.length;
  }
  if (right.length === 0) {
    return left.length;
  }

  const previous = Array.from({ length: right.length + 1 }, (_, index) => index);
  const current = new Array<number>(right.length + 1).fill(0);

  for (let i = 1; i <= left.length; i += 1) {
    current[0] = i;
    for (let j = 1; j <= right.length; j += 1) {
      const cost = left[i - 1] === right[j - 1] ? 0 : 1;
      current[j] = Math.min(current[j - 1] + 1, previous[j] + 1, previous[j - 1] + cost);
    }
    for (let j = 0; j <= right.length; j += 1) {
      previous[j] = current[j];
    }
  }

  return previous[right.length];
};

const countByKey = (items: string[]): Array<{ key: string; count: number }> => {
  const counter = new Map<string, number>();
  for (const item of items) {
    counter.set(item, (counter.get(item) ?? 0) + 1);
  }

  return Array.from(counter.entries())
    .map(([key, count]) => ({ key, count }))
    .sort((a, b) => b.count - a.count || a.key.localeCompare(b.key));
};

const formatAccuracy = (correct: number, total: number): number => {
  if (total <= 0) {
    return 0;
  }
  return Number((correct / total).toFixed(2));
};

const defaultPlaybackState = (): PracticePlaybackState => ({
  playbackRate: 1,
  segmentIndex: 0,
  positionSeconds: 0,
  replayWrongOnly: false
});

const normalizeLimitSeconds = (value?: number): number => {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    return DEFAULT_EXAM_LIMIT_SECONDS;
  }
  return clamp(Math.trunc(value), MIN_EXAM_LIMIT_SECONDS, MAX_EXAM_LIMIT_SECONDS);
};

export class PracticeService {
  constructor(
    private readonly store: InMemoryStore,
    private readonly onboardingService: Pick<OnboardingService, "applyAdaptiveAdjustment">
  ) {}

  createSession(input: {
    userId: string;
    skill: PracticeSkill;
    taskType?: string;
    trainingMode?: PracticeTrainingMode;
    timeLimitSeconds?: number;
  }): PracticeSession {
    const now = nowIso();
    const taskType = input.taskType?.trim() || "core_training";
    const questionSet = this.createQuestionSet(input.skill, taskType);
    const trainingMode = input.skill === "reading" ? input.trainingMode ?? "training" : "training";
    const timing = this.initTimingIfNeeded(input.skill, trainingMode, input.timeLimitSeconds);

    const session: PracticeSession = {
      id: randomUUID(),
      userId: input.userId,
      skill: input.skill,
      taskType,
      trainingMode,
      mode: "core_training",
      status: "in_progress",
      questionSet,
      timing,
      playbackState: input.skill === "listening" ? defaultPlaybackState() : undefined,
      createdAt: now,
      updatedAt: now
    };

    this.store.practiceSessionsById.set(session.id, session);

    appendAudit(this.store, "practice_session_created", {
      userId: input.userId,
      metadata: {
        sessionId: session.id,
        skill: input.skill,
        taskType: session.taskType,
        questionCount: session.questionSet.length,
        trainingMode: session.trainingMode,
        timeLimitSeconds: session.timing?.limitSeconds
      }
    });

    return session;
  }

  getSession(userId: string, sessionId: string): PracticeSession {
    const session = this.store.practiceSessionsById.get(sessionId);
    if (!session || session.userId !== userId) {
      throw new Error("SESSION_NOT_FOUND");
    }
    this.syncTimingProgress(session);
    return session;
  }

  submitSession(input: {
    userId: string;
    sessionId: string;
    answers: Array<{
      questionId: string;
      answer: string;
    }>;
  }): PracticeSession {
    const session = this.getSession(input.userId, input.sessionId);
    if (session.submission) {
      return session;
    }

    const answerMap = new Map<string, string>();
    for (const item of input.answers) {
      answerMap.set(item.questionId, item.answer);
    }

    const dictationSession = this.isDictationSession(session);
    const questionResults: PracticeQuestionResult[] = session.questionSet.map((question) => {
      const userAnswer = answerMap.get(question.id) ?? "";
      const isCorrect = this.isCorrect(question, userAnswer);
      const dictationFeedback = dictationSession ? this.buildDictationFeedback(question, userAnswer) : undefined;
      return {
        questionId: question.id,
        type: question.type,
        userAnswer,
        correctAnswer: question.correctAnswer,
        isCorrect,
        explanation: question.explanation,
        errorTags: isCorrect ? [] : question.errorTags,
        improvementActions: isCorrect ? [] : question.improvementActions,
        evidence: question.evidence,
        dictationFeedback
      };
    });

    const correctCount = questionResults.filter((result) => result.isCorrect).length;
    const totalQuestions = questionResults.length;
    const accuracy = formatAccuracy(correctCount, totalQuestions);
    const wrongResults = questionResults.filter((item) => !item.isCorrect);
    const dictationSummary = dictationSession ? this.buildDictationSummary(questionResults) : undefined;

    const nextActions =
      wrongResults.length > 0
        ? Array.from(new Set(wrongResults.flatMap((item) => item.improvementActions))).slice(0, 4)
        : ["保持当前节奏，进入下一套题并对比正确率。"];

    const elapsedSeconds = this.finalizeTimingOnSubmit(session);

    session.status = "submitted";
    session.submission = {
      submittedAt: nowIso(),
      scoreBreakdown: {
        correctCount,
        totalQuestions,
        accuracy,
        elapsedSeconds,
        mode: session.trainingMode
      },
      questionResults,
      nextActions,
      dictationSummary
    };
    session.updatedAt = nowIso();
    this.store.practiceSessionsById.set(session.id, session);

    appendAudit(this.store, "practice_submitted", {
      userId: input.userId,
      metadata: {
        sessionId: session.id,
        skill: session.skill,
        correctCount,
        totalQuestions,
        accuracy,
        elapsedSeconds,
        mode: session.trainingMode
      }
    });

    this.onboardingService.applyAdaptiveAdjustment({
      userId: input.userId,
      sourceType: "practice_session",
      sourceId: session.id,
      skill: session.skill,
      score: accuracy
    });

    if (session.mode === "retry" && session.sourceQueueItemId) {
      const queueItem = this.store.retryQueueById.get(session.sourceQueueItemId);
      if (queueItem && queueItem.userId === input.userId) {
        const proficiencyDelta = accuracy >= 1 ? 5 : 2;
        const proficiencyAfter = clamp(queueItem.proficiencyBefore + proficiencyDelta, 0, 100);
        queueItem.status = "completed";
        queueItem.proficiencyAfter = proficiencyAfter;
        queueItem.completedAt = nowIso();
        queueItem.updatedAt = nowIso();
        this.store.retryQueueById.set(queueItem.id, queueItem);

        this.store.skillProficiencyByUserAndSkill.set(
          this.skillProficiencyKey(input.userId, queueItem.skill),
          proficiencyAfter
        );

        appendAudit(this.store, "retry_session_completed", {
          userId: input.userId,
          metadata: {
            queueItemId: queueItem.id,
            sessionId: session.id,
            proficiencyBefore: queueItem.proficiencyBefore,
            proficiencyAfter
          }
        });
      }
    }

    return session;
  }

  switchReadingMode(input: {
    userId: string;
    sessionId: string;
    trainingMode: PracticeTrainingMode;
    timeLimitSeconds?: number;
  }): { session: PracticeSession; recovered: boolean } {
    const session = this.requireReadingSession(input.userId, input.sessionId);
    this.syncTimingProgress(session);

    if (!session.timing) {
      session.timing = {
        status: "idle",
        elapsedSeconds: 0
      };
    }

    let recovered = false;
    if (input.trainingMode === "training") {
      if (session.timing.status === "running" && session.timing.startedAt) {
        session.timing.status = "paused";
        session.timing.pausedAt = nowIso();
        session.timing.startedAt = undefined;
      } else if (session.timing.status === "idle") {
        session.timing.status = "paused";
        session.timing.pausedAt = nowIso();
      }
    } else {
      const limitSeconds = normalizeLimitSeconds(input.timeLimitSeconds ?? session.timing.limitSeconds);
      if (!Number.isFinite(session.timing.elapsedSeconds) || session.timing.elapsedSeconds < 0) {
        session.timing.elapsedSeconds = 0;
        session.timing.recoveredAt = nowIso();
        recovered = true;
      }
      if (session.timing.elapsedSeconds > limitSeconds * 2) {
        session.timing.elapsedSeconds = limitSeconds;
        session.timing.recoveredAt = nowIso();
        recovered = true;
      }
      session.timing.limitSeconds = limitSeconds;
      session.timing.status = "running";
      session.timing.startedAt = nowIso();
      session.timing.pausedAt = undefined;
    }

    session.trainingMode = input.trainingMode;
    session.updatedAt = nowIso();
    this.store.practiceSessionsById.set(session.id, session);

    appendAudit(this.store, "reading_mode_switched", {
      userId: input.userId,
      metadata: {
        sessionId: session.id,
        trainingMode: session.trainingMode,
        limitSeconds: session.timing.limitSeconds,
        recovered
      }
    });

    return {
      session,
      recovered
    };
  }

  getReadingTimerState(
    userId: string,
    sessionId: string
  ): {
    timing: PracticeTimingState;
    recovered: boolean;
  } {
    const session = this.requireReadingSession(userId, sessionId);
    if (!session.timing) {
      session.timing = {
        status: "idle",
        elapsedSeconds: 0
      };
      this.store.practiceSessionsById.set(session.id, session);
    }

    const beforeRecoveredAt = session.timing.recoveredAt;
    this.syncTimingProgress(session);

    return {
      timing: session.timing,
      recovered: beforeRecoveredAt !== session.timing.recoveredAt && Boolean(session.timing.recoveredAt)
    };
  }

  pauseReadingTimer(userId: string, sessionId: string): PracticeTimingState {
    const session = this.requireReadingSession(userId, sessionId);
    if (!session.timing) {
      session.timing = {
        status: "idle",
        elapsedSeconds: 0
      };
    }

    this.syncTimingProgress(session);
    if (session.timing.status === "running") {
      session.timing.status = "paused";
      session.timing.pausedAt = nowIso();
      session.timing.startedAt = undefined;
    }
    session.updatedAt = nowIso();
    this.store.practiceSessionsById.set(session.id, session);

    appendAudit(this.store, "reading_timer_paused", {
      userId,
      metadata: {
        sessionId: session.id,
        elapsedSeconds: session.timing.elapsedSeconds,
        mode: session.trainingMode
      }
    });

    return session.timing;
  }

  resumeReadingTimer(userId: string, sessionId: string): PracticeTimingState {
    const session = this.requireReadingSession(userId, sessionId);
    if (session.trainingMode !== "exam") {
      throw new Error("TIMER_NOT_AVAILABLE");
    }
    if (!session.timing) {
      session.timing = {
        status: "running",
        elapsedSeconds: 0,
        limitSeconds: DEFAULT_EXAM_LIMIT_SECONDS,
        startedAt: nowIso()
      };
    }

    this.syncTimingProgress(session);
    if (session.timing.status !== "running") {
      session.timing.status = "running";
      session.timing.startedAt = nowIso();
      session.timing.pausedAt = undefined;
    }
    session.updatedAt = nowIso();
    this.store.practiceSessionsById.set(session.id, session);

    appendAudit(this.store, "reading_timer_resumed", {
      userId,
      metadata: {
        sessionId: session.id,
        elapsedSeconds: session.timing.elapsedSeconds,
        limitSeconds: session.timing.limitSeconds
      }
    });

    return session.timing;
  }

  recoverReadingTimer(userId: string, sessionId: string): PracticeTimingState {
    const session = this.requireReadingSession(userId, sessionId);
    if (!session.timing) {
      session.timing = {
        status: session.trainingMode === "exam" ? "running" : "idle",
        elapsedSeconds: 0,
        limitSeconds: session.trainingMode === "exam" ? DEFAULT_EXAM_LIMIT_SECONDS : undefined,
        startedAt: session.trainingMode === "exam" ? nowIso() : undefined
      };
    }

    session.timing.elapsedSeconds = clamp(
      Number.isFinite(session.timing.elapsedSeconds) ? Math.trunc(session.timing.elapsedSeconds) : 0,
      0,
      session.timing.limitSeconds ?? Number.MAX_SAFE_INTEGER
    );
    session.timing.recoveredAt = nowIso();
    if (session.trainingMode === "exam" && session.timing.status === "running") {
      session.timing.startedAt = nowIso();
    }
    session.updatedAt = nowIso();
    this.store.practiceSessionsById.set(session.id, session);

    appendAudit(this.store, "reading_timer_recovered", {
      userId,
      metadata: {
        sessionId: session.id,
        elapsedSeconds: session.timing.elapsedSeconds,
        limitSeconds: session.timing.limitSeconds
      }
    });

    return session.timing;
  }

  getPlaybackState(userId: string, sessionId: string): PracticePlaybackState {
    const session = this.getSession(userId, sessionId);
    if (session.skill !== "listening") {
      throw new Error("PLAYBACK_NOT_SUPPORTED");
    }

    if (!session.playbackState) {
      session.playbackState = defaultPlaybackState();
      this.store.practiceSessionsById.set(session.id, session);
    }

    return session.playbackState;
  }

  updatePlaybackState(input: {
    userId: string;
    sessionId: string;
    playbackRate?: number;
    segmentIndex?: number;
    positionSeconds?: number;
    replayWrongOnly?: boolean;
    replayQuestionId?: string;
  }): { playbackState: PracticePlaybackState; recovered: boolean } {
    const session = this.getSession(input.userId, input.sessionId);
    if (session.skill !== "listening") {
      throw new Error("PLAYBACK_NOT_SUPPORTED");
    }

    const state = this.getPlaybackState(input.userId, input.sessionId);
    let recovered = false;

    if (typeof input.playbackRate === "number") {
      const roundedRate = Number(input.playbackRate.toFixed(2));
      if (!PLAYBACK_RATES.includes(roundedRate)) {
        state.playbackRate = 1;
        state.lastRecoveredAt = nowIso();
        recovered = true;
      } else {
        state.playbackRate = roundedRate;
      }
    }

    if (typeof input.segmentIndex === "number") {
      const maxSegment = Math.max(0, session.questionSet.length - 1);
      state.segmentIndex = clamp(Math.trunc(input.segmentIndex), 0, maxSegment);
    }

    if (typeof input.positionSeconds === "number") {
      state.positionSeconds = Math.max(0, Math.trunc(input.positionSeconds));
    }

    if (typeof input.replayWrongOnly === "boolean") {
      state.replayWrongOnly = input.replayWrongOnly;
    }

    if (typeof input.replayQuestionId === "string" && input.replayQuestionId.trim().length > 0) {
      const exists = session.questionSet.some((question) => question.id === input.replayQuestionId);
      if (exists) {
        state.lastReplayedQuestionId = input.replayQuestionId;
      }
    }

    session.updatedAt = nowIso();
    this.store.practiceSessionsById.set(session.id, session);

    appendAudit(this.store, "playback_state_updated", {
      userId: input.userId,
      metadata: {
        sessionId: session.id,
        playbackRate: state.playbackRate,
        segmentIndex: state.segmentIndex,
        positionSeconds: state.positionSeconds,
        replayWrongOnly: state.replayWrongOnly,
        recovered
      }
    });

    return {
      playbackState: state,
      recovered
    };
  }

  addRetryQueue(input: {
    userId: string;
    sessionId: string;
    questionIds?: string[];
  }): RetryQueueItem[] {
    const session = this.getSession(input.userId, input.sessionId);
    if (!session.submission) {
      throw new Error("SESSION_NOT_SUBMITTED");
    }

    const requiredIds = new Set(input.questionIds ?? []);
    const wrongResults = session.submission.questionResults.filter(
      (result) => !result.isCorrect && (requiredIds.size === 0 || requiredIds.has(result.questionId))
    );

    const createdItems: RetryQueueItem[] = [];
    for (const result of wrongResults) {
      const duplicate = Array.from(this.store.retryQueueById.values()).find(
        (item) =>
          item.userId === input.userId &&
          item.sourceSessionId === session.id &&
          item.questionId === result.questionId &&
          item.status !== "completed"
      );
      if (duplicate) {
        createdItems.push(duplicate);
        continue;
      }

      const proficiencyBefore = this.getSkillProficiency(input.userId, session.skill);
      const now = nowIso();
      const queueItem: RetryQueueItem = {
        id: randomUUID(),
        userId: input.userId,
        skill: session.skill,
        sourceSessionId: session.id,
        questionId: result.questionId,
        status: "queued",
        errorTags: result.errorTags,
        improvementActions: result.improvementActions,
        proficiencyBefore,
        createdAt: now,
        updatedAt: now
      };

      this.store.retryQueueById.set(queueItem.id, queueItem);
      createdItems.push(queueItem);
    }

    appendAudit(this.store, "retry_queue_added", {
      userId: input.userId,
      metadata: {
        sessionId: session.id,
        queuedCount: createdItems.length
      }
    });

    return createdItems;
  }

  getRetryQueue(userId: string): RetryQueueItem[] {
    return Array.from(this.store.retryQueueById.values())
      .filter((item) => item.userId === userId)
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  }

  startRetrySession(input: { userId: string; queueItemId: string }): PracticeSession {
    const queueItem = this.store.retryQueueById.get(input.queueItemId);
    if (!queueItem || queueItem.userId !== input.userId) {
      throw new Error("QUEUE_ITEM_NOT_FOUND");
    }
    if (queueItem.status === "completed") {
      throw new Error("QUEUE_ITEM_COMPLETED");
    }

    const sourceSession = this.getSession(input.userId, queueItem.sourceSessionId);
    const sourceQuestion = sourceSession.questionSet.find((question) => question.id === queueItem.questionId);
    if (!sourceQuestion) {
      throw new Error("QUESTION_NOT_FOUND");
    }

    const now = nowIso();
    const retrySession: PracticeSession = {
      id: randomUUID(),
      userId: input.userId,
      skill: queueItem.skill,
      taskType: "retry_training",
      trainingMode: sourceSession.trainingMode,
      mode: "retry",
      status: "in_progress",
      questionSet: [{ ...sourceQuestion, id: randomUUID() }],
      timing: sourceSession.skill === "reading" ? this.initTimingIfNeeded("reading", sourceSession.trainingMode) : undefined,
      playbackState: queueItem.skill === "listening" ? defaultPlaybackState() : undefined,
      sourceSessionId: sourceSession.id,
      sourceQueueItemId: queueItem.id,
      createdAt: now,
      updatedAt: now
    };

    this.store.practiceSessionsById.set(retrySession.id, retrySession);
    queueItem.status = "in_progress";
    queueItem.updatedAt = nowIso();
    this.store.retryQueueById.set(queueItem.id, queueItem);

    appendAudit(this.store, "retry_session_started", {
      userId: input.userId,
      metadata: {
        queueItemId: queueItem.id,
        sessionId: retrySession.id,
        sourceSessionId: sourceSession.id
      }
    });

    return retrySession;
  }

  private requireReadingSession(userId: string, sessionId: string): PracticeSession {
    const session = this.getSession(userId, sessionId);
    if (session.skill !== "reading") {
      throw new Error("READING_MODE_NOT_SUPPORTED");
    }
    return session;
  }

  private initTimingIfNeeded(
    skill: PracticeSkill,
    trainingMode: PracticeTrainingMode,
    timeLimitSeconds?: number
  ): PracticeTimingState | undefined {
    if (skill !== "reading") {
      return undefined;
    }
    if (trainingMode === "exam") {
      return {
        status: "running",
        elapsedSeconds: 0,
        limitSeconds: normalizeLimitSeconds(timeLimitSeconds),
        startedAt: nowIso()
      };
    }
    return {
      status: "idle",
      elapsedSeconds: 0
    };
  }

  private syncTimingProgress(session: PracticeSession): void {
    if (session.skill !== "reading" || !session.timing || session.timing.status !== "running") {
      return;
    }

    const startedAt = session.timing.startedAt ? new Date(session.timing.startedAt).getTime() : NaN;
    if (Number.isNaN(startedAt)) {
      session.timing.startedAt = nowIso();
      session.timing.recoveredAt = nowIso();
      this.store.practiceSessionsById.set(session.id, session);
      return;
    }

    let delta = Math.floor((Date.now() - startedAt) / 1000);
    if (!Number.isFinite(delta) || delta < 0 || delta > 4 * 3600) {
      delta = 0;
      session.timing.recoveredAt = nowIso();
    }

    session.timing.elapsedSeconds = Math.max(0, session.timing.elapsedSeconds + delta);

    if (session.timing.limitSeconds && session.timing.elapsedSeconds > session.timing.limitSeconds * 2) {
      session.timing.elapsedSeconds = session.timing.limitSeconds;
      session.timing.recoveredAt = nowIso();
    }

    session.timing.startedAt = nowIso();
    this.store.practiceSessionsById.set(session.id, session);
  }

  private finalizeTimingOnSubmit(session: PracticeSession): number | undefined {
    if (session.skill !== "reading" || !session.timing) {
      return undefined;
    }

    this.syncTimingProgress(session);
    session.timing.status = "ended";
    session.timing.startedAt = undefined;
    session.timing.pausedAt = nowIso();
    session.timing.submittedElapsedSeconds = session.timing.elapsedSeconds;
    this.store.practiceSessionsById.set(session.id, session);
    return session.timing.elapsedSeconds;
  }

  private isDictationSession(session: PracticeSession): boolean {
    return session.skill === "listening" && session.questionSet.some((question) => question.type === "dictation_sentence");
  }

  private buildDictationFeedback(question: PracticeQuestion, answer: string): PracticeDictationFeedback {
    const expectedTokens = tokenizeDictation(question.correctAnswer);
    const actualTokens = tokenizeDictation(answer);
    const compareLength = Math.min(expectedTokens.length, actualTokens.length);

    const spellingMismatches: PracticeDictationFeedback["spellingMismatches"] = [];
    for (let index = 0; index < compareLength; index += 1) {
      if (expectedTokens[index] === actualTokens[index]) {
        continue;
      }
      if (levenshteinDistance(expectedTokens[index], actualTokens[index]) <= 2) {
        spellingMismatches.push({
          position: index + 1,
          expected: expectedTokens[index],
          actual: actualTokens[index]
        });
      }
    }

    const expectedChunks = buildDictationChunks(expectedTokens);
    const actualChunks = buildDictationChunks(actualTokens);
    const missingChunks = diffMissingItems(expectedChunks, actualChunks);
    const extraChunks = diffExtraItems(expectedChunks, actualChunks);

    return {
      expectedTokenCount: expectedTokens.length,
      answerTokenCount: actualTokens.length,
      spellingMismatches,
      missingChunks,
      extraChunks
    };
  }

  private buildDictationSummary(questionResults: PracticeQuestionResult[]): PracticeDictationSummary {
    const tokenErrors = questionResults.flatMap((result) =>
      result.dictationFeedback?.spellingMismatches.map((item) => item.expected) ?? []
    );
    const chunkErrors = questionResults.flatMap((result) => result.dictationFeedback?.missingChunks ?? []);

    return {
      totalSentences: questionResults.length,
      highFrequencySpellingErrors: countByKey(tokenErrors)
        .slice(0, MAX_DICTATION_ERROR_ITEMS)
        .map((item) => ({
          token: item.key,
          count: item.count
        })),
      highFrequencyChunkErrors: countByKey(chunkErrors)
        .slice(0, MAX_DICTATION_ERROR_ITEMS)
        .map((item) => ({
          chunk: item.key,
          count: item.count
        }))
    };
  }

  private isCorrect(question: PracticeQuestion, answer: string): boolean {
    const normalizedAnswer = normalizeAnswer(answer);
    const normalizedCorrect = normalizeAnswer(question.correctAnswer);

    if (question.type === "tfng") {
      const canonicalMap: Record<string, string> = {
        t: "true",
        true: "true",
        f: "false",
        false: "false",
        ng: "not given",
        "not given": "not given"
      };
      return canonicalMap[normalizedAnswer] === canonicalMap[normalizedCorrect];
    }

    return normalizedAnswer === normalizedCorrect;
  }

  private createQuestionSet(skill: PracticeSkill, taskType: string): PracticeQuestion[] {
    if (skill === "listening") {
      if (taskType === "dictation") {
        return this.createListeningDictationQuestions();
      }
      return this.createListeningQuestions();
    }
    return this.createReadingQuestions();
  }

  private createListeningDictationQuestions(): PracticeQuestion[] {
    return [
      {
        id: randomUUID(),
        skill: "listening",
        type: "dictation_sentence",
        prompt: "Sentence 1：请听写完整句子（课程咨询）。",
        correctAnswer: "The advisor suggested booking the trial lesson before Friday morning.",
        explanation: "关键信息包括 suggested booking 与 before Friday morning。",
        errorTags: ["句子结构漏写", "拼写细节错误"],
        improvementActions: ["先记动词主干再补时间状语", "听到日期时间先写骨架后补拼写"],
        audioSegmentIndex: 0
      },
      {
        id: randomUUID(),
        skill: "listening",
        type: "dictation_sentence",
        prompt: "Sentence 2：请听写完整句子（场馆指引）。",
        correctAnswer: "You should enter through the south gate and report to reception desk three.",
        explanation: "方位 south gate 与 desk three 是高频丢失点。",
        errorTags: ["方位词误听", "数字信息错写"],
        improvementActions: ["方位词与数字先单独速记", "利用连词 and 切分句子节奏"],
        audioSegmentIndex: 1
      },
      {
        id: randomUUID(),
        skill: "listening",
        type: "dictation_sentence",
        prompt: "Sentence 3：请听写完整句子（学术讨论）。",
        correctAnswer: "Their final report highlighted how community projects improved student confidence.",
        explanation: "highlighted how 与 improved student confidence 需要整块捕捉。",
        errorTags: ["词块断裂", "名词短语漏写"],
        improvementActions: ["按意群记录 community projects", "复听时优先补全动宾结构"],
        audioSegmentIndex: 2
      },
      {
        id: randomUUID(),
        skill: "listening",
        type: "dictation_sentence",
        prompt: "Sentence 4：请听写完整句子（安排变更）。",
        correctAnswer: "If the weather turns bad, the outdoor interview will be moved online.",
        explanation: "条件从句 If the weather turns bad 容易与主句混写。",
        errorTags: ["从句边界识别弱", "被动语态遗漏"],
        improvementActions: ["先划分从句与主句再听写", "重点标记 will be moved 这类被动结构"],
        audioSegmentIndex: 3
      }
    ];
  }

  private createListeningQuestions(): PracticeQuestion[] {
    return [
      {
        id: randomUUID(),
        skill: "listening",
        type: "multiple_choice",
        prompt: "Section 1 选择题：课程开始时间是几点？（A) 8:30 (B) 9:00 (C) 9:30",
        options: ["A", "B", "C"],
        correctAnswer: "B",
        explanation: "录音中出现明确时间点 nine o'clock。",
        errorTags: ["同义替换遗漏", "时间细节误听"],
        improvementActions: ["重听时间表达句并做数字速记", "把 distractor 选项中的时间先划掉"],
        audioSegmentIndex: 0
      },
      {
        id: randomUUID(),
        skill: "listening",
        type: "fill_blank",
        prompt: "Section 2 填空题：报名地点在 ____ Street。",
        correctAnswer: "King",
        explanation: "音频原句为 located on King Street。",
        errorTags: ["拼写错误", "专有名词漏听"],
        improvementActions: ["开启 0.75 倍速复听地名句", "先记首字母再补全拼写"],
        audioSegmentIndex: 1
      },
      {
        id: randomUUID(),
        skill: "listening",
        type: "matching",
        prompt: "Section 3 匹配题：讲师与主题匹配（填写 1-A,2-B,3-C 格式）。",
        correctAnswer: "1-a,2-c,3-b",
        explanation: "三位讲师在对话后半段按 A/C/B 顺序对应。",
        errorTags: ["顺序跟丢", "人名定位失败"],
        improvementActions: ["先在草稿纸写讲师缩写", "听到 topic signal words 立即连线"],
        audioSegmentIndex: 2
      },
      {
        id: randomUUID(),
        skill: "listening",
        type: "map_label",
        prompt: "Section 4 地图题：图书馆入口对应编号？（A/B/C）",
        options: ["A", "B", "C"],
        correctAnswer: "C",
        explanation: "音频先给参照点 parking，再右转到 library entrance C。",
        errorTags: ["方位词混淆", "参照点未建立"],
        improvementActions: ["先固定 north/south 方位再听转向", "每个参照点只保留一个候选答案"],
        audioSegmentIndex: 3
      }
    ];
  }

  private createReadingQuestions(): PracticeQuestion[] {
    return [
      {
        id: randomUUID(),
        skill: "reading",
        type: "tfng",
        prompt: "判断题：The museum opened in 1998.",
        correctAnswer: "false",
        explanation: "原文说明 opened in 1989，而非 1998。",
        errorTags: ["年份细节误判", "题干与原文对照不足"],
        improvementActions: ["先圈题干年份再回文定位", "确认是否为直接矛盾而非未提及"],
        evidence: {
          sentence: "The museum first opened to the public in 1989.",
          paragraph: 2,
          spanStart: 56,
          spanEnd: 102
        }
      },
      {
        id: randomUUID(),
        skill: "reading",
        type: "paragraph_match",
        prompt: "段落匹配：哪一段提到 'community funding'？（A/B/C/D）",
        options: ["A", "B", "C", "D"],
        correctAnswer: "B",
        explanation: "B 段首句即出现 community funding model。",
        errorTags: ["关键词定位慢", "段落主旨误判"],
        improvementActions: ["先做关键词词形还原再扫读", "优先检查段首段尾句"],
        evidence: {
          sentence: "Community funding became the project's primary support.",
          paragraph: 2,
          spanStart: 12,
          spanEnd: 69
        }
      },
      {
        id: randomUUID(),
        skill: "reading",
        type: "heading_match",
        prompt: "标题匹配：Paragraph C 的最佳标题是？（i/ii/iii/iv）",
        options: ["i", "ii", "iii", "iv"],
        correctAnswer: "iii",
        explanation: "C 段核心是 technology adaptation，对应 iii。",
        errorTags: ["主旨句识别不足", "干扰标题未排除"],
        improvementActions: ["先写段落一句话 summary 再选标题", "排除只覆盖细节的标题"],
        evidence: {
          sentence: "The decisive factor was how quickly teams adapted new technology.",
          paragraph: 3,
          spanStart: 33,
          spanEnd: 104
        }
      },
      {
        id: randomUUID(),
        skill: "reading",
        type: "summary_cloze",
        prompt: "摘要填空：The final recommendation was to improve ____ strategy.",
        correctAnswer: "communication",
        explanation: "摘要句与原文 conclude 段同义替换。",
        errorTags: ["同义替换识别失败", "词性不匹配"],
        improvementActions: ["先判空格词性再找同义词", "把候选词放回句子检验语法"],
        evidence: {
          sentence: "The report concluded that communication strategies needed revision.",
          paragraph: 5,
          spanStart: 20,
          spanEnd: 92
        }
      }
    ];
  }

  private getSkillProficiency(userId: string, skill: PracticeSkill): number {
    const key = this.skillProficiencyKey(userId, skill);
    return this.store.skillProficiencyByUserAndSkill.get(key) ?? 50;
  }

  private skillProficiencyKey(userId: string, skill: PracticeSkill): string {
    return `${userId}:${skill}`;
  }
}
