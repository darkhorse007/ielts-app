import { Redirect, router } from "expo-router";
import { Pressable, Text, View } from "react-native";
import { useEffect, useEffectEvent, useRef, useState } from "react";
import { ApiNetworkError, ApiRequestError } from "../src/lib/api-client";
import type { WritingArchiveResponse, WritingEvaluationResponse, WritingTemplateListResponse } from "../src/lib/api-types";
import { buildScopedStorageKey, clearStoredJson, loadStoredJson, saveStoredJson } from "../src/lib/storage";
import { useAppSession } from "../src/state/app-session";
import { useStudyLoop } from "../src/state/study-loop";
import { AppScreen, ButtonRow, InfoCard, PrimaryButton, SecondaryButton, StatusPill, TextField } from "../src/ui/primitives";
import { StudyLoopNextStepCard } from "../src/ui/study-loop-next-step-card";
import { colors, radii, spacing } from "../src/ui/theme";

type WritingTaskType = "task1" | "task2";
type TemplateInsertionMode = "append" | "prepend";
type WritingComparisonDelta = {
  tr: number;
  cc: number;
  lr: number;
  gra: number;
  overall: number;
};
type WritingDraftSnapshot = {
  version: 1;
  taskType: WritingTaskType;
  prompt: string;
  essay: string;
  rewriteEssay: string;
  evaluationId: string;
  comparisonDelta: WritingComparisonDelta | null;
  selectedTemplateId: string;
  templateInsertionMode: TemplateInsertionMode;
  templatePreservedOriginal: boolean;
  templateAdoptionText: string;
  updatedAt: string;
};

const defaultTaskType: WritingTaskType = "task2";
const defaultPrompt = "Some people think students should learn practical skills at school.";
const defaultEssay =
  "I strongly agree with this statement because practical skills can help students adapt to real life more effectively. For example, communication and collaboration are essential in both study and work.";
const defaultRewriteEssay =
  "I strongly agree that practical skills should be integrated into school courses because they directly improve students' readiness for work and life.";
const defaultDraftStatus = "本地草稿未恢复";

const isDefaultDraftSnapshot = (snapshot: WritingDraftSnapshot): boolean =>
  snapshot.taskType === defaultTaskType &&
  snapshot.prompt === defaultPrompt &&
  snapshot.essay === defaultEssay &&
  snapshot.rewriteEssay === defaultRewriteEssay &&
  snapshot.evaluationId === "" &&
  snapshot.comparisonDelta === null &&
  snapshot.selectedTemplateId === "" &&
  snapshot.templateInsertionMode === "append" &&
  snapshot.templatePreservedOriginal === false &&
  snapshot.templateAdoptionText === "-";

const taskOptions: Array<{
  value: WritingTaskType;
  label: string;
  description: string;
}> = [
  {
    value: "task1",
    label: "Task 1",
    description: "适用于图表、流程或信息概述类写作"
  },
  {
    value: "task2",
    label: "Task 2",
    description: "适用于议论文、观点题和双边讨论"
  }
];

const insertionModeOptions: Array<{
  value: TemplateInsertionMode;
  label: string;
  description: string;
}> = [
  {
    value: "append",
    label: "追加",
    description: "把模板框架追加到当前作文后面"
  },
  {
    value: "prepend",
    label: "前置",
    description: "把模板框架插在当前作文前面"
  }
];

const formatScores = (evaluation: WritingEvaluationResponse | null): string =>
  evaluation
    ? `TR${evaluation.scores.tr} / CC${evaluation.scores.cc} / LR${evaluation.scores.lr} / GRA${evaluation.scores.gra}`
    : "-";

const formatComparison = (value: {
  tr: number;
  cc: number;
  lr: number;
  gra: number;
  overall: number;
} | null): string =>
  value ? `ΔTR${value.tr} ΔCC${value.cc} ΔLR${value.lr} ΔGRA${value.gra} ΔOverall${value.overall}` : "-";

const formatDraftTime = (value: string): string =>
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

type WritingRetryAction =
  | "evaluate"
  | "reload"
  | "rewrite"
  | "load_archives"
  | "load_templates"
  | "insert_template"
  | "load_template_adoption";

const formatWritingRetryActionLabel = (value: WritingRetryAction): string => {
  switch (value) {
    case "evaluate":
      return "写作批改";
    case "reload":
      return "加载评估";
    case "rewrite":
      return "改写复评";
    case "load_archives":
      return "加载档案";
    case "load_templates":
      return "加载模板";
    case "insert_template":
      return "插入模板";
    case "load_template_adoption":
      return "加载采纳率";
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

export default function WritingScreen() {
  const { session: authSession, runWithAuthorizedClient } = useAppSession();
  const { recordActivity } = useStudyLoop();
  const draftSaveTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const skipNextDraftPersistRef = useRef(false);
  const [taskType, setTaskType] = useState<WritingTaskType>(defaultTaskType);
  const [prompt, setPrompt] = useState(defaultPrompt);
  const [essay, setEssay] = useState(defaultEssay);
  const [evaluation, setEvaluation] = useState<WritingEvaluationResponse | null>(null);
  const [evaluationId, setEvaluationId] = useState("");
  const [rewriteEssay, setRewriteEssay] = useState(defaultRewriteEssay);
  const [comparisonDelta, setComparisonDelta] = useState<WritingComparisonDelta | null>(null);
  const [archives, setArchives] = useState<WritingArchiveResponse["items"]>([]);
  const [templates, setTemplates] = useState<WritingTemplateListResponse["items"]>([]);
  const [selectedTemplateId, setSelectedTemplateId] = useState("");
  const [templateInsertionMode, setTemplateInsertionMode] = useState<TemplateInsertionMode>("append");
  const [templatePreservedOriginal, setTemplatePreservedOriginal] = useState(false);
  const [templateAdoptionText, setTemplateAdoptionText] = useState("-");
  const [statusMessage, setStatusMessage] = useState("未开始");
  const [draftStatus, setDraftStatus] = useState(defaultDraftStatus);
  const [draftReady, setDraftReady] = useState(false);
  const [loading, setLoading] = useState(false);
  const [serverSyncDetail, setServerSyncDetail] = useState("-");
  const [serverSyncAt, setServerSyncAt] = useState<string | null>(null);
  const [lastFailedAction, setLastFailedAction] = useState<WritingRetryAction | null>(null);
  const [error, setError] = useState<string | null>(null);

  if (!authSession) {
    return <Redirect href="/login" />;
  }

  const selectedTemplate = templates.find((item) => item.template_id === selectedTemplateId) ?? null;
  const draftStorageKey = buildScopedStorageKey("writing", "draft", "v1", authSession.userId);

  const markSyncSuccess = (statusText: string, detail: string): void => {
    setStatusMessage(statusText);
    setServerSyncDetail(detail);
    setServerSyncAt(new Date().toISOString());
    setLastFailedAction(null);
  };

  const markSyncFailure = (action: WritingRetryAction, detail: string): void => {
    setStatusMessage(`${formatWritingRetryActionLabel(action)}失败`);
    setServerSyncDetail(detail);
    setServerSyncAt(new Date().toISOString());
    setLastFailedAction(action);
  };

  const resetDraftState = (): void => {
    setTaskType(defaultTaskType);
    setPrompt(defaultPrompt);
    setEssay(defaultEssay);
    setEvaluation(null);
    setEvaluationId("");
    setRewriteEssay(defaultRewriteEssay);
    setComparisonDelta(null);
    setArchives([]);
    setTemplates([]);
    setSelectedTemplateId("");
    setTemplateInsertionMode("append");
    setTemplatePreservedOriginal(false);
    setTemplateAdoptionText("-");
    setStatusMessage("未开始");
    setServerSyncDetail("-");
    setServerSyncAt(null);
    setLastFailedAction(null);
    setError(null);
  };

  const persistDraft = useEffectEvent(async (snapshot: WritingDraftSnapshot) => {
    if (isDefaultDraftSnapshot(snapshot)) {
      await clearStoredJson(draftStorageKey);
      setDraftStatus("已启用自动保存");
      return;
    }

    await saveStoredJson(draftStorageKey, snapshot);
    setDraftStatus(`已自动保存 ${formatDraftTime(snapshot.updatedAt)}`);
  });

  useEffect(() => {
    let cancelled = false;

    resetDraftState();
    setDraftReady(false);
    setDraftStatus("正在恢复本地草稿...");
    if (draftSaveTimeoutRef.current) {
      clearTimeout(draftSaveTimeoutRef.current);
      draftSaveTimeoutRef.current = null;
    }

    void (async () => {
      const snapshot = await loadStoredJson<WritingDraftSnapshot>(draftStorageKey);
      if (cancelled) {
        return;
      }

      if (snapshot?.version === 1) {
        setTaskType(snapshot.taskType);
        setPrompt(snapshot.prompt);
        setEssay(snapshot.essay);
        setEvaluationId(snapshot.evaluationId);
        setRewriteEssay(snapshot.rewriteEssay);
        setComparisonDelta(snapshot.comparisonDelta);
        setSelectedTemplateId(snapshot.selectedTemplateId);
        setTemplateInsertionMode(snapshot.templateInsertionMode);
        setTemplatePreservedOriginal(snapshot.templatePreservedOriginal);
        setTemplateAdoptionText(snapshot.templateAdoptionText);
        setStatusMessage(
          snapshot.evaluationId.trim() ? "已恢复本地写作草稿，可继续加载评估结果" : "已恢复本地写作草稿"
        );
        setDraftStatus(`已恢复 ${formatDraftTime(snapshot.updatedAt)}`);
      } else {
        setDraftStatus("已启用自动保存");
      }

      skipNextDraftPersistRef.current = true;
      setDraftReady(true);
    })();

    return () => {
      cancelled = true;
      if (draftSaveTimeoutRef.current) {
        clearTimeout(draftSaveTimeoutRef.current);
        draftSaveTimeoutRef.current = null;
      }
    };
  }, [draftStorageKey]);

  useEffect(() => {
    if (!draftReady) {
      return;
    }

    if (skipNextDraftPersistRef.current) {
      skipNextDraftPersistRef.current = false;
      return;
    }

    const snapshot: WritingDraftSnapshot = {
      version: 1,
      taskType,
      prompt,
      essay,
      rewriteEssay,
      evaluationId,
      comparisonDelta,
      selectedTemplateId,
      templateInsertionMode,
      templatePreservedOriginal,
      templateAdoptionText,
      updatedAt: new Date().toISOString()
    };

    if (draftSaveTimeoutRef.current) {
      clearTimeout(draftSaveTimeoutRef.current);
    }

    draftSaveTimeoutRef.current = setTimeout(() => {
      void persistDraft(snapshot);
      draftSaveTimeoutRef.current = null;
    }, 400);

    return () => {
      if (draftSaveTimeoutRef.current) {
        clearTimeout(draftSaveTimeoutRef.current);
        draftSaveTimeoutRef.current = null;
      }
    };
  }, [
    comparisonDelta,
    draftReady,
    essay,
    evaluationId,
    persistDraft,
    prompt,
    rewriteEssay,
    selectedTemplateId,
    taskType,
    templateAdoptionText,
    templateInsertionMode,
    templatePreservedOriginal
  ]);

  const evaluate = async (): Promise<void> => {
    setLoading(true);
    try {
      setStatusMessage("正在提交写作批改");
      setServerSyncDetail(`task_type ${taskType}`);
      const result = await runWithAuthorizedClient((apiClient, accessToken) =>
        apiClient.evaluateWriting(accessToken, {
          task_type: taskType,
          prompt,
          essay
        })
      );
      setEvaluation(result);
      setTaskType(result.task_type);
      setPrompt(result.prompt);
      setEvaluationId(result.evaluation_id);
      recordActivity({
        skill: "writing",
        source: "writing_evaluation",
        title: "写作批改已完成",
        summary: `写作批改 overall ${result.scores.overall}，TR${result.scores.tr}/CC${result.scores.cc}/LR${result.scores.lr}/GRA${result.scores.gra}`,
        route: "/writing"
      });
      markSyncSuccess(
        `写作批改完成，overall=${result.scores.overall}`,
        `evaluation ${result.evaluation_id} / overall ${result.scores.overall}`
      );
      setError(null);
    } catch (evaluateError) {
      const message = toRequestErrorMessage(evaluateError, "写作批改失败");
      markSyncFailure("evaluate", message);
      setError(message);
    } finally {
      setLoading(false);
    }
  };

  const reload = async (): Promise<void> => {
    if (!evaluationId.trim()) {
      setError("请先输入 evaluation_id");
      return;
    }

    setLoading(true);
    try {
      setStatusMessage("正在加载写作评估结果");
      setServerSyncDetail(`evaluation ${evaluationId.trim()}`);
      const result = await runWithAuthorizedClient((apiClient, accessToken) =>
        apiClient.getWritingEvaluation(accessToken, evaluationId.trim())
      );
      setEvaluation(result);
      setTaskType(result.task_type);
      setPrompt(result.prompt);
      markSyncSuccess(
        "已加载写作评估结果",
        `evaluation ${result.evaluation_id} / overall ${result.scores.overall}`
      );
      setError(null);
    } catch (loadError) {
      const message = toRequestErrorMessage(loadError, "加载评估结果失败");
      markSyncFailure("reload", message);
      setError(message);
    } finally {
      setLoading(false);
    }
  };

  const rewrite = async (): Promise<void> => {
    if (!evaluationId.trim()) {
      setError("请先完成一次写作评估");
      return;
    }

    setLoading(true);
    try {
      setStatusMessage("正在执行改写复评");
      setServerSyncDetail(`evaluation ${evaluationId.trim()}`);
      const result = await runWithAuthorizedClient((apiClient, accessToken) =>
        apiClient.rewriteWriting(accessToken, evaluationId.trim(), {
          essay: rewriteEssay
        })
      );
      setEvaluation(result.evaluation);
      setTaskType(result.evaluation.task_type);
      setPrompt(result.evaluation.prompt);
      setEvaluationId(result.evaluation.evaluation_id);
      setComparisonDelta(result.comparison.delta);
      recordActivity({
        dedupeKey: `writing-rewrite:${result.archive.archive_id}`,
        skill: "writing",
        source: "writing_rewrite",
        title: "写作改写复评已完成",
        summary: `写作改写 overall ${result.evaluation.scores.overall}，ΔOverall${result.comparison.delta.overall}`,
        route: "/writing"
      });
      markSyncSuccess(
        "改写复评完成",
        `evaluation ${result.evaluation.evaluation_id} / delta ${result.comparison.delta.overall}`
      );
      setError(null);
    } catch (rewriteError) {
      const message = toRequestErrorMessage(rewriteError, "改写复评失败");
      markSyncFailure("rewrite", message);
      setError(message);
    } finally {
      setLoading(false);
    }
  };

  const clearLocalDraft = async (): Promise<void> => {
    if (draftSaveTimeoutRef.current) {
      clearTimeout(draftSaveTimeoutRef.current);
      draftSaveTimeoutRef.current = null;
    }

    await clearStoredJson(draftStorageKey);
    skipNextDraftPersistRef.current = true;
    resetDraftState();
    setDraftReady(true);
    setDraftStatus("本地草稿已清空");
    setStatusMessage("已清空本地写作草稿");
  };

  const loadArchives = async (): Promise<void> => {
    setLoading(true);
    try {
      setStatusMessage("正在加载改写档案");
      setServerSyncDetail("writing archives");
      const result = await runWithAuthorizedClient((apiClient, accessToken) => apiClient.getWritingArchives(accessToken));
      setArchives(result.items);
      markSyncSuccess("已加载改写档案", `archives ${result.items.length}`);
      setError(null);
    } catch (archiveError) {
      const message = toRequestErrorMessage(archiveError, "加载改写档案失败");
      markSyncFailure("load_archives", message);
      setError(message);
    } finally {
      setLoading(false);
    }
  };

  const loadTemplates = async (): Promise<void> => {
    setLoading(true);
    try {
      setStatusMessage("正在加载写作模板库");
      setServerSyncDetail(`task_type ${taskType}`);
      const result = await runWithAuthorizedClient((apiClient, accessToken) =>
        apiClient.getWritingTemplates(accessToken, {
          task_type: taskType
        })
      );
      setTemplates(result.items);
      if (result.items.length > 0) {
        const exists = result.items.some((item) => item.template_id === selectedTemplateId);
        if (!exists) {
          setSelectedTemplateId(result.items[0].template_id);
        }
      }
      markSyncSuccess("已加载写作模板库", `templates ${result.items.length} / task_type ${taskType}`);
      setError(null);
    } catch (templateError) {
      const message = toRequestErrorMessage(templateError, "加载模板失败");
      markSyncFailure("load_templates", message);
      setError(message);
    } finally {
      setLoading(false);
    }
  };

  const insertTemplate = async (): Promise<void> => {
    if (!selectedTemplateId) {
      setError("请先加载并选择模板");
      return;
    }

    setLoading(true);
    try {
      setStatusMessage("正在插入模板框架");
      setServerSyncDetail(`template ${selectedTemplateId} / insertion_mode ${templateInsertionMode}`);
      const result = await runWithAuthorizedClient((apiClient, accessToken) =>
        apiClient.insertWritingTemplate(accessToken, selectedTemplateId, {
          essay,
          insertion_mode: templateInsertionMode
        })
      );
      setEssay(result.merged_essay);
      setTemplatePreservedOriginal(result.preserved_original);
      markSyncSuccess(
        `模板已插入：${result.template.title}`,
        `template ${result.template.template_id} / preserved ${result.preserved_original ? "yes" : "no"}`
      );
      setError(null);
    } catch (insertError) {
      const message = toRequestErrorMessage(insertError, "插入模板失败");
      markSyncFailure("insert_template", message);
      setError(message);
    } finally {
      setLoading(false);
    }
  };

  const loadTemplateAdoption = async (): Promise<void> => {
    setLoading(true);
    try {
      setStatusMessage("正在加载模板采纳率");
      setServerSyncDetail("template adoption");
      const result = await runWithAuthorizedClient((apiClient, accessToken) =>
        apiClient.getWritingTemplateAdoption(accessToken)
      );
      const top = result.items[0];
      setTemplateAdoptionText(
        top
          ? `total=${result.total_insertions}, top=${top.template_id}, rate=${top.adoption_rate}`
          : `total=${result.total_insertions}, top=-, rate=0`
      );
      markSyncSuccess(
        "已加载模板采纳率",
        `total_insertions ${result.total_insertions} / top ${top?.template_id ?? "-"}`
      );
      setError(null);
    } catch (adoptionError) {
      const message = toRequestErrorMessage(adoptionError, "加载模板采纳率失败");
      markSyncFailure("load_template_adoption", message);
      setError(message);
    } finally {
      setLoading(false);
    }
  };

  const retryLastFailedAction = async (): Promise<void> => {
    switch (lastFailedAction) {
      case "evaluate":
        await evaluate();
        break;
      case "reload":
        await reload();
        break;
      case "rewrite":
        await rewrite();
        break;
      case "load_archives":
        await loadArchives();
        break;
      case "load_templates":
        await loadTemplates();
        break;
      case "insert_template":
        await insertTemplate();
        break;
      case "load_template_adoption":
        await loadTemplateAdoption();
        break;
      default:
        break;
    }
  };

  return (
    <AppScreen
      eyebrow="Writing"
      title="写作批改已进入移动端"
      subtitle="当前已接上 writing evaluation、结果重载、改写复评、改写档案、模板库、模板插入和模板采纳率查询。"
    >
      <InfoCard tone="accent">
        <Text style={{ color: colors.textMuted, fontSize: 12 }}>Task 类型</Text>
        <View style={{ gap: 10 }}>
          {taskOptions.map((option) => {
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
      </InfoCard>

      <InfoCard>
        <Text style={{ color: colors.textMuted, fontSize: 12 }}>本地草稿恢复</Text>
        <Text style={{ color: colors.textPrimary, fontSize: 14 }}>draft_status: {draftStatus}</Text>
        <Text style={{ color: colors.textMuted, fontSize: 14 }}>
          evaluation_resume: {evaluationId.trim() ? "已保留 evaluation_id，可继续加载结果" : "当前仅保存草稿与改写内容"}
        </Text>
        <ButtonRow>
          <SecondaryButton label="清空本地草稿" onPress={() => void clearLocalDraft()} disabled={loading || !draftReady} />
          <PrimaryButton label="加载批改结果" onPress={() => void reload()} disabled={loading || !evaluationId.trim()} />
        </ButtonRow>
      </InfoCard>

      <InfoCard tone={lastFailedAction ? "accent" : "default"}>
        <Text style={{ color: colors.textMuted, fontSize: 12 }}>服务端同步</Text>
        <ButtonRow>
          <StatusPill
            label={statusMessage}
            tone={lastFailedAction ? "accent" : serverSyncAt ? "success" : "neutral"}
          />
          <StatusPill
            label={lastFailedAction ? `待重试 ${formatWritingRetryActionLabel(lastFailedAction)}` : "链路已就绪"}
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
              testID="writing.retryLastFailedAction"
            />
          </ButtonRow>
        ) : null}
      </InfoCard>

      <TextField
        label="题目"
        value={prompt}
        onChangeText={setPrompt}
        placeholder="输入写作题目"
        multiline
        numberOfLines={4}
        textAlignVertical="top"
      />

      <TextField
        label="作文"
        value={essay}
        onChangeText={setEssay}
        placeholder="输入作文正文"
        multiline
        numberOfLines={10}
        textAlignVertical="top"
      />

      <InfoCard>
        <Text style={{ color: colors.textMuted, fontSize: 12 }}>模板库</Text>
        <ButtonRow>
          <PrimaryButton label={loading ? "处理中..." : "加载模板"} onPress={() => void loadTemplates()} disabled={loading} />
          <SecondaryButton label="查看采纳率" onPress={() => void loadTemplateAdoption()} disabled={loading} />
        </ButtonRow>
        <Text style={{ color: colors.textMuted, fontSize: 14 }}>template_count: {templates.length}</Text>
        <Text style={{ color: colors.textMuted, fontSize: 14 }}>template_adoption: {templateAdoptionText}</Text>

        {templates.length ? (
          <View style={{ gap: 10 }}>
            {templates.slice(0, 3).map((template) => {
              const active = template.template_id === selectedTemplateId;
              return (
                <Pressable
                  key={template.template_id}
                  onPress={() => setSelectedTemplateId(template.template_id)}
                  style={{
                    borderRadius: radii.md,
                    borderWidth: 1,
                    borderColor: active ? colors.cardAccentBorder : colors.cardBorder,
                    backgroundColor: active ? colors.cardAccent : colors.input,
                    padding: spacing.md,
                    gap: 6
                  }}
                >
                  <Text style={{ color: colors.textPrimary, fontSize: 14, fontWeight: "700" }}>{template.title}</Text>
                  <Text style={{ color: colors.textMuted, fontSize: 13 }}>
                    {template.template_id} · {template.scenario_tag}
                  </Text>
                  <Text style={{ color: colors.textMuted, fontSize: 13, lineHeight: 20 }}>
                    {template.argument_framework}
                  </Text>
                  <Text style={{ color: colors.textMuted, fontSize: 13 }}>
                    usage_count: {template.usage_count} · adoption_rate: {template.adoption_rate}
                  </Text>
                </Pressable>
              );
            })}
          </View>
        ) : null}

        {selectedTemplate ? (
          <View style={{ gap: 10 }}>
            <Text style={{ color: colors.textPrimary, fontSize: 14, fontWeight: "700" }}>
              selected_template: {selectedTemplate.title}
            </Text>
            <Text style={{ color: colors.textMuted, fontSize: 13, lineHeight: 20 }}>
              usage_tips: {selectedTemplate.usage_tips.join(" | ") || "-"}
            </Text>
          </View>
        ) : null}

        <Text style={{ color: colors.textMuted, fontSize: 12 }}>插入方式</Text>
        <View style={{ gap: 10 }}>
          {insertionModeOptions.map((option) => {
            const active = option.value === templateInsertionMode;
            return (
              <Pressable
                key={option.value}
                onPress={() => setTemplateInsertionMode(option.value)}
                style={{
                  borderRadius: radii.md,
                  borderWidth: 1,
                  borderColor: active ? colors.cardAccentBorder : colors.cardBorder,
                  backgroundColor: active ? colors.cardAccent : colors.card,
                  padding: spacing.md,
                  gap: 6
                }}
              >
                <Text style={{ color: colors.textPrimary, fontSize: 14, fontWeight: "700" }}>{option.label}</Text>
                <Text style={{ color: colors.textMuted, fontSize: 13, lineHeight: 20 }}>{option.description}</Text>
              </Pressable>
            );
          })}
        </View>
        <ButtonRow>
          <PrimaryButton label="插入模板框架" onPress={() => void insertTemplate()} disabled={loading || !selectedTemplateId} />
          <SecondaryButton label="返回首页" onPress={() => router.replace("/home")} disabled={loading} />
        </ButtonRow>
        <Text style={{ color: colors.textMuted, fontSize: 14 }}>
          template_preserved_original: {String(templatePreservedOriginal)}
        </Text>
      </InfoCard>

      <InfoCard>
        <Text style={{ color: colors.textMuted, fontSize: 12 }}>评估</Text>
        <ButtonRow>
          <PrimaryButton label={loading ? "处理中..." : "提交写作批改"} onPress={() => void evaluate()} disabled={loading} />
          <SecondaryButton label="加载批改结果" onPress={() => void reload()} disabled={loading || !evaluationId.trim()} />
        </ButtonRow>
        <TextField
          label="evaluation_id"
          value={evaluationId}
          onChangeText={setEvaluationId}
          placeholder="完成批改后自动填充"
          autoCapitalize="none"
          autoCorrect={false}
        />
        <ButtonRow>
          <StatusPill label={statusMessage} tone={evaluation ? "accent" : "neutral"} />
          <StatusPill label={evaluation ? `overall ${evaluation.scores.overall}` : "未评估"} tone={evaluation ? "success" : "neutral"} />
        </ButtonRow>
      </InfoCard>

      <TextField
        label="改写作文"
        value={rewriteEssay}
        onChangeText={setRewriteEssay}
        placeholder="输入改写后的版本"
        multiline
        numberOfLines={8}
        textAlignVertical="top"
      />

      <ButtonRow>
        <PrimaryButton label="改写复评" onPress={() => void rewrite()} disabled={loading || !evaluationId.trim()} />
        <SecondaryButton label="加载改写档案" onPress={() => void loadArchives()} disabled={loading} />
      </ButtonRow>

      {evaluation ? (
        <InfoCard>
          <Text style={{ color: colors.textMuted, fontSize: 12 }}>当前评估结果</Text>
          <Text style={{ color: colors.textPrimary, fontSize: 15, fontWeight: "700" }}>{formatScores(evaluation)}</Text>
          <Text style={{ color: colors.textMuted, fontSize: 14 }}>overall: {evaluation.scores.overall}</Text>
          <Text style={{ color: colors.textMuted, fontSize: 14 }}>latency_ms: {evaluation.latency_ms}</Text>
          <Text style={{ color: colors.textMuted, fontSize: 14 }}>
            fallback_triggered: {String(evaluation.fallback_triggered)}
          </Text>
          <Text style={{ color: colors.textMuted, fontSize: 14 }}>suggestion_count: {evaluation.suggestions.length}</Text>
          <View style={{ gap: 10 }}>
            {evaluation.suggestions.map((item) => (
              <View
                key={item.suggestion_id}
                style={{
                  borderRadius: radii.md,
                  borderWidth: 1,
                  borderColor: colors.cardBorder,
                  backgroundColor: colors.input,
                  padding: spacing.md,
                  gap: 6
                }}
              >
                <Text style={{ color: colors.textPrimary, fontSize: 14, fontWeight: "700" }}>{item.issue}</Text>
                <Text style={{ color: colors.textMuted, fontSize: 13, lineHeight: 20 }}>
                  evidence: {item.evidence_sentence}
                </Text>
                <Text style={{ color: colors.textMuted, fontSize: 13, lineHeight: 20 }}>
                  recommendation: {item.recommendation}
                </Text>
                <Text style={{ color: colors.textMuted, fontSize: 13, lineHeight: 20 }}>
                  sample: {item.revised_sample}
                </Text>
              </View>
            ))}
          </View>
        </InfoCard>
      ) : null}

      <InfoCard>
        <Text style={{ color: colors.textMuted, fontSize: 12 }}>改写与档案</Text>
        <Text style={{ color: colors.textPrimary, fontSize: 14 }}>comparison: {formatComparison(comparisonDelta)}</Text>
        <Text style={{ color: colors.textMuted, fontSize: 14 }}>archive_count: {archives.length}</Text>
        {archives.slice(0, 3).map((item) => (
          <Text key={item.archive_id} style={{ color: colors.textMuted, fontSize: 13 }}>
            {item.archive_id} · Δoverall {item.delta_overall}
          </Text>
        ))}
      </InfoCard>

      <StudyLoopNextStepCard
        visible={Boolean(evaluation || comparisonDelta)}
        currentRoute="/writing"
        secondaryRoute="/home"
        secondaryLabel="返回首页"
        testIDPrefix="writing.studyLoopNext"
      />

      {error ? <Text style={{ color: colors.danger, fontSize: 14, lineHeight: 20 }}>{error}</Text> : null}
    </AppScreen>
  );
}
