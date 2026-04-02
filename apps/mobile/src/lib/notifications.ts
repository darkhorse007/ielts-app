import Constants from "expo-constants";
import { Platform } from "react-native";
import { buildScopedStorageKey, loadStoredJson, saveStoredJson } from "./storage";

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

export type ReminderNotificationRouteTarget = {
  route: string;
  reminderId: string | null;
};

export type RemoteReminderDeviceRegistration = {
  installationId: string;
  platform: "ios" | "android";
  permissionStatus: "granted" | "provisional" | "undetermined" | "denied" | "unsupported";
  pushProvider?: "apns" | "fcm";
  pushToken?: string;
  deviceLabel: string;
  appBuild?: string;
  environment: "development" | "preview" | "production";
};

const reminderChannelId = "study-reminders";
const reminderKind = "study-reminder";
const fallbackReminderDelaySeconds = 5;
const authorizedIosStatuses = new Set([2, 3, 4]);
const installationIdStorageKey = buildScopedStorageKey("installation", "id", "v1");

let notificationsModulePromise: Promise<NotificationsModule | null> | null = null;
let notificationHandlerConfigured = false;
const debugNotificationRouteTargetListeners = new Set<(target: ReminderNotificationRouteTarget) => void>();

const unavailablePermissions: NotificationPermissionSnapshot = {
  available: false,
  granted: false,
  canAskAgain: false,
  expires: "never",
  status: "unavailable"
};

const shouldSkipNotificationsModule = (): boolean => Platform.OS === "android" && Constants.appOwnership === "expo";

const createInstallationId = (): string => {
  const maybeRandomUuid = globalThis.crypto?.randomUUID?.();
  if (maybeRandomUuid) {
    return maybeRandomUuid;
  }

  return `${Platform.OS}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
};

const getNotificationBuildEnvironment = (): "development" | "preview" | "production" => {
  if (__DEV__) {
    return "development";
  }

  if (Constants.executionEnvironment === "standalone") {
    return "production";
  }

  return "preview";
};

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

const normalizeReminderId = (value: unknown): string | null => {
  if (typeof value !== "string") {
    return null;
  }

  const trimmed = value.trim();
  return trimmed ? trimmed : null;
};

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

export const toRemotePermissionStatus = (
  settings: NotificationPermissionSnapshot
): "granted" | "provisional" | "undetermined" | "denied" | "unsupported" => {
  if (!settings.available) {
    return "unsupported";
  }

  if (settings.ios?.status === 3) {
    return "provisional";
  }

  if (allowsNotifications(settings)) {
    return "granted";
  }

  if (String(settings.status) === "undetermined" || settings.canAskAgain) {
    return "undetermined";
  }

  return "denied";
};

export const getReminderInstallationIdAsync = async (): Promise<string> => {
  const existing = await loadStoredJson<string>(installationIdStorageKey);
  if (existing) {
    return existing;
  }

  const created = createInstallationId();
  await saveStoredJson(installationIdStorageKey, created);
  return created;
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

export const buildCurrentRemoteReminderDeviceRegistrationAsync = async (): Promise<RemoteReminderDeviceRegistration> => {
  const installationId = await getReminderInstallationIdAsync();
  const permission = await getNotificationPermissionsStatusAsync();
  const permissionStatus = toRemotePermissionStatus(permission);
  const environment = getNotificationBuildEnvironment();
  const deviceLabel = `mobile-${Platform.OS}`;
  const appBuild = Constants.expoConfig?.version;

  const registration: RemoteReminderDeviceRegistration = {
    installationId,
    platform: Platform.OS === "android" ? "android" : "ios",
    permissionStatus,
    deviceLabel,
    appBuild,
    environment
  };

  if (
    permissionStatus !== "granted" &&
    permissionStatus !== "provisional" &&
    permissionStatus !== "undetermined"
  ) {
    return registration;
  }

  const notifications = await loadNotificationsModule();
  if (!notifications || Constants.appOwnership === "expo" || !notifications.getDevicePushTokenAsync) {
    return registration;
  }

  try {
    const token = await notifications.getDevicePushTokenAsync();
    if (typeof token.data === "string" && token.data.trim()) {
      registration.pushProvider = token.type === "ios" ? "apns" : "fcm";
      registration.pushToken = token.data.trim();
    }
  } catch {
    // Best-effort registration. The server can still track capability without a resolved native token.
  }

  return registration;
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

export const getNotificationRouteTarget = (response: {
  notification: {
    request: {
      content: {
        data?: Record<string, unknown>;
      };
    };
  };
} | null | undefined): ReminderNotificationRouteTarget | null => {
  const data = response?.notification.request.content.data;
  const route = normalizeDeepLink(data?.deepLink);
  if (!route) {
    return null;
  }

  return {
    route,
    reminderId: normalizeReminderId(data?.reminderId)
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
} | null | undefined): string | null => getNotificationRouteTarget(response)?.route ?? null;

export const getLastNotificationRouteTargetAsync = async (): Promise<ReminderNotificationRouteTarget | null> => {
  const notifications = await loadNotificationsModule();
  if (!notifications) {
    return null;
  }

  return getNotificationRouteTarget(notifications.getLastNotificationResponse());
};

export const getLastNotificationRouteAsync = async (): Promise<string | null> => {
  return (await getLastNotificationRouteTargetAsync())?.route ?? null;
};

export const clearLastNotificationResponseAsync = async (): Promise<void> => {
  const notifications = await loadNotificationsModule();
  notifications?.clearLastNotificationResponse();
};

export const subscribeToNotificationRoutesAsync = async (
  onRoute: (route: string) => void
): Promise<() => void> => {
  return subscribeToNotificationRouteTargetsAsync((target) => {
    onRoute(target.route);
  });
};

export const subscribeToNotificationRouteTargetsAsync = async (
  onTarget: (target: ReminderNotificationRouteTarget) => void
): Promise<() => void> => {
  const notifications = await loadNotificationsModule();
  if (!notifications) {
    return () => undefined;
  }

  const subscription = notifications.addNotificationResponseReceivedListener((response) => {
    const target = getNotificationRouteTarget(response);
    if (target) {
      onTarget(target);
    }
  });

  return () => {
    subscription.remove();
  };
};

export const subscribeToDebugNotificationRouteTargets = (
  onTarget: (target: ReminderNotificationRouteTarget) => void
): (() => void) => {
  debugNotificationRouteTargetListeners.add(onTarget);
  return () => {
    debugNotificationRouteTargetListeners.delete(onTarget);
  };
};

export const emitDebugReminderNotificationOpen = (input: {
  deepLink?: string | null;
  reminderId?: string | null;
}): ReminderNotificationRouteTarget | null => {
  const route = normalizeDeepLink(input.deepLink);
  if (!route) {
    return null;
  }

  const target = {
    route,
    reminderId: normalizeReminderId(input.reminderId)
  } satisfies ReminderNotificationRouteTarget;

  debugNotificationRouteTargetListeners.forEach((listener) => {
    listener(target);
  });

  return target;
};
