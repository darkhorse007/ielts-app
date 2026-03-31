import { Redirect, router } from "expo-router";
import { Pressable, Text, View } from "react-native";
import { useState } from "react";
import type { WritingArchiveResponse, WritingEvaluationResponse, WritingTemplateListResponse } from "../src/lib/api-types";
import { useAppSession } from "../src/state/app-session";
import { AppScreen, ButtonRow, InfoCard, PrimaryButton, SecondaryButton, StatusPill, TextField } from "../src/ui/primitives";
import { colors, radii, spacing } from "../src/ui/theme";

type WritingTaskType = "task1" | "task2";
type TemplateInsertionMode = "append" | "prepend";

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

export default function WritingScreen() {
  const { session: authSession, runWithAuthorizedClient } = useAppSession();
  const [taskType, setTaskType] = useState<WritingTaskType>("task2");
  const [prompt, setPrompt] = useState("Some people think students should learn practical skills at school.");
  const [essay, setEssay] = useState(
    "I strongly agree with this statement because practical skills can help students adapt to real life more effectively. For example, communication and collaboration are essential in both study and work."
  );
  const [evaluation, setEvaluation] = useState<WritingEvaluationResponse | null>(null);
  const [evaluationId, setEvaluationId] = useState("");
  const [rewriteEssay, setRewriteEssay] = useState(
    "I strongly agree that practical skills should be integrated into school courses because they directly improve students' readiness for work and life."
  );
  const [comparisonDelta, setComparisonDelta] = useState<{
    tr: number;
    cc: number;
    lr: number;
    gra: number;
    overall: number;
  } | null>(null);
  const [archives, setArchives] = useState<WritingArchiveResponse["items"]>([]);
  const [templates, setTemplates] = useState<WritingTemplateListResponse["items"]>([]);
  const [selectedTemplateId, setSelectedTemplateId] = useState("");
  const [templateInsertionMode, setTemplateInsertionMode] = useState<TemplateInsertionMode>("append");
  const [templatePreservedOriginal, setTemplatePreservedOriginal] = useState(false);
  const [templateAdoptionText, setTemplateAdoptionText] = useState("-");
  const [statusMessage, setStatusMessage] = useState("未开始");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!authSession) {
    return <Redirect href="/login" />;
  }

  const selectedTemplate = templates.find((item) => item.template_id === selectedTemplateId) ?? null;

  const evaluate = async (): Promise<void> => {
    setLoading(true);
    try {
      const result = await runWithAuthorizedClient((apiClient, accessToken) =>
        apiClient.evaluateWriting(accessToken, {
          task_type: taskType,
          prompt,
          essay
        })
      );
      setEvaluation(result);
      setEvaluationId(result.evaluation_id);
      setStatusMessage(`写作批改完成，overall=${result.scores.overall}`);
      setError(null);
    } catch (evaluateError) {
      setError(evaluateError instanceof Error ? evaluateError.message : "写作批改失败");
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
      const result = await runWithAuthorizedClient((apiClient, accessToken) =>
        apiClient.getWritingEvaluation(accessToken, evaluationId.trim())
      );
      setEvaluation(result);
      setStatusMessage("已加载写作评估结果");
      setError(null);
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "加载评估结果失败");
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
      const result = await runWithAuthorizedClient((apiClient, accessToken) =>
        apiClient.rewriteWriting(accessToken, evaluationId.trim(), {
          essay: rewriteEssay
        })
      );
      setEvaluation(result.evaluation);
      setEvaluationId(result.evaluation.evaluation_id);
      setComparisonDelta(result.comparison.delta);
      setStatusMessage("改写复评完成");
      setError(null);
    } catch (rewriteError) {
      setError(rewriteError instanceof Error ? rewriteError.message : "改写复评失败");
    } finally {
      setLoading(false);
    }
  };

  const loadArchives = async (): Promise<void> => {
    setLoading(true);
    try {
      const result = await runWithAuthorizedClient((apiClient, accessToken) => apiClient.getWritingArchives(accessToken));
      setArchives(result.items);
      setStatusMessage("已加载改写档案");
      setError(null);
    } catch (archiveError) {
      setError(archiveError instanceof Error ? archiveError.message : "加载改写档案失败");
    } finally {
      setLoading(false);
    }
  };

  const loadTemplates = async (): Promise<void> => {
    setLoading(true);
    try {
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
      setStatusMessage("已加载写作模板库");
      setError(null);
    } catch (templateError) {
      setError(templateError instanceof Error ? templateError.message : "加载模板失败");
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
      const result = await runWithAuthorizedClient((apiClient, accessToken) =>
        apiClient.insertWritingTemplate(accessToken, selectedTemplateId, {
          essay,
          insertion_mode: templateInsertionMode
        })
      );
      setEssay(result.merged_essay);
      setTemplatePreservedOriginal(result.preserved_original);
      setStatusMessage(`模板已插入：${result.template.title}`);
      setError(null);
    } catch (insertError) {
      setError(insertError instanceof Error ? insertError.message : "插入模板失败");
    } finally {
      setLoading(false);
    }
  };

  const loadTemplateAdoption = async (): Promise<void> => {
    setLoading(true);
    try {
      const result = await runWithAuthorizedClient((apiClient, accessToken) =>
        apiClient.getWritingTemplateAdoption(accessToken)
      );
      const top = result.items[0];
      setTemplateAdoptionText(
        top
          ? `total=${result.total_insertions}, top=${top.template_id}, rate=${top.adoption_rate}`
          : `total=${result.total_insertions}, top=-, rate=0`
      );
      setStatusMessage("已加载模板采纳率");
      setError(null);
    } catch (adoptionError) {
      setError(adoptionError instanceof Error ? adoptionError.message : "加载模板采纳率失败");
    } finally {
      setLoading(false);
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

      {error ? <Text style={{ color: colors.danger, fontSize: 14, lineHeight: 20 }}>{error}</Text> : null}

      <ButtonRow>
        <PrimaryButton label="查看学习进度" onPress={() => router.push("/progress")} />
        <SecondaryButton label="返回首页" onPress={() => router.replace("/home")} />
      </ButtonRow>
    </AppScreen>
  );
}
