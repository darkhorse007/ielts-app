import { useEffect, useState } from "react";
import type { ApiClient } from "../lib/api-client";
import { resolveLearningRouteForPlanTask, selectNextActionablePlanTask } from "../lib/learning-routes";
import { loadCachedSessionProfile } from "../lib/session-profile-cache";
import { hasInternalOpsAccess } from "../lib/system-roles";
import { TokenStorage } from "../lib/token-storage";

type HomePrimaryAction = {
  title: string;
  detail: string;
  route: string;
  actionLabel: string;
};

type HomePageProps = {
  apiClient: Pick<ApiClient, "getProfile" | "fetchActivePlan">;
  tokenStorage: TokenStorage;
};

const buildDiagnosticFallbackAction = (detail: string): HomePrimaryAction => ({
  title: "开始今天的学习主线",
  detail,
  route: "/diagnostic",
  actionLabel: "进入首次诊断"
});

export const HomePage = ({ apiClient, tokenStorage }: HomePageProps) => {
  const [canAccessAdmin, setCanAccessAdmin] = useState(false);
  const [primaryAction, setPrimaryAction] = useState<HomePrimaryAction>(
    buildDiagnosticFallbackAction("正在读取当前计划，稍后给出下一步建议。")
  );

  useEffect(() => {
    let cancelled = false;

    const loadHomeState = async (): Promise<void> => {
      const accessToken = tokenStorage.getAccessToken();
      if (!accessToken) {
        if (!cancelled) {
          setCanAccessAdmin(false);
          setPrimaryAction(buildDiagnosticFallbackAction("当前没有可用会话，先从首次诊断重新开始。"));
        }
        return;
      }

      const loadProfileState = async (): Promise<void> => {
        try {
          const profile = await loadCachedSessionProfile(apiClient, accessToken);
          if (!cancelled) {
            setCanAccessAdmin(hasInternalOpsAccess(profile.system_roles));
          }
        } catch {
          if (!cancelled) {
            setCanAccessAdmin(false);
          }
        }
      };

      const loadPlanState = async (): Promise<void> => {
        try {
          const activePlan = await apiClient.fetchActivePlan(accessToken);
          const nextTask = selectNextActionablePlanTask(activePlan);
          const learningRoute = resolveLearningRouteForPlanTask(nextTask);

          if (!cancelled) {
            if (nextTask && learningRoute) {
              setPrimaryAction({
                title: "直接进入当前计划任务",
                detail: `当前计划下一步：${nextTask.title}`,
                route: learningRoute.route,
                actionLabel: learningRoute.actionLabel
              });
            } else {
              setPrimaryAction(buildDiagnosticFallbackAction("当前计划还没有排入可执行任务，先完成首次诊断。"));
            }
          }
        } catch {
          if (!cancelled) {
            setPrimaryAction(buildDiagnosticFallbackAction("当前计划暂时无法加载，先回到首次诊断继续主线。"));
          }
        }
      };

      void loadProfileState();
      void loadPlanState();
    };

    void loadHomeState();

    return () => {
      cancelled = true;
    };
  }, [apiClient, tokenStorage]);

  return (
    <section>
      <h1>IELTS 自托管学习首页</h1>
      <p>当前版本保留雅思备考主链路，内部处理入口仅对具备 `ops/admin` 角色的账号可见。</p>
      <section>
        <h2>{primaryAction.title}</h2>
        <p>{primaryAction.detail}</p>
        <p>
          <a href={primaryAction.route}>{primaryAction.actionLabel}</a> | <a href="/plan">查看完整学习计划</a>
        </p>
      </section>
      <nav>
        <a href="/onboarding">入门目标</a> | <a href="/diagnostic">首次诊断</a> | <a href="/plan">8周计划</a> |{" "}
        <a href="/progress">学习进度</a> | <a href="/account">账户中心</a>
      </nav>
      <nav>
        <a href="/practice/listening">听力训练</a> | <a href="/practice/reading">阅读训练</a> |{" "}
        <a href="/speaking-live">口语实时会话</a> | <a href="/writing">写作批改</a>
      </nav>
      <nav>
        <a href="/mock-exam">全科模考</a>
      </nav>
      {canAccessAdmin ? (
        <nav>
          <a href="/admin">监护人工单处理台</a>
        </nav>
      ) : null}
    </section>
  );
};
