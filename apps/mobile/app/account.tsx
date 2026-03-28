import { router } from "expo-router";
import { useEffect, useEffectEvent, useState } from "react";
import { Share, Text, View } from "react-native";
import type {
  DeleteAccountResponse,
  ReminderPreferenceResponse,
  ReminderRecommendationResponse,
  UserProfileResponse
} from "../src/lib/api-types";
import { useAppSession } from "../src/state/app-session";
import { AppScreen, ButtonRow, InfoCard, PrimaryButton, SecondaryButton, StatusPill } from "../src/ui/primitives";
import { colors } from "../src/ui/theme";

const formatValue = (value?: string | number | null): string =>
  value === undefined || value === null || value === "" ? "-" : String(value);

const toStatusTone = (status: UserProfileResponse["status"] | null): "neutral" | "accent" | "success" => {
  if (status === "active") {
    return "success";
  }

  if (status === "pending_deletion") {
    return "accent";
  }

  return "neutral";
};

const toRemovalRows = (summary: DeleteAccountResponse): Array<{ label: string; value: number | undefined }> => [
  { label: "revoked_sessions", value: summary.revoked_sessions },
  { label: "removed_assessments", value: summary.removed_assessments },
  { label: "removed_plans", value: summary.removed_plans },
  { label: "removed_goal_profiles", value: summary.removed_goal_profiles },
  { label: "removed_progress_conflicts", value: summary.removed_progress_conflicts },
  { label: "removed_practice_sessions", value: summary.removed_practice_sessions },
  { label: "removed_retry_queue_items", value: summary.removed_retry_queue_items },
  { label: "removed_speaking_sessions", value: summary.removed_speaking_sessions },
  { label: "removed_writing_evaluations", value: summary.removed_writing_evaluations },
  { label: "removed_writing_rewrite_archives", value: summary.removed_writing_rewrite_archives },
  { label: "removed_mock_exams", value: summary.removed_mock_exams },
  { label: "removed_mock_exam_reports", value: summary.removed_mock_exam_reports }
];

export default function AccountScreen() {
  const { session, logout, runWithAuthorizedClient } = useAppSession();
  const [profile, setProfile] = useState<UserProfileResponse | null>(null);
  const [reminderPreference, setReminderPreference] = useState<ReminderPreferenceResponse | null>(null);
  const [recommendation, setRecommendation] = useState<ReminderRecommendationResponse | null>(null);
  const [subscribedDraft, setSubscribedDraft] = useState(true);
  const [statusMessage, setStatusMessage] = useState("未加载");
  const [exportFilename, setExportFilename] = useState("-");
  const [exportPreview, setExportPreview] = useState("-");
  const [deletedSummary, setDeletedSummary] = useState<DeleteAccountResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const loadAccount = useEffectEvent(async () => {
    setLoading(true);
    try {
      const [nextProfile, nextPreference] = await runWithAuthorizedClient((apiClient, accessToken) =>
        Promise.all([apiClient.getProfile(accessToken), apiClient.getReminderPreference(accessToken)])
      );
      setProfile(nextProfile);
      setReminderPreference(nextPreference);
      setSubscribedDraft(nextPreference.subscribed);

      if (nextPreference.subscribed) {
        const nextRecommendation = await runWithAuthorizedClient((apiClient, accessToken) =>
          apiClient.getReminderRecommendation(accessToken)
        );
        setRecommendation(nextRecommendation.subscribed ? nextRecommendation : null);
      } else {
        setRecommendation(null);
      }

      setStatusMessage("已加载账户状态");
      setError(null);
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "加载账户状态失败");
    } finally {
      setLoading(false);
    }
  });

  useEffect(() => {
    if (!session || deletedSummary) {
      return;
    }

    void loadAccount();
  }, [deletedSummary, loadAccount, session]);

  if (!session && !deletedSummary) {
    router.replace("/login");
    return null;
  }

  const saveReminderPreference = async (): Promise<void> => {
    setLoading(true);
    try {
      const nextPreference = await runWithAuthorizedClient((apiClient, accessToken) =>
        apiClient.updateReminderPreference(accessToken, {
          subscribed: subscribedDraft
        })
      );
      setReminderPreference(nextPreference);
      setSubscribedDraft(nextPreference.subscribed);

      if (nextPreference.subscribed) {
        const nextRecommendation = await runWithAuthorizedClient((apiClient, accessToken) =>
          apiClient.getReminderRecommendation(accessToken)
        );
        setRecommendation(nextRecommendation.subscribed ? nextRecommendation : null);
      } else {
        setRecommendation(null);
      }

      setStatusMessage(nextPreference.subscribed ? "提醒设置已更新" : "提醒已关闭");
      setError(null);
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : "更新提醒设置失败");
    } finally {
      setLoading(false);
    }
  };

  const refreshRecommendation = async (): Promise<void> => {
    if (!reminderPreference?.subscribed) {
      setStatusMessage("当前提醒已关闭");
      setRecommendation(null);
      setError(null);
      return;
    }

    setLoading(true);
    try {
      const nextRecommendation = await runWithAuthorizedClient((apiClient, accessToken) =>
        apiClient.getReminderRecommendation(accessToken)
      );
      setRecommendation(nextRecommendation.subscribed ? nextRecommendation : null);
      setStatusMessage("已刷新提醒建议");
      setError(null);
    } catch (refreshError) {
      setError(refreshError instanceof Error ? refreshError.message : "加载提醒建议失败");
    } finally {
      setLoading(false);
    }
  };

  const clickReminder = async (): Promise<void> => {
    if (!recommendation?.reminder_id) {
      setError("当前没有可点击的提醒");
      return;
    }
    const reminderId = recommendation.reminder_id;

    setLoading(true);
    try {
      const result = await runWithAuthorizedClient((apiClient, accessToken) =>
        apiClient.clickReminder(accessToken, reminderId)
      );
      setRecommendation((current) =>
        current
          ? {
              ...current,
              deep_link: result.deep_link
            }
          : current
      );
      setStatusMessage("已记录提醒点击");
      setError(null);
    } catch (clickError) {
      setError(clickError instanceof Error ? clickError.message : "记录提醒点击失败");
    } finally {
      setLoading(false);
    }
  };

  const exportUserData = async (): Promise<void> => {
    setLoading(true);
    try {
      const response = await runWithAuthorizedClient((apiClient, accessToken) =>
        apiClient.exportUserData(accessToken)
      );
      setExportFilename(response.filename);
      setExportPreview(response.content.slice(0, 200));
      await Share.share({
        title: response.filename,
        message: response.content
      });
      setStatusMessage(`已导出并分享 ${response.filename}`);
      setError(null);
    } catch (exportError) {
      setError(exportError instanceof Error ? exportError.message : "导出用户数据失败");
    } finally {
      setLoading(false);
    }
  };

  const requestDeletion = async (): Promise<void> => {
    setLoading(true);
    try {
      const response = await runWithAuthorizedClient((apiClient, accessToken) =>
        apiClient.requestDeletion(accessToken)
      );
      setProfile((current) =>
        current
          ? {
              ...current,
              status: response.status,
              deletion_requested_at: response.deletion_requested_at
            }
          : current
      );
      setStatusMessage("已发起删除申请");
      setError(null);
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "申请删除失败");
    } finally {
      setLoading(false);
    }
  };

  const deleteAccount = async (): Promise<void> => {
    setLoading(true);
    try {
      const response = await runWithAuthorizedClient((apiClient, accessToken) =>
        apiClient.deleteAccount(accessToken)
      );
      setDeletedSummary(response);
      await logout();
      setStatusMessage("账号已删除，本地会话已清理");
      setError(null);
    } catch (deleteError) {
      setError(deleteError instanceof Error ? deleteError.message : "删除账号失败");
    } finally {
      setLoading(false);
    }
  };

  if (deletedSummary) {
    return (
      <AppScreen
        eyebrow="Account"
        title="账号删除已完成"
        subtitle="服务端删除结果已返回，移动端本地会话也已清理。你可以重新登录，或切换到新的自托管实例。"
      >
        <InfoCard tone="accent">
          <ButtonRow>
            <StatusPill label={deletedSummary.status} tone="success" />
            <StatusPill label={statusMessage} tone="accent" />
          </ButtonRow>
          <Text style={{ color: colors.textPrimary, fontSize: 14 }}>user_id: {deletedSummary.user_id}</Text>
          <Text style={{ color: colors.textMuted, fontSize: 14 }}>deleted_at: {deletedSummary.deleted_at}</Text>
        </InfoCard>

        <InfoCard>
          <Text style={{ color: colors.textMuted, fontSize: 12 }}>清理结果</Text>
          <View style={{ gap: 6 }}>
            {toRemovalRows(deletedSummary).map((item) => (
              <Text key={item.label} style={{ color: colors.textMuted, fontSize: 13 }}>
                {item.label}: {item.value ?? 0}
              </Text>
            ))}
          </View>
        </InfoCard>

        <ButtonRow>
          <PrimaryButton label="返回登录" onPress={() => router.replace("/login")} />
          <SecondaryButton label="切换实例" onPress={() => router.replace("/instance")} />
        </ButtonRow>
      </AppScreen>
    );
  }

  return (
    <AppScreen
      eyebrow="Account"
      title="账户中心已进入移动端"
      subtitle="这里对齐 Web 侧 profile、提醒偏好、数据导出、删除申请与删除执行契约，并在删除后清理本地会话。"
    >
      <InfoCard tone="accent">
        <Text style={{ color: colors.textMuted, fontSize: 12 }}>账户资料</Text>
        <ButtonRow>
          <StatusPill label={profile?.status ?? "未加载"} tone={toStatusTone(profile?.status ?? null)} />
          <StatusPill label={statusMessage} tone={profile ? "accent" : "neutral"} />
        </ButtonRow>
        <View style={{ gap: 6, marginTop: 10 }}>
          <Text style={{ color: colors.textPrimary, fontSize: 14 }}>user_id: {formatValue(profile?.id)}</Text>
          <Text style={{ color: colors.textMuted, fontSize: 14 }}>email: {formatValue(profile?.email)}</Text>
          <Text style={{ color: colors.textMuted, fontSize: 14 }}>phone: {formatValue(profile?.phone)}</Text>
          <Text style={{ color: colors.textMuted, fontSize: 14 }}>
            deletion_requested_at: {formatValue(profile?.deletion_requested_at)}
          </Text>
          <Text style={{ color: colors.textMuted, fontSize: 14 }}>updated_at: {formatValue(profile?.updated_at)}</Text>
        </View>
      </InfoCard>

      <InfoCard>
        <Text style={{ color: colors.textMuted, fontSize: 12 }}>提醒偏好</Text>
        <ButtonRow>
          <StatusPill
            label={reminderPreference?.subscribed ? "已订阅" : "未订阅"}
            tone={reminderPreference?.subscribed ? "success" : "neutral"}
          />
          <StatusPill
            label={subscribedDraft ? "待保存: 开启" : "待保存: 关闭"}
            tone={subscribedDraft ? "accent" : "neutral"}
          />
        </ButtonRow>
        <View style={{ gap: 6, marginTop: 10 }}>
          <Text style={{ color: colors.textPrimary, fontSize: 14 }}>
            active_hour_utc: {formatValue(reminderPreference?.active_hour_utc)}
          </Text>
          <Text style={{ color: colors.textMuted, fontSize: 14 }}>
            updated_at: {formatValue(reminderPreference?.updated_at)}
          </Text>
          <Text style={{ color: colors.textMuted, fontSize: 14 }}>
            reminder_id: {formatValue(recommendation?.reminder_id)}
          </Text>
          <Text style={{ color: colors.textMuted, fontSize: 14 }}>
            scheduled_at: {formatValue(recommendation?.scheduled_at)}
          </Text>
          <Text style={{ color: colors.textMuted, fontSize: 14 }}>reason: {formatValue(recommendation?.reason)}</Text>
          <Text style={{ color: colors.textMuted, fontSize: 14 }}>
            deep_link: {formatValue(recommendation?.deep_link)}
          </Text>
        </View>
        <ButtonRow>
          <PrimaryButton label="切为订阅" onPress={() => setSubscribedDraft(true)} disabled={loading} />
          <SecondaryButton label="切为关闭" onPress={() => setSubscribedDraft(false)} disabled={loading} />
        </ButtonRow>
        <ButtonRow>
          <PrimaryButton label="保存提醒设置" onPress={() => void saveReminderPreference()} disabled={loading} />
          <SecondaryButton label="刷新提醒建议" onPress={() => void refreshRecommendation()} disabled={loading} />
        </ButtonRow>
        <ButtonRow>
          <PrimaryButton
            label="模拟点击提醒"
            onPress={() => void clickReminder()}
            disabled={loading || !recommendation?.reminder_id}
          />
          <SecondaryButton label="查看计划" onPress={() => router.push("/plan")} />
        </ButtonRow>
      </InfoCard>

      <InfoCard>
        <Text style={{ color: colors.textMuted, fontSize: 12 }}>用户数据导出</Text>
        <Text style={{ color: colors.textPrimary, fontSize: 14 }}>filename: {exportFilename}</Text>
        <Text style={{ color: colors.textMuted, fontSize: 13, lineHeight: 20 }}>preview: {exportPreview}</Text>
        <ButtonRow>
          <PrimaryButton label="导出并分享" onPress={() => void exportUserData()} disabled={loading} />
          <SecondaryButton label="刷新账户状态" onPress={() => void loadAccount()} disabled={loading} />
        </ButtonRow>
      </InfoCard>

      <InfoCard>
        <Text style={{ color: colors.textMuted, fontSize: 12 }}>删除账号</Text>
        <Text style={{ color: colors.textMuted, fontSize: 14 }}>
          先发起删除申请，再执行最终删除。执行后将清理服务端学习数据，并清空移动端本地会话。
        </Text>
        <ButtonRow>
          <PrimaryButton label="申请删除" onPress={() => void requestDeletion()} disabled={loading} />
          <SecondaryButton label="立即删除" onPress={() => void deleteAccount()} disabled={loading} />
        </ButtonRow>
      </InfoCard>

      {error ? <Text style={{ color: colors.danger, fontSize: 14, lineHeight: 20 }}>{error}</Text> : null}

      <ButtonRow>
        <PrimaryButton label="返回首页" onPress={() => router.replace("/home")} />
        <SecondaryButton label="查看进度" onPress={() => router.push("/progress")} />
      </ButtonRow>
    </AppScreen>
  );
}
