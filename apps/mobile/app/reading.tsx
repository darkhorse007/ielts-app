import { Redirect, router } from "expo-router";
import { useState } from "react";
import { Pressable, Text, View } from "react-native";
import type { PracticeSessionResponse } from "../src/lib/api-types";
import { useAppSession } from "../src/state/app-session";
import { AppScreen, ButtonRow, InfoCard, PrimaryButton, SecondaryButton, StatusPill, TextField } from "../src/ui/primitives";
import { colors, radii, spacing } from "../src/ui/theme";

type ReadingMode = "training" | "exam";

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

export default function ReadingScreen() {
  const { session: authSession, runWithAuthorizedClient } = useAppSession();
  const [trainingMode, setTrainingMode] = useState<ReadingMode>("training");
  const [timeLimitSeconds, setTimeLimitSeconds] = useState("1200");
  const [session, setSession] = useState<PracticeSessionResponse | null>(null);
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [statusMessage, setStatusMessage] = useState("未开始");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [timerText, setTimerText] = useState("-");
  const [timerRecovered, setTimerRecovered] = useState(false);
  const [evidenceCount, setEvidenceCount] = useState(0);

  if (!authSession) {
    return <Redirect href="/login" />;
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
      setStatusMessage(`已创建阅读训练，题量 ${response.questions.length}`);
      setError(null);
    } catch (createError) {
      setError(createError instanceof Error ? createError.message : "创建阅读训练失败");
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
      const response = await runWithAuthorizedClient((apiClient, accessToken) =>
        apiClient.switchReadingMode(accessToken, session.session_id, {
          training_mode: trainingMode,
          time_limit_seconds: asNumber(timeLimitSeconds, 1200)
        })
      );

      setSession(response);
      setTimerText(formatTimer(response.timer));
      setTimerRecovered(response.recovered);
      setStatusMessage(response.recovered ? "模式切换成功，计时器已恢复" : `已切换到${trainingMode === "exam" ? "考试" : "训练"}模式`);
      setError(null);
    } catch (switchError) {
      setError(switchError instanceof Error ? switchError.message : "切换阅读模式失败");
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
      const result = await runWithAuthorizedClient((apiClient, accessToken) =>
        apiClient.getReadingTimer(accessToken, session.session_id)
      );

      setTimerText(formatTimer(result.timer));
      setTimerRecovered(result.recovered);
      setStatusMessage(result.recovered ? "计时器状态已恢复" : "已拉取计时器状态");
      setError(null);
    } catch (timerError) {
      setError(timerError instanceof Error ? timerError.message : "拉取计时器失败");
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
      const result = await runWithAuthorizedClient((apiClient, accessToken) =>
        apiClient.pauseReadingTimer(accessToken, session.session_id)
      );

      setTimerText(formatTimer(result.timer));
      setTimerRecovered(false);
      setStatusMessage("计时已暂停");
      setError(null);
    } catch (timerError) {
      setError(timerError instanceof Error ? timerError.message : "暂停计时失败");
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
      const result = await runWithAuthorizedClient((apiClient, accessToken) =>
        apiClient.resumeReadingTimer(accessToken, session.session_id)
      );

      setTimerText(formatTimer(result.timer));
      setTimerRecovered(false);
      setStatusMessage("计时已恢复");
      setError(null);
    } catch (timerError) {
      setError(timerError instanceof Error ? timerError.message : "恢复计时失败");
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
      const result = await runWithAuthorizedClient((apiClient, accessToken) =>
        apiClient.recoverReadingTimer(accessToken, session.session_id)
      );

      setTimerText(formatTimer(result.timer));
      setTimerRecovered(result.recovered);
      setStatusMessage(result.recovered ? "计时器恢复完成" : "计时器无需恢复");
      setError(null);
    } catch (timerError) {
      setError(timerError instanceof Error ? timerError.message : "恢复异常计时失败");
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
      setStatusMessage(
        `提交完成，正确 ${response.submission?.score_breakdown.correct_count ?? 0}/${response.submission?.score_breakdown.total_questions ?? 0}`
      );
      setError(null);
    } catch (submitError) {
      setError(submitError instanceof Error ? submitError.message : "提交阅读答案失败");
    } finally {
      setLoading(false);
    }
  };

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

      <ButtonRow>
        <PrimaryButton label="查看学习计划" onPress={() => router.push("/plan")} disabled={loading} />
        <SecondaryButton label="查看学习进度" onPress={() => router.push("/progress")} disabled={loading} />
      </ButtonRow>
    </AppScreen>
  );
}
