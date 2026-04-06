import { Redirect, useLocalSearchParams, router } from "expo-router";
import { useEffect, useEffectEvent, useRef, useState } from "react";
import { Text, View } from "react-native";
import { ApiNetworkError, ApiRequestError } from "../src/lib/api-client";
import type { DiagnosticQuestionsResponse } from "../src/lib/api-types";
import { useAppForegroundEffect } from "../src/hooks/use-app-foreground-effect";
import { resolveLearningRouteForPlanTask, selectNextActionablePlanTask } from "../src/lib/learning-routes";
import { buildScopedStorageKey, clearStoredJson, loadStoredJson, saveStoredJson } from "../src/lib/storage";
import { useAppSession } from "../src/state/app-session";
import { useStudyLoop } from "../src/state/study-loop";
import { AppScreen, ButtonRow, InfoCard, PrimaryButton, SecondaryButton, StatusPill, TextField } from "../src/ui/primitives";
import { StudyLoopNextStepCard } from "../src/ui/study-loop-next-step-card";
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

type DiagnosticRetryAction = "load_questions" | "submit_answer" | "pause" | "resume" | "complete";

const formatDiagnosticRetryActionLabel = (value: DiagnosticRetryAction): string => {
  switch (value) {
    case "load_questions":
      return "拉取题目";
    case "submit_answer":
      return "提交答案";
    case "pause":
      return "暂停诊断";
    case "resume":
      return "恢复诊断";
    case "complete":
      return "完成诊断";
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

export default function DiagnosticScreen() {
  const params = useLocalSearchParams<{ assessmentId?: string | string[] }>();
  const { session, runWithAuthorizedClient } = useAppSession();
  const { recordActivity } = useStudyLoop();
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
  const [serverSyncStatus, setServerSyncStatus] = useState("尚未同步");
  const [serverSyncDetail, setServerSyncDetail] = useState("-");
  const [serverSyncAt, setServerSyncAt] = useState<string | null>(null);
  const [lastFailedAction, setLastFailedAction] = useState<DiagnosticRetryAction | null>(null);
  const [completionTaskAction, setCompletionTaskAction] = useState<{
    route: string;
    actionLabel: string;
    taskTitle: string;
  } | null>(null);
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
    setServerSyncStatus("尚未同步");
    setServerSyncDetail("-");
    setServerSyncAt(null);
    setLastFailedAction(null);
    setCompletionTaskAction(null);
    setError(null);
  };

  const markSyncSuccess = (statusText: string, detail: string): void => {
    setServerSyncStatus(statusText);
    setServerSyncDetail(detail);
    setServerSyncAt(new Date().toISOString());
    setLastFailedAction(null);
  };

  const markSyncFailure = (action: DiagnosticRetryAction, detail: string): void => {
    setServerSyncStatus(`${formatDiagnosticRetryActionLabel(action)}失败`);
    setServerSyncDetail(detail);
    setServerSyncAt(new Date().toISOString());
    setLastFailedAction(action);
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

  const resolveAssessmentId = (value = assessmentId): string | null => {
    const trimmedValue = value.trim();
    if (!trimmedValue) {
      setError("请先填写 assessment_id");
      return null;
    }

    return trimmedValue;
  };

  const loadQuestions = async (nextAssessmentId = assessmentId.trim()): Promise<void> => {
    const resolvedAssessmentId = resolveAssessmentId(nextAssessmentId);
    if (!resolvedAssessmentId) {
      return;
    }

    setLoading(true);
    try {
      setServerSyncStatus("正在拉取题目");
      setServerSyncDetail(`assessment ${resolvedAssessmentId}`);
      const response = await runWithAuthorizedClient((apiClient, accessToken) =>
        apiClient.fetchDiagnosticQuestions(accessToken, resolvedAssessmentId)
      );
      const currentQuestion = pickCurrentQuestion(response);
      setAssessmentId(resolvedAssessmentId);
      setStatus(response.status);
      setElapsedSeconds(response.elapsed_seconds);
      setQuestionId(currentQuestion?.question_id ?? "");
      setQuestionPrompt(currentQuestion?.prompt ?? "当前没有可展示题目");
      setProgressText(`${response.answered_count}/${response.total_questions}`);
      markSyncSuccess(
        "题目已同步",
        `assessment ${response.assessment_id} / status ${response.status} / progress ${response.answered_count}/${response.total_questions}`
      );
      setError(null);
    } catch (loadError) {
      const message = toRequestErrorMessage(loadError, "加载题目失败");
      markSyncFailure("load_questions", message);
      setError(message);
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
      setServerSyncStatus("正在提交答案");
      setServerSyncDetail(`question ${questionId.trim()}`);
      const response = await runWithAuthorizedClient((apiClient, accessToken) =>
        apiClient.submitDiagnosticAnswer(accessToken, assessmentId.trim(), questionId.trim(), answer)
      );
      setStatus(response.status);
      setProgressText(`${response.answered_count}/${response.total_questions}`);
      setAnswer("");
      markSyncSuccess(
        "答案已提交",
        `assessment ${response.assessment_id} / progress ${response.answered_count}/${response.total_questions}`
      );
      setError(null);
      await loadQuestions(assessmentId.trim());
    } catch (submitError) {
      const message = toRequestErrorMessage(submitError, "提交答案失败");
      markSyncFailure("submit_answer", message);
      setError(message);
    } finally {
      setLoading(false);
    }
  };

  const pause = async (): Promise<void> => {
    const resolvedAssessmentId = resolveAssessmentId();
    if (!resolvedAssessmentId) {
      return;
    }

    setLoading(true);
    try {
      setServerSyncStatus("正在暂停诊断");
      setServerSyncDetail(`assessment ${resolvedAssessmentId}`);
      const response = await runWithAuthorizedClient((apiClient, accessToken) =>
        apiClient.pauseDiagnostic(accessToken, resolvedAssessmentId)
      );
      setStatus(response.status);
      setElapsedSeconds(response.elapsed_seconds);
      markSyncSuccess("暂停状态已同步", `status ${response.status} / elapsed ${response.elapsed_seconds}s`);
      setError(null);
    } catch (pauseError) {
      const message = toRequestErrorMessage(pauseError, "暂停失败");
      markSyncFailure("pause", message);
      setError(message);
    } finally {
      setLoading(false);
    }
  };

  const resume = async (): Promise<void> => {
    const resolvedAssessmentId = resolveAssessmentId();
    if (!resolvedAssessmentId) {
      return;
    }

    setLoading(true);
    try {
      setServerSyncStatus("正在恢复诊断");
      setServerSyncDetail(`assessment ${resolvedAssessmentId}`);
      const response = await runWithAuthorizedClient((apiClient, accessToken) =>
        apiClient.resumeDiagnostic(accessToken, resolvedAssessmentId)
      );
      setStatus(response.status);
      setElapsedSeconds(response.elapsed_seconds);
      markSyncSuccess("恢复状态已同步", `status ${response.status} / elapsed ${response.elapsed_seconds}s`);
      setError(null);
      await loadQuestions(resolvedAssessmentId);
    } catch (resumeError) {
      const message = toRequestErrorMessage(resumeError, "恢复失败");
      markSyncFailure("resume", message);
      setError(message);
    } finally {
      setLoading(false);
    }
  };

  const complete = async (): Promise<void> => {
    const resolvedAssessmentId = resolveAssessmentId();
    if (!resolvedAssessmentId) {
      return;
    }

    setLoading(true);
    try {
      setServerSyncStatus("正在完成诊断");
      setServerSyncDetail(`assessment ${resolvedAssessmentId}`);
      const response = await runWithAuthorizedClient((apiClient, accessToken) =>
        apiClient.completeDiagnostic(accessToken, resolvedAssessmentId)
      );
      setStatus(response.status);
      setElapsedSeconds(response.elapsed_seconds);
      setPlanId(response.plan_id);
      setSkillBandText(
        `L${response.skill_bands.listening}/S${response.skill_bands.speaking}/R${response.skill_bands.reading}/W${response.skill_bands.writing}`
      );
      recordActivity({
        dedupeKey: `diagnostic:${response.assessment_id}`,
        skill: "diagnostic",
        source: "diagnostic_completion",
        title: "首次诊断已完成",
        summary: `诊断生成计划 ${response.plan_id}，L${response.skill_bands.listening}/S${response.skill_bands.speaking}/R${response.skill_bands.reading}/W${response.skill_bands.writing}`,
        route: "/plan",
        planPending: true,
        progressPending: false
      });
      const nextTaskAction = await runWithAuthorizedClient(async (apiClient, accessToken) => {
        try {
          const activePlan = await apiClient.fetchActivePlan(accessToken);
          if (activePlan.plan_id !== response.plan_id) {
            return null;
          }

          const nextTask = selectNextActionablePlanTask(activePlan);
          const learningRoute = resolveLearningRouteForPlanTask(nextTask);
          if (!nextTask || !learningRoute) {
            return null;
          }

          return {
            route: learningRoute.route,
            actionLabel: learningRoute.actionLabel,
            taskTitle: nextTask.title
          };
        } catch {
          return null;
        }
      });
      setCompletionTaskAction(nextTaskAction);
      markSyncSuccess(
        "诊断已完成",
        `plan ${response.plan_id} / bands L${response.skill_bands.listening}/S${response.skill_bands.speaking}/R${response.skill_bands.reading}/W${response.skill_bands.writing}`
      );
      setError(null);
    } catch (completeError) {
      const message = toRequestErrorMessage(completeError, "完成诊断失败");
      markSyncFailure("complete", message);
      setError(message);
    } finally {
      setLoading(false);
    }
  };

  const retryLastFailedAction = async (): Promise<void> => {
    switch (lastFailedAction) {
      case "load_questions":
        await loadQuestions();
        break;
      case "submit_answer":
        await submitAnswer();
        break;
      case "pause":
        await pause();
        break;
      case "resume":
        await resume();
        break;
      case "complete":
        await complete();
        break;
      default:
        break;
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
        testID="diagnostic.assessmentId"
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

      <InfoCard tone={lastFailedAction ? "accent" : "default"}>
        <Text style={{ color: colors.textMuted, fontSize: 12 }}>服务端同步</Text>
        <ButtonRow>
          <StatusPill
            label={serverSyncStatus}
            tone={lastFailedAction ? "accent" : serverSyncAt ? "success" : "neutral"}
          />
          <StatusPill
            label={lastFailedAction ? `待重试 ${formatDiagnosticRetryActionLabel(lastFailedAction)}` : "链路已就绪"}
            tone={lastFailedAction ? "accent" : serverSyncAt ? "success" : "neutral"}
          />
        </ButtonRow>
        <Text style={{ color: colors.textPrimary, fontSize: 14 }}>server_sync_status: {serverSyncStatus}</Text>
        <Text style={{ color: colors.textMuted, fontSize: 14 }}>server_sync_at: {formatIsoDateTime(serverSyncAt)}</Text>
        <Text style={{ color: colors.textMuted, fontSize: 14, lineHeight: 20 }}>server_sync_result: {serverSyncDetail}</Text>
        {lastFailedAction ? (
          <ButtonRow>
            <PrimaryButton
              label="重试上次失败操作"
              onPress={() => void retryLastFailedAction()}
              disabled={loading}
              testID="diagnostic.retryLastFailedAction"
            />
          </ButtonRow>
        ) : null}
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
        <PrimaryButton
          label={loading ? "处理中..." : "加载题目"}
          onPress={() => void loadQuestions()}
          disabled={loading}
          testID="diagnostic.loadQuestions"
        />
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

      <StudyLoopNextStepCard
        visible={Boolean(planId)}
        currentRoute="/diagnostic"
        secondaryRoute="/home"
        secondaryLabel="返回首页"
        testIDPrefix="diagnostic.studyLoopNext"
      />

      {completionTaskAction ? (
        <>
          <ButtonRow>
            <PrimaryButton
              label={completionTaskAction.actionLabel}
              onPress={() => router.push(completionTaskAction.route)}
              testID="diagnostic.nextLearningAction"
            />
            <SecondaryButton label="去看进度" onPress={() => router.push("/progress")} />
          </ButtonRow>

          <Text style={{ color: colors.textMuted, fontSize: 13, lineHeight: 20 }}>
            next_task: {completionTaskAction.taskTitle}
          </Text>
        </>
      ) : null}

      <ButtonRow>
        <PrimaryButton label="返回首页" onPress={() => router.replace("/home")} />
        <SecondaryButton label="回到目标页" onPress={() => router.push("/onboarding")} />
      </ButtonRow>
    </AppScreen>
  );
}
