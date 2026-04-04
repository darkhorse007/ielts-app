import { Redirect, router } from "expo-router";
import { Platform, Text, View } from "react-native";
import { useEffect, useEffectEvent, useState } from "react";
import type { ProgressResponse } from "../src/lib/api-types";
import { useAppSession } from "../src/state/app-session";
import { formatStudyLoopSkillLabel, useStudyLoop } from "../src/state/study-loop";
import { AppScreen, ButtonRow, InfoCard, PrimaryButton, SecondaryButton, StatusPill, TextField } from "../src/ui/primitives";
import { colors } from "../src/ui/theme";

const toEditableState = (snapshot: ProgressResponse) => ({
  listeningCompleted: String(snapshot.listening_completed),
  speakingCompleted: String(snapshot.speaking_completed),
  readingCompleted: String(snapshot.reading_completed),
  writingCompleted: String(snapshot.writing_completed),
  totalStudyMinutes: String(snapshot.total_study_minutes),
  streakDays: String(snapshot.streak_days)
});

export default function ProgressScreen() {
  const { session, runWithAuthorizedClient } = useAppSession();
  const {
    activities,
    ready: studyLoopReady,
    pendingProgressRefreshCount,
    acknowledgeProgressRefresh
  } = useStudyLoop();
  const [snapshot, setSnapshot] = useState<ProgressResponse | null>(null);
  const [listeningCompleted, setListeningCompleted] = useState("0");
  const [speakingCompleted, setSpeakingCompleted] = useState("0");
  const [readingCompleted, setReadingCompleted] = useState("0");
  const [writingCompleted, setWritingCompleted] = useState("0");
  const [totalStudyMinutes, setTotalStudyMinutes] = useState("0");
  const [streakDays, setStreakDays] = useState("0");
  const [conflictCount, setConflictCount] = useState(0);
  const [statusMessage, setStatusMessage] = useState("未同步");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const load = useEffectEvent(async () => {
    if (!session) {
      setSnapshot(null);
      setConflictCount(0);
      setStatusMessage("未登录");
      return;
    }

    setLoading(true);
    try {
      const response = await runWithAuthorizedClient((apiClient, accessToken) => apiClient.getProgress(accessToken));
      const pendingCount = pendingProgressRefreshCount;
      setSnapshot(response);
      const editable = toEditableState(response);
      setListeningCompleted(editable.listeningCompleted);
      setSpeakingCompleted(editable.speakingCompleted);
      setReadingCompleted(editable.readingCompleted);
      setWritingCompleted(editable.writingCompleted);
      setTotalStudyMinutes(editable.totalStudyMinutes);
      setStreakDays(editable.streakDays);
      setStatusMessage(pendingCount > 0 ? `已按最近 ${pendingCount} 条训练结果刷新进度` : "已加载服务端进度");
      if (pendingCount > 0) {
        acknowledgeProgressRefresh();
      }
      setError(null);
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "加载失败");
    } finally {
      setLoading(false);
    }
  });

  useEffect(() => {
    void load();
  }, [session]);

  useEffect(() => {
    if (!studyLoopReady || pendingProgressRefreshCount === 0) {
      return;
    }

    void load();
  }, [load, pendingProgressRefreshCount, studyLoopReady]);

  const sync = async (): Promise<void> => {
    setLoading(true);
    try {
      const pendingCount = pendingProgressRefreshCount;
      const response = await runWithAuthorizedClient((apiClient, accessToken) =>
        apiClient.syncProgress(accessToken, {
          device_id: `mobile-${Platform.OS}`,
          client_updated_at: new Date().toISOString(),
          progress: {
            listening_completed: Number(listeningCompleted) || 0,
            speaking_completed: Number(speakingCompleted) || 0,
            reading_completed: Number(readingCompleted) || 0,
            writing_completed: Number(writingCompleted) || 0,
            total_study_minutes: Number(totalStudyMinutes) || 0,
            streak_days: Number(streakDays) || 0
          }
        })
      );
      setSnapshot(response);
      const conflicts = await runWithAuthorizedClient((apiClient, accessToken) =>
        apiClient.getProgressConflicts(accessToken)
      );
      setConflictCount(conflicts.items.length);
      setStatusMessage(
        response.stale_request
          ? "同步请求为旧版本，已回退服务端数据"
          : pendingCount > 0
            ? `同步成功，并已消化最近 ${pendingCount} 条训练结果`
            : "同步成功"
      );
      if (pendingCount > 0) {
        acknowledgeProgressRefresh();
      }
      setError(null);
    } catch (syncError) {
      setError(syncError instanceof Error ? syncError.message : "同步失败");
    } finally {
      setLoading(false);
    }
  };

  const reloadConflicts = async (): Promise<void> => {
    setLoading(true);
    try {
      const conflicts = await runWithAuthorizedClient((apiClient, accessToken) =>
        apiClient.getProgressConflicts(accessToken)
      );
      setConflictCount(conflicts.items.length);
      setStatusMessage("已加载冲突历史");
      setError(null);
    } catch (conflictError) {
      setError(conflictError instanceof Error ? conflictError.message : "加载冲突失败");
    } finally {
      setLoading(false);
    }
  };

  if (!session) {
    return <Redirect href="/login" />;
  }

  const pendingActivities = activities.filter((item) => item.progressPending).slice(0, 3);

  return (
    <AppScreen
      eyebrow="Progress"
      title="跨端进度同步已进入移动端"
      subtitle="这里复用 Web 端已有的 progress / sync / conflicts 契约，用移动端 device_id 做进度写回与冲突检查。"
    >
      <InfoCard tone="accent">
        <Text style={{ color: colors.textMuted, fontSize: 12 }}>当前快照</Text>
        <ButtonRow>
          <StatusPill label={statusMessage} tone={snapshot ? "success" : "neutral"} />
          <StatusPill label={`conflicts ${conflictCount}`} tone={conflictCount > 0 ? "accent" : "success"} />
          <StatusPill
            label={`待消化训练 ${pendingProgressRefreshCount}`}
            tone={pendingProgressRefreshCount > 0 ? "accent" : "success"}
          />
        </ButtonRow>
        <View style={{ gap: 6, marginTop: 10 }}>
          <Text style={{ color: colors.textPrimary, fontSize: 14 }}>server_version: {snapshot?.server_version ?? "-"}</Text>
          <Text style={{ color: colors.textMuted, fontSize: 14 }}>updated_at: {snapshot?.updated_at ?? "-"}</Text>
          <Text style={{ color: colors.textMuted, fontSize: 14 }}>
            last_synced_device_id: {snapshot?.last_synced_device_id ?? "-"}
          </Text>
        </View>
        {pendingActivities.length ? (
          <View style={{ gap: 6, marginTop: 10 }}>
            {pendingActivities.map((item) => (
              <Text key={item.id} style={{ color: colors.textMuted, fontSize: 13, lineHeight: 20 }}>
                待同步训练: {formatStudyLoopSkillLabel(item.skill)} · {item.summary}
              </Text>
            ))}
          </View>
        ) : null}
      </InfoCard>

      <TextField
        label="听力完成数"
        value={listeningCompleted}
        onChangeText={setListeningCompleted}
        keyboardType="number-pad"
      />
      <TextField
        label="口语完成数"
        value={speakingCompleted}
        onChangeText={setSpeakingCompleted}
        keyboardType="number-pad"
      />
      <TextField
        label="阅读完成数"
        value={readingCompleted}
        onChangeText={setReadingCompleted}
        keyboardType="number-pad"
      />
      <TextField
        label="写作完成数"
        value={writingCompleted}
        onChangeText={setWritingCompleted}
        keyboardType="number-pad"
      />
      <TextField
        label="总学习分钟数"
        value={totalStudyMinutes}
        onChangeText={setTotalStudyMinutes}
        keyboardType="number-pad"
      />
      <TextField
        label="连续学习天数"
        value={streakDays}
        onChangeText={setStreakDays}
        keyboardType="number-pad"
      />

      {error ? <Text style={{ color: colors.danger, fontSize: 14, lineHeight: 20 }}>{error}</Text> : null}

      <ButtonRow>
        <PrimaryButton label={loading ? "处理中..." : "刷新进度"} onPress={() => void load()} disabled={loading} />
        <SecondaryButton label="同步进度" onPress={() => void sync()} disabled={loading} />
      </ButtonRow>

      <InfoCard>
        <Text style={{ color: colors.textMuted, fontSize: 12 }}>同步校验</Text>
        <Text style={{ color: colors.textPrimary, fontSize: 14 }}>device_id: mobile-{Platform.OS}</Text>
        <Text style={{ color: colors.textMuted, fontSize: 14 }}>
          这一步用于验证移动端已经接上 server snapshot、sync 和 conflict history 三条接口。
        </Text>
        <ButtonRow>
          <PrimaryButton label="加载冲突历史" onPress={() => void reloadConflicts()} disabled={loading} />
          <SecondaryButton label="回看计划" onPress={() => router.push("/plan")} />
        </ButtonRow>
      </InfoCard>

      <SecondaryButton label="返回首页" onPress={() => router.replace("/home")} />
    </AppScreen>
  );
}
