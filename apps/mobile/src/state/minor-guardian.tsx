import { createContext, useContext, useEffect, useMemo, useState, type PropsWithChildren } from "react";
import { Pressable, Text, View } from "react-native";
import type { MinorGuardianResponse, MinorGuardianSource } from "../lib/api-types";
import { useAppSession } from "./app-session";
import { buildScopedStorageKey, loadStoredJson, saveStoredJson } from "../lib/storage";
import { colors, radii, spacing } from "../ui/theme";

export type MinorGuardianAgeBand = "unknown" | "under_18" | "adult";

type MinorGuardianState = {
  ageBand: MinorGuardianAgeBand;
  source?: MinorGuardianSource;
  updatedAt?: string;
  guardianNoticeAcceptedAt?: string;
  guardianNoticeAcceptedUserId?: string;
  ownerUserId?: string;
};

type MinorGuardianContextValue = {
  ready: boolean;
  state: MinorGuardianState;
  requiresGuardianNotice: boolean;
  setAgeBand: (ageBand: MinorGuardianAgeBand, source?: MinorGuardianSource) => Promise<void>;
  acknowledgeGuardianNotice: () => Promise<void>;
};

const MINOR_GUARDIAN_STORAGE_KEY = buildScopedStorageKey("minor_guardian");
const defaultMinorGuardianState: MinorGuardianState = {
  ageBand: "unknown"
};

const MinorGuardianContext = createContext<MinorGuardianContextValue | null>(null);

const nowIso = (): string => new Date().toISOString();

const persistMinorGuardianState = async (state: MinorGuardianState): Promise<void> => {
  await saveStoredJson(MINOR_GUARDIAN_STORAGE_KEY, state);
};

const normalizeMinorGuardianState = (state?: MinorGuardianState | null): MinorGuardianState => ({
  ageBand: state?.ageBand ?? "unknown",
  source: state?.source,
  updatedAt: state?.updatedAt,
  guardianNoticeAcceptedAt: state?.guardianNoticeAcceptedAt,
  guardianNoticeAcceptedUserId: state?.guardianNoticeAcceptedUserId,
  ownerUserId: state?.ownerUserId
});

const toMinorGuardianState = (
  response?: MinorGuardianResponse | null,
  ownerUserId?: string
): MinorGuardianState => ({
  ageBand: response?.age_band ?? "unknown",
  source: response?.source,
  updatedAt: response?.updated_at,
  guardianNoticeAcceptedAt: response?.guardian_notice_accepted_at,
  guardianNoticeAcceptedUserId: response?.guardian_notice_accepted_user_id,
  ownerUserId
});

const shouldPromoteLocalStateToSession = (state: MinorGuardianState, userId: string): boolean => {
  if (state.ownerUserId === userId) {
    return true;
  }

  return !state.ownerUserId && state.source === "register" && state.ageBand !== "unknown";
};

const localStateDiffersFromRemote = (local: MinorGuardianState, remote: MinorGuardianState): boolean =>
  local.ageBand !== remote.ageBand ||
  local.source !== remote.source ||
  local.updatedAt !== remote.updatedAt ||
  local.guardianNoticeAcceptedAt !== remote.guardianNoticeAcceptedAt ||
  local.guardianNoticeAcceptedUserId !== remote.guardianNoticeAcceptedUserId;

export const formatMinorGuardianAgeBandLabel = (ageBand: MinorGuardianAgeBand): string => {
  switch (ageBand) {
    case "under_18":
      return "未满 18 周岁";
    case "adult":
      return "已满 18 周岁";
    default:
      return "未设置";
  }
};

export const MinorGuardianProvider = ({ children }: PropsWithChildren) => {
  const { session, runWithAuthorizedClient } = useAppSession();
  const [ready, setReady] = useState(false);
  const [state, setState] = useState<MinorGuardianState>(defaultMinorGuardianState);

  useEffect(() => {
    let cancelled = false;

    void (async () => {
      const stored = await loadStoredJson<MinorGuardianState>(MINOR_GUARDIAN_STORAGE_KEY);
      if (cancelled) {
        return;
      }

      setState(stored ?? defaultMinorGuardianState);
      setReady(true);
    })();

    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    let cancelled = false;

    if (!ready || !session) {
      return () => {
        cancelled = true;
      };
    }

    void (async () => {
      try {
        const profile = await runWithAuthorizedClient((apiClient, accessToken) => apiClient.getProfile(accessToken));
        const remoteState = toMinorGuardianState(profile.minor_guardian, session.userId);
        let nextState = remoteState;

        if (shouldPromoteLocalStateToSession(state, session.userId) && localStateDiffersFromRemote(state, remoteState)) {
          const syncedState = await runWithAuthorizedClient((apiClient, accessToken) =>
            apiClient.updateMinorGuardian(accessToken, {
              age_band: state.ageBand,
              source: state.source ?? "account"
            })
          );
          nextState = toMinorGuardianState(syncedState, session.userId);

          if (
            state.ageBand === "under_18" &&
            state.guardianNoticeAcceptedAt &&
            state.guardianNoticeAcceptedUserId === session.userId &&
            !nextState.guardianNoticeAcceptedAt
          ) {
            const acknowledgedState = await runWithAuthorizedClient((apiClient, accessToken) =>
              apiClient.acknowledgeMinorGuardianNotice(accessToken)
            );
            nextState = toMinorGuardianState(acknowledgedState, session.userId);
          }
        }

        if (cancelled) {
          return;
        }

        setState(nextState);
        await persistMinorGuardianState(nextState);
      } catch {
        // Keep the last local snapshot when the remote profile is temporarily unavailable.
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [ready, runWithAuthorizedClient, session?.userId]);

  const stateBelongsToCurrentSession = !session || !state.ownerUserId || state.ownerUserId === session.userId;

  const requiresGuardianNotice = Boolean(
    ready &&
      session &&
      stateBelongsToCurrentSession &&
      state.ageBand === "under_18" &&
      state.guardianNoticeAcceptedUserId !== session.userId
  );

  const setAgeBand = async (ageBand: MinorGuardianAgeBand, source: MinorGuardianSource = "account"): Promise<void> => {
    if (session) {
      const response = await runWithAuthorizedClient((apiClient, accessToken) =>
        apiClient.updateMinorGuardian(accessToken, {
          age_band: ageBand,
          source
        })
      );
      const nextState = toMinorGuardianState(response, session.userId);
      setState(nextState);
      await persistMinorGuardianState(nextState);
      return;
    }

    const nextState = normalizeMinorGuardianState({
      ageBand,
      source,
      updatedAt: nowIso(),
      guardianNoticeAcceptedAt: undefined,
      guardianNoticeAcceptedUserId: undefined,
      ownerUserId: undefined
    });

    setState(nextState);
    await persistMinorGuardianState(nextState);
  };

  const acknowledgeGuardianNotice = async (): Promise<void> => {
    if (!session) {
      return;
    }

    const response = await runWithAuthorizedClient((apiClient, accessToken) =>
      apiClient.acknowledgeMinorGuardianNotice(accessToken)
    );
    const nextState = toMinorGuardianState(response, session.userId);
    setState(nextState);
    await persistMinorGuardianState(nextState);
  };

  const value = useMemo<MinorGuardianContextValue>(
    () => ({
      ready,
      state,
      requiresGuardianNotice,
      setAgeBand,
      acknowledgeGuardianNotice
    }),
    [ready, state, requiresGuardianNotice]
  );

  return (
    <MinorGuardianContext.Provider value={value}>
      {children}
      {requiresGuardianNotice ? (
        <View
          style={{
            position: "absolute",
            inset: 0,
            backgroundColor: "rgba(8, 17, 31, 0.86)",
            alignItems: "center",
            justifyContent: "center",
            padding: spacing.lg
          }}
        >
          <View
            style={{
              width: "100%",
              maxWidth: 420,
              backgroundColor: colors.cardAccent,
              borderRadius: radii.lg,
              borderWidth: 1,
              borderColor: colors.cardAccentBorder,
              padding: spacing.lg,
              gap: spacing.sm
            }}
          >
            <Text style={{ color: colors.accent, fontSize: 12, fontWeight: "800", letterSpacing: 1 }}>
              Guardian Notice
            </Text>
            <Text style={{ color: colors.textPrimary, fontSize: 24, lineHeight: 30, fontWeight: "800" }}>
              未成年人使用提示
            </Text>
            <Text style={{ color: colors.textSecondary, fontSize: 14, lineHeight: 21 }}>
              如你未满 18 周岁，请在监护人知情和同意下使用本产品，并合理安排学习时长、账号与付费行为。
            </Text>
            <Text style={{ color: colors.textMuted, fontSize: 13, lineHeight: 19 }}>
              当前已记录监护提示确认留痕，并对未成年人启用更短提醒与连续学习上限控制；尚未提供亲子绑定。
            </Text>
            <Pressable
              onPress={() => void acknowledgeGuardianNotice()}
              testID="minorGuardian.acknowledge"
              style={({ pressed }) => ({
                minHeight: 52,
                borderRadius: radii.md,
                alignItems: "center",
                justifyContent: "center",
                backgroundColor: pressed ? colors.accentPressed : colors.accent,
                paddingHorizontal: spacing.md,
                marginTop: spacing.sm
              })}
            >
              <Text style={{ color: colors.canvas, fontSize: 15, fontWeight: "800" }}>我已阅读并理解</Text>
            </Pressable>
          </View>
        </View>
      ) : null}
    </MinorGuardianContext.Provider>
  );
};

export const useMinorGuardian = (): MinorGuardianContextValue => {
  const context = useContext(MinorGuardianContext);
  if (!context) {
    throw new Error("useMinorGuardian must be used within MinorGuardianProvider");
  }
  return context;
};
