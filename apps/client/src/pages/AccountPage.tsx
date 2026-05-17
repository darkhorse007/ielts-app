import { useEffect, useState } from "react";
import type { ApiClient } from "../lib/api-client";
import { trackWebAnalyticsEvent } from "../lib/analytics";
import { TokenStorage } from "../lib/token-storage";

type AccountPageProps = {
  apiClient: Pick<
    ApiClient,
    | "getProfile"
    | "requestDeletion"
    | "deleteAccount"
    | "getReminderPreference"
    | "updateReminderPreference"
    | "getReminderRecommendation"
    | "clickReminder"
  > &
    Partial<Pick<ApiClient, "analyticsBatch">>;
  tokenStorage: TokenStorage;
};

export const AccountPage = ({ apiClient, tokenStorage }: AccountPageProps) => {
  const [status, setStatus] = useState("-");
  const [message, setMessage] = useState("未操作");
  const [error, setError] = useState<string | null>(null);
  const [subscribed, setSubscribed] = useState(true);
  const [activeHourUtc, setActiveHourUtc] = useState<number | null>(null);
  const [reminderUpdatedAt, setReminderUpdatedAt] = useState("-");
  const [reminderStatus, setReminderStatus] = useState("未加载提醒");
  const [reminderId, setReminderId] = useState("-");
  const [scheduledAt, setScheduledAt] = useState("-");
  const [reason, setReason] = useState("-");
  const [deepLink, setDeepLink] = useState("-");

  const load = async (): Promise<void> => {
    const accessToken = tokenStorage.getAccessToken();
    if (!accessToken) {
      setError("会话已失效，请重新登录");
      return;
    }

    try {
      const profile = await apiClient.getProfile(accessToken);
      const preference = await apiClient.getReminderPreference(accessToken);
      setStatus(profile.status);
      setSubscribed(preference.subscribed);
      setActiveHourUtc(preference.active_hour_utc);
      setReminderUpdatedAt(preference.updated_at);
      if (preference.subscribed) {
        await loadRecommendation(accessToken);
      } else {
        setReminderId("-");
        setScheduledAt("-");
        setReason("已退订学习提醒");
        setDeepLink("-");
        setReminderStatus("提醒已退订");
      }
      setError(null);
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "加载账号状态失败");
    }
  };

  useEffect(() => {
    void load();
  }, []);

  const requestDeletion = async (): Promise<void> => {
    const accessToken = tokenStorage.getAccessToken();
    if (!accessToken) {
      setError("会话已失效，请重新登录");
      return;
    }

    try {
      const result = await apiClient.requestDeletion(accessToken);
      setStatus(result.status);
      setMessage("已发起注销申请");
      setError(null);
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "申请注销失败");
    }
  };

  const deleteAccount = async (): Promise<void> => {
    const accessToken = tokenStorage.getAccessToken();
    if (!accessToken) {
      setError("会话已失效，请重新登录");
      return;
    }

    try {
      const result = await apiClient.deleteAccount(accessToken);
      setStatus(result.status);
      setMessage("账号已删除");
      setError(null);
      tokenStorage.clear();
    } catch (deleteError) {
      setError(deleteError instanceof Error ? deleteError.message : "删除账号失败");
    }
  };

  const loadRecommendation = async (accessToken: string): Promise<void> => {
    const recommendation = await apiClient.getReminderRecommendation(accessToken);
    setActiveHourUtc(recommendation.active_hour_utc);
    if (!recommendation.subscribed) {
      setReminderId("-");
      setScheduledAt("-");
      setReason("已退订学习提醒");
      setDeepLink("-");
      setReminderStatus("提醒已退订");
      return;
    }
    setReminderId(recommendation.reminder_id ?? "-");
    setScheduledAt(recommendation.scheduled_at ?? "-");
    setReason(recommendation.reason ?? "-");
    setDeepLink(recommendation.deep_link ?? "-");
    setReminderStatus("已生成提醒建议");
  };

  const saveReminderPreference = async (): Promise<void> => {
    const accessToken = tokenStorage.getAccessToken();
    if (!accessToken) {
      setError("会话已失效，请重新登录");
      return;
    }

    try {
      const result = await apiClient.updateReminderPreference(accessToken, {
        subscribed
      });
      setSubscribed(result.subscribed);
      setActiveHourUtc(result.active_hour_utc);
      setReminderUpdatedAt(result.updated_at);
      if (result.subscribed) {
        await loadRecommendation(accessToken);
      } else {
        setReminderId("-");
        setScheduledAt("-");
        setReason("已退订学习提醒");
        setDeepLink("-");
        setReminderStatus("提醒已退订");
      }
      setMessage("提醒设置已保存");
      setError(null);
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : "更新提醒设置失败");
    }
  };

  const refreshRecommendation = async (): Promise<void> => {
    const accessToken = tokenStorage.getAccessToken();
    if (!accessToken) {
      setError("会话已失效，请重新登录");
      return;
    }

    try {
      await loadRecommendation(accessToken);
      setError(null);
    } catch (refreshError) {
      setError(refreshError instanceof Error ? refreshError.message : "加载提醒建议失败");
    }
  };

  const clickReminder = async (): Promise<void> => {
    const accessToken = tokenStorage.getAccessToken();
    if (!accessToken) {
      setError("会话已失效，请重新登录");
      return;
    }
    if (reminderId === "-") {
      setError("当前无可点击的提醒");
      return;
    }

    try {
      const result = await apiClient.clickReminder(accessToken, reminderId);
      setDeepLink(result.deep_link);
      setReminderStatus("已记录提醒点击");
      setMessage("提醒点击已追踪，可直达任务页");
      void trackWebAnalyticsEvent(apiClient, tokenStorage, {
        eventType: "reminder_clicked",
        createdAt: result.clicked_at,
        metadata: {
          reminderId: result.reminder_id,
          deepLink: result.deep_link
        }
      });
      setError(null);
    } catch (clickError) {
      setError(clickError instanceof Error ? clickError.message : "记录提醒点击失败");
    }
  };

  return (
    <section>
      <h1>账号管理</h1>
      {error ? <p role="alert">{error}</p> : null}

      <p>账号状态: {status}</p>
      <p>消息: {message}</p>

      <button type="button" onClick={requestDeletion}>
        申请注销
      </button>
      <button type="button" onClick={deleteAccount}>
        立即删除账号
      </button>

      <h2>学习提醒设置</h2>
      <label htmlFor="reminder-subscribed">
        <input
          id="reminder-subscribed"
          type="checkbox"
          checked={subscribed}
          onChange={(event) => setSubscribed(event.target.checked)}
        />
        接收个性化学习提醒
      </label>
      <p>active_hour_utc: {activeHourUtc === null ? "-" : activeHourUtc}</p>
      <p>reminder_updated_at: {reminderUpdatedAt}</p>
      <p>reminder_id: {reminderId}</p>
      <p>scheduled_at: {scheduledAt}</p>
      <p>reason: {reason}</p>
      <p>deep_link: {deepLink}</p>
      <p>reminder_status: {reminderStatus}</p>

      <button type="button" onClick={saveReminderPreference}>
        保存提醒设置
      </button>
      <button type="button" onClick={refreshRecommendation}>
        刷新提醒建议
      </button>
      <button type="button" onClick={clickReminder}>
        模拟点击提醒
      </button>
      {deepLink !== "-" ? (
        <p>
          <a href={deepLink}>直达任务页</a>
        </p>
      ) : null}
    </section>
  );
};
