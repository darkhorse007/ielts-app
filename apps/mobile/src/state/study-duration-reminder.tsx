import { router, usePathname } from "expo-router";
import { useEffect, useRef, useState } from "react";
import { AppState, Pressable, Text, View } from "react-native";
import { useMinorGuardian } from "./minor-guardian";
import { colors, radii, spacing } from "../ui/theme";

const STUDY_ROUTE_PATHS = new Set([
  "/onboarding",
  "/diagnostic",
  "/plan",
  "/progress",
  "/listening",
  "/reading",
  "/speaking",
  "/writing",
  "/mock-exam"
]);

const DEFAULT_DAY_REMINDER_MINUTES = 45;
const DEFAULT_NIGHT_REMINDER_MINUTES = 20;
const DEFAULT_SNOOZE_MINUTES = 15;
const DEFAULT_MINOR_DAY_REMINDER_MINUTES = 30;
const DEFAULT_MINOR_NIGHT_REMINDER_MINUTES = 10;
const DEFAULT_MINOR_SNOOZE_MINUTES = 5;
const DEFAULT_MINOR_DAY_MAX_MINUTES = 90;
const DEFAULT_MINOR_NIGHT_MAX_MINUTES = 30;
const DEFAULT_NIGHT_START_HOUR = 22;
const DEFAULT_NIGHT_END_HOUR = 6;

const resolvePositiveInteger = (value: string | undefined, fallback: number): number => {
  const trimmed = value?.trim();
  if (!trimmed) {
    return fallback;
  }

  const parsed = Number(trimmed);
  if (!Number.isInteger(parsed) || parsed <= 0) {
    return fallback;
  }

  return parsed;
};

const dayReminderMinutes = resolvePositiveInteger(
  process.env.EXPO_PUBLIC_STUDY_DURATION_REMINDER_MINUTES,
  DEFAULT_DAY_REMINDER_MINUTES
);
const nightReminderMinutes = resolvePositiveInteger(
  process.env.EXPO_PUBLIC_NIGHT_STUDY_DURATION_REMINDER_MINUTES,
  DEFAULT_NIGHT_REMINDER_MINUTES
);
const snoozeMinutes = resolvePositiveInteger(
  process.env.EXPO_PUBLIC_STUDY_DURATION_REMINDER_SNOOZE_MINUTES,
  DEFAULT_SNOOZE_MINUTES
);
const minorDayReminderMinutes = resolvePositiveInteger(
  process.env.EXPO_PUBLIC_MINOR_STUDY_DURATION_REMINDER_MINUTES,
  DEFAULT_MINOR_DAY_REMINDER_MINUTES
);
const minorNightReminderMinutes = resolvePositiveInteger(
  process.env.EXPO_PUBLIC_MINOR_NIGHT_STUDY_DURATION_REMINDER_MINUTES,
  DEFAULT_MINOR_NIGHT_REMINDER_MINUTES
);
const minorSnoozeMinutes = resolvePositiveInteger(
  process.env.EXPO_PUBLIC_MINOR_STUDY_DURATION_REMINDER_SNOOZE_MINUTES,
  DEFAULT_MINOR_SNOOZE_MINUTES
);
const minorDayMaxMinutes = resolvePositiveInteger(
  process.env.EXPO_PUBLIC_MINOR_STUDY_DURATION_MAX_MINUTES,
  DEFAULT_MINOR_DAY_MAX_MINUTES
);
const minorNightMaxMinutes = resolvePositiveInteger(
  process.env.EXPO_PUBLIC_MINOR_NIGHT_STUDY_DURATION_MAX_MINUTES,
  DEFAULT_MINOR_NIGHT_MAX_MINUTES
);
const nightStartHour = resolvePositiveInteger(
  process.env.EXPO_PUBLIC_NIGHT_STUDY_REMINDER_START_HOUR,
  DEFAULT_NIGHT_START_HOUR
) % 24;
const nightEndHour = resolvePositiveInteger(
  process.env.EXPO_PUBLIC_NIGHT_STUDY_REMINDER_END_HOUR,
  DEFAULT_NIGHT_END_HOUR
) % 24;

const isStudyRoutePath = (pathname: string | null | undefined): boolean => {
  if (!pathname) {
    return false;
  }

  return STUDY_ROUTE_PATHS.has(pathname);
};

const isNightWindow = (date: Date): boolean => {
  const hour = date.getHours();

  if (nightStartHour === nightEndHour) {
    return true;
  }

  if (nightStartHour < nightEndHour) {
    return hour >= nightStartHour && hour < nightEndHour;
  }

  return hour >= nightStartHour || hour < nightEndHour;
};

type StudyDurationPolicy = {
  minorProtection: boolean;
  nightWindow: boolean;
  reminderMinutes: number;
  snoozeMinutes: number;
  maxContinuousMinutes?: number;
};

type ReminderMode = "soft" | "limit";

const resolveStudyDurationPolicy = (date: Date, strictMinorProtection: boolean): StudyDurationPolicy => {
  const nightWindow = isNightWindow(date);

  if (strictMinorProtection) {
    return {
      minorProtection: true,
      nightWindow,
      reminderMinutes: nightWindow ? minorNightReminderMinutes : minorDayReminderMinutes,
      snoozeMinutes: minorSnoozeMinutes,
      maxContinuousMinutes: nightWindow ? minorNightMaxMinutes : minorDayMaxMinutes
    };
  }

  return {
    minorProtection: false,
    nightWindow,
    reminderMinutes: nightWindow ? nightReminderMinutes : dayReminderMinutes,
    snoozeMinutes,
    maxContinuousMinutes: undefined
  };
};

const getReminderThresholdMs = (policy: StudyDurationPolicy): number => policy.reminderMinutes * 60 * 1000;

const getMaxContinuousStudyMs = (policy: StudyDurationPolicy): number | null =>
  typeof policy.maxContinuousMinutes === "number" ? policy.maxContinuousMinutes * 60 * 1000 : null;

const buildReminderCopy = (sessionStartedAt: number, policy: StudyDurationPolicy): string => {
  const now = new Date();
  const elapsedMinutes = Math.max(1, Math.round((now.getTime() - sessionStartedAt) / (60 * 1000)));

  if (policy.minorProtection && policy.nightWindow) {
    return `现在已较晚，你已连续学习约 ${elapsedMinutes} 分钟。未成年人夜间学习建议尽快休息，并在监护人指导下继续使用。`;
  }

  if (policy.minorProtection) {
    return `你已连续学习约 ${elapsedMinutes} 分钟。未成年人建议先休息，再在监护人指导下继续使用。`;
  }

  if (policy.nightWindow) {
    return `现在已较晚，你已连续学习约 ${elapsedMinutes} 分钟，建议先休息再继续。`;
  }

  return `你已连续学习约 ${elapsedMinutes} 分钟，建议休息后再继续使用。`;
};

const buildLimitCopy = (sessionStartedAt: number, policy: StudyDurationPolicy): string => {
  const now = new Date();
  const elapsedMinutes = Math.max(1, Math.round((now.getTime() - sessionStartedAt) / (60 * 1000)));

  if (policy.nightWindow) {
    return `你已在夜间连续学习约 ${elapsedMinutes} 分钟，本次学习已达未成年人建议上限，请先返回首页休息。`;
  }

  return `你已连续学习约 ${elapsedMinutes} 分钟，本次学习已达未成年人建议上限，请先返回首页休息。`;
};

export function StudyDurationReminderProvider({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const { state: minorGuardianState } = useMinorGuardian();
  const [appState, setAppState] = useState(AppState.currentState);
  const [visible, setVisible] = useState(false);
  const [message, setMessage] = useState("");
  const [reminderMode, setReminderMode] = useState<ReminderMode>("soft");
  const reminderTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const sessionStartedAtRef = useRef<number | null>(null);
  const snoozeUntilRef = useRef<number | null>(null);
  const softReminderShownAtRef = useRef<number | null>(null);
  const studyActive = appState === "active" && isStudyRoutePath(pathname);
  const strictMinorProtection = minorGuardianState.ageBand === "under_18";

  const getCurrentPolicy = (): StudyDurationPolicy =>
    resolveStudyDurationPolicy(new Date(), strictMinorProtection);

  const clearReminderTimer = (): void => {
    if (reminderTimerRef.current) {
      clearTimeout(reminderTimerRef.current);
      reminderTimerRef.current = null;
    }
  };

  const resetSession = (): void => {
    clearReminderTimer();
    sessionStartedAtRef.current = null;
    snoozeUntilRef.current = null;
    softReminderShownAtRef.current = null;
    setVisible(false);
    setMessage("");
    setReminderMode("soft");
  };

  const scheduleReminder = (): void => {
    clearReminderTimer();

    if (!studyActive || sessionStartedAtRef.current === null) {
      return;
    }

    const now = Date.now();
    const policy = getCurrentPolicy();
    const reminderDueAt = sessionStartedAtRef.current + getReminderThresholdMs(policy);
    const softReminderLocked =
      softReminderShownAtRef.current !== null && (snoozeUntilRef.current === null || snoozeUntilRef.current <= now);
    const nextReminderDueAt = softReminderLocked ? Number.POSITIVE_INFINITY : Math.max(reminderDueAt, snoozeUntilRef.current ?? 0);
    const maxContinuousStudyMs = getMaxContinuousStudyMs(policy);
    const limitDueAt =
      maxContinuousStudyMs === null ? Number.POSITIVE_INFINITY : sessionStartedAtRef.current + maxContinuousStudyMs;
    const nextDueAt = Math.min(nextReminderDueAt, limitDueAt);

    if (!Number.isFinite(nextDueAt)) {
      return;
    }

    const delay = Math.max(0, nextDueAt - now);

    reminderTimerRef.current = setTimeout(() => {
      if (sessionStartedAtRef.current === null) {
        return;
      }
      const activePolicy = getCurrentPolicy();
      const activeLimitMs = getMaxContinuousStudyMs(activePolicy);
      const limitReached =
        activeLimitMs !== null && Date.now() >= sessionStartedAtRef.current + activeLimitMs;

      if (limitReached) {
        setReminderMode("limit");
        setMessage(buildLimitCopy(sessionStartedAtRef.current, activePolicy));
        setVisible(true);
        return;
      }

      softReminderShownAtRef.current = Date.now();
      setReminderMode("soft");
      setMessage(buildReminderCopy(sessionStartedAtRef.current, activePolicy));
      setVisible(true);
      scheduleReminder();
    }, delay);
  };

  useEffect(() => {
    const subscription = AppState.addEventListener("change", (nextState) => {
      setAppState(nextState);
    });

    return () => {
      subscription.remove();
      clearReminderTimer();
    };
  }, []);

  useEffect(() => {
    if (!studyActive) {
      resetSession();
      return;
    }

    if (sessionStartedAtRef.current === null) {
      sessionStartedAtRef.current = Date.now();
      snoozeUntilRef.current = null;
      setVisible(false);
      setMessage("");
    }

    scheduleReminder();

    return () => {
      clearReminderTimer();
    };
  }, [studyActive, pathname, appState, strictMinorProtection]);

  const postponeReminder = (): void => {
    setVisible(false);
    softReminderShownAtRef.current = null;
    snoozeUntilRef.current = Date.now() + getCurrentPolicy().snoozeMinutes * 60 * 1000;
    scheduleReminder();
  };

  const endStudySession = (): void => {
    resetSession();
    router.replace("/home");
  };

  if (!visible) {
    return <>{children}</>;
  }

  const activePolicy = getCurrentPolicy();
  const eyebrow = reminderMode === "limit" || activePolicy.minorProtection ? "Minor Protection" : "Study Reminder";
  const title =
    reminderMode === "limit"
      ? "本次学习已达上限"
      : activePolicy.minorProtection
        ? "未成年人建议先休息一下"
        : "建议先休息一下";

  return (
    <>
      {children}
      <View
        style={{
          position: "absolute",
          left: spacing.md,
          right: spacing.md,
          bottom: spacing.xxl,
          backgroundColor: colors.cardAccent,
          borderWidth: 1,
          borderColor: colors.cardAccentBorder,
          borderRadius: radii.lg,
          padding: spacing.md,
          gap: spacing.sm,
          shadowColor: "#000000",
          shadowOpacity: 0.28,
          shadowRadius: 16,
          shadowOffset: {
            width: 0,
            height: 12
          },
          elevation: 8
        }}
      >
        <Text style={{ color: colors.accent, fontSize: 12, fontWeight: "800", letterSpacing: 1 }}>
          {eyebrow}
        </Text>
        <Text style={{ color: colors.textPrimary, fontSize: 18, lineHeight: 24, fontWeight: "800" }}>
          {title}
        </Text>
        <Text
          testID="study.durationReminder.message"
          style={{ color: colors.textSecondary, fontSize: 14, lineHeight: 20 }}
        >
          {message}
        </Text>
        {reminderMode === "limit" ? (
          <Pressable
            onPress={endStudySession}
            testID="study.durationReminder.endSession"
            style={({ pressed }) => ({
              minHeight: 48,
              borderRadius: radii.md,
              alignItems: "center",
              justifyContent: "center",
              backgroundColor: pressed ? colors.accentPressed : colors.accent,
              paddingHorizontal: spacing.md
            })}
          >
            <Text style={{ color: colors.canvas, fontSize: 15, fontWeight: "800" }}>返回首页休息</Text>
          </Pressable>
        ) : (
          <Pressable
            onPress={postponeReminder}
            testID="study.durationReminder.dismiss"
            style={({ pressed }) => ({
              minHeight: 48,
              borderRadius: radii.md,
              alignItems: "center",
              justifyContent: "center",
              backgroundColor: pressed ? colors.accentPressed : colors.accent,
              paddingHorizontal: spacing.md
            })}
          >
            <Text style={{ color: colors.canvas, fontSize: 15, fontWeight: "800" }}>
              {`${activePolicy.snoozeMinutes} 分钟后再提醒`}
            </Text>
          </Pressable>
        )}
      </View>
    </>
  );
}
