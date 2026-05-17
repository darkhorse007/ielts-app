import { Redirect, router } from "expo-router";
import { useEffect, useEffectEvent, useRef, useState } from "react";
import { Pressable, Text, View } from "react-native";
import { ApiNetworkError, ApiRequestError } from "../src/lib/api-client";
import { trackMobileAnalyticsEvent } from "../src/lib/analytics";
import type { PracticeSessionResponse } from "../src/lib/api-types";
import { useAppForegroundEffect } from "../src/hooks/use-app-foreground-effect";
import { buildScopedStorageKey, clearStoredJson, loadStoredJson, saveStoredJson } from "../src/lib/storage";
import { useAppSession } from "../src/state/app-session";
import { useStudyLoop } from "../src/state/study-loop";
import { AppScreen, ButtonRow, InfoCard, PrimaryButton, SecondaryButton, StatusPill, TextField } from "../src/ui/primitives";
import { StudyLoopNextStepCard } from "../src/ui/study-loop-next-step-card";
import { colors, radii, spacing } from "../src/ui/theme";

type ReadingMode = "training" | "exam";
type ReadingSnapshot = {
  version: 1;
  trainingMode: ReadingMode;
  timeLimitSeconds: string;
  session: PracticeSessionResponse | null;
  answers: Record<string, string>;
  timerText: string;
  timerRecovered: boolean;
  evidenceCount: number;
  updatedAt: string;
};

const defaultReadingMode: ReadingMode = "training";
const defaultTimeLimitSeconds = "1200";

const isDefaultReadingSnapshot = (snapshot: ReadingSnapshot): boolean =>
  snapshot.trainingMode === defaultReadingMode &&
  snapshot.timeLimitSeconds === defaultTimeLimitSeconds &&
  snapshot.session === null &&
  Object.keys(snapshot.answers).length === 0 &&
  snapshot.timerText === "-" &&
  snapshot.timerRecovered === false &&
  snapshot.evidenceCount === 0;

const formatCheckpointTime = (value: string): string =>
  new Date(value).toLocaleTimeString("zh-CN", {
    hour12: false
  });

const readingModeOptions: Array<{
  value: ReadingMode;
  label: string;
  description: string;
}> = [
  {
    value: "training",
    label: "训练模式",
    description: "用于带解析的日常训练"
  },
  {
    value: "exam",
    label: "考试模式",
    description: "用于限时做题与计时恢复"
  }
];

const asNumber = (value: string, fallback: number): number => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
};

const formatTimer = (timer: PracticeSessionResponse["timer"]): string => {
  if (!timer) {
    return "-";
  }

  const remaining = timer.remaining_seconds === undefined ? "-" : `${timer.remaining_seconds}s`;
  return `${timer.status} / elapsed ${timer.elapsed_seconds}s / remain ${remaining}`;
};

const formatIsoDateTime = (value?: string | null): string => {
  if (!value) {
    return "-";
  }

  const timestamp = Date.parse(value);
  if (Number.isNaN(timestamp)) {
    return value;
  }

  return new Date(timestamp).toLocaleString("zh-CN", {
    hour12: false
  });
};

type ReadingRetryAction =
  | "create_session"
  | "sync_mode"
  | "load_timer"
  | "pause_timer"
  | "resume_timer"
  | "recover_timer"
  | "submit";

const formatReadingRetryActionLabel = (value: ReadingRetryAction): string => {
  switch (value) {
    case "create_session":
      return "创建训练";
    case "sync_mode":
      return "同步模式";
    case "load_timer":
      return "拉取计时";
    case "pause_timer":
      return "暂停计时";
    case "resume_timer":
      return "恢复计时";
    case "recover_timer":
      return "异常恢复";
    case "submit":
      return "提交答案";
    default:
      return value;
  }
};

const toRequestErrorMessage = (error: unknown, fallback: string): string => {
  if (error instanceof ApiNetworkError) {
    return error.message;
  }

  if (error instanceof ApiRequestError) {
    const requestLine = error.method && error.url ? ` (${error.method} ${error.url})` : "";
    return `${error.message}${requestLine}`;
  }

  return error instanceof Error ? error.message : fallback;
};

export default function ReadingScreen() {
  const { session: authSession, runWithAuthorizedClient } = useAppSession();
  const { recordActivity } = useStudyLoop();
  const snapshotSaveTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const skipNextSnapshotPersistRef = useRef(false);
  const [trainingMode, setTrainingMode] = useState<ReadingMode>(defaultReadingMode);
  const [timeLimitSeconds, setTimeLimitSeconds] = useState(defaultTimeLimitSeconds);
  const [session, setSession] = useState<PracticeSessionResponse | null>(null);
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [statusMessage, setStatusMessage] = useState("未开始");
  const [checkpointStatus, setCheckpointStatus] = useState("本地会话未恢复");
  const [checkpointReady, setCheckpointReady] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [serverSyncDetail, setServerSyncDetail] = useState("-");
  const [serverSyncAt, setServerSyncAt] = useState<string | null>(null);
  const [lastFailedAction, setLastFailedAction] = useState<ReadingRetryAction | null>(null);
  const [timerText, setTimerText] = useState("-");
  const [timerRecovered, setTimerRecovered] = useState(false);
  const [evidenceCount, setEvidenceCount] = useState(0);

  if (!authSession) {
    return <Redirect href="/login" />;
  }

  const snapshotStorageKey = buildScopedStorageKey("reading", "draft", "v1", authSession.userId);

  const markSyncSuccess = (statusText: string, detail: string): void => {
    setStatusMessage(statusText);
    setServerSyncDetail(detail);
    setServerSyncAt(new Date().toISOString());
    setLastFailedAction(null);
  };

  const markSyncFailure = (action: ReadingRetryAction, detail: string): void => {
    setStatusMessage(`${formatReadingRetryActionLabel(action)}失败`);
    setServerSyncDetail(detail);
    setServerSyncAt(new Date().toISOString());
    setLastFailedAction(action);
  };

  const resetSnapshotState = (): void => {
    setTrainingMode(defaultReadingMode);
    setTimeLimitSeconds(defaultTimeLimitSeconds);
    setSession(null);
    setAnswers({});
    setStatusMessage("未开始");
    setServerSyncDetail("-");
    setServerSyncAt(null);
    setLastFailedAction(null);
    setError(null);
    setTimerText("-");
    setTimerRecovered(false);
    setEvidenceCount(0);
  };

  const persistSnapshot = useEffectEvent(async (snapshot: ReadingSnapshot) => {
    if (isDefaultReadingSnapshot(snapshot)) {
      await clearStoredJson(snapshotStorageKey);
      setCheckpointStatus("已启用自动保存");
      return;
    }

    await saveStoredJson(snapshotStorageKey, snapshot);
    setCheckpointStatus(`已自动保存 ${formatCheckpointTime(snapshot.updatedAt)}`);
  });

  useEffect(() => {
    let cancelled = false;

    resetSnapshotState();
    setCheckpointReady(false);
    setCheckpointStatus("正在恢复本地会话...");
    if (snapshotSaveTimeoutRef.current) {
      clearTimeout(snapshotSaveTimeoutRef.current);
      snapshotSaveTimeoutRef.current = null;
    }

    void (async () => {
      const snapshot = await loadStoredJson<ReadingSnapshot>(snapshotStorageKey);
      if (cancelled) {
        return;
      }

      if (snapshot?.version === 1) {
        setTrainingMode(snapshot.trainingMode);
        setTimeLimitSeconds(snapshot.timeLimitSeconds);
        setSession(snapshot.session);
        setAnswers(snapshot.answers);
        setTimerText(snapshot.timerText);
        setTimerRecovered(snapshot.timerRecovered);
        setEvidenceCount(snapshot.evidenceCount);
        setStatusMessage(snapshot.session ? "已恢复本地阅读会话" : "未开始");
        setCheckpointStatus(`已恢复 ${formatCheckpointTime(snapshot.updatedAt)}`);
      } else {
        setCheckpointStatus("已启用自动保存");
      }

      skipNextSnapshotPersistRef.current = true;
      setCheckpointReady(true);
    })();

    return () => {
      cancelled = true;
      if (snapshotSaveTimeoutRef.current) {
        clearTimeout(snapshotSaveTimeoutRef.current);
        snapshotSaveTimeoutRef.current = null;
      }
    };
  }, [snapshotStorageKey]);

  useEffect(() => {
    if (!checkpointReady) {
      return;
    }

    if (skipNextSnapshotPersistRef.current) {
      skipNextSnapshotPersistRef.current = false;
      return;
    }

    const snapshot: ReadingSnapshot = {
      version: 1,
      trainingMode,
      timeLimitSeconds,
      session,
      answers,
      timerText,
      timerRecovered,
      evidenceCount,
      updatedAt: new Date().toISOString()
    };

    if (snapshotSaveTimeoutRef.current) {
      clearTimeout(snapshotSaveTimeoutRef.current);
    }

    snapshotSaveTimeoutRef.current = setTimeout(() => {
      void persistSnapshot(snapshot);
      snapshotSaveTimeoutRef.current = null;
    }, 400);

    return () => {
      if (snapshotSaveTimeoutRef.current) {
        clearTimeout(snapshotSaveTimeoutRef.current);
        snapshotSaveTimeoutRef.current = null;
      }
    };
  }, [
    answers,
    checkpointReady,
    evidenceCount,
    persistSnapshot,
    session,
    timeLimitSeconds,
    timerRecovered,
    timerText,
    trainingMode
  ]);

  const updateAnswer = (questionId: string, value: string): void => {
    setAnswers((current) => ({
      ...current,
      [questionId]: value
    }));
  };

  const createSession = async (): Promise<void> => {
    setLoading(true);
    try {
      setStatusMessage("正在创建阅读训练");
      setServerSyncDetail(`training_mode ${trainingMode} / time_limit_seconds ${timeLimitSeconds}`);
      const response = await runWithAuthorizedClient((apiClient, accessToken) =>
        apiClient.createPracticeSession(accessToken, {
          skill: "reading",
          training_mode: trainingMode,
          time_limit_seconds: asNumber(timeLimitSeconds, 1200)
        })
      );

      setSession(response);
      setAnswers({});
      setEvidenceCount(0);
      setTimerText(formatTimer(response.timer));
      setTimerRecovered(false);
      markSyncSuccess(
        `已创建阅读训练，题量 ${response.questions.length}`,
        `session ${response.session_id} / mode ${response.training_mode ?? trainingMode} / question_count ${response.questions.length}`
      );
      setError(null);
    } catch (createError) {
      const message = toRequestErrorMessage(createError, "创建阅读训练失败");
      markSyncFailure("create_session", message);
      setError(message);
    } finally {
      setLoading(false);
    }
  };

  const syncMode = async (): Promise<void> => {
    if (!session) {
      setError("请先创建阅读训练");
      return;
    }

    setLoading(true);
    try {
      setStatusMessage("正在同步阅读模式");
      setServerSyncDetail(`session ${session.session_id} / training_mode ${trainingMode} / time_limit_seconds ${timeLimitSeconds}`);
      const response = await runWithAuthorizedClient((apiClient, accessToken) =>
        apiClient.switchReadingMode(accessToken, session.session_id, {
          training_mode: trainingMode,
          time_limit_seconds: asNumber(timeLimitSeconds, 1200)
        })
      );

      setSession(response);
      setTimerText(formatTimer(response.timer));
      setTimerRecovered(response.recovered);
      markSyncSuccess(
        response.recovered ? "模式切换成功，计时器已恢复" : `已切换到${trainingMode === "exam" ? "考试" : "训练"}模式`,
        `session ${response.session_id} / training_mode ${response.training_mode ?? trainingMode} / recovered ${response.recovered ? "yes" : "no"}`
      );
      setError(null);
    } catch (switchError) {
      const message = toRequestErrorMessage(switchError, "切换阅读模式失败");
      markSyncFailure("sync_mode", message);
      setError(message);
    } finally {
      setLoading(false);
    }
  };

  const loadTimer = async (): Promise<void> => {
    if (!session) {
      setError("请先创建阅读训练");
      return;
    }

    setLoading(true);
    try {
      setStatusMessage("正在拉取计时器状态");
      setServerSyncDetail(`session ${session.session_id}`);
      const result = await runWithAuthorizedClient((apiClient, accessToken) =>
        apiClient.getReadingTimer(accessToken, session.session_id)
      );

      const timerLabel = formatTimer(result.timer);
      setTimerText(timerLabel);
      setTimerRecovered(result.recovered);
      markSyncSuccess(
        result.recovered ? "计时器状态已恢复" : "已拉取计时器状态",
        `${timerLabel} / recovered ${result.recovered ? "yes" : "no"}`
      );
      setError(null);
    } catch (timerError) {
      const message = toRequestErrorMessage(timerError, "拉取计时器失败");
      markSyncFailure("load_timer", message);
      setError(message);
    } finally {
      setLoading(false);
    }
  };

  const pauseTimer = async (): Promise<void> => {
    if (!session) {
      setError("请先创建阅读训练");
      return;
    }

    setLoading(true);
    try {
      setStatusMessage("正在暂停计时");
      setServerSyncDetail(`session ${session.session_id}`);
      const result = await runWithAuthorizedClient((apiClient, accessToken) =>
        apiClient.pauseReadingTimer(accessToken, session.session_id)
      );

      const timerLabel = formatTimer(result.timer);
      setTimerText(timerLabel);
      setTimerRecovered(false);
      markSyncSuccess("计时已暂停", timerLabel);
      setError(null);
    } catch (timerError) {
      const message = toRequestErrorMessage(timerError, "暂停计时失败");
      markSyncFailure("pause_timer", message);
      setError(message);
    } finally {
      setLoading(false);
    }
  };

  const resumeTimer = async (): Promise<void> => {
    if (!session) {
      setError("请先创建阅读训练");
      return;
    }

    setLoading(true);
    try {
      setStatusMessage("正在恢复计时");
      setServerSyncDetail(`session ${session.session_id}`);
      const result = await runWithAuthorizedClient((apiClient, accessToken) =>
        apiClient.resumeReadingTimer(accessToken, session.session_id)
      );

      const timerLabel = formatTimer(result.timer);
      setTimerText(timerLabel);
      setTimerRecovered(false);
      markSyncSuccess("计时已恢复", timerLabel);
      setError(null);
    } catch (timerError) {
      const message = toRequestErrorMessage(timerError, "恢复计时失败");
      markSyncFailure("resume_timer", message);
      setError(message);
    } finally {
      setLoading(false);
    }
  };

  const recoverTimer = async (): Promise<void> => {
    if (!session) {
      setError("请先创建阅读训练");
      return;
    }

    setLoading(true);
    try {
      setStatusMessage("正在恢复异常计时");
      setServerSyncDetail(`session ${session.session_id}`);
      const result = await runWithAuthorizedClient((apiClient, accessToken) =>
        apiClient.recoverReadingTimer(accessToken, session.session_id)
      );

      const timerLabel = formatTimer(result.timer);
      setTimerText(timerLabel);
      setTimerRecovered(result.recovered);
      markSyncSuccess(
        result.recovered ? "计时器恢复完成" : "计时器无需恢复",
        `${timerLabel} / recovered ${result.recovered ? "yes" : "no"}`
      );
      setError(null);
    } catch (timerError) {
      const message = toRequestErrorMessage(timerError, "恢复异常计时失败");
      markSyncFailure("recover_timer", message);
      setError(message);
    } finally {
      setLoading(false);
    }
  };

  const submit = async (): Promise<void> => {
    if (!session) {
      setError("请先创建阅读训练");
      return;
    }

    setLoading(true);
    try {
      setStatusMessage("正在提交阅读答案");
      setServerSyncDetail(`session ${session.session_id} / answer_count ${session.questions.length}`);
      const response = await runWithAuthorizedClient((apiClient, accessToken) =>
        apiClient.submitPracticeSession(
          accessToken,
          session.session_id,
          session.questions.map((question) => ({
            question_id: question.question_id,
            answer: answers[question.question_id] ?? ""
          }))
        )
      );

      const wrongWithEvidence =
        response.submission?.question_results.filter((item) => !item.is_correct && Boolean(item.evidence)).length ?? 0;

      setSession(response);
      setEvidenceCount(wrongWithEvidence);
      setTimerText(
        `${response.submission?.score_breakdown.mode ?? "-"} / ${response.submission?.score_breakdown.elapsed_seconds ?? 0}s`
      );
      recordActivity({
        skill: "reading",
        source: "practice_submission",
        title: "阅读训练已提交",
        summary: `阅读提交 ${response.submission?.score_breakdown.correct_count ?? 0}/${response.submission?.score_breakdown.total_questions ?? 0}，accuracy ${Math.round((response.submission?.score_breakdown.accuracy ?? 0) * 100)}%`,
        route: "/reading"
      });
      void trackMobileAnalyticsEvent(runWithAuthorizedClient, {
        eventType: "practice_submitted",
        skill: "reading",
        createdAt: response.submission?.submitted_at,
        metadata: {
          sessionId: response.session_id,
          trainingMode: response.training_mode ?? trainingMode,
          questionCount: response.questions.length,
          evidenceCount: wrongWithEvidence,
          correctCount: response.submission?.score_breakdown.correct_count ?? 0,
          totalQuestions: response.submission?.score_breakdown.total_questions ?? 0,
          accuracy: response.submission?.score_breakdown.accuracy ?? 0
        }
      });
      markSyncSuccess(
        `提交完成，正确 ${response.submission?.score_breakdown.correct_count ?? 0}/${response.submission?.score_breakdown.total_questions ?? 0}`,
        `session ${response.session_id} / evidence_count ${wrongWithEvidence} / accuracy ${Math.round((response.submission?.score_breakdown.accuracy ?? 0) * 100)}%`
      );
      setError(null);
    } catch (submitError) {
      const message = toRequestErrorMessage(submitError, "提交阅读答案失败");
      markSyncFailure("submit", message);
      setError(message);
    } finally {
      setLoading(false);
    }
  };

  const clearLocalCheckpoint = async (): Promise<void> => {
    if (snapshotSaveTimeoutRef.current) {
      clearTimeout(snapshotSaveTimeoutRef.current);
      snapshotSaveTimeoutRef.current = null;
    }

    await clearStoredJson(snapshotStorageKey);
    skipNextSnapshotPersistRef.current = true;
    resetSnapshotState();
    setCheckpointReady(true);
    setCheckpointStatus("本地会话已清空");
    setStatusMessage("已清空本地阅读会话");
  };

  const retryLastFailedAction = async (): Promise<void> => {
    switch (lastFailedAction) {
      case "create_session":
        await createSession();
        break;
      case "sync_mode":
        await syncMode();
        break;
      case "load_timer":
        await loadTimer();
        break;
      case "pause_timer":
        await pauseTimer();
        break;
      case "resume_timer":
        await resumeTimer();
        break;
      case "recover_timer":
        await recoverTimer();
        break;
      case "submit":
        await submit();
        break;
      default:
        break;
    }
  };

  useAppForegroundEffect(
    async () => {
      if (loading || !session?.session_id) {
        return;
      }
      await loadTimer();
    },
    {
      enabled: Boolean(session?.session_id)
    }
  );

  return (
    <AppScreen
      eyebrow="Reading"
      title="阅读训练与考试模式已进入移动端"
      subtitle="当前已接上 reading session、训练/考试模式切换、计时器拉取/暂停/恢复/异常恢复，以及提交后的证据定位回显。"
    >
      <InfoCard tone="accent">
        <Text style={{ color: colors.textMuted, fontSize: 12 }}>训练模式</Text>
        <View style={{ gap: 10 }}>
          {readingModeOptions.map((option) => {
            const active = option.value === trainingMode;
            return (
              <Pressable
                key={option.value}
                onPress={() => setTrainingMode(option.value)}
                style={{
                  borderRadius: radii.md,
                  borderWidth: 1,
                  borderColor: active ? colors.cardAccentBorder : colors.cardBorder,
                  backgroundColor: active ? colors.cardAccent : colors.card,
                  padding: spacing.md,
                  gap: 6
                }}
              >
                <Text style={{ color: colors.textPrimary, fontSize: 15, fontWeight: "700" }}>{option.label}</Text>
                <Text style={{ color: colors.textMuted, fontSize: 13, lineHeight: 20 }}>{option.description}</Text>
              </Pressable>
            );
          })}
        </View>

        <TextField
          label="考试时长（秒）"
          value={timeLimitSeconds}
          onChangeText={setTimeLimitSeconds}
          placeholder="1200"
          keyboardType="number-pad"
        />

        <ButtonRow>
          <PrimaryButton label={loading ? "处理中..." : "创建训练"} onPress={() => void createSession()} disabled={loading} />
          <SecondaryButton label="同步所选模式" onPress={() => void syncMode()} disabled={loading || !session} />
        </ButtonRow>
      </InfoCard>

      <InfoCard>
        <Text style={{ color: colors.textMuted, fontSize: 12 }}>当前 session</Text>
        <ButtonRow>
          <StatusPill label={session?.status ?? "未创建"} tone={session ? "success" : "neutral"} />
          <StatusPill label={statusMessage} tone={session ? "accent" : "neutral"} />
        </ButtonRow>
        <View style={{ gap: 6, marginTop: 10 }}>
          <Text style={{ color: colors.textPrimary, fontSize: 14 }}>session_id: {session?.session_id ?? "-"}</Text>
          <Text style={{ color: colors.textMuted, fontSize: 14 }}>training_mode: {session?.training_mode ?? trainingMode}</Text>
          <Text style={{ color: colors.textMuted, fontSize: 14 }}>question_count: {session?.questions.length ?? 0}</Text>
          <Text style={{ color: colors.textMuted, fontSize: 14 }}>evidence_count: {evidenceCount}</Text>
        </View>
      </InfoCard>

      <InfoCard tone={lastFailedAction ? "accent" : "default"}>
        <Text style={{ color: colors.textMuted, fontSize: 12 }}>服务端同步</Text>
        <ButtonRow>
          <StatusPill
            label={statusMessage}
            tone={lastFailedAction ? "accent" : serverSyncAt ? "success" : "neutral"}
          />
          <StatusPill
            label={lastFailedAction ? `待重试 ${formatReadingRetryActionLabel(lastFailedAction)}` : "链路已就绪"}
            tone={lastFailedAction ? "accent" : serverSyncAt ? "success" : "neutral"}
          />
        </ButtonRow>
        <Text style={{ color: colors.textPrimary, fontSize: 14 }}>server_sync_status: {statusMessage}</Text>
        <Text style={{ color: colors.textMuted, fontSize: 14 }}>server_sync_at: {formatIsoDateTime(serverSyncAt)}</Text>
        <Text style={{ color: colors.textMuted, fontSize: 14, lineHeight: 20 }}>server_sync_result: {serverSyncDetail}</Text>
        {lastFailedAction ? (
          <ButtonRow>
            <PrimaryButton
              label="重试上次失败操作"
              onPress={() => void retryLastFailedAction()}
              disabled={loading}
              testID="reading.retryLastFailedAction"
            />
          </ButtonRow>
        ) : null}
      </InfoCard>

      <InfoCard>
        <Text style={{ color: colors.textMuted, fontSize: 12 }}>本地会话恢复</Text>
        <Text style={{ color: colors.textPrimary, fontSize: 14 }}>checkpoint_status: {checkpointStatus}</Text>
        <Text style={{ color: colors.textMuted, fontSize: 14 }}>
          restore_target: {session?.session_id ? `session ${session.session_id}` : "当前尚无本地阅读 checkpoint"}
        </Text>
        <ButtonRow>
          <PrimaryButton label="拉取计时状态" onPress={() => void loadTimer()} disabled={loading || !session} />
          <SecondaryButton label="清空本地会话" onPress={() => void clearLocalCheckpoint()} disabled={loading || !checkpointReady} />
        </ButtonRow>
      </InfoCard>

      <InfoCard>
        <Text style={{ color: colors.textMuted, fontSize: 12 }}>计时器</Text>
        <Text style={{ color: colors.textPrimary, fontSize: 14 }}>{timerText}</Text>
        <Text style={{ color: colors.textMuted, fontSize: 13 }}>
          recovered: {timerRecovered ? "true" : "false"}
        </Text>
        <ButtonRow>
          <PrimaryButton label="拉取计时状态" onPress={() => void loadTimer()} disabled={loading || !session} />
          <SecondaryButton label="暂停计时" onPress={() => void pauseTimer()} disabled={loading || !session} />
        </ButtonRow>
        <ButtonRow>
          <PrimaryButton label="恢复计时" onPress={() => void resumeTimer()} disabled={loading || !session} />
          <SecondaryButton label="异常恢复" onPress={() => void recoverTimer()} disabled={loading || !session} />
        </ButtonRow>
      </InfoCard>

      {session ? (
        <InfoCard>
          <Text style={{ color: colors.textMuted, fontSize: 12 }}>答题区</Text>
          <View style={{ gap: 14 }}>
            {session.questions.map((question) => (
              <View key={question.question_id} style={{ gap: 8 }}>
                <Text style={{ color: colors.textPrimary, fontSize: 14, fontWeight: "700", lineHeight: 22 }}>
                  [{question.type}] {question.prompt}
                </Text>
                {question.options?.length ? (
                  <Text style={{ color: colors.textMuted, fontSize: 13, lineHeight: 20 }}>
                    options: {question.options.join(" / ")}
                  </Text>
                ) : null}
                <TextField
                  label={`答案 ${question.question_id.slice(0, 8)}`}
                  value={answers[question.question_id] ?? ""}
                  onChangeText={(value) => updateAnswer(question.question_id, value)}
                  placeholder="输入答案"
                  multiline
                  numberOfLines={3}
                  textAlignVertical="top"
                />
              </View>
            ))}
          </View>

          <ButtonRow>
            <PrimaryButton label={loading ? "处理中..." : "提交答案"} onPress={() => void submit()} disabled={loading} />
            <SecondaryButton label="返回首页" onPress={() => router.replace("/home")} disabled={loading} />
          </ButtonRow>
        </InfoCard>
      ) : null}

      {error ? <Text style={{ color: colors.danger, fontSize: 14, lineHeight: 20 }}>{error}</Text> : null}

      {session?.submission ? (
        <InfoCard>
          <Text style={{ color: colors.textMuted, fontSize: 12 }}>提交结果</Text>
          <Text style={{ color: colors.textPrimary, fontSize: 15, fontWeight: "700" }}>
            正确 {session.submission.score_breakdown.correct_count}/{session.submission.score_breakdown.total_questions}
          </Text>
          <Text style={{ color: colors.textMuted, fontSize: 14 }}>
            accuracy: {Math.round(session.submission.score_breakdown.accuracy * 100)}%
          </Text>
          <View style={{ gap: 10, marginTop: 8 }}>
            {session.submission.question_results.map((item) => (
              <View
                key={item.question_id}
                style={{
                  borderRadius: radii.md,
                  borderWidth: 1,
                  borderColor: colors.cardBorder,
                  backgroundColor: colors.input,
                  padding: spacing.md,
                  gap: 6
                }}
              >
                <Text style={{ color: colors.textPrimary, fontSize: 14, fontWeight: "700" }}>
                  {item.is_correct ? "正确" : "需回看"} · {item.question_id.slice(0, 8)}
                </Text>
                <Text style={{ color: colors.textMuted, fontSize: 13 }}>你的答案: {item.user_answer || "-"}</Text>
                <Text style={{ color: colors.textMuted, fontSize: 13 }}>正确答案: {item.correct_answer}</Text>
                <Text style={{ color: colors.textMuted, fontSize: 13, lineHeight: 20 }}>
                  explanation: {item.explanation}
                </Text>
                <Text style={{ color: colors.textMuted, fontSize: 13 }}>
                  error_tags: {item.error_tags.length ? item.error_tags.join(", ") : "-"}
                </Text>
                <Text style={{ color: colors.textMuted, fontSize: 13 }}>
                  actions: {item.improvement_actions.length ? item.improvement_actions.join(", ") : "-"}
                </Text>
                {item.evidence ? (
                  <Text style={{ color: colors.textMuted, fontSize: 13, lineHeight: 20 }}>
                    evidence: P{item.evidence.paragraph} · {item.evidence.sentence}
                  </Text>
                ) : null}
              </View>
            ))}
          </View>
        </InfoCard>
      ) : null}

      <StudyLoopNextStepCard
        visible={Boolean(session?.submission)}
        currentRoute="/reading"
        secondaryRoute="/home"
        secondaryLabel="返回首页"
        testIDPrefix="reading.studyLoopNext"
      />
    </AppScreen>
  );
}
