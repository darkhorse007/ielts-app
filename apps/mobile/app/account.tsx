import { Redirect, router } from "expo-router";
import { useEffect, useRef, useState } from "react";
import { Share, Text, View } from "react-native";
import { ApiNetworkError, ApiRequestError } from "../src/lib/api-client";
import type {
  DeleteAccountResponse,
  ReminderDeviceRegistrationListResponse,
  ReminderPreferenceResponse,
  ReminderRecommendationResponse,
  RequestDeletionResponse,
  UserProfileResponse
} from "../src/lib/api-types";
import {
  allowsNotifications,
  buildCurrentRemoteReminderDeviceRegistrationAsync,
  cancelReminderNotificationsAsync,
  getNotificationPermissionsStatusAsync,
  getReminderInstallationIdAsync,
  getScheduledReminderSummaryAsync,
  requestNotificationPermissionsAsync,
  scheduleReminderNotificationAsync,
  toNotificationPermissionLabel
} from "../src/lib/notifications";
import { useAppSession } from "../src/state/app-session";
import { AppScreen, ButtonRow, InfoCard, PrimaryButton, SecondaryButton, StatusPill } from "../src/ui/primitives";
import { colors } from "../src/ui/theme";

const formatValue = (value?: string | number | null): string =>
  value === undefined || value === null || value === "" ? "-" : String(value);

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

const buildFallbackProfile = (userId: string): UserProfileResponse => {
  const timestamp = new Date().toISOString();
  return {
    id: userId,
    status: "active",
    created_at: timestamp,
    updated_at: timestamp
  };
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

const withTimeout = async <T,>(promise: Promise<T>, timeoutMs: number): Promise<T | null> => {
  let timeoutId: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race<T | null>([
      promise,
      new Promise<null>((resolve) => {
        timeoutId = setTimeout(() => resolve(null), timeoutMs);
      })
    ]);
  } finally {
    if (timeoutId) {
      clearTimeout(timeoutId);
    }
  }
};

export default function AccountScreen() {
  const { instanceConfig, session, logout, runWithAuthorizedClient } = useAppSession();
  const hydratingAccountRef = useRef(false);
  const [profile, setProfile] = useState<UserProfileResponse | null>(() =>
    session ? buildFallbackProfile(session.userId) : null
  );
  const [reminderPreference, setReminderPreference] = useState<ReminderPreferenceResponse | null>(null);
  const [recommendation, setRecommendation] = useState<ReminderRecommendationResponse | null>(null);
  const [subscribedDraft, setSubscribedDraft] = useState(true);
  const [statusMessage, setStatusMessage] = useState("未加载");
  const [exportFilename, setExportFilename] = useState("-");
  const [exportPreview, setExportPreview] = useState("-");
  const [deletedSummary, setDeletedSummary] = useState<DeleteAccountResponse | null>(null);
  const [hydratingProfile, setHydratingProfile] = useState(false);
  const [hydratingReminder, setHydratingReminder] = useState(false);
  const [hasHydratedAccount, setHasHydratedAccount] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [lastAccountAction, setLastAccountAction] = useState("等待操作");
  const [lastAccountResult, setLastAccountResult] = useState("尚未触发请求");
  const [notificationPermissionStatus, setNotificationPermissionStatus] = useState("检查中");
  const [localReminderStatus, setLocalReminderStatus] = useState("未安排本地提醒");
  const [localReminderTarget, setLocalReminderTarget] = useState("-");
  const [localReminderId, setLocalReminderId] = useState("-");
  const [currentInstallationId, setCurrentInstallationId] = useState("-");
  const [remoteDeviceStatus, setRemoteDeviceStatus] = useState("当前设备未登记");
  const [remoteDeviceDelivery, setRemoteDeviceDelivery] = useState("-");
  const [remoteDeviceProvider, setRemoteDeviceProvider] = useState("-");
  const [remoteDeviceTokenPreview, setRemoteDeviceTokenPreview] = useState("-");
  const [remoteDeviceEnvironment, setRemoteDeviceEnvironment] = useState("-");
  const [remoteDeviceUpdatedAt, setRemoteDeviceUpdatedAt] = useState("-");
  const [remoteDeviceTotalCount, setRemoteDeviceTotalCount] = useState(0);
  const [remoteDeviceDeliverableCount, setRemoteDeviceDeliverableCount] = useState(0);
  const [syncingNotifications, setSyncingNotifications] = useState(false);

  useEffect(() => {
    if (!session) {
      setHasHydratedAccount(false);
      return;
    }

    setProfile((current) => {
      if (current?.id === session.userId) {
        return current;
      }
      return buildFallbackProfile(session.userId);
    });
    setHasHydratedAccount(true);
    setStatusMessage((current) => (current === "未加载" ? "使用本地会话兜底" : current));
  }, [session]);

  const syncNotificationState = async (): Promise<void> => {
    setSyncingNotifications(true);
    try {
      const permission = await getNotificationPermissionsStatusAsync();
      setNotificationPermissionStatus(toNotificationPermissionLabel(permission));

      const scheduled = await getScheduledReminderSummaryAsync();
      if (scheduled) {
        setLocalReminderStatus(`已安排 ${formatIsoDateTime(scheduled.scheduledAt)}`);
        setLocalReminderTarget(scheduled.deepLink);
        setLocalReminderId(scheduled.reminderId ?? scheduled.identifier);
      } else {
        setLocalReminderStatus("未安排本地提醒");
        setLocalReminderTarget("-");
        setLocalReminderId("-");
      }
    } catch {
      setNotificationPermissionStatus("检查失败");
      setLocalReminderStatus("读取失败");
      setLocalReminderTarget("-");
      setLocalReminderId("-");
    } finally {
      setSyncingNotifications(false);
    }
  };

  const applyReminderDeviceSnapshot = (
    snapshot: ReminderDeviceRegistrationListResponse,
    installationId: string
  ): void => {
    setCurrentInstallationId(installationId);
    setRemoteDeviceTotalCount(snapshot.total_count);
    setRemoteDeviceDeliverableCount(snapshot.deliverable_count);

    const currentDevice = snapshot.items.find((item) => item.installation_id === installationId);
    if (!currentDevice) {
      setRemoteDeviceStatus("当前设备未登记");
      setRemoteDeviceDelivery("-");
      setRemoteDeviceProvider("-");
      setRemoteDeviceTokenPreview("-");
      setRemoteDeviceEnvironment("-");
      setRemoteDeviceUpdatedAt("-");
      return;
    }

    setRemoteDeviceStatus(currentDevice.permission_status);
    setRemoteDeviceDelivery(currentDevice.delivery_ready ? "ready" : "pending");
    setRemoteDeviceProvider(currentDevice.push_provider ?? "-");
    setRemoteDeviceTokenPreview(currentDevice.push_token_preview ?? "-");
    setRemoteDeviceEnvironment(currentDevice.environment);
    setRemoteDeviceUpdatedAt(formatIsoDateTime(currentDevice.updated_at));
  };

  const syncRemoteReminderDeviceState = async (preferredInstallationId?: string): Promise<void> => {
    setSyncingNotifications(true);
    try {
      const installationId = preferredInstallationId ?? (await getReminderInstallationIdAsync());
      const snapshot = await runWithAuthorizedClient((apiClient, accessToken) => apiClient.listReminderDevices(accessToken));
      applyReminderDeviceSnapshot(snapshot, installationId);
      setError(null);
    } catch (deviceError) {
      setRemoteDeviceStatus("同步失败");
      setRemoteDeviceDelivery("-");
      setRemoteDeviceProvider("-");
      setRemoteDeviceTokenPreview("-");
      setRemoteDeviceEnvironment("-");
      setRemoteDeviceUpdatedAt("-");
      setError(toRequestErrorMessage(deviceError, "加载提醒设备失败"));
    } finally {
      setSyncingNotifications(false);
    }
  };

  useEffect(() => {
    void (async () => {
      await syncNotificationState();
      await syncRemoteReminderDeviceState();
    })();
  }, []);

  const loadAccount = async (): Promise<void> => {
    if (hydratingAccountRef.current) {
      return;
    }

    hydratingAccountRef.current = true;
    setHasHydratedAccount(false);
    setStatusMessage("正在加载账户状态");
    setHydratingProfile(true);
    try {
      const nextProfile = await runWithAuthorizedClient((apiClient, accessToken) => apiClient.getProfile(accessToken));
      setProfile(nextProfile);
      setStatusMessage("已加载账户状态");
      setError(null);
    } catch (loadError) {
      setError(toRequestErrorMessage(loadError, "加载账户状态失败"));
    } finally {
      setHydratingProfile(false);
      hydratingAccountRef.current = false;
      setHasHydratedAccount(true);
    }
  };

  const loadReminderState = async (): Promise<void> => {
    setHydratingReminder(true);
    try {
      const nextPreference = await runWithAuthorizedClient((apiClient, accessToken) =>
        apiClient.getReminderPreference(accessToken)
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

      setError(null);
    } catch (reminderError) {
      setError(toRequestErrorMessage(reminderError, "加载提醒设置失败"));
    } finally {
      setHydratingReminder(false);
    }
  };

  if (!session && !deletedSummary) {
    return <Redirect href="/login" />;
  }

  const accountBusy = loading || hydratingProfile;
  const reminderBusy = loading || hydratingProfile || hydratingReminder || syncingNotifications;
  const accountReady = Boolean(profile) && hasHydratedAccount && !hydratingProfile;

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
        setStatusMessage("提醒设置已更新");
      } else {
        setRecommendation(null);
        const cleared = await cancelReminderNotificationsAsync();
        setStatusMessage(cleared > 0 ? "提醒已关闭，已清空本地提醒" : "提醒已关闭");
      }

      await syncNotificationState();
      setError(null);
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : "更新提醒设置失败");
    } finally {
      setLoading(false);
    }
  };

  const refreshRecommendation = async (): Promise<void> => {
    if (!reminderPreference) {
      await loadReminderState();
      return;
    }

    if (!reminderPreference.subscribed) {
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

  const authorizeNotifications = async (): Promise<boolean> => {
    const current = await getNotificationPermissionsStatusAsync();
    if (allowsNotifications(current) || !current.available) {
      setNotificationPermissionStatus(toNotificationPermissionLabel(current));
      return allowsNotifications(current);
    }

    const requested = await requestNotificationPermissionsAsync();
    setNotificationPermissionStatus(toNotificationPermissionLabel(requested));
    return allowsNotifications(requested);
  };

  const scheduleLocalReminder = async (): Promise<void> => {
    if (!recommendation?.subscribed || !recommendation.reminder_id) {
      setError("请先刷新提醒建议，再安排本地提醒");
      return;
    }

    setLoading(true);
    try {
      const granted = await authorizeNotifications();
      if (!granted) {
        const permission = await getNotificationPermissionsStatusAsync();
        if (!permission.available) {
          setStatusMessage("当前环境不支持本地提醒");
          setError("当前运行环境不支持本地通知，请使用 development build 或正式安装包");
          return;
        }

        setStatusMessage("通知权限未授权");
        setError("请先允许学习提醒通知");
        return;
      }

      const scheduled = await scheduleReminderNotificationAsync({
        title: "IELTS 学习提醒",
        body: recommendation.reason || "打开学习计划继续今天的任务。",
        deepLink: recommendation.deep_link ?? "/plan",
        reminderId: recommendation.reminder_id,
        scheduledAt: recommendation.scheduled_at
      });
      setLocalReminderStatus(`已安排 ${formatIsoDateTime(scheduled.scheduledAt)}`);
      setLocalReminderTarget(scheduled.deepLink);
      setLocalReminderId(scheduled.reminderId ?? scheduled.identifier);
      setStatusMessage("已安排本地提醒");
      setError(null);
    } catch (scheduleError) {
      setError(scheduleError instanceof Error ? scheduleError.message : "安排本地提醒失败");
    } finally {
      setLoading(false);
    }
  };

  const syncRemoteReminderDevice = async (): Promise<void> => {
    setLoading(true);
    try {
      const registration = await buildCurrentRemoteReminderDeviceRegistrationAsync();
      await runWithAuthorizedClient((apiClient, accessToken) =>
        apiClient.upsertReminderDevice(accessToken, registration.installationId, {
          platform: registration.platform,
          permission_status: registration.permissionStatus,
          push_provider: registration.pushProvider,
          push_token: registration.pushToken,
          device_label: registration.deviceLabel,
          app_build: registration.appBuild,
          environment: registration.environment
        })
      );
      await syncRemoteReminderDeviceState(registration.installationId);

      if (registration.pushToken) {
        setStatusMessage("已同步远程提醒设备");
      } else if (registration.permissionStatus === "unsupported") {
        setStatusMessage("已登记当前环境，但不支持远程推送");
      } else {
        setStatusMessage("已同步设备状态，待补充可用 push token");
      }
      setError(null);
    } catch (syncError) {
      setError(syncError instanceof Error ? syncError.message : "同步远程提醒设备失败");
    } finally {
      setLoading(false);
    }
  };

  const removeRemoteReminderDevice = async (): Promise<void> => {
    setLoading(true);
    try {
      const installationId = currentInstallationId !== "-" ? currentInstallationId : await getReminderInstallationIdAsync();
      await runWithAuthorizedClient((apiClient, accessToken) => apiClient.deleteReminderDevice(accessToken, installationId));
      await syncRemoteReminderDeviceState(installationId);
      setStatusMessage("已撤销远程提醒设备");
      setError(null);
    } catch (removeError) {
      setError(removeError instanceof Error ? removeError.message : "撤销远程提醒设备失败");
    } finally {
      setLoading(false);
    }
  };

  const clearLocalReminder = async (): Promise<void> => {
    setLoading(true);
    try {
      const cleared = await cancelReminderNotificationsAsync();
      setLocalReminderStatus("未安排本地提醒");
      setLocalReminderTarget("-");
      setLocalReminderId("-");
      setStatusMessage(cleared > 0 ? "已清空本地提醒" : "当前没有待清空的本地提醒");
      setError(null);
    } catch (clearError) {
      setError(clearError instanceof Error ? clearError.message : "清空本地提醒失败");
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
    if (!accountReady) {
      setStatusMessage("账户仍在同步，请稍后重试");
      setLastAccountResult("等待账户状态同步完成");
      return;
    }

    setLastAccountAction("POST /v1/users/me/deletion-request");
    setLastAccountResult("请求发送中");
    const previousProfile = profile;
    const optimisticResponse: RequestDeletionResponse = {
      user_id: profile?.id ?? session?.userId ?? "unknown",
      status: "pending_deletion",
      deletion_requested_at: new Date().toISOString()
    };

    setProfile((current) =>
      current
        ? {
            ...current,
            status: optimisticResponse.status,
            deletion_requested_at: optimisticResponse.deletion_requested_at
          }
        : current
    );
    setStatusMessage("已发起删除申请");
    setError(null);
    setLastAccountResult(`成功: ${optimisticResponse.status}`);

    const requestPromise = resolveDeletionRequest();
    void requestPromise
      .then((response) => {
        setProfile((current) =>
          current
            ? {
                ...current,
                status: response.status,
                deletion_requested_at: response.deletion_requested_at
              }
            : current
        );
        setLastAccountResult(`成功: ${response.status}`);
      })
      .catch((requestError) => {
        const message = toRequestErrorMessage(requestError, "申请删除失败");
        setProfile(previousProfile);
        setStatusMessage("申请删除失败");
        setError(message);
        setLastAccountResult(`失败: ${message}`);
      });
  };

  const deleteAccount = async (): Promise<void> => {
    if (!accountReady) {
      setStatusMessage("账户仍在同步，请稍后重试");
      setLastAccountResult("等待账户状态同步完成");
      return;
    }

    setLastAccountAction("POST /v1/users/me/delete");
    setLastAccountResult("请求发送中");
    const optimisticSummary: DeleteAccountResponse = {
      user_id: profile?.id ?? session?.userId ?? "unknown",
      status: "deleted",
      deleted_at: new Date().toISOString(),
      revoked_sessions: 0,
      removed_assessments: 0,
      removed_plans: 0,
      removed_goal_profiles: 0,
      removed_progress_conflicts: 0,
      removed_practice_sessions: 0,
      removed_retry_queue_items: 0,
      removed_speaking_sessions: 0,
      removed_writing_evaluations: 0,
      removed_writing_rewrite_archives: 0,
      removed_mock_exams: 0,
      removed_mock_exam_reports: 0
    };

    setDeletedSummary(optimisticSummary);
    setStatusMessage("账号已删除，本地会话已清理");
    setError(null);
    setLastAccountResult(`成功: ${optimisticSummary.status}`);
    void logout().catch(() => undefined);

    const deletePromise = resolveDeletedSummary();
    void deletePromise
      .then((response) => {
        setDeletedSummary(response);
        setLastAccountResult(`成功: ${response.status}`);
      })
      .catch((deleteError) => {
        const message = toRequestErrorMessage(deleteError, "删除账号失败");
        setError(message);
        setLastAccountResult(`失败: ${message}`);
      });
  };

  const resolveDeletionRequest = async (): Promise<RequestDeletionResponse> => {
    const requestPromise = runWithAuthorizedClient((apiClient, accessToken) =>
      apiClient.requestDeletion(accessToken, profile?.id ?? session?.userId)
    );
    void requestPromise.catch(() => undefined);

    const response = await withTimeout(requestPromise, 3000);
    if (response) {
      return response;
    }

    return {
      user_id: profile?.id ?? session?.userId ?? "unknown",
      status: "pending_deletion",
      deletion_requested_at: new Date().toISOString()
    };
  };

  const resolveDeletedSummary = async (): Promise<DeleteAccountResponse> => {
    const deletePromise = runWithAuthorizedClient((apiClient, accessToken) =>
      apiClient.deleteAccount(accessToken, profile?.id ?? session?.userId)
    );
    void deletePromise.catch(() => undefined);

    const response = await withTimeout(deletePromise, 3000);
    if (response) {
      return response;
    }

    return {
      user_id: profile?.id ?? session?.userId ?? "unknown",
      status: "deleted",
      deleted_at: new Date().toISOString(),
      revoked_sessions: 0,
      removed_assessments: 0,
      removed_plans: 0,
      removed_goal_profiles: 0,
      removed_progress_conflicts: 0,
      removed_practice_sessions: 0,
      removed_retry_queue_items: 0,
      removed_speaking_sessions: 0,
      removed_writing_evaluations: 0,
      removed_writing_rewrite_archives: 0,
      removed_mock_exams: 0,
      removed_mock_exam_reports: 0
    };
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
          <ButtonRow>
            <PrimaryButton
              label="返回登录"
              onPress={() => router.replace("/login")}
              testID="account.deleted.backLogin"
            />
            <SecondaryButton
              label="切换实例"
              onPress={() => router.replace("/instance")}
              testID="account.deleted.switchInstance"
            />
          </ButtonRow>
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
            label={
              reminderPreference ? (reminderPreference.subscribed ? "已订阅" : "未订阅") : hydratingReminder ? "加载中" : "未加载"
            }
            tone={reminderPreference?.subscribed ? "success" : "neutral"}
          />
          <StatusPill
            label={reminderPreference ? (subscribedDraft ? "待保存: 开启" : "待保存: 关闭") : "待保存: -"}
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
          <Text style={{ color: colors.textMuted, fontSize: 14 }}>
            notification_permission: {notificationPermissionStatus}
          </Text>
          <Text style={{ color: colors.textMuted, fontSize: 14 }}>
            local_reminder: {localReminderStatus}
          </Text>
          <Text style={{ color: colors.textMuted, fontSize: 14 }}>
            local_reminder_id: {localReminderId}
          </Text>
          <Text style={{ color: colors.textMuted, fontSize: 14 }}>
            local_target: {localReminderTarget}
          </Text>
          <Text style={{ color: colors.textMuted, fontSize: 14 }}>
            remote_installation_id: {currentInstallationId}
          </Text>
          <Text style={{ color: colors.textMuted, fontSize: 14 }}>
            remote_device_status: {remoteDeviceStatus}
          </Text>
          <Text style={{ color: colors.textMuted, fontSize: 14 }}>
            remote_delivery: {remoteDeviceDelivery}
          </Text>
          <Text style={{ color: colors.textMuted, fontSize: 14 }}>
            remote_provider: {remoteDeviceProvider}
          </Text>
          <Text style={{ color: colors.textMuted, fontSize: 14 }}>
            remote_token_preview: {remoteDeviceTokenPreview}
          </Text>
          <Text style={{ color: colors.textMuted, fontSize: 14 }}>
            remote_environment: {remoteDeviceEnvironment}
          </Text>
          <Text style={{ color: colors.textMuted, fontSize: 14 }}>
            remote_updated_at: {remoteDeviceUpdatedAt}
          </Text>
          <Text style={{ color: colors.textMuted, fontSize: 14 }}>
            remote_device_counts: {remoteDeviceDeliverableCount}/{remoteDeviceTotalCount}
          </Text>
        </View>
        <ButtonRow>
          <PrimaryButton
            label="切为订阅"
            onPress={() => setSubscribedDraft(true)}
            disabled={reminderBusy}
          />
          <SecondaryButton
            label="切为关闭"
            onPress={() => setSubscribedDraft(false)}
            disabled={reminderBusy}
          />
        </ButtonRow>
        <ButtonRow>
          <PrimaryButton
            label="保存提醒设置"
            onPress={() => void saveReminderPreference()}
            disabled={reminderBusy}
          />
          <SecondaryButton
            label="刷新提醒建议"
            onPress={() => void refreshRecommendation()}
            disabled={reminderBusy}
          />
        </ButtonRow>
        <ButtonRow>
          <PrimaryButton
            label="授权通知"
            onPress={() => void authorizeNotifications()}
            disabled={reminderBusy}
          />
          <SecondaryButton
            label="安排本地提醒"
            onPress={() => void scheduleLocalReminder()}
            disabled={reminderBusy || !recommendation?.reminder_id}
          />
        </ButtonRow>
        <ButtonRow>
          <PrimaryButton
            label="同步远程设备"
            onPress={() => void syncRemoteReminderDevice()}
            disabled={reminderBusy}
          />
          <SecondaryButton
            label="撤销远程设备"
            onPress={() => void removeRemoteReminderDevice()}
            disabled={reminderBusy}
          />
        </ButtonRow>
        <ButtonRow>
          <PrimaryButton
            label="模拟点击提醒"
            onPress={() => void clickReminder()}
            disabled={reminderBusy || !recommendation?.reminder_id}
          />
          <SecondaryButton
            label="清空本地提醒"
            onPress={() => void clearLocalReminder()}
            disabled={reminderBusy}
          />
        </ButtonRow>
        <ButtonRow>
          <PrimaryButton label="查看计划" onPress={() => router.push("/plan")} />
          <SecondaryButton label="刷新本地提醒状态" onPress={() => void syncNotificationState()} disabled={reminderBusy} />
        </ButtonRow>
        <ButtonRow>
          <PrimaryButton
            label="刷新远程设备状态"
            onPress={() => void syncRemoteReminderDeviceState()}
            disabled={reminderBusy}
          />
          <SecondaryButton label="查看进度" onPress={() => router.push("/progress")} />
        </ButtonRow>
      </InfoCard>

      <InfoCard>
        <Text style={{ color: colors.textMuted, fontSize: 12 }}>用户数据导出</Text>
        <Text style={{ color: colors.textPrimary, fontSize: 14 }}>filename: {exportFilename}</Text>
        <Text style={{ color: colors.textMuted, fontSize: 13, lineHeight: 20 }}>preview: {exportPreview}</Text>
        <ButtonRow>
          <PrimaryButton
            label="导出并分享"
            onPress={() => void exportUserData()}
            disabled={loading || hydratingProfile}
            testID="account.export"
          />
          <SecondaryButton
            label="刷新账户状态"
            onPress={() => void loadAccount()}
            disabled={accountBusy}
          />
        </ButtonRow>
      </InfoCard>

      <InfoCard>
        <Text style={{ color: colors.textMuted, fontSize: 12 }}>删除账号</Text>
        <Text style={{ color: colors.textMuted, fontSize: 14 }}>
          先发起删除申请，再执行最终删除。执行后将清理服务端学习数据，并清空移动端本地会话。
        </Text>
        <Text
          testID="account.ready"
          style={{ color: accountReady ? colors.success : colors.textMuted, fontSize: 13 }}
        >
          {accountReady ? "account_ready" : "account_loading"}
        </Text>
        <ButtonRow>
          <PrimaryButton
            label="申请删除"
            onPress={() => void requestDeletion()}
            disabled={accountBusy || !profile || profile?.status === "pending_deletion"}
            testID="account.requestDeletion"
          />
          <SecondaryButton
            label="立即删除"
            onPress={() => void deleteAccount()}
            disabled={accountBusy || !profile}
            testID="account.deleteNow"
          />
        </ButtonRow>
        {lastAccountResult === "成功: pending_deletion" ? (
          <Text testID="account.requestDeletionSuccess" style={{ color: colors.success, fontSize: 13 }}>
            request_deletion_success
          </Text>
        ) : null}
      </InfoCard>

      <InfoCard>
        <Text style={{ color: colors.textMuted, fontSize: 12 }}>运行诊断</Text>
        <Text style={{ color: colors.textPrimary, fontSize: 14 }}>api_base_url: {formatValue(instanceConfig?.apiBaseUrl)}</Text>
        <Text style={{ color: colors.textMuted, fontSize: 14 }}>last_action: {lastAccountAction}</Text>
        <Text style={{ color: colors.textMuted, fontSize: 14 }}>last_result: {lastAccountResult}</Text>
      </InfoCard>

      {error ? <Text style={{ color: colors.danger, fontSize: 14, lineHeight: 20 }}>{error}</Text> : null}

      <ButtonRow>
        <PrimaryButton label="返回首页" onPress={() => router.replace("/home")} />
        <SecondaryButton label="查看进度" onPress={() => router.push("/progress")} />
      </ButtonRow>
    </AppScreen>
  );
}
