import { Redirect, useLocalSearchParams, router } from "expo-router";
import { useEffect, useEffectEvent, useRef, useState } from "react";
import { Text, View } from "react-native";
import type { DiagnosticQuestionsResponse } from "../src/lib/api-types";
import { useAppForegroundEffect } from "../src/hooks/use-app-foreground-effect";
import { buildScopedStorageKey, clearStoredJson, loadStoredJson, saveStoredJson } from "../src/lib/storage";
import { useAppSession } from "../src/state/app-session";
import { AppScreen, ButtonRow, InfoCard, PrimaryButton, SecondaryButton, TextField } from "../src/ui/primitives";
import { colors } from "../src/ui/theme";

const pickCurrentQuestion = (response: DiagnosticQuestionsResponse) =>
  response.questions[response.current_question_index] ?? response.questions[0] ?? null;

type DiagnosticSnapshot = {
  version: 1;
  assessmentId: string;
  questionId: string;
  questionPrompt: string;
  answer: string;
  status: string;
  elapsedSeconds: number;
  progressText: string;
  skillBandText: string;
  planId: string | null;
  updatedAt: string;
};

const isDefaultDiagnosticSnapshot = (snapshot: DiagnosticSnapshot): boolean =>
  snapshot.assessmentId === "" &&
  snapshot.questionId === "" &&
  snapshot.questionPrompt === "尚未加载题目" &&
  snapshot.answer === "" &&
  snapshot.status === "未开始" &&
  snapshot.elapsedSeconds === 0 &&
  snapshot.progressText === "-" &&
  snapshot.skillBandText === "-" &&
  snapshot.planId === null;

const formatCheckpointTime = (value: string): string =>
  new Date(value).toLocaleTimeString("zh-CN", {
    hour12: false
  });

export default function DiagnosticScreen() {
  const params = useLocalSearchParams<{ assessmentId?: string | string[] }>();
  const { session, runWithAuthorizedClient } = useAppSession();
  const snapshotSaveTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const skipNextSnapshotPersistRef = useRef(false);
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
  const [checkpointStatus, setCheckpointStatus] = useState("本地中间态未恢复");
  const [checkpointReady, setCheckpointReady] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  if (!session) {
    return <Redirect href="/login" />;
  }

  const snapshotStorageKey = buildScopedStorageKey("diagnostic", "draft", "v1", session.userId);

  const resetSnapshotState = (): void => {
    setAssessmentId(initialAssessmentId ?? "");
    setQuestionId("");
    setQuestionPrompt("尚未加载题目");
    setAnswer("");
    setStatus("未开始");
    setElapsedSeconds(0);
    setProgressText("-");
    setSkillBandText("-");
    setPlanId(null);
    setError(null);
  };

  const persistSnapshot = useEffectEvent(async (snapshot: DiagnosticSnapshot) => {
    if (isDefaultDiagnosticSnapshot(snapshot)) {
      await clearStoredJson(snapshotStorageKey);
      setCheckpointStatus("已启用自动保存");
      return;
    }

    await saveStoredJson(snapshotStorageKey, snapshot);
    setCheckpointStatus(`已自动保存 ${formatCheckpointTime(snapshot.updatedAt)}`);
  });

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
    let cancelled = false;

    resetSnapshotState();
    setCheckpointReady(false);
    setCheckpointStatus("正在恢复本地中间态...");
    if (snapshotSaveTimeoutRef.current) {
      clearTimeout(snapshotSaveTimeoutRef.current);
      snapshotSaveTimeoutRef.current = null;
    }

    void (async () => {
      if (initialAssessmentId) {
        skipNextSnapshotPersistRef.current = true;
        setCheckpointStatus("assessment_id 由路由参数接管");
        setCheckpointReady(true);
        return;
      }

      const snapshot = await loadStoredJson<DiagnosticSnapshot>(snapshotStorageKey);
      if (cancelled) {
        return;
      }

      if (snapshot?.version === 1) {
        setAssessmentId(snapshot.assessmentId);
        setQuestionId(snapshot.questionId);
        setQuestionPrompt(snapshot.questionPrompt);
        setAnswer(snapshot.answer);
        setStatus(snapshot.status);
        setElapsedSeconds(snapshot.elapsedSeconds);
        setProgressText(snapshot.progressText);
        setSkillBandText(snapshot.skillBandText);
        setPlanId(snapshot.planId);
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
  }, [initialAssessmentId, snapshotStorageKey]);

  useEffect(() => {
    if (initialAssessmentId) {
      void loadQuestions(initialAssessmentId);
    }
  }, [initialAssessmentId]);

  useEffect(() => {
    if (!checkpointReady) {
      return;
    }

    if (skipNextSnapshotPersistRef.current) {
      skipNextSnapshotPersistRef.current = false;
      return;
    }

    const snapshot: DiagnosticSnapshot = {
      version: 1,
      assessmentId,
      questionId,
      questionPrompt,
      answer,
      status,
      elapsedSeconds,
      progressText,
      skillBandText,
      planId,
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
    answer,
    assessmentId,
    checkpointReady,
    elapsedSeconds,
    persistSnapshot,
    planId,
    progressText,
    questionId,
    questionPrompt,
    skillBandText,
    status
  ]);

  useAppForegroundEffect(
    async () => {
      if (loading || !assessmentId.trim()) {
        return;
      }
      await loadQuestions(assessmentId.trim());
    },
    {
      enabled: Boolean(assessmentId.trim())
    }
  );

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

  const clearLocalCheckpoint = async (): Promise<void> => {
    if (snapshotSaveTimeoutRef.current) {
      clearTimeout(snapshotSaveTimeoutRef.current);
      snapshotSaveTimeoutRef.current = null;
    }

    await clearStoredJson(snapshotStorageKey);
    skipNextSnapshotPersistRef.current = true;
    resetSnapshotState();
    setCheckpointReady(true);
    setCheckpointStatus("本地中间态已清空");
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

      <InfoCard>
        <Text style={{ color: colors.textMuted, fontSize: 12 }}>本地中间态恢复</Text>
        <Text style={{ color: colors.textPrimary, fontSize: 14 }}>checkpoint_status: {checkpointStatus}</Text>
        <Text style={{ color: colors.textMuted, fontSize: 14 }}>
          restore_target: {assessmentId.trim() ? `assessment ${assessmentId.trim()}` : "当前尚无本地 diagnostic checkpoint"}
        </Text>
        <ButtonRow>
          <PrimaryButton label="加载题目" onPress={() => void loadQuestions()} disabled={loading} />
          <SecondaryButton label="清空本地中间态" onPress={() => void clearLocalCheckpoint()} disabled={loading || !checkpointReady} />
        </ButtonRow>
      </InfoCard>

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
