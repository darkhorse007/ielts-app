import { useLocalSearchParams, router } from "expo-router";
import { useEffect, useState } from "react";
import { Text, View } from "react-native";
import type { DiagnosticQuestionsResponse } from "../src/lib/api-types";
import { useAppSession } from "../src/state/app-session";
import { AppScreen, ButtonRow, InfoCard, PrimaryButton, SecondaryButton, TextField } from "../src/ui/primitives";
import { colors } from "../src/ui/theme";

const pickCurrentQuestion = (response: DiagnosticQuestionsResponse) =>
  response.questions[response.current_question_index] ?? response.questions[0] ?? null;

export default function DiagnosticScreen() {
  const params = useLocalSearchParams<{ assessmentId?: string | string[] }>();
  const { session, runWithAuthorizedClient } = useAppSession();
  const initialAssessmentId = Array.isArray(params.assessmentId) ? params.assessmentId[0] : params.assessmentId;
  const [assessmentId, setAssessmentId] = useState(initialAssessmentId ?? "");
  const [questionId, setQuestionId] = useState("");
  const [questionPrompt, setQuestionPrompt] = useState("尚未加载题目");
  const [answer, setAnswer] = useState("");
  const [status, setStatus] = useState("未开始");
  const [elapsedSeconds, setElapsedSeconds] = useState(0);
  const [progressText, setProgressText] = useState("-");
  const [skillBandText, setSkillBandText] = useState("-");
  const [planId, setPlanId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  if (!session) {
    router.replace("/login");
    return null;
  }

  const loadQuestions = async (nextAssessmentId = assessmentId.trim()): Promise<void> => {
    if (!nextAssessmentId) {
      setError("请先填写 assessment_id");
      return;
    }

    setLoading(true);
    try {
      const response = await runWithAuthorizedClient((apiClient, accessToken) =>
        apiClient.fetchDiagnosticQuestions(accessToken, nextAssessmentId)
      );
      const currentQuestion = pickCurrentQuestion(response);
      setAssessmentId(nextAssessmentId);
      setStatus(response.status);
      setElapsedSeconds(response.elapsed_seconds);
      setQuestionId(currentQuestion?.question_id ?? "");
      setQuestionPrompt(currentQuestion?.prompt ?? "当前没有可展示题目");
      setProgressText(`${response.answered_count}/${response.total_questions}`);
      setError(null);
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "加载题目失败");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (initialAssessmentId) {
      void loadQuestions(initialAssessmentId);
    }
  }, [initialAssessmentId]);

  const submitAnswer = async (): Promise<void> => {
    if (!assessmentId.trim() || !questionId.trim()) {
      setError("请先加载题目");
      return;
    }

    setLoading(true);
    try {
      const response = await runWithAuthorizedClient((apiClient, accessToken) =>
        apiClient.submitDiagnosticAnswer(accessToken, assessmentId.trim(), questionId.trim(), answer)
      );
      setStatus(response.status);
      setAnswer("");
      setError(null);
      await loadQuestions(assessmentId.trim());
    } catch (submitError) {
      setError(submitError instanceof Error ? submitError.message : "提交答案失败");
    } finally {
      setLoading(false);
    }
  };

  const pause = async (): Promise<void> => {
    setLoading(true);
    try {
      const response = await runWithAuthorizedClient((apiClient, accessToken) =>
        apiClient.pauseDiagnostic(accessToken, assessmentId.trim())
      );
      setStatus(response.status);
      setElapsedSeconds(response.elapsed_seconds);
      setError(null);
    } catch (pauseError) {
      setError(pauseError instanceof Error ? pauseError.message : "暂停失败");
    } finally {
      setLoading(false);
    }
  };

  const resume = async (): Promise<void> => {
    setLoading(true);
    try {
      const response = await runWithAuthorizedClient((apiClient, accessToken) =>
        apiClient.resumeDiagnostic(accessToken, assessmentId.trim())
      );
      setStatus(response.status);
      setElapsedSeconds(response.elapsed_seconds);
      setError(null);
      await loadQuestions(assessmentId.trim());
    } catch (resumeError) {
      setError(resumeError instanceof Error ? resumeError.message : "恢复失败");
    } finally {
      setLoading(false);
    }
  };

  const complete = async (): Promise<void> => {
    setLoading(true);
    try {
      const response = await runWithAuthorizedClient((apiClient, accessToken) =>
        apiClient.completeDiagnostic(accessToken, assessmentId.trim())
      );
      setStatus(response.status);
      setElapsedSeconds(response.elapsed_seconds);
      setPlanId(response.plan_id);
      setSkillBandText(
        `L${response.skill_bands.listening}/S${response.skill_bands.speaking}/R${response.skill_bands.reading}/W${response.skill_bands.writing}`
      );
      setError(null);
    } catch (completeError) {
      setError(completeError instanceof Error ? completeError.message : "完成诊断失败");
    } finally {
      setLoading(false);
    }
  };

  return (
    <AppScreen
      eyebrow="Diagnostic"
      title="首次诊断已经进入移动端"
      subtitle="这里直接复用当前服务端的 questions / answers / pause / resume / complete 契约。你可以从入门目标页带 assessment_id 进来，也可以手工填写。"
    >
      <TextField
        label="assessment_id"
        value={assessmentId}
        onChangeText={setAssessmentId}
        placeholder="先提交目标后获得"
        autoCapitalize="none"
        autoCorrect={false}
      />

      <InfoCard tone="accent">
        <Text style={{ color: colors.textMuted, fontSize: 12 }}>当前题目</Text>
        <Text style={{ color: colors.textPrimary, fontSize: 15, fontWeight: "700" }}>
          question_id: {questionId || "-"}
        </Text>
        <Text style={{ color: colors.textSecondary, fontSize: 14, lineHeight: 22 }}>{questionPrompt}</Text>
      </InfoCard>

      <TextField
        label="回答"
        value={answer}
        onChangeText={setAnswer}
        placeholder="输入本题回答"
        multiline
        numberOfLines={5}
        textAlignVertical="top"
      />

      {error ? <Text style={{ color: colors.danger, fontSize: 14, lineHeight: 20 }}>{error}</Text> : null}

      <ButtonRow>
        <PrimaryButton label={loading ? "处理中..." : "加载题目"} onPress={() => void loadQuestions()} disabled={loading} />
        <SecondaryButton label="提交答案" onPress={() => void submitAnswer()} disabled={loading} />
      </ButtonRow>

      <ButtonRow>
        <SecondaryButton label="暂停" onPress={() => void pause()} disabled={loading} />
        <SecondaryButton label="恢复" onPress={() => void resume()} disabled={loading} />
        <PrimaryButton label="完成诊断" onPress={() => void complete()} disabled={loading} />
      </ButtonRow>

      <InfoCard>
        <Text style={{ color: colors.textMuted, fontSize: 12 }}>运行状态</Text>
        <View style={{ gap: 8 }}>
          <Text style={{ color: colors.textPrimary, fontSize: 14 }}>status: {status}</Text>
          <Text style={{ color: colors.textMuted, fontSize: 14 }}>elapsed_seconds: {elapsedSeconds}</Text>
          <Text style={{ color: colors.textMuted, fontSize: 14 }}>progress: {progressText}</Text>
          <Text style={{ color: colors.textMuted, fontSize: 14 }}>skill_bands: {skillBandText}</Text>
          <Text style={{ color: colors.textMuted, fontSize: 14 }}>plan_id: {planId ?? "-"}</Text>
        </View>
      </InfoCard>

      <ButtonRow>
        <PrimaryButton label="查看计划" onPress={() => router.push("/plan")} />
        <SecondaryButton label="去看进度" onPress={() => router.push("/progress")} />
      </ButtonRow>

      <ButtonRow>
        <PrimaryButton label="返回首页" onPress={() => router.replace("/home")} />
        <SecondaryButton label="回到目标页" onPress={() => router.push("/onboarding")} />
      </ButtonRow>
    </AppScreen>
  );
}
