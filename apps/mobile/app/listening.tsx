import { router } from "expo-router";
import { useState } from "react";
import { Pressable, Text, View } from "react-native";
import type { PlaybackStateResponse, PracticeSessionResponse } from "../src/lib/api-types";
import { useAppSession } from "../src/state/app-session";
import { AppScreen, ButtonRow, InfoCard, PrimaryButton, SecondaryButton, StatusPill, TextField } from "../src/ui/primitives";
import { colors, radii, spacing } from "../src/ui/theme";

type ListeningTaskType = "core_training" | "dictation";

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
  const [taskType, setTaskType] = useState<ListeningTaskType>("core_training");
  const [session, setSession] = useState<PracticeSessionResponse | null>(null);
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [statusMessage, setStatusMessage] = useState("未开始");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [playbackRate, setPlaybackRate] = useState("1");
  const [segmentIndex, setSegmentIndex] = useState("0");
  const [positionSeconds, setPositionSeconds] = useState("0");
  const [replayWrongOnly, setReplayWrongOnly] = useState(false);
  const [queueCount, setQueueCount] = useState(0);
  const [lastPlaybackSnapshot, setLastPlaybackSnapshot] = useState<PlaybackStateResponse | null>(null);

  if (!authSession) {
    router.replace("/login");
    return null;
  }

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
