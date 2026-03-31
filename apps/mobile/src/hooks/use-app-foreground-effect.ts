import { useEffect, useEffectEvent, useRef } from "react";
import { AppState, type AppStateStatus } from "react-native";

export const useAppForegroundEffect = (
  effect: () => void | Promise<void>,
  options?: {
    enabled?: boolean;
    cooldownMs?: number;
  }
) => {
  const enabled = options?.enabled ?? true;
  const cooldownMs = options?.cooldownMs ?? 1200;
  const appStateRef = useRef<AppStateStatus>(AppState.currentState ?? "active");
  const lastRunAtRef = useRef(0);
  const onForeground = useEffectEvent(async () => {
    if (!enabled) {
      return;
    }

    const now = Date.now();
    if (now - lastRunAtRef.current < cooldownMs) {
      return;
    }

    lastRunAtRef.current = now;
    await effect();
  });

  useEffect(() => {
    appStateRef.current = AppState.currentState ?? appStateRef.current;

    const subscription = AppState.addEventListener("change", (nextState) => {
      const previousState = appStateRef.current;
      appStateRef.current = nextState;

      if (previousState !== "active" && nextState === "active") {
        void onForeground();
      }
    });

    return () => {
      subscription.remove();
    };
  }, [cooldownMs, enabled]);
};
