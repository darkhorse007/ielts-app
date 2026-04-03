import { createContext, useContext, useEffect, useMemo, useState, type PropsWithChildren } from "react";
import { Pressable, Text, View } from "react-native";
import { useAppSession } from "./app-session";
import { buildScopedStorageKey, loadStoredJson, saveStoredJson } from "../lib/storage";
import { colors, radii, spacing } from "../ui/theme";

export type MinorGuardianAgeBand = "unknown" | "under_18" | "adult";

type MinorGuardianState = {
  ageBand: MinorGuardianAgeBand;
  source?: "register" | "account";
  updatedAt?: string;
  guardianNoticeAcceptedAt?: string;
  guardianNoticeAcceptedUserId?: string;
};

type MinorGuardianContextValue = {
  ready: boolean;
  state: MinorGuardianState;
  requiresGuardianNotice: boolean;
  setAgeBand: (ageBand: MinorGuardianAgeBand, source?: "register" | "account") => Promise<void>;
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
  const { session } = useAppSession();
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

  const requiresGuardianNotice = Boolean(
    ready &&
      session &&
      state.ageBand === "under_18" &&
      state.guardianNoticeAcceptedUserId !== session.userId
  );

  const setAgeBand = async (ageBand: MinorGuardianAgeBand, source: "register" | "account" = "account"): Promise<void> => {
    const nextState: MinorGuardianState = {
      ageBand,
      source,
      updatedAt: nowIso(),
      guardianNoticeAcceptedAt: ageBand === "under_18" ? undefined : state.guardianNoticeAcceptedAt,
      guardianNoticeAcceptedUserId: ageBand === "under_18" ? undefined : state.guardianNoticeAcceptedUserId
    };

    setState(nextState);
    await persistMinorGuardianState(nextState);
  };

  const acknowledgeGuardianNotice = async (): Promise<void> => {
    if (!session) {
      return;
    }

    const nextState: MinorGuardianState = {
      ...state,
      guardianNoticeAcceptedAt: nowIso(),
      guardianNoticeAcceptedUserId: session.userId
    };
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
              当前首版仅补前台提示与学习时长提醒，尚未提供监护人留痕、亲子绑定或专门时长控制。
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
