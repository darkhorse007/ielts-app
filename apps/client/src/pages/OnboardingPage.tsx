import { useState } from "react";
import type { ApiClient } from "../lib/api-client";
import { validateBandScore } from "../lib/validators";
import { TokenStorage } from "../lib/token-storage";

type OnboardingPageProps = {
  apiClient: Pick<ApiClient, "submitOnboarding" | "fetchOnboardingStatus">;
  tokenStorage: TokenStorage;
};

type WeakSkill = "listening" | "speaking" | "reading" | "writing";

const todayDate = (): string => {
  const now = new Date();
  const year = now.getUTCFullYear();
  const month = String(now.getUTCMonth() + 1).padStart(2, "0");
  const day = String(now.getUTCDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
};

export const OnboardingPage = ({ apiClient, tokenStorage }: OnboardingPageProps) => {
  const [targetBand, setTargetBand] = useState("6.5");
  const [targetExamDate, setTargetExamDate] = useState("");
  const [weeklyHours, setWeeklyHours] = useState("10");
  const [weakSkills, setWeakSkills] = useState<WeakSkill[]>([]);
  const [statusMessage, setStatusMessage] = useState("未提交");
  const [assessmentId, setAssessmentId] = useState<string | null>(null);
  const [planId, setPlanId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const [lastPayload, setLastPayload] = useState<{
    targetBand: number;
    targetExamDate: string;
    weeklyHours: number;
    weakSkills: WeakSkill[];
  } | null>(null);

  const toggleSkill = (skill: WeakSkill): void => {
    setWeakSkills((current) => {
      if (current.includes(skill)) {
        return current.filter((item) => item !== skill);
      }
      return [...current, skill];
    });
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

  const submitWithPayload = async (payload: {
    targetBand: number;
    targetExamDate: string;
    weeklyHours: number;
    weakSkills: WeakSkill[];
  }): Promise<void> => {
    const accessToken = tokenStorage.getAccessToken();
    if (!accessToken) {
      throw new Error("会话已失效，请重新登录");
    }

    const idempotencyKey = `goal-${Date.now()}`;
    const response = await apiClient.submitOnboarding(
      accessToken,
      {
        target_overall_band: payload.targetBand,
        target_exam_date: payload.targetExamDate,
        weekly_study_hours: payload.weeklyHours,
        weak_skills: payload.weakSkills
      },
      idempotencyKey
    );

    setAssessmentId(response.assessment_id);
    setPlanId(response.plan_id);
    setStatusMessage(response.status);

    const status = await apiClient.fetchOnboardingStatus(accessToken, response.assessment_id);
    setStatusMessage(status.status);
  };

  const submit = async (): Promise<void> => {
    setError(null);
    setSubmitting(true);

    try {
      const { targetBandValue, weeklyHoursValue } = validate();
      const payload = {
        targetBand: targetBandValue,
        targetExamDate,
        weeklyHours: weeklyHoursValue,
        weakSkills
      };
      setLastPayload(payload);
      await submitWithPayload(payload);
    } catch (submitError) {
      setError(submitError instanceof Error ? submitError.message : "提交失败");
      setStatusMessage("failed");
    } finally {
      setSubmitting(false);
    }
  };

  const retry = async (): Promise<void> => {
    if (!lastPayload) {
      setError("没有可重试的请求");
      return;
    }

    setError(null);
    setSubmitting(true);
    try {
      await submitWithPayload(lastPayload);
    } catch (retryError) {
      setError(retryError instanceof Error ? retryError.message : "重试失败");
      setStatusMessage("failed");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <section>
      <h1>目标设置</h1>
      {error ? <p role="alert">{error}</p> : null}

      <label htmlFor="target-band">目标分</label>
      <input
        id="target-band"
        name="target-band"
        value={targetBand}
        onChange={(event) => setTargetBand(event.target.value)}
      />

      <label htmlFor="target-exam-date">考试日期</label>
      <input
        id="target-exam-date"
        name="target-exam-date"
        type="date"
        value={targetExamDate}
        onChange={(event) => setTargetExamDate(event.target.value)}
      />

      <label htmlFor="weekly-hours">每周学习时长</label>
      <input
        id="weekly-hours"
        name="weekly-hours"
        value={weeklyHours}
        onChange={(event) => setWeeklyHours(event.target.value)}
      />

      <fieldset>
        <legend>薄弱科目</legend>
        {(["listening", "speaking", "reading", "writing"] as WeakSkill[]).map((skill) => (
          <label key={skill} htmlFor={`weak-${skill}`}>
            <input
              id={`weak-${skill}`}
              type="checkbox"
              checked={weakSkills.includes(skill)}
              onChange={() => toggleSkill(skill)}
            />
            {skill}
          </label>
        ))}
      </fieldset>

      <button type="button" onClick={submit} disabled={submitting}>
        {submitting ? "提交中..." : "提交目标"}
      </button>
      <button type="button" onClick={retry} disabled={submitting}>
        重试
      </button>

      <p>assessment_id: {assessmentId ?? "-"}</p>
      <p>plan_id: {planId ?? "-"}</p>
      <p>status: {statusMessage}</p>
    </section>
  );
};
