import { router } from "expo-router";
import { useEffect, useEffectEvent, useRef, useState } from "react";
import {
  clearLastNotificationResponseAsync,
  getLastNotificationRouteTargetAsync,
  subscribeToNotificationRouteTargetsAsync,
  type ReminderNotificationRouteTarget
} from "../lib/notifications";
import { useAppSession } from "./app-session";

type PendingReminderClick = ReminderNotificationRouteTarget & {
  key: string;
};

const toReminderNotificationKey = (target: ReminderNotificationRouteTarget): string =>
  `${target.reminderId ?? "route-only"}:${target.route}`;

export const ReminderNotificationBridge = () => {
  const { ready, instanceConfig, session, runWithAuthorizedClient } = useAppSession();
  const openedTargetKeysRef = useRef(new Set<string>());
  const [pendingReminderClick, setPendingReminderClick] = useState<PendingReminderClick | null>(null);

  const openNotificationTarget = useEffectEvent(async (target: ReminderNotificationRouteTarget | null) => {
    if (!target) {
      return;
    }

    const key = toReminderNotificationKey(target);
    if (openedTargetKeysRef.current.has(key)) {
      await clearLastNotificationResponseAsync();
      return;
    }

    openedTargetKeysRef.current.add(key);
    router.push(target.route);
    if (target.reminderId) {
      setPendingReminderClick({
        ...target,
        key
      });
    }
    await clearLastNotificationResponseAsync();
  });

  const trackReminderClick = useEffectEvent(async (target: PendingReminderClick) => {
    if (!target.reminderId) {
      return;
    }

    await runWithAuthorizedClient((apiClient, accessToken) => apiClient.clickReminder(accessToken, target.reminderId!));
  });

  useEffect(() => {
    let active = true;
    let unsubscribe: () => void = () => undefined;

    void (async () => {
      const initialTarget = await getLastNotificationRouteTargetAsync();
      if (!active) {
        return;
      }

      await openNotificationTarget(initialTarget);
      if (!active) {
        return;
      }

      unsubscribe = await subscribeToNotificationRouteTargetsAsync((target) => {
        void openNotificationTarget(target);
      });
    })();

    return () => {
      active = false;
      unsubscribe();
    };
  }, []);

  useEffect(() => {
    if (!ready || (session && instanceConfig)) {
      return;
    }

    setPendingReminderClick(null);
  }, [instanceConfig, ready, session]);

  useEffect(() => {
    if (!pendingReminderClick?.reminderId || !ready || !session || !instanceConfig) {
      return;
    }

    let cancelled = false;
    const current = pendingReminderClick;

    void trackReminderClick(current)
      .catch(() => undefined)
      .finally(() => {
        if (!cancelled) {
          setPendingReminderClick((latest) => (latest?.key === current.key ? null : latest));
        }
      });

    return () => {
      cancelled = true;
    };
  }, [instanceConfig, pendingReminderClick, ready, session]);

  return null;
};
