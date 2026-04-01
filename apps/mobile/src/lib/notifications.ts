import Constants from "expo-constants";
import { Platform } from "react-native";

type NotificationsModule = typeof import("expo-notifications");

export type NotificationPermissionSnapshot = {
  available: boolean;
  granted: boolean;
  canAskAgain: boolean;
  expires: string | number;
  status: string | number;
  ios?: {
    status?: number | null;
  };
};

export type ScheduledReminderSummary = {
  identifier: string;
  reminderId: string | null;
  deepLink: string;
  scheduledAt: string | null;
};

const reminderChannelId = "study-reminders";
const reminderKind = "study-reminder";
const fallbackReminderDelaySeconds = 5;
const authorizedIosStatuses = new Set([2, 3, 4]);

let notificationsModulePromise: Promise<NotificationsModule | null> | null = null;
let notificationHandlerConfigured = false;

const unavailablePermissions: NotificationPermissionSnapshot = {
  available: false,
  granted: false,
  canAskAgain: false,
  expires: "never",
  status: "unavailable"
};

const shouldSkipNotificationsModule = (): boolean => Platform.OS === "android" && Constants.appOwnership === "expo";

const loadNotificationsModule = async (): Promise<NotificationsModule | null> => {
  if (shouldSkipNotificationsModule()) {
    return null;
  }

  if (!notificationsModulePromise) {
    notificationsModulePromise = import("expo-notifications")
      .then((module) => {
        if (!notificationHandlerConfigured) {
          module.setNotificationHandler({
            handleNotification: async () => ({
              shouldShowBanner: true,
              shouldShowList: true,
              shouldPlaySound: true,
              shouldSetBadge: false,
              priority: module.AndroidNotificationPriority.HIGH
            })
          });
          notificationHandlerConfigured = true;
        }

        return module;
      })
      .catch(() => null);
  }

  return notificationsModulePromise;
};

const isReminderRequest = (request: {
  content: {
    data?: Record<string, unknown>;
  };
}): boolean => request.content.data?.kind === reminderKind;

const normalizeDeepLink = (value: unknown): string | null => {
  if (typeof value !== "string") {
    return null;
  }

  const trimmed = value.trim();
  if (!trimmed) {
    return null;
  }

  if (trimmed.startsWith("/")) {
    return trimmed;
  }

  if (trimmed.startsWith("ielts-mobile://")) {
    const route = trimmed.replace("ielts-mobile://", "/");
    return route.startsWith("/") ? route : `/${route}`;
  }

  return `/${trimmed.replace(/^\/+/, "")}`;
};

const toSummary = (request: {
  identifier: string;
  content: {
    data?: Record<string, unknown>;
  };
}): ScheduledReminderSummary => {
  const data = request.content.data;
  return {
    identifier: request.identifier,
    reminderId: typeof data?.reminderId === "string" ? data.reminderId : null,
    deepLink: normalizeDeepLink(data?.deepLink) ?? "/plan",
    scheduledAt: typeof data?.scheduledAt === "string" ? data.scheduledAt : null
  };
};

export const allowsNotifications = (settings: NotificationPermissionSnapshot): boolean =>
  settings.available && (settings.granted || authorizedIosStatuses.has(settings.ios?.status ?? -1));

export const toNotificationPermissionLabel = (settings: NotificationPermissionSnapshot): string => {
  if (!settings.available) {
    return "当前环境不支持";
  }

  if (allowsNotifications(settings)) {
    return "已授权";
  }

  return settings.canAskAgain ? "未决定" : "已拒绝";
};

export const ensureReminderNotificationChannelAsync = async (): Promise<void> => {
  const notifications = await loadNotificationsModule();
  if (!notifications || Platform.OS !== "android") {
    return;
  }

  await notifications.setNotificationChannelAsync(reminderChannelId, {
    name: "学习提醒",
    importance: notifications.AndroidImportance.HIGH,
    vibrationPattern: [0, 250, 250, 250],
    lightColor: "#7DE2D1"
  });
};

export const getNotificationPermissionsStatusAsync = async (): Promise<NotificationPermissionSnapshot> => {
  const notifications = await loadNotificationsModule();
  if (!notifications) {
    return unavailablePermissions;
  }

  const permissions = await notifications.getPermissionsAsync();
  return {
    available: true,
    granted: permissions.granted,
    canAskAgain: permissions.canAskAgain,
    expires: permissions.expires,
    status: permissions.status,
    ios: permissions.ios
  };
};

export const requestNotificationPermissionsAsync = async (): Promise<NotificationPermissionSnapshot> => {
  const notifications = await loadNotificationsModule();
  if (!notifications) {
    return unavailablePermissions;
  }

  const permissions = await notifications.requestPermissionsAsync({
    ios: {
      allowAlert: true,
      allowBadge: true,
      allowSound: true
    }
  });

  return {
    available: true,
    granted: permissions.granted,
    canAskAgain: permissions.canAskAgain,
    expires: permissions.expires,
    status: permissions.status,
    ios: permissions.ios
  };
};

export const getScheduledReminderSummaryAsync = async (): Promise<ScheduledReminderSummary | null> => {
  const notifications = await loadNotificationsModule();
  if (!notifications) {
    return null;
  }

  const requests = await notifications.getAllScheduledNotificationsAsync();
  const reminders = requests.filter(isReminderRequest).map(toSummary);
  if (reminders.length === 0) {
    return null;
  }

  reminders.sort((left, right) => {
    const leftTime = left.scheduledAt ? Date.parse(left.scheduledAt) : Number.POSITIVE_INFINITY;
    const rightTime = right.scheduledAt ? Date.parse(right.scheduledAt) : Number.POSITIVE_INFINITY;
    return leftTime - rightTime;
  });

  return reminders[0];
};

export const cancelReminderNotificationsAsync = async (): Promise<number> => {
  const notifications = await loadNotificationsModule();
  if (!notifications) {
    return 0;
  }

  const requests = await notifications.getAllScheduledNotificationsAsync();
  const reminders = requests.filter(isReminderRequest);
  await Promise.all(reminders.map((request) => notifications.cancelScheduledNotificationAsync(request.identifier)));
  return reminders.length;
};

export const scheduleReminderNotificationAsync = async (input: {
  title: string;
  body: string;
  deepLink?: string | null;
  reminderId?: string | null;
  scheduledAt?: string | null;
}): Promise<ScheduledReminderSummary> => {
  const notifications = await loadNotificationsModule();
  if (!notifications) {
    throw new Error("当前运行环境不支持本地通知，请使用 development build 或正式安装包");
  }

  await ensureReminderNotificationChannelAsync();
  await cancelReminderNotificationsAsync();

  const requestedDate = input.scheduledAt ? new Date(input.scheduledAt) : null;
  const scheduledFor =
    requestedDate && !Number.isNaN(requestedDate.getTime()) && requestedDate.getTime() > Date.now() + 1000
      ? requestedDate
      : new Date(Date.now() + fallbackReminderDelaySeconds * 1000);

  const deepLink = normalizeDeepLink(input.deepLink) ?? "/plan";
  const identifier = await notifications.scheduleNotificationAsync({
    content: {
      title: input.title,
      body: input.body,
      sound: "default",
      data: {
        kind: reminderKind,
        deepLink,
        reminderId: input.reminderId ?? null,
        scheduledAt: scheduledFor.toISOString()
      }
    },
    trigger: {
      type: notifications.SchedulableTriggerInputTypes.DATE,
      date: scheduledFor,
      ...(Platform.OS === "android" ? { channelId: reminderChannelId } : {})
    }
  });

  return {
    identifier,
    reminderId: input.reminderId ?? null,
    deepLink,
    scheduledAt: scheduledFor.toISOString()
  };
};

export const getNotificationRoute = (response: {
  notification: {
    request: {
      content: {
        data?: Record<string, unknown>;
      };
    };
  };
} | null | undefined): string | null => normalizeDeepLink(response?.notification.request.content.data?.deepLink);

export const getLastNotificationRouteAsync = async (): Promise<string | null> => {
  const notifications = await loadNotificationsModule();
  if (!notifications) {
    return null;
  }

  return getNotificationRoute(notifications.getLastNotificationResponse());
};

export const clearLastNotificationResponseAsync = async (): Promise<void> => {
  const notifications = await loadNotificationsModule();
  notifications?.clearLastNotificationResponse();
};

export const subscribeToNotificationRoutesAsync = async (
  onRoute: (route: string) => void
): Promise<() => void> => {
  const notifications = await loadNotificationsModule();
  if (!notifications) {
    return () => undefined;
  }

  const subscription = notifications.addNotificationResponseReceivedListener((response) => {
    const route = getNotificationRoute(response);
    if (route) {
      onRoute(route);
    }
  });

  return () => {
    subscription.remove();
  };
};
