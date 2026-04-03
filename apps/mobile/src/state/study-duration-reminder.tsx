import { usePathname } from "expo-router";
import { useEffect, useRef, useState } from "react";
import { AppState, Pressable, Text, View } from "react-native";
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

const getReminderThresholdMs = (date: Date): number =>
  (isNightWindow(date) ? nightReminderMinutes : dayReminderMinutes) * 60 * 1000;

const buildReminderCopy = (sessionStartedAt: number): string => {
  const now = new Date();
  const elapsedMinutes = Math.max(1, Math.round((now.getTime() - sessionStartedAt) / (60 * 1000)));

  if (isNightWindow(now)) {
    return `现在已较晚，你已连续学习约 ${elapsedMinutes} 分钟，建议先休息再继续。`;
  }

  return `你已连续学习约 ${elapsedMinutes} 分钟，建议休息后再继续使用。`;
};

export function StudyDurationReminderProvider({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const [appState, setAppState] = useState(AppState.currentState);
  const [visible, setVisible] = useState(false);
  const [message, setMessage] = useState("");
  const reminderTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const sessionStartedAtRef = useRef<number | null>(null);
  const snoozeUntilRef = useRef<number | null>(null);
  const studyActive = appState === "active" && isStudyRoutePath(pathname);

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
    setVisible(false);
    setMessage("");
  };

  const scheduleReminder = (): void => {
    clearReminderTimer();

    if (!studyActive || sessionStartedAtRef.current === null) {
      return;
    }

    const now = Date.now();
    const thresholdDueAt = sessionStartedAtRef.current + getReminderThresholdMs(new Date(now));
    const nextDueAt = Math.max(thresholdDueAt, snoozeUntilRef.current ?? 0);
    const delay = Math.max(0, nextDueAt - now);

    reminderTimerRef.current = setTimeout(() => {
      if (sessionStartedAtRef.current === null) {
        return;
      }
      setMessage(buildReminderCopy(sessionStartedAtRef.current));
      setVisible(true);
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
  }, [studyActive, pathname, appState]);

  const postponeReminder = (): void => {
    setVisible(false);
    snoozeUntilRef.current = Date.now() + snoozeMinutes * 60 * 1000;
    scheduleReminder();
  };

  if (!visible) {
    return <>{children}</>;
  }

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
          Study Reminder
        </Text>
        <Text style={{ color: colors.textPrimary, fontSize: 18, lineHeight: 24, fontWeight: "800" }}>
          建议先休息一下
        </Text>
        <Text
          testID="study.durationReminder.message"
          style={{ color: colors.textSecondary, fontSize: 14, lineHeight: 20 }}
        >
          {message}
        </Text>
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
            {`${snoozeMinutes} 分钟后再提醒`}
          </Text>
        </Pressable>
      </View>
    </>
  );
}
