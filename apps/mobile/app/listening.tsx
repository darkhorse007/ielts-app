import { Redirect, router } from "expo-router";
import { useEffect, useEffectEvent, useRef, useState } from "react";
import { Pressable, Text, View } from "react-native";
import type { PlaybackStateResponse, PracticeSessionResponse } from "../src/lib/api-types";
import { useAppForegroundEffect } from "../src/hooks/use-app-foreground-effect";
import { buildScopedStorageKey, clearStoredJson, loadStoredJson, saveStoredJson } from "../src/lib/storage";
import { useAppSession } from "../src/state/app-session";
import { AppScreen, ButtonRow, InfoCard, PrimaryButton, SecondaryButton, StatusPill, TextField } from "../src/ui/primitives";
import { colors, radii, spacing } from "../src/ui/theme";

type ListeningTaskType = "core_training" | "dictation";
type ListeningSnapshot = {
  version: 1;
  taskType: ListeningTaskType;
  session: PracticeSessionResponse | null;
  answers: Record<string, string>;
  playbackRate: string;
  segmentIndex: string;
  positionSeconds: string;
  replayWrongOnly: boolean;
  queueCount: number;
  lastPlaybackSnapshot: PlaybackStateResponse | null;
  updatedAt: string;
};

const defaultTaskType: ListeningTaskType = "core_training";
const defaultPlaybackRate = "1";
const defaultSegmentIndex = "0";
const defaultPositionSeconds = "0";

const isDefaultListeningSnapshot = (snapshot: ListeningSnapshot): boolean =>
  snapshot.taskType === defaultTaskType &&
  snapshot.session === null &&
  Object.keys(snapshot.answers).length === 0 &&
  snapshot.playbackRate === defaultPlaybackRate &&
  snapshot.segmentIndex === defaultSegmentIndex &&
  snapshot.positionSeconds === defaultPositionSeconds &&
  snapshot.replayWrongOnly === false &&
  snapshot.queueCount === 0 &&
  snapshot.lastPlaybackSnapshot === null;

const formatCheckpointTime = (value: string): string =>
  new Date(value).toLocaleTimeString("zh-CN", {
    hour12: false
  });

const listeningTaskOptions: Array<{
  value: ListeningTaskType;
  label: string;
  description: string;
}> = [
  {
    value: "core_training",
    label: "核心题型",
    description: "用于常规听力题训练与提交评分"
  },
  {
    value: "dictation",
    label: "句级听写",
    description: "用于句级听写与拼写纠错反馈"
  }
];

const asNumber = (value: string, fallback: number): number => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
};

const applyPlaybackState = (
  playback: PlaybackStateResponse,
  setPlaybackRate: (value: string) => void,
  setSegmentIndex: (value: string) => void,
  setPositionSeconds: (value: string) => void,
  setReplayWrongOnly: (value: boolean) => void
): void => {
  setPlaybackRate(String(playback.playback_rate));
  setSegmentIndex(String(playback.segment_index));
  setPositionSeconds(String(playback.position_seconds));
  setReplayWrongOnly(playback.replay_wrong_only);
};

const renderQuestionLabel = (question: PracticeSessionResponse["questions"][number]): string =>
  question.audio_segment_index === undefined
    ? `[${question.type}] ${question.prompt}`
    : `[${question.type}] S${question.audio_segment_index} · ${question.prompt}`;

export default function ListeningScreen() {
  const { session: authSession, runWithAuthorizedClient } = useAppSession();
  const snapshotSaveTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const skipNextSnapshotPersistRef = useRef(false);
  const [taskType, setTaskType] = useState<ListeningTaskType>(defaultTaskType);
  const [session, setSession] = useState<PracticeSessionResponse | null>(null);
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [statusMessage, setStatusMessage] = useState("未开始");
  const [checkpointStatus, setCheckpointStatus] = useState("本地会话未恢复");
  const [checkpointReady, setCheckpointReady] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [playbackRate, setPlaybackRate] = useState(defaultPlaybackRate);
  const [segmentIndex, setSegmentIndex] = useState(defaultSegmentIndex);
  const [positionSeconds, setPositionSeconds] = useState(defaultPositionSeconds);
  const [replayWrongOnly, setReplayWrongOnly] = useState(false);
  const [queueCount, setQueueCount] = useState(0);
  const [lastPlaybackSnapshot, setLastPlaybackSnapshot] = useState<PlaybackStateResponse | null>(null);

  if (!authSession) {
    return <Redirect href="/login" />;
  }

  const snapshotStorageKey = buildScopedStorageKey("listening", "draft", "v1", authSession.userId);

  const resetSnapshotState = (): void => {
    setTaskType(defaultTaskType);
    setSession(null);
    setAnswers({});
    setStatusMessage("未开始");
    setCheckpointStatus("本地会话未恢复");
    setError(null);
    setPlaybackRate(defaultPlaybackRate);
    setSegmentIndex(defaultSegmentIndex);
    setPositionSeconds(defaultPositionSeconds);
    setReplayWrongOnly(false);
    setQueueCount(0);
    setLastPlaybackSnapshot(null);
  };

  const persistSnapshot = useEffectEvent(async (snapshot: ListeningSnapshot) => {
    if (isDefaultListeningSnapshot(snapshot)) {
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
      const snapshot = await loadStoredJson<ListeningSnapshot>(snapshotStorageKey);
      if (cancelled) {
        return;
      }

      if (snapshot?.version === 1) {
        setTaskType(snapshot.taskType);
        setSession(snapshot.session);
        setAnswers(snapshot.answers);
        setPlaybackRate(snapshot.playbackRate);
        setSegmentIndex(snapshot.segmentIndex);
        setPositionSeconds(snapshot.positionSeconds);
        setReplayWrongOnly(snapshot.replayWrongOnly);
        setQueueCount(snapshot.queueCount);
        setLastPlaybackSnapshot(snapshot.lastPlaybackSnapshot);
        setStatusMessage(snapshot.session ? "已恢复本地听力会话" : "未开始");
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

    const snapshot: ListeningSnapshot = {
      version: 1,
      taskType,
      session,
      answers,
      playbackRate,
      segmentIndex,
      positionSeconds,
      replayWrongOnly,
      queueCount,
      lastPlaybackSnapshot,
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
    lastPlaybackSnapshot,
    persistSnapshot,
    playbackRate,
    positionSeconds,
    queueCount,
    replayWrongOnly,
    segmentIndex,
    session,
    taskType
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
      const response = await runWithAuthorizedClient((apiClient, accessToken) =>
        apiClient.createPracticeSession(accessToken, {
          skill: "listening",
          task_type: taskType
        })
      );

      setSession(response);
      setAnswers({});
      setQueueCount(0);
      setLastPlaybackSnapshot(null);
      setPlaybackRate("1");
      setSegmentIndex("0");
      setPositionSeconds("0");
      setReplayWrongOnly(false);
      setStatusMessage(
        response.task_type === "dictation"
          ? `已创建听写训练，句量 ${response.questions.length}`
          : `已创建听力训练，题量 ${response.questions.length}`
      );
      setError(null);
    } catch (createError) {
      setError(createError instanceof Error ? createError.message : "创建听力训练失败");
    } finally {
      setLoading(false);
    }
  };

  const submit = async (): Promise<void> => {
    if (!session) {
      setError("请先创建听力训练");
      return;
    }

    setLoading(true);
    try {
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

      setSession(response);
      setStatusMessage(
        `提交完成，正确 ${response.submission?.score_breakdown.correct_count ?? 0}/${response.submission?.score_breakdown.total_questions ?? 0}`
      );
      setError(null);
    } catch (submitError) {
      setError(submitError instanceof Error ? submitError.message : "提交听力答案失败");
    } finally {
      setLoading(false);
    }
  };

  const savePlayback = async (): Promise<void> => {
    if (!session) {
      setError("请先创建听力训练");
      return;
    }

    setLoading(true);
    try {
      const response = await runWithAuthorizedClient((apiClient, accessToken) =>
        apiClient.updatePlaybackState(accessToken, session.session_id, {
          playback_rate: asNumber(playbackRate, 1),
          segment_index: asNumber(segmentIndex, 0),
          position_seconds: asNumber(positionSeconds, 0),
          replay_wrong_only: replayWrongOnly
        })
      );

      applyPlaybackState(response, setPlaybackRate, setSegmentIndex, setPositionSeconds, setReplayWrongOnly);
      setLastPlaybackSnapshot(response);
      setStatusMessage(response.recovered ? "播放状态已恢复到安全值" : "播放状态已保存");
      setError(null);
    } catch (playbackError) {
      setError(playbackError instanceof Error ? playbackError.message : "保存播放状态失败");
    } finally {
      setLoading(false);
    }
  };

  const loadPlayback = async (): Promise<void> => {
    if (!session) {
      setError("请先创建听力训练");
      return;
    }

    setLoading(true);
    try {
      const response = await runWithAuthorizedClient((apiClient, accessToken) =>
        apiClient.getPlaybackState(accessToken, session.session_id)
      );

      applyPlaybackState(response, setPlaybackRate, setSegmentIndex, setPositionSeconds, setReplayWrongOnly);
      setLastPlaybackSnapshot(response);
      setStatusMessage(response.recovered ? "已加载并恢复播放状态" : "已加载播放状态");
      setError(null);
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "加载播放状态失败");
    } finally {
      setLoading(false);
    }
  };

  const addRetryQueue = async (): Promise<void> => {
    if (!session?.submission) {
      setError("请先提交一次听力训练");
      return;
    }

    setLoading(true);
    try {
      const response = await runWithAuthorizedClient((apiClient, accessToken) =>
        apiClient.addRetryQueue(accessToken, session.session_id)
      );
      setQueueCount(response.items.length);
      setStatusMessage(`已加入重练队列 ${response.items.length} 题`);
      setError(null);
    } catch (queueError) {
      setError(queueError instanceof Error ? queueError.message : "加入重练队列失败");
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
    setStatusMessage("已清空本地听力会话");
  };

  useAppForegroundEffect(
    async () => {
      if (loading || !session?.session_id) {
        return;
      }
      await loadPlayback();
    },
    {
      enabled: Boolean(session?.session_id)
    }
  );

  return (
    <AppScreen
      eyebrow="Listening"
      title="听力训练已进入移动端"
      subtitle="当前已接上 listening session、答案提交、播放状态保存/恢复，以及错题加入 retry queue。句级听写也会回显拼写与 chunk 级反馈。"
    >
      <InfoCard tone="accent">
        <Text style={{ color: colors.textMuted, fontSize: 12 }}>训练形态</Text>
        <View style={{ gap: 10 }}>
          {listeningTaskOptions.map((option) => {
            const active = option.value === taskType;
            return (
              <Pressable
                key={option.value}
                onPress={() => setTaskType(option.value)}
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
        <ButtonRow>
          <PrimaryButton label={loading ? "处理中..." : "创建训练"} onPress={() => void createSession()} disabled={loading} />
          <SecondaryButton label="返回首页" onPress={() => router.replace("/home")} disabled={loading} />
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
          <Text style={{ color: colors.textMuted, fontSize: 14 }}>task_type: {session?.task_type ?? taskType}</Text>
          <Text style={{ color: colors.textMuted, fontSize: 14 }}>question_count: {session?.questions.length ?? 0}</Text>
          <Text style={{ color: colors.textMuted, fontSize: 14 }}>retry_queue_count: {queueCount}</Text>
        </View>
      </InfoCard>

      <InfoCard>
        <Text style={{ color: colors.textMuted, fontSize: 12 }}>本地会话恢复</Text>
        <Text style={{ color: colors.textPrimary, fontSize: 14 }}>checkpoint_status: {checkpointStatus}</Text>
        <Text style={{ color: colors.textMuted, fontSize: 14 }}>
          restore_target: {session?.session_id ? `session ${session.session_id}` : "当前尚无本地听力 checkpoint"}
        </Text>
        <ButtonRow>
          <PrimaryButton label="加载播放状态" onPress={() => void loadPlayback()} disabled={loading || !session} />
          <SecondaryButton label="清空本地会话" onPress={() => void clearLocalCheckpoint()} disabled={loading || !checkpointReady} />
        </ButtonRow>
      </InfoCard>

      {session ? (
        <InfoCard>
          <Text style={{ color: colors.textMuted, fontSize: 12 }}>答题区</Text>
          <View style={{ gap: 14 }}>
            {session.questions.map((question) => (
              <View key={question.question_id} style={{ gap: 8 }}>
                <Text style={{ color: colors.textPrimary, fontSize: 14, fontWeight: "700", lineHeight: 22 }}>
                  {renderQuestionLabel(question)}
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
            <SecondaryButton
              label="加入重练队列"
              onPress={() => void addRetryQueue()}
              disabled={loading || !session.submission}
            />
          </ButtonRow>
        </InfoCard>
      ) : null}

      <InfoCard>
        <Text style={{ color: colors.textMuted, fontSize: 12 }}>播放状态</Text>
        <TextField
          label="播放倍速"
          value={playbackRate}
          onChangeText={setPlaybackRate}
          placeholder="1"
          keyboardType="decimal-pad"
        />
        <TextField
          label="句段索引"
          value={segmentIndex}
          onChangeText={setSegmentIndex}
          placeholder="0"
          keyboardType="number-pad"
        />
        <TextField
          label="播放位置（秒）"
          value={positionSeconds}
          onChangeText={setPositionSeconds}
          placeholder="0"
          keyboardType="decimal-pad"
        />
        <Pressable
          onPress={() => setReplayWrongOnly((current) => !current)}
          style={{
            borderRadius: radii.md,
            borderWidth: 1,
            borderColor: replayWrongOnly ? colors.cardAccentBorder : colors.cardBorder,
            backgroundColor: replayWrongOnly ? colors.cardAccent : colors.card,
            padding: spacing.md
          }}
        >
          <Text style={{ color: colors.textPrimary, fontSize: 14, fontWeight: "700" }}>
            {replayWrongOnly ? "仅重听错题: 开" : "仅重听错题: 关"}
          </Text>
        </Pressable>
        <ButtonRow>
          <PrimaryButton label="保存播放状态" onPress={() => void savePlayback()} disabled={loading || !session} />
          <SecondaryButton label="加载播放状态" onPress={() => void loadPlayback()} disabled={loading || !session} />
        </ButtonRow>
        <Text style={{ color: colors.textMuted, fontSize: 13 }}>
          last_replayed_question_id: {lastPlaybackSnapshot?.last_replayed_question_id ?? "-"}
        </Text>
        <Text style={{ color: colors.textMuted, fontSize: 13 }}>
          last_recovered_at: {lastPlaybackSnapshot?.last_recovered_at ?? "-"}
        </Text>
      </InfoCard>

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
                {item.dictation_feedback ? (
                  <Text style={{ color: colors.textMuted, fontSize: 13, lineHeight: 20 }}>
                    dictation: spelling {item.dictation_feedback.spelling_mismatches.length} · missing{" "}
                    {item.dictation_feedback.missing_chunks.length} · extra {item.dictation_feedback.extra_chunks.length}
                  </Text>
                ) : null}
              </View>
            ))}
          </View>
        </InfoCard>
      ) : null}

      {session?.submission?.dictation_summary ? (
        <InfoCard tone="accent">
          <Text style={{ color: colors.textMuted, fontSize: 12 }}>听写摘要</Text>
          <Text style={{ color: colors.textPrimary, fontSize: 14 }}>
            sentence_count: {session.submission.dictation_summary.total_sentences}
          </Text>
          <Text style={{ color: colors.textMuted, fontSize: 13, lineHeight: 20 }}>
            spelling_top:
            {session.submission.dictation_summary.high_frequency_spelling_errors.length
              ? ` ${session.submission.dictation_summary.high_frequency_spelling_errors
                  .map((item) => `${item.token}(${item.count})`)
                  .join(", ")}`
              : " -"}
          </Text>
          <Text style={{ color: colors.textMuted, fontSize: 13, lineHeight: 20 }}>
            chunk_top:
            {session.submission.dictation_summary.high_frequency_chunk_errors.length
              ? ` ${session.submission.dictation_summary.high_frequency_chunk_errors
                  .map((item) => `${item.chunk}(${item.count})`)
                  .join(", ")}`
              : " -"}
          </Text>
        </InfoCard>
      ) : null}

      <ButtonRow>
        <PrimaryButton label="查看学习计划" onPress={() => router.push("/plan")} disabled={loading} />
        <SecondaryButton label="查看学习进度" onPress={() => router.push("/progress")} disabled={loading} />
      </ButtonRow>
    </AppScreen>
  );
}
