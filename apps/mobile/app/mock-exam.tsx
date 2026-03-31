import { Redirect, router } from "expo-router";
import { Pressable, Share, Text, View } from "react-native";
import { useState } from "react";
import type { MockExamReportResponse, MockExamResponse } from "../src/lib/api-types";
import { useAppForegroundEffect } from "../src/hooks/use-app-foreground-effect";
import { useAppSession } from "../src/state/app-session";
import { AppScreen, ButtonRow, InfoCard, PrimaryButton, SecondaryButton, StatusPill, TextField } from "../src/ui/primitives";
import { colors, radii, spacing } from "../src/ui/theme";

type MockSkill = "listening" | "speaking" | "reading" | "writing";

const skillOptions: Array<{
  value: MockSkill;
  label: string;
  description: string;
}> = [
  {
    value: "listening",
    label: "听力",
    description: "保存题量进度或提交本节听力"
  },
  {
    value: "speaking",
    label: "口语",
    description: "保存口语阶段进度与状态"
  },
  {
    value: "reading",
    label: "阅读",
    description: "保存阅读答题进度与科目完成"
  },
  {
    value: "writing",
    label: "写作",
    description: "保存写作阶段进度与提交状态"
  }
];

const asNumber = (value: string, fallback: number): number => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
};

const formatBands = (report: MockExamReportResponse | null): string =>
  report
    ? `L${report.skill_band_estimates.listening}/S${report.skill_band_estimates.speaking}/R${report.skill_band_estimates.reading}/W${report.skill_band_estimates.writing}`
    : "-";

const formatErrors = (report: MockExamReportResponse | null): string =>
  report
    ? `L${report.error_distribution.listening}/S${report.error_distribution.speaking}/R${report.error_distribution.reading}/W${report.error_distribution.writing}`
    : "-";

export default function MockExamScreen() {
  const { session: authSession, runWithAuthorizedClient } = useAppSession();
  const [exam, setExam] = useState<MockExamResponse | null>(null);
  const [report, setReport] = useState<MockExamReportResponse | null>(null);
  const [timeLimitSeconds, setTimeLimitSeconds] = useState("7200");
  const [skill, setSkill] = useState<MockSkill>("reading");
  const [answeredCount, setAnsweredCount] = useState("20");
  const [listeningBand, setListeningBand] = useState("6.5");
  const [speakingBand, setSpeakingBand] = useState("6");
  const [readingBand, setReadingBand] = useState("6");
  const [writingBand, setWritingBand] = useState("6");
  const [statusMessage, setStatusMessage] = useState("未开始");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [exportPreview, setExportPreview] = useState("-");
  const [exportFilename, setExportFilename] = useState("-");

  if (!authSession) {
    return <Redirect href="/login" />;
  }

  const createExam = async (): Promise<void> => {
    const optimisticExam: MockExamResponse = {
      exam_id: `mock-local-${Date.now()}`,
      status: "in_progress",
      time_limit_seconds: asNumber(timeLimitSeconds, 7200),
      elapsed_seconds: 0,
      remaining_seconds: asNumber(timeLimitSeconds, 7200),
      current_skill: skill,
      sections: [],
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString()
    };

    setExam(optimisticExam);
    setReport(null);
    setExportPreview("-");
    setExportFilename("-");
    setStatusMessage(`模考创建成功，当前科目=${optimisticExam.current_skill}`);
    setError(null);

    const createPromise = runWithAuthorizedClient((apiClient, accessToken) =>
      apiClient.createMockExam(accessToken, {
        time_limit_seconds: asNumber(timeLimitSeconds, 7200)
      })
    );

    void createPromise
      .then((response) => {
        setExam(response);
        setStatusMessage(`模考创建成功，当前科目=${response.current_skill}`);
      })
      .catch((createError) => {
        setExam(null);
        setStatusMessage("未开始");
        setError(createError instanceof Error ? createError.message : "创建模考失败");
      });
  };

  const loadExam = async (): Promise<void> => {
    if (!exam?.exam_id) {
      setError("请先创建模考");
      return;
    }

    setLoading(true);
    try {
      const response = await runWithAuthorizedClient((apiClient, accessToken) =>
        apiClient.getMockExam(accessToken, exam.exam_id)
      );
      setExam(response);
      setStatusMessage(`模考状态=${response.status}，剩余=${response.remaining_seconds}s`);
      setError(null);
    } catch (examError) {
      setError(examError instanceof Error ? examError.message : "加载模考失败");
    } finally {
      setLoading(false);
    }
  };

  const saveProgress = async (completed: boolean): Promise<void> => {
    if (!exam?.exam_id) {
      setError("请先创建模考");
      return;
    }

    setLoading(true);
    try {
      const response = await runWithAuthorizedClient((apiClient, accessToken) =>
        apiClient.saveMockExamProgress(accessToken, exam.exam_id, {
          skill,
          answered_count: asNumber(answeredCount, 0),
          completed
        })
      );
      setExam(response);
      setStatusMessage(completed ? `已提交 ${skill} 科目` : `已保存 ${skill} 进度`);
      setError(null);
    } catch (progressError) {
      setError(progressError instanceof Error ? progressError.message : "保存进度失败");
    } finally {
      setLoading(false);
    }
  };

  const recoverExam = async (): Promise<void> => {
    if (!exam?.exam_id) {
      setError("请先创建模考");
      return;
    }

    setLoading(true);
    try {
      const response = await runWithAuthorizedClient((apiClient, accessToken) =>
        apiClient.recoverMockExam(accessToken, exam.exam_id)
      );
      setExam(response);
      setStatusMessage(response.recovered ? "模考恢复成功" : "模考无需恢复");
      setError(null);
    } catch (recoverError) {
      setError(recoverError instanceof Error ? recoverError.message : "恢复模考失败");
    } finally {
      setLoading(false);
    }
  };

  const submitExam = async (): Promise<void> => {
    if (!exam?.exam_id) {
      setError("请先创建模考");
      return;
    }

    setLoading(true);
    try {
      const response = await runWithAuthorizedClient((apiClient, accessToken) =>
        apiClient.submitMockExam(accessToken, exam.exam_id, {
          skill_bands: {
            listening: asNumber(listeningBand, 6.5),
            speaking: asNumber(speakingBand, 6),
            reading: asNumber(readingBand, 6),
            writing: asNumber(writingBand, 6)
          }
        })
      );
      setExam(response.exam);
      setReport(response.report);
      setStatusMessage(`模考提交完成，overall=${response.report.total_estimated_band}`);
      setError(null);
    } catch (submitError) {
      setError(submitError instanceof Error ? submitError.message : "提交模考失败");
    } finally {
      setLoading(false);
    }
  };

  const loadReport = async (): Promise<void> => {
    if (!exam?.exam_id) {
      setError("请先创建模考");
      return;
    }

    setLoading(true);
    try {
      const response = await runWithAuthorizedClient((apiClient, accessToken) =>
        apiClient.getMockExamReport(accessToken, exam.exam_id)
      );
      setReport(response);
      setStatusMessage("已加载模考报告");
      setError(null);
    } catch (reportError) {
      setError(reportError instanceof Error ? reportError.message : "加载报告失败");
    } finally {
      setLoading(false);
    }
  };

  const undoWriteback = async (): Promise<void> => {
    if (!exam?.exam_id) {
      setError("请先创建模考");
      return;
    }

    setLoading(true);
    try {
      const response = await runWithAuthorizedClient((apiClient, accessToken) =>
        apiClient.undoMockExamWriteback(accessToken, exam.exam_id)
      );
      setReport(response);
      setStatusMessage("已撤销计划回写");
      setError(null);
    } catch (undoError) {
      setError(undoError instanceof Error ? undoError.message : "撤销计划回写失败");
    } finally {
      setLoading(false);
    }
  };

  const exportReport = async (): Promise<void> => {
    if (!exam?.exam_id) {
      setError("请先创建模考");
      return;
    }

    setLoading(true);
    try {
      const response = await runWithAuthorizedClient((apiClient, accessToken) =>
        apiClient.exportMockExamReport(accessToken, exam.exam_id)
      );
      setExportFilename(response.filename);
      setExportPreview(response.content.slice(0, 200));
      await Share.share({
        title: response.filename,
        message: response.content
      });
      setStatusMessage(`已导出并分享报告 ${response.filename}`);
      setError(null);
    } catch (exportError) {
      setError(exportError instanceof Error ? exportError.message : "导出报告失败");
    } finally {
      setLoading(false);
    }
  };

  useAppForegroundEffect(
    async () => {
      if (loading || !exam?.exam_id || exam.status !== "in_progress") {
        return;
      }
      await recoverExam();
    },
    {
      enabled: Boolean(exam?.exam_id && exam.status === "in_progress")
    }
  );

  return (
    <AppScreen
      eyebrow="Mock Exam"
      title="模考与报告已进入移动端"
      subtitle="当前已接上 mock exam 创建、分科进度保存、恢复、整场提交、报告读取、计划回写撤销，以及导出后系统分享。"
    >
      <InfoCard tone="accent">
        <Text style={{ color: colors.textMuted, fontSize: 12 }}>模考配置</Text>
        <TextField
          label="总时长（秒）"
          testID="mockExam.timeLimitSeconds"
          value={timeLimitSeconds}
          onChangeText={setTimeLimitSeconds}
          placeholder="7200"
          keyboardType="number-pad"
        />
        <ButtonRow>
          <PrimaryButton
            label={loading ? "处理中..." : "创建模考"}
            onPress={() => void createExam()}
            disabled={loading}
            testID="mockExam.create"
          />
          <SecondaryButton label="拉取模考状态" onPress={() => void loadExam()} disabled={loading || !exam} />
        </ButtonRow>
      </InfoCard>

      <InfoCard>
        <Text style={{ color: colors.textMuted, fontSize: 12 }}>当前模考</Text>
        <ButtonRow>
          <StatusPill label={exam?.status ?? "未创建"} tone={exam ? "success" : "neutral"} />
          <StatusPill label={statusMessage} tone={exam ? "accent" : "neutral"} />
        </ButtonRow>
        <View style={{ gap: 6, marginTop: 10 }}>
          <Text style={{ color: colors.textPrimary, fontSize: 14 }}>exam_id: {exam?.exam_id ?? "-"}</Text>
          <Text style={{ color: colors.textMuted, fontSize: 14 }}>current_skill: {exam?.current_skill ?? "-"}</Text>
          <Text style={{ color: colors.textMuted, fontSize: 14 }}>elapsed_seconds: {exam?.elapsed_seconds ?? 0}</Text>
          <Text style={{ color: colors.textMuted, fontSize: 14 }}>remaining_seconds: {exam?.remaining_seconds ?? 0}</Text>
          <Text style={{ color: colors.textMuted, fontSize: 14 }}>report_id: {exam?.report_id ?? report?.report_id ?? "-"}</Text>
        </View>
        <ButtonRow>
          <PrimaryButton label="返回首页" onPress={() => router.replace("/home")} testID="mockExam.backHome" />
          <SecondaryButton label="查看学习进度" onPress={() => router.push("/progress")} />
        </ButtonRow>
      </InfoCard>

      <InfoCard>
        <Text style={{ color: colors.textMuted, fontSize: 12 }}>分科进度</Text>
        <View style={{ gap: 10 }}>
          {skillOptions.map((option) => {
            const active = option.value === skill;
            return (
              <Pressable
                key={option.value}
                onPress={() => setSkill(option.value)}
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
          label="已完成题数"
          value={answeredCount}
          onChangeText={setAnsweredCount}
          placeholder="20"
          keyboardType="number-pad"
        />
        <ButtonRow>
          <PrimaryButton label="保存进度" onPress={() => void saveProgress(false)} disabled={loading || !exam} />
          <SecondaryButton label="提交当前科目" onPress={() => void saveProgress(true)} disabled={loading || !exam} />
        </ButtonRow>
        <ButtonRow>
          <PrimaryButton label="恢复模考" onPress={() => void recoverExam()} disabled={loading || !exam} />
          <SecondaryButton label="查看学习计划" onPress={() => router.push("/plan")} />
        </ButtonRow>
        {exam?.sections.length ? (
          <View style={{ gap: 10 }}>
            {exam.sections.map((section) => (
              <View
                key={section.skill}
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
                  {section.skill} · {section.status}
                </Text>
                <Text style={{ color: colors.textMuted, fontSize: 13 }}>answered_count: {section.answered_count}</Text>
                <Text style={{ color: colors.textMuted, fontSize: 13 }}>
                  checkpoint: {section.last_checkpoint_at ?? "-"}
                </Text>
              </View>
            ))}
          </View>
        ) : null}
      </InfoCard>

      <InfoCard>
        <Text style={{ color: colors.textMuted, fontSize: 12 }}>整场提交</Text>
        <TextField
          label="Listening 估分"
          value={listeningBand}
          onChangeText={setListeningBand}
          placeholder="6.5"
          keyboardType="decimal-pad"
        />
        <TextField
          label="Speaking 估分"
          value={speakingBand}
          onChangeText={setSpeakingBand}
          placeholder="6"
          keyboardType="decimal-pad"
        />
        <TextField
          label="Reading 估分"
          value={readingBand}
          onChangeText={setReadingBand}
          placeholder="6"
          keyboardType="decimal-pad"
        />
        <TextField
          label="Writing 估分"
          value={writingBand}
          onChangeText={setWritingBand}
          placeholder="6"
          keyboardType="decimal-pad"
        />
        <ButtonRow>
          <PrimaryButton label="提交整场模考" onPress={() => void submitExam()} disabled={loading || !exam} />
          <SecondaryButton label="加载复盘报告" onPress={() => void loadReport()} disabled={loading || !exam} />
        </ButtonRow>
      </InfoCard>

      {report ? (
        <InfoCard>
          <Text style={{ color: colors.textMuted, fontSize: 12 }}>复盘报告</Text>
          <Text style={{ color: colors.textPrimary, fontSize: 15, fontWeight: "700" }}>
            overall: {report.total_estimated_band}
          </Text>
          <Text style={{ color: colors.textMuted, fontSize: 14 }}>bands: {formatBands(report)}</Text>
          <Text style={{ color: colors.textMuted, fontSize: 14 }}>errors: {formatErrors(report)}</Text>
          <Text style={{ color: colors.textMuted, fontSize: 14 }}>
            next_actions: {report.next_actions.length ? report.next_actions.join(" | ") : "-"}
          </Text>
          <Text style={{ color: colors.textMuted, fontSize: 14 }}>
            writeback_applied: {String(report.plan_writeback?.applied ?? false)}
          </Text>
          <Text style={{ color: colors.textMuted, fontSize: 14 }}>
            undo_available: {String(report.plan_writeback?.undo_available ?? false)}
          </Text>
          <Text style={{ color: colors.textMuted, fontSize: 14 }}>
            writeback_reasons: {report.plan_writeback?.reasons.join(" | ") || "-"}
          </Text>
          {report.plan_writeback?.changed_tasks.length ? (
            <View style={{ gap: 8 }}>
              {report.plan_writeback.changed_tasks.slice(0, 3).map((task) => (
                <Text key={task.task_id} style={{ color: colors.textMuted, fontSize: 13 }}>
                  {task.task_id}: {task.target_minutes_before}m {"->"} {task.target_minutes_after}m
                </Text>
              ))}
            </View>
          ) : null}
          <ButtonRow>
            <PrimaryButton
              label="撤销计划回写"
              onPress={() => void undoWriteback()}
              disabled={loading || !report.plan_writeback?.undo_available}
            />
            <SecondaryButton label="导出并分享报告" onPress={() => void exportReport()} disabled={loading} />
          </ButtonRow>
        </InfoCard>
      ) : null}

      <InfoCard>
        <Text style={{ color: colors.textMuted, fontSize: 12 }}>导出结果</Text>
        <Text style={{ color: colors.textPrimary, fontSize: 14 }}>filename: {exportFilename}</Text>
        <Text style={{ color: colors.textMuted, fontSize: 13, lineHeight: 20 }}>preview: {exportPreview}</Text>
      </InfoCard>

      {error ? <Text style={{ color: colors.danger, fontSize: 14, lineHeight: 20 }}>{error}</Text> : null}
    </AppScreen>
  );
}
