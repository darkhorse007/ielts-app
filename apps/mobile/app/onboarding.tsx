import { Redirect, router } from "expo-router";
import { useState } from "react";
import { Pressable, Text, View } from "react-native";
import { trackMobileAnalyticsEvent } from "../src/lib/analytics";
import type { DiagnosticQuestionsResponse } from "../src/lib/api-types";
import { validateBandScore } from "../src/lib/validators";
import { useAppSession } from "../src/state/app-session";
import { InstanceConnectionCard } from "../src/ui/instance-connection-card";
import { AppScreen, ButtonRow, InfoCard, PrimaryButton, SecondaryButton, TextField } from "../src/ui/primitives";
import { colors, radii, spacing } from "../src/ui/theme";

type WeakSkill = "listening" | "speaking" | "reading" | "writing";

const weakSkillOptions: WeakSkill[] = ["listening", "speaking", "reading", "writing"];

const pickCurrentQuestion = (response: DiagnosticQuestionsResponse) =>
  response.questions[response.current_question_index] ?? response.questions[0] ?? null;

const todayDate = (): string => {
  const now = new Date();
  const year = now.getUTCFullYear();
  const month = String(now.getUTCMonth() + 1).padStart(2, "0");
  const day = String(now.getUTCDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
};

export default function OnboardingScreen() {
  const { defaultInstanceConfig, instanceConfig, session, runWithAuthorizedClient } = useAppSession();
  const [targetBand, setTargetBand] = useState("6.5");
  const [targetExamDate, setTargetExamDate] = useState("");
  const [weeklyHours, setWeeklyHours] = useState("10");
  const [weakSkills, setWeakSkills] = useState<WeakSkill[]>([]);
  const [statusMessage, setStatusMessage] = useState("未提交");
  const [assessmentId, setAssessmentId] = useState<string | null>(null);
  const [planId, setPlanId] = useState<string | null>(null);
  const [diagnosticPreview, setDiagnosticPreview] = useState<{
    questionId: string;
    prompt: string;
    progressText: string;
  } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  if (!instanceConfig) {
    return <Redirect href="/instance" />;
  }

  if (!session) {
    return <Redirect href="/login" />;
  }

  const toggleSkill = (skill: WeakSkill): void => {
    setWeakSkills((current) => (current.includes(skill) ? current.filter((item) => item !== skill) : [...current, skill]));
  };

  const validate = (): { targetBandValue: number; weeklyHoursValue: number } => {
    const targetBandValue = Number(targetBand);
    const weeklyHoursValue = Number(weeklyHours);

    if (!validateBandScore(targetBandValue)) {
      throw new Error("目标分必须在 0-9 之间且以 0.5 递增");
    }
    if (!targetExamDate) {
      throw new Error("请填写考试日期");
    }
    if (targetExamDate < todayDate()) {
      throw new Error("考试日期不能早于今天");
    }
    if (!Number.isInteger(weeklyHoursValue) || weeklyHoursValue < 1 || weeklyHoursValue > 80) {
      throw new Error("每周学习时长应在 1-80 小时之间");
    }

    return {
      targetBandValue,
      weeklyHoursValue
    };
  };

  const submit = async (): Promise<void> => {
    setSubmitting(true);
    setDiagnosticPreview(null);
    setError(null);
    try {
      const { targetBandValue, weeklyHoursValue } = validate();
      const response = await runWithAuthorizedClient((apiClient, accessToken) =>
        apiClient.submitOnboarding(
          accessToken,
          {
            target_overall_band: targetBandValue,
            target_exam_date: targetExamDate,
            weekly_study_hours: weeklyHoursValue,
            weak_skills: weakSkills
          },
          `mobile-goal-${Date.now()}`
        )
      );

      setAssessmentId(response.assessment_id);
      setPlanId(response.plan_id);
      setStatusMessage(response.status);
      void trackMobileAnalyticsEvent(runWithAuthorizedClient, {
        eventType: "onboarding_submitted",
        metadata: {
          assessmentId: response.assessment_id,
          planId: response.plan_id,
          targetOverallBand: targetBandValue,
          targetExamDate,
          weeklyStudyHours: weeklyHoursValue,
          weakSkills
        }
      });
      let statusRefreshFailed = false;

      try {
        const status = await runWithAuthorizedClient((apiClient, accessToken) =>
          apiClient.fetchOnboardingStatus(accessToken, response.assessment_id)
        );
        setStatusMessage(status.status);
      } catch (statusError) {
        statusRefreshFailed = true;
        // Submit already succeeded. Keep submit status and only surface a refresh warning.
        setError(
          `目标已提交，诊断状态刷新失败：${statusError instanceof Error ? statusError.message : "请稍后重试"}`
        );
      }

      const firstQuestion = await runWithAuthorizedClient(async (apiClient, accessToken) => {
        try {
          const questions = await apiClient.fetchDiagnosticQuestions(accessToken, response.assessment_id);
          const currentQuestion = pickCurrentQuestion(questions);
          if (!currentQuestion) {
            return null;
          }

          return {
            questionId: currentQuestion.question_id,
            prompt: currentQuestion.prompt,
            progressText: `${questions.answered_count}/${questions.total_questions}`
          };
        } catch {
          return null;
        }
      });
      setDiagnosticPreview(firstQuestion);
      if (!statusRefreshFailed) {
        setError(null);
      }
    } catch (submitError) {
      setError(submitError instanceof Error ? submitError.message : "提交失败");
      setStatusMessage("failed");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <AppScreen
      eyebrow="Onboarding"
      title="先把目标与约束写进系统"
      subtitle="这个页面已经接上当前 Web 使用的入门目标接口。提交成功后可以直接进入首次诊断。"
    >
      <InstanceConnectionCard
        title="当前将把目标写入以下实例"
        instanceConfig={instanceConfig}
        defaultInstanceConfig={defaultInstanceConfig}
      />

      <TextField
        label="目标分"
        value={targetBand}
        onChangeText={setTargetBand}
        placeholder="例如 6.5"
        keyboardType="decimal-pad"
      />

      <TextField
        label="考试日期"
        value={targetExamDate}
        onChangeText={setTargetExamDate}
        placeholder="YYYY-MM-DD"
        testID="onboarding.targetExamDate"
        autoCapitalize="none"
        autoCorrect={false}
      />

      <TextField
        label="每周学习时长"
        value={weeklyHours}
        onChangeText={setWeeklyHours}
        placeholder="例如 10"
        keyboardType="number-pad"
      />

      <View style={{ gap: 10 }}>
        <Text style={{ color: colors.textSecondary, fontSize: 13, fontWeight: "700" }}>薄弱科目</Text>
        <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 10 }}>
          {weakSkillOptions.map((skill) => {
            const active = weakSkills.includes(skill);
            return (
              <Pressable
                key={skill}
                onPress={() => toggleSkill(skill)}
                style={{
                  paddingHorizontal: spacing.md,
                  paddingVertical: 12,
                  borderRadius: radii.md,
                  borderWidth: 1,
                  borderColor: active ? colors.cardAccentBorder : colors.cardBorder,
                  backgroundColor: active ? colors.cardAccent : colors.card
                }}
              >
                <Text style={{ color: colors.textPrimary, fontSize: 14, fontWeight: "700" }}>{skill}</Text>
              </Pressable>
            );
          })}
        </View>
      </View>

      {error ? <Text style={{ color: colors.danger, fontSize: 14, lineHeight: 20 }}>{error}</Text> : null}

      <ButtonRow>
        <PrimaryButton
          label={submitting ? "提交中..." : "提交目标"}
          onPress={submit}
          disabled={submitting}
          testID="onboarding.submit"
        />
        <SecondaryButton label="返回首页" onPress={() => router.replace("/home")} />
      </ButtonRow>

      <InfoCard tone="accent">
        <Text style={{ color: colors.textMuted, fontSize: 12 }}>当前状态</Text>
        <Text style={{ color: colors.textPrimary, fontSize: 15, fontWeight: "700" }}>status: {statusMessage}</Text>
        <Text style={{ color: colors.textMuted, fontSize: 14 }}>assessment_id: {assessmentId ?? "-"}</Text>
        <Text style={{ color: colors.textMuted, fontSize: 14 }}>plan_id: {planId ?? "-"}</Text>
        {diagnosticPreview ? (
          <View style={{ gap: 6 }}>
            <Text style={{ color: colors.textMuted, fontSize: 14 }}>first_question_id: {diagnosticPreview.questionId}</Text>
            <Text style={{ color: colors.textMuted, fontSize: 14 }}>diagnostic_progress: {diagnosticPreview.progressText}</Text>
            <Text style={{ color: colors.textPrimary, fontSize: 14, lineHeight: 20 }}>
              first_question_prompt: {diagnosticPreview.prompt}
            </Text>
          </View>
        ) : null}
        <ButtonRow>
          <PrimaryButton
            label={diagnosticPreview ? "进入第一题" : "继续做诊断"}
            onPress={() =>
              router.push({
                pathname: "/diagnostic",
                params: assessmentId ? { assessmentId } : {}
              })
            }
            disabled={!assessmentId}
            testID="onboarding.continueDiagnostic"
          />
          <SecondaryButton label="稍后再做" onPress={() => router.replace("/home")} />
        </ButtonRow>
      </InfoCard>
    </AppScreen>
  );
}
