import { useEffect, useState } from "react";
import type { ApiClient } from "../lib/api-client";
import { TokenStorage } from "../lib/token-storage";

type ProgressPageProps = {
  apiClient: Pick<ApiClient, "getProgress" | "syncProgress" | "getProgressConflicts">;
  tokenStorage: TokenStorage;
};

export const ProgressPage = ({ apiClient, tokenStorage }: ProgressPageProps) => {
  const [listeningCompleted, setListeningCompleted] = useState("0");
  const [speakingCompleted, setSpeakingCompleted] = useState("0");
  const [readingCompleted, setReadingCompleted] = useState("0");
  const [writingCompleted, setWritingCompleted] = useState("0");
  const [totalStudyMinutes, setTotalStudyMinutes] = useState("0");
  const [streakDays, setStreakDays] = useState("0");
  const [conflictCount, setConflictCount] = useState(0);
  const [statusMessage, setStatusMessage] = useState("未同步");
  const [error, setError] = useState<string | null>(null);

  const load = async (): Promise<void> => {
    const accessToken = tokenStorage.getAccessToken();
    if (!accessToken) {
      setError("会话已失效，请重新登录");
      return;
    }

    try {
      const snapshot = await apiClient.getProgress(accessToken);
      setListeningCompleted(String(snapshot.listening_completed));
      setSpeakingCompleted(String(snapshot.speaking_completed));
      setReadingCompleted(String(snapshot.reading_completed));
      setWritingCompleted(String(snapshot.writing_completed));
      setTotalStudyMinutes(String(snapshot.total_study_minutes));
      setStreakDays(String(snapshot.streak_days));
      setStatusMessage("已加载服务端进度");
      setError(null);
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "加载失败");
    }
  };

  useEffect(() => {
    void load();
  }, []);

  const sync = async (): Promise<void> => {
    const accessToken = tokenStorage.getAccessToken();
    if (!accessToken) {
      setError("会话已失效，请重新登录");
      return;
    }

    setError(null);
    try {
      const response = await apiClient.syncProgress(accessToken, {
        device_id: "web-client",
        client_updated_at: new Date().toISOString(),
        progress: {
          listening_completed: Number(listeningCompleted) || 0,
          speaking_completed: Number(speakingCompleted) || 0,
          reading_completed: Number(readingCompleted) || 0,
          writing_completed: Number(writingCompleted) || 0,
          total_study_minutes: Number(totalStudyMinutes) || 0,
          streak_days: Number(streakDays) || 0
        }
      });

      const conflicts = await apiClient.getProgressConflicts(accessToken);
      setConflictCount(conflicts.items.length);
      setStatusMessage(response.stale_request ? "同步请求为旧版本，使用服务端数据" : "同步成功");
    } catch (syncError) {
      setError(syncError instanceof Error ? syncError.message : "同步失败");
    }
  };

  return (
    <section>
      <h1>学习进度同步</h1>
      {error ? <p role="alert">{error}</p> : null}

      <label htmlFor="progress-listening">听力完成数</label>
      <input
        id="progress-listening"
        value={listeningCompleted}
        onChange={(event) => setListeningCompleted(event.target.value)}
      />

      <label htmlFor="progress-speaking">口语完成数</label>
      <input
        id="progress-speaking"
        value={speakingCompleted}
        onChange={(event) => setSpeakingCompleted(event.target.value)}
      />

      <label htmlFor="progress-reading">阅读完成数</label>
      <input
        id="progress-reading"
        value={readingCompleted}
        onChange={(event) => setReadingCompleted(event.target.value)}
      />

      <label htmlFor="progress-writing">写作完成数</label>
      <input
        id="progress-writing"
        value={writingCompleted}
        onChange={(event) => setWritingCompleted(event.target.value)}
      />

      <label htmlFor="progress-minutes">总学习分钟数</label>
      <input
        id="progress-minutes"
        value={totalStudyMinutes}
        onChange={(event) => setTotalStudyMinutes(event.target.value)}
      />

      <label htmlFor="progress-streak">连续学习天数</label>
      <input
        id="progress-streak"
        value={streakDays}
        onChange={(event) => setStreakDays(event.target.value)}
      />

      <button type="button" onClick={sync}>
        同步进度
      </button>

      <p>status: {statusMessage}</p>
      <p>conflicts: {conflictCount}</p>
    </section>
  );
};
