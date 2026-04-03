import { Redirect, router } from "expo-router";
import { useEffect, useRef, useState } from "react";
import { Share, Text, View } from "react-native";
import { ApiNetworkError, ApiRequestError } from "../src/lib/api-client";
import type {
  DeleteAccountResponse,
  MinorGuardianSupportContactChannel,
  MinorGuardianSupportRequestResponse,
  MinorGuardianSupportRequestTopic,
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
  emitDebugReminderNotificationOpen,
  getNotificationPermissionsStatusAsync,
  getReminderInstallationIdAsync,
  getScheduledReminderSummaryAsync,
  requestNotificationPermissionsAsync,
  scheduleReminderNotificationAsync,
  toNotificationPermissionLabel
} from "../src/lib/notifications";
import {
  formatMinorGuardianAgeBandLabel,
  useMinorGuardian,
  type MinorGuardianAgeBand
} from "../src/state/minor-guardian";
import { useAppSession } from "../src/state/app-session";
import { AppScreen, ButtonRow, InfoCard, PrimaryButton, SecondaryButton, StatusPill, TextField } from "../src/ui/primitives";
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

const formatMinorGuardianSupportTopicLabel = (topic: MinorGuardianSupportRequestTopic): string => {
  switch (topic) {
    case "account_review":
      return "账号情况";
    case "data_deletion":
      return "删除数据";
    case "usage_concern":
      return "使用疑虑";
    default:
      return "其他";
  }
};

const formatMinorGuardianSupportChannelLabel = (channel: MinorGuardianSupportContactChannel): string =>
  channel === "phone" ? "手机号" : "邮箱";

const formatMinorGuardianSupportStatusLabel = (status: MinorGuardianSupportRequestResponse["status"]): string => {
  switch (status) {
    case "contacted":
      return "已联系";
    case "closed":
      return "已关闭";
    default:
      return "待处理";
  }
};

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

const reminderNotificationHarnessEnabled = process.env.EXPO_PUBLIC_E2E_REMINDER_NOTIFICATION_HARNESS === "true";

export default function AccountScreen() {
  const { instanceConfig, session, logout, runWithAuthorizedClient, syncReminderDevice } = useAppSession();
  const { ready: minorGuardianReady, state: minorGuardianState, setAgeBand: setMinorGuardianAgeBand } = useMinorGuardian();
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
  const [minorGuardianSupportRequests, setMinorGuardianSupportRequests] = useState<MinorGuardianSupportRequestResponse[]>([]);
  const [minorGuardianSupportTopic, setMinorGuardianSupportTopic] =
    useState<MinorGuardianSupportRequestTopic>("account_review");
  const [minorGuardianSupportContactChannel, setMinorGuardianSupportContactChannel] =
    useState<MinorGuardianSupportContactChannel>("email");
  const [minorGuardianSupportContactValue, setMinorGuardianSupportContactValue] = useState("");
  const [minorGuardianSupportMessage, setMinorGuardianSupportMessage] = useState("");
  const [hydratingMinorGuardianSupport, setHydratingMinorGuardianSupport] = useState(false);
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
  const [remoteLastDeliveryStatus, setRemoteLastDeliveryStatus] = useState("-");
  const [remoteLastDeliveryFailureCode, setRemoteLastDeliveryFailureCode] = useState("-");
  const [remoteLastDeliveryFailureMessage, setRemoteLastDeliveryFailureMessage] = useState("-");
  const [remoteLastDeliveryRetryCount, setRemoteLastDeliveryRetryCount] = useState("-");
  const [remoteLastDeliveryUpdatedAt, setRemoteLastDeliveryUpdatedAt] = useState("-");
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
      setRemoteLastDeliveryStatus("-");
      setRemoteLastDeliveryFailureCode("-");
      setRemoteLastDeliveryFailureMessage("-");
      setRemoteLastDeliveryRetryCount("-");
      setRemoteLastDeliveryUpdatedAt("-");
      return;
    }

    setRemoteDeviceStatus(currentDevice.permission_status);
    setRemoteDeviceDelivery(currentDevice.delivery_ready ? "ready" : "pending");
    setRemoteDeviceProvider(currentDevice.push_provider ?? "-");
    setRemoteDeviceTokenPreview(currentDevice.push_token_preview ?? "-");
    setRemoteDeviceEnvironment(currentDevice.environment);
    setRemoteDeviceUpdatedAt(formatIsoDateTime(currentDevice.updated_at));
    setRemoteLastDeliveryStatus(currentDevice.last_delivery_attempt?.status ?? "-");
    setRemoteLastDeliveryFailureCode(currentDevice.last_delivery_attempt?.failure_code ?? "-");
    setRemoteLastDeliveryFailureMessage(currentDevice.last_delivery_attempt?.failure_message ?? "-");
    setRemoteLastDeliveryRetryCount(
      currentDevice.last_delivery_attempt ? String(currentDevice.last_delivery_attempt.retry_count) : "-"
    );
    setRemoteLastDeliveryUpdatedAt(formatIsoDateTime(currentDevice.last_delivery_attempt?.updated_at));
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
      setRemoteLastDeliveryStatus("-");
      setRemoteLastDeliveryFailureCode("-");
      setRemoteLastDeliveryFailureMessage("-");
      setRemoteLastDeliveryRetryCount("-");
      setRemoteLastDeliveryUpdatedAt("-");
      setError(toRequestErrorMessage(deviceError, "加载提醒设备失败"));
    } finally {
      setSyncingNotifications(false);
    }
  };

  useEffect(() => {
    void (async () => {
      await syncNotificationState();
      await syncRemoteReminderDeviceState();
      await loadMinorGuardianSupportRequests();
    })();
  }, []);

  useEffect(() => {
    if (minorGuardianSupportContactValue) {
      return;
    }

    if (minorGuardianSupportContactChannel === "email" && profile?.email) {
      setMinorGuardianSupportContactValue(profile.email);
      return;
    }

    if (minorGuardianSupportContactChannel === "phone" && profile?.phone) {
      setMinorGuardianSupportContactValue(profile.phone);
    }
  }, [minorGuardianSupportContactChannel, minorGuardianSupportContactValue, profile?.email, profile?.phone]);

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

  const loadMinorGuardianSupportRequests = async (): Promise<void> => {
    setHydratingMinorGuardianSupport(true);
    try {
      const response = await runWithAuthorizedClient((apiClient, accessToken) =>
        apiClient.listMinorGuardianSupportRequests(accessToken)
      );
      setMinorGuardianSupportRequests(response.items);
      setError(null);
    } catch (supportError) {
      setError(toRequestErrorMessage(supportError, "加载监护人联络申请失败"));
    } finally {
      setHydratingMinorGuardianSupport(false);
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
  const minorGuardianBusy = loading || !minorGuardianReady;
  const minorGuardianSupportBusy = loading || hydratingMinorGuardianSupport;
  const accountReady = Boolean(profile) && hasHydratedAccount && !hydratingProfile;
  const guardianNoticeStatus =
    minorGuardianState.ageBand === "under_18"
      ? minorGuardianState.guardianNoticeAcceptedUserId === session?.userId
        ? "已确认"
        : "待确认"
      : "-";
  const latestMinorGuardianSupportRequest = minorGuardianSupportRequests[0] ?? null;

  const updateMinorGuardianState = async (ageBand: MinorGuardianAgeBand): Promise<void> => {
    setLoading(true);
    try {
      await setMinorGuardianAgeBand(ageBand, "account");
      setStatusMessage(
        ageBand === "under_18"
          ? "已更新年龄状态，请完成监护提示确认"
          : ageBand === "adult"
            ? "已更新年龄状态：已满 18 周岁"
            : "已清空年龄状态"
      );
      setError(null);
    } catch (minorGuardianError) {
      setError(
        minorGuardianError instanceof Error ? minorGuardianError.message : "更新未成年人监护状态失败"
      );
    } finally {
      setLoading(false);
    }
  };

  const submitMinorGuardianSupportRequest = async (): Promise<void> => {
    const contactValue = minorGuardianSupportContactValue.trim();
    const message = minorGuardianSupportMessage.trim();

    if (!contactValue) {
      setError("请填写监护人联系邮箱或手机号");
      return;
    }

    if (!message || message.length < 8) {
      setError("请填写至少 8 个字的联络说明");
      return;
    }

    setLoading(true);
    try {
      const created = await runWithAuthorizedClient((apiClient, accessToken) =>
        apiClient.submitMinorGuardianSupportRequest(accessToken, {
          topic: minorGuardianSupportTopic,
          contact_channel: minorGuardianSupportContactChannel,
          contact_value: contactValue,
          message
        })
      );
      setMinorGuardianSupportRequests((current) =>
        [created, ...current.filter((item) => item.request_id !== created.request_id)].sort((left, right) =>
          right.created_at.localeCompare(left.created_at)
        )
      );
      setMinorGuardianSupportMessage("");
      setStatusMessage("已提交监护人联络申请");
      setError(null);
    } catch (supportError) {
      setError(toRequestErrorMessage(supportError, "提交监护人联络申请失败"));
    } finally {
      setLoading(false);
    }
  };

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
      await syncReminderDevice();
      if (session) {
        await syncRemoteReminderDeviceState();
      }
      return allowsNotifications(current);
    }

    const requested = await requestNotificationPermissionsAsync();
    setNotificationPermissionStatus(toNotificationPermissionLabel(requested));
    await syncReminderDevice({ force: true });
    if (session) {
      await syncRemoteReminderDeviceState();
    }
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
      await syncReminderDevice({ force: true });
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

  const simulateReminderNotificationOpen = (): void => {
    const target = emitDebugReminderNotificationOpen({
      deepLink: recommendation?.deep_link ?? "/plan",
      reminderId: recommendation?.reminder_id ?? null
    });

    if (!target) {
      setError("当前没有可模拟的提醒目标");
      return;
    }

    setStatusMessage(`已触发提醒桥接: ${target.route}`);
    setError(null);
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
        <Text style={{ color: colors.textMuted, fontSize: 12 }}>未成年人监护提示</Text>
        <ButtonRow>
          <StatusPill label={formatMinorGuardianAgeBandLabel(minorGuardianState.ageBand)} tone="accent" />
          <StatusPill label={guardianNoticeStatus} tone={guardianNoticeStatus === "已确认" ? "success" : "neutral"} />
        </ButtonRow>
        <View style={{ gap: 6, marginTop: 10 }}>
          <Text style={{ color: colors.textPrimary, fontSize: 14 }}>
            minor_guardian_age_band: {formatMinorGuardianAgeBandLabel(minorGuardianState.ageBand)}
          </Text>
          <Text style={{ color: colors.textMuted, fontSize: 14 }}>
            minor_guardian_source: {formatValue(minorGuardianState.source)}
          </Text>
          <Text style={{ color: colors.textMuted, fontSize: 14 }}>
            minor_guardian_updated_at: {formatValue(minorGuardianState.updatedAt)}
          </Text>
          <Text style={{ color: colors.textMuted, fontSize: 14 }}>
            minor_guardian_notice: {guardianNoticeStatus}
          </Text>
          <Text style={{ color: colors.textMuted, fontSize: 14 }}>
            minor_guardian_notice_accepted_at: {formatValue(minorGuardianState.guardianNoticeAcceptedAt)}
          </Text>
        </View>
        <ButtonRow>
          <PrimaryButton
            label="切为已满 18 周岁"
            onPress={() => void updateMinorGuardianState("adult")}
            disabled={minorGuardianBusy}
            testID="account.minorGuardianAdult"
          />
          <SecondaryButton
            label="切为未满 18 周岁"
            onPress={() => void updateMinorGuardianState("under_18")}
            disabled={minorGuardianBusy}
            testID="account.minorGuardianMinor"
          />
        </ButtonRow>
        <ButtonRow>
          <SecondaryButton
            label="重置年龄状态"
            onPress={() => void updateMinorGuardianState("unknown")}
            disabled={minorGuardianBusy}
            testID="account.minorGuardianReset"
          />
        </ButtonRow>
      </InfoCard>

      <InfoCard>
        <Text style={{ color: colors.textMuted, fontSize: 12 }}>监护人联络申请</Text>
        <ButtonRow>
          <StatusPill
            label={latestMinorGuardianSupportRequest ? formatMinorGuardianSupportStatusLabel(latestMinorGuardianSupportRequest.status) : "尚未提交"}
            tone={latestMinorGuardianSupportRequest ? "accent" : "neutral"}
          />
          <StatusPill
            label={latestMinorGuardianSupportRequest ? formatMinorGuardianSupportTopicLabel(latestMinorGuardianSupportRequest.topic) : "待选择主题"}
            tone="neutral"
          />
        </ButtonRow>
        <View style={{ gap: 6, marginTop: 10 }}>
          <Text style={{ color: colors.textPrimary, fontSize: 14 }}>
            support_request_count: {minorGuardianSupportRequests.length}
          </Text>
          <Text style={{ color: colors.textMuted, fontSize: 14 }}>
            support_request_latest_topic: {latestMinorGuardianSupportRequest ? formatMinorGuardianSupportTopicLabel(latestMinorGuardianSupportRequest.topic) : "-"}
          </Text>
          <Text style={{ color: colors.textMuted, fontSize: 14 }}>
            support_request_latest_status: {latestMinorGuardianSupportRequest ? formatMinorGuardianSupportStatusLabel(latestMinorGuardianSupportRequest.status) : "-"}
          </Text>
          <Text style={{ color: colors.textMuted, fontSize: 14 }}>
            support_request_latest_contact_channel: {latestMinorGuardianSupportRequest ? formatMinorGuardianSupportChannelLabel(latestMinorGuardianSupportRequest.contact_channel) : "-"}
          </Text>
          <Text style={{ color: colors.textMuted, fontSize: 14 }}>
            support_request_latest_created_at: {formatIsoDateTime(latestMinorGuardianSupportRequest?.created_at)}
          </Text>
        </View>
        <Text style={{ color: colors.textMuted, fontSize: 13, lineHeight: 20 }}>
          如监护人希望了解账号、删除数据或反馈未成年人使用疑虑，可在此登记联系信息，当前状态会保存在账户记录中。
        </Text>
        <ButtonRow>
          <SecondaryButton
            label={minorGuardianSupportTopic === "account_review" ? "已选: 账号情况" : "账号情况"}
            onPress={() => setMinorGuardianSupportTopic("account_review")}
            disabled={minorGuardianSupportBusy}
            testID="account.guardianSupportTopicAccountReview"
          />
          <SecondaryButton
            label={minorGuardianSupportTopic === "data_deletion" ? "已选: 删除数据" : "删除数据"}
            onPress={() => setMinorGuardianSupportTopic("data_deletion")}
            disabled={minorGuardianSupportBusy}
            testID="account.guardianSupportTopicDataDeletion"
          />
        </ButtonRow>
        <ButtonRow>
          <SecondaryButton
            label={minorGuardianSupportTopic === "usage_concern" ? "已选: 使用疑虑" : "使用疑虑"}
            onPress={() => setMinorGuardianSupportTopic("usage_concern")}
            disabled={minorGuardianSupportBusy}
            testID="account.guardianSupportTopicUsageConcern"
          />
          <SecondaryButton
            label={minorGuardianSupportTopic === "other" ? "已选: 其他" : "其他"}
            onPress={() => setMinorGuardianSupportTopic("other")}
            disabled={minorGuardianSupportBusy}
            testID="account.guardianSupportTopicOther"
          />
        </ButtonRow>
        <ButtonRow>
          <SecondaryButton
            label={minorGuardianSupportContactChannel === "email" ? "已选: 邮箱" : "邮箱"}
            onPress={() => {
              setMinorGuardianSupportContactChannel("email");
              if (!minorGuardianSupportContactValue && profile?.email) {
                setMinorGuardianSupportContactValue(profile.email);
              }
            }}
            disabled={minorGuardianSupportBusy}
            testID="account.guardianSupportChannelEmail"
          />
          <SecondaryButton
            label={minorGuardianSupportContactChannel === "phone" ? "已选: 手机号" : "手机号"}
            onPress={() => {
              setMinorGuardianSupportContactChannel("phone");
              if (!minorGuardianSupportContactValue && profile?.phone) {
                setMinorGuardianSupportContactValue(profile.phone);
              }
            }}
            disabled={minorGuardianSupportBusy}
            testID="account.guardianSupportChannelPhone"
          />
        </ButtonRow>
        <TextField
          label="监护人联系方式"
          value={minorGuardianSupportContactValue}
          onChangeText={setMinorGuardianSupportContactValue}
          placeholder={minorGuardianSupportContactChannel === "email" ? "guardian@example.com" : "13800000000"}
          autoCapitalize="none"
          keyboardType={minorGuardianSupportContactChannel === "email" ? "email-address" : "phone-pad"}
          editable={minorGuardianSupportBusy ? false : undefined}
          testID="account.guardianSupportContactValue"
        />
        <TextField
          label="联络说明"
          value={minorGuardianSupportMessage}
          onChangeText={setMinorGuardianSupportMessage}
          placeholder="例如：希望了解如何导出学习数据并申请删除。"
          multiline
          numberOfLines={4}
          editable={minorGuardianSupportBusy ? false : undefined}
          testID="account.guardianSupportMessage"
        />
        <ButtonRow>
          <PrimaryButton
            label="提交联络申请"
            onPress={() => void submitMinorGuardianSupportRequest()}
            disabled={minorGuardianSupportBusy}
            testID="account.guardianSupportSubmit"
          />
          <SecondaryButton
            label="刷新申请状态"
            onPress={() => void loadMinorGuardianSupportRequests()}
            disabled={minorGuardianSupportBusy}
            testID="account.guardianSupportRefresh"
          />
        </ButtonRow>
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
            remote_last_delivery_status: {remoteLastDeliveryStatus}
          </Text>
          <Text style={{ color: colors.textMuted, fontSize: 14 }}>
            remote_last_delivery_failure_code: {remoteLastDeliveryFailureCode}
          </Text>
          <Text style={{ color: colors.textMuted, fontSize: 14 }}>
            remote_last_delivery_failure_message: {remoteLastDeliveryFailureMessage}
          </Text>
          <Text style={{ color: colors.textMuted, fontSize: 14 }}>
            remote_last_delivery_retry_count: {remoteLastDeliveryRetryCount}
          </Text>
          <Text style={{ color: colors.textMuted, fontSize: 14 }}>
            remote_last_delivery_updated_at: {remoteLastDeliveryUpdatedAt}
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
            testID="account.reminderSave"
          />
          <SecondaryButton
            label="刷新提醒建议"
            onPress={() => void refreshRecommendation()}
            disabled={reminderBusy}
            testID="account.reminderRefresh"
          />
        </ButtonRow>
        <ButtonRow>
          <PrimaryButton
            label="授权通知"
            onPress={() => void authorizeNotifications()}
            disabled={reminderBusy}
            testID="account.reminderAuthorize"
          />
          <SecondaryButton
            label="安排本地提醒"
            onPress={() => void scheduleLocalReminder()}
            disabled={reminderBusy || !recommendation?.reminder_id}
            testID="account.reminderScheduleLocal"
          />
        </ButtonRow>
        <ButtonRow>
          <PrimaryButton
            label="同步远程设备"
            onPress={() => void syncRemoteReminderDevice()}
            disabled={reminderBusy}
            testID="account.reminderSyncRemote"
          />
          <SecondaryButton
            label="撤销远程设备"
            onPress={() => void removeRemoteReminderDevice()}
            disabled={reminderBusy}
            testID="account.reminderRemoveRemote"
          />
        </ButtonRow>
        <ButtonRow>
          <PrimaryButton
            label="模拟点击提醒"
            onPress={() => void clickReminder()}
            disabled={reminderBusy || !recommendation?.reminder_id}
            testID="account.reminderClick"
          />
          <SecondaryButton
            label="清空本地提醒"
            onPress={() => void clearLocalReminder()}
            disabled={reminderBusy}
            testID="account.reminderClearLocal"
          />
        </ButtonRow>
        {reminderNotificationHarnessEnabled ? (
          <ButtonRow>
            <PrimaryButton
              label="模拟通知打开"
              onPress={simulateReminderNotificationOpen}
              disabled={reminderBusy || !recommendation?.reminder_id}
              testID="account.reminderSimulateNotificationOpen"
            />
          </ButtonRow>
        ) : null}
        <ButtonRow>
          <PrimaryButton label="查看计划" onPress={() => router.push("/plan")} testID="account.plan" />
          <SecondaryButton
            label="刷新本地提醒状态"
            onPress={() => void syncNotificationState()}
            disabled={reminderBusy}
            testID="account.reminderRefreshLocalState"
          />
        </ButtonRow>
        <ButtonRow>
          <PrimaryButton
            label="刷新远程设备状态"
            onPress={() => void syncRemoteReminderDeviceState()}
            disabled={reminderBusy}
            testID="account.reminderRefreshRemoteState"
          />
          <SecondaryButton label="查看进度" onPress={() => router.push("/progress")} testID="account.progress" />
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
