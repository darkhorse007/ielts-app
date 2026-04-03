import { useEffect, useState } from "react";
import type { ApiClient } from "../lib/api-client";
import { loadCachedSessionProfile } from "../lib/session-profile-cache";
import { hasInternalOpsAccess } from "../lib/system-roles";
import { TokenStorage } from "../lib/token-storage";

type HomePageProps = {
  apiClient: Pick<ApiClient, "getProfile">;
  tokenStorage: TokenStorage;
};

export const HomePage = ({ apiClient, tokenStorage }: HomePageProps) => {
  const [canAccessAdmin, setCanAccessAdmin] = useState(false);

  useEffect(() => {
    let cancelled = false;

    const loadProfile = async (): Promise<void> => {
      const accessToken = tokenStorage.getAccessToken();
      if (!accessToken) {
        if (!cancelled) {
          setCanAccessAdmin(false);
        }
        return;
      }

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

    void loadProfile();

    return () => {
      cancelled = true;
    };
  }, [apiClient, tokenStorage]);

  return (
    <section>
      <h1>IELTS 自托管学习首页</h1>
      <p>当前版本保留雅思备考主链路，内部处理入口仅对具备 `ops/admin` 角色的账号可见。</p>
      <nav>
        <a href="/onboarding">入门目标</a> | <a href="/diagnostic">首次诊断</a> | <a href="/plan">8周计划</a> |{" "}
        <a href="/account">账户中心</a>
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
