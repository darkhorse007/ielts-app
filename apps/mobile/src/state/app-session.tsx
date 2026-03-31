import {
  createContext,
  startTransition,
  useContext,
  useEffect,
  useRef,
  useState,
  type PropsWithChildren
} from "react";
import { ApiClient, ApiRequestError } from "../lib/api-client";
import type { StoredSession, TokenResponse } from "../lib/api-types";
import { resolveDefaultInstanceConfig, type InstanceConfig } from "../lib/runtime-config";
import {
  clearStoredSession,
  loadStoredInstanceConfig,
  loadStoredSession,
  saveStoredInstanceConfig,
  saveStoredSession
} from "../lib/storage";

type AppSessionContextValue = {
  ready: boolean;
  defaultInstanceConfig: InstanceConfig | null;
  instanceConfig: InstanceConfig | null;
  session: StoredSession | null;
  saveInstanceConfig: (config: InstanceConfig) => Promise<void>;
  saveSession: (tokens: TokenResponse) => Promise<void>;
  logout: () => Promise<void>;
  runWithAuthorizedClient: <T>(execute: (apiClient: ApiClient, accessToken: string) => Promise<T>) => Promise<T>;
};

type AppSessionState = {
  ready: boolean;
  instanceConfig: InstanceConfig | null;
  session: StoredSession | null;
};

const AppSessionContext = createContext<AppSessionContextValue | null>(null);

const toStoredSession = (tokens: TokenResponse): StoredSession => ({
  accessToken: tokens.access_token,
  refreshToken: tokens.refresh_token,
  expiresAt: Math.floor(Date.now() / 1000) + tokens.expires_in,
  userId: tokens.user_id
});

export const AppSessionProvider = ({ children }: PropsWithChildren) => {
  const [defaultInstanceConfig] = useState<InstanceConfig | null>(() => resolveDefaultInstanceConfig());
  const [state, setState] = useState<AppSessionState>({
    ready: false,
    instanceConfig: null,
    session: null
  });
  const stateRef = useRef(state);
  const refreshInFlightRef = useRef<Promise<string | null> | null>(null);

  useEffect(() => {
    stateRef.current = state;
  }, [state]);

  useEffect(() => {
    let cancelled = false;

    void (async () => {
      const [storedInstanceConfig, storedSession] = await Promise.all([loadStoredInstanceConfig(), loadStoredSession()]);
      if (cancelled) {
        return;
      }

      startTransition(() => {
        setState({
          ready: true,
          instanceConfig: storedInstanceConfig ?? defaultInstanceConfig,
          session: storedSession
        });
      });
    })();

    return () => {
      cancelled = true;
    };
  }, [defaultInstanceConfig]);

  const saveSession = async (tokens: TokenResponse): Promise<void> => {
    const next = toStoredSession(tokens);
    await saveStoredSession(next);
    startTransition(() => {
      setState((current) => ({
        ...current,
        session: next
      }));
    });
  };

  const logout = async (): Promise<void> => {
    await clearStoredSession();
    startTransition(() => {
      setState((current) => ({
        ...current,
        session: null
      }));
    });
  };

  const saveInstanceConfig = async (config: InstanceConfig): Promise<void> => {
    const previous = stateRef.current.instanceConfig;
    const changed =
      !previous || previous.apiBaseUrl !== config.apiBaseUrl || previous.wsBaseUrl !== config.wsBaseUrl;

    await saveStoredInstanceConfig(config);
    if (changed) {
      await clearStoredSession();
    }

    startTransition(() => {
      setState((current) => ({
        ...current,
        instanceConfig: config,
        session: changed ? null : current.session
      }));
    });
  };

  const getAccessToken = async (forceRefresh = false): Promise<string | null> => {
    const snapshot = stateRef.current;
    if (!snapshot.instanceConfig || !snapshot.session) {
      return null;
    }

    const now = Math.floor(Date.now() / 1000);
    const isFresh = snapshot.session.expiresAt - now > 30;
    if (isFresh && !forceRefresh) {
      return snapshot.session.accessToken;
    }

    if (refreshInFlightRef.current) {
      return refreshInFlightRef.current;
    }

    const apiClient = new ApiClient(snapshot.instanceConfig.apiBaseUrl);
    refreshInFlightRef.current = apiClient
      .refresh(snapshot.session.refreshToken)
      .then(async (tokens) => {
        await saveSession(tokens);
        return tokens.access_token;
      })
      .catch(async () => {
        await logout();
        return null;
      })
      .finally(() => {
        refreshInFlightRef.current = null;
      });

    return refreshInFlightRef.current;
  };

  const runWithAuthorizedClient = async <T,>(
    execute: (apiClient: ApiClient, accessToken: string) => Promise<T>
  ): Promise<T> => {
    const snapshot = stateRef.current;
    if (!snapshot.instanceConfig) {
      throw new Error("请先配置自托管实例");
    }

    const apiClient = new ApiClient(snapshot.instanceConfig.apiBaseUrl);
    const accessToken = await getAccessToken();
    if (!accessToken) {
      throw new Error("登录已失效，请重新登录");
    }

    try {
      return await execute(apiClient, accessToken);
    } catch (error) {
      if (error instanceof ApiRequestError && error.statusCode === 401) {
        const refreshedAccessToken = await getAccessToken(true);
        if (!refreshedAccessToken) {
          throw new Error("登录已失效，请重新登录");
        }
        return execute(apiClient, refreshedAccessToken);
      }
      throw error;
    }
  };

  return (
    <AppSessionContext.Provider
      value={{
        ready: state.ready,
        defaultInstanceConfig,
        instanceConfig: state.instanceConfig,
        session: state.session,
        saveInstanceConfig,
        saveSession,
        logout,
        runWithAuthorizedClient
      }}
    >
      {children}
    </AppSessionContext.Provider>
  );
};

export const useAppSession = (): AppSessionContextValue => {
  const context = useContext(AppSessionContext);
  if (!context) {
    throw new Error("useAppSession must be used within AppSessionProvider");
  }
  return context;
};
