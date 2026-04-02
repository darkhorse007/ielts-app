import { appendAudit } from "./audit.js";
import { InMemoryStore } from "./store.js";
import type { ReminderDeviceRegistration, ReminderPushProvider } from "./types.js";
import type { ReminderService } from "./reminder-service.js";

export type ReminderPushProviderRuntimeSettings = {
  apns: {
    enabled: boolean;
    bundleId?: string;
  };
  fcm: {
    enabled: boolean;
    projectId?: string;
  };
};

export type ReminderDispatchSkipReason =
  | "USER_UNSUBSCRIBED"
  | "DEVICE_NOT_DELIVERABLE"
  | "PUSH_PROVIDER_MISSING"
  | "PROVIDER_DISABLED"
  | "PROVIDER_NOT_CONFIGURED";

export type ReminderDispatchPreviewItem = {
  installationId: string;
  platform: "ios" | "android";
  permissionStatus: "granted" | "provisional" | "undetermined" | "denied" | "unsupported";
  pushProvider?: "apns" | "fcm";
  pushTokenPreview?: string;
  environment: "development" | "preview" | "production";
  deliveryReady: boolean;
  dispatchable: boolean;
  providerReady: boolean;
  skipReason?: ReminderDispatchSkipReason;
  deviceLabel?: string;
  appBuild?: string;
  updatedAt: string;
};

export type ReminderDispatchProviderSummary = {
  enabled: boolean;
  configured: boolean;
  ready: boolean;
  missingFields: string[];
  targetCount: number;
  dispatchableCount: number;
  skippedCount: number;
  bundleId?: string;
  projectId?: string;
};

export type ReminderDispatchPreview = {
  reminderId: string;
  userId: string;
  subscribed: boolean;
  scheduledAt: string;
  deepLink: string;
  planId?: string;
  taskId?: string;
  dispatchableCount: number;
  skippedCount: number;
  providerSummary: Record<ReminderPushProvider, ReminderDispatchProviderSummary>;
  items: ReminderDispatchPreviewItem[];
};

type ProviderRuntimeState = {
  enabled: boolean;
  configured: boolean;
  ready: boolean;
  missingFields: string[];
  bundleId?: string;
  projectId?: string;
};

const toPushTokenPreview = (pushToken?: string): string | undefined => {
  if (!pushToken) {
    return undefined;
  }

  if (pushToken.length <= 10) {
    return pushToken;
  }

  return `${pushToken.slice(0, 6)}...${pushToken.slice(-4)}`;
};

const normalizeProviderRuntimeSettings = (
  settings?: Partial<ReminderPushProviderRuntimeSettings>
): ReminderPushProviderRuntimeSettings => ({
  apns: {
    enabled: settings?.apns?.enabled ?? false,
    bundleId: settings?.apns?.bundleId?.trim() || undefined
  },
  fcm: {
    enabled: settings?.fcm?.enabled ?? false,
    projectId: settings?.fcm?.projectId?.trim() || undefined
  }
});

export class ReminderDeliveryService {
  private readonly providerSettings: ReminderPushProviderRuntimeSettings;

  constructor(
    private readonly store: InMemoryStore,
    private readonly reminderService: ReminderService,
    providerSettings?: Partial<ReminderPushProviderRuntimeSettings>
  ) {
    this.providerSettings = normalizeProviderRuntimeSettings(providerSettings);
  }

  previewDispatch(input: {
    reminderId: string;
    requestUserId: string;
  }): ReminderDispatchPreview {
    const reminder = this.store.reminderRecommendationsById.get(input.reminderId);
    if (!reminder || reminder.userId !== input.requestUserId) {
      throw new Error("REMINDER_NOT_FOUND");
    }

    const preference = this.reminderService.getPreference(reminder.userId);
    const providerState = this.getProviderStates();
    const items = this.reminderService.listDevices(reminder.userId).map((device) =>
      this.toPreviewItem(device, preference.subscribed, providerState)
    );

    const providerSummary: Record<ReminderPushProvider, ReminderDispatchProviderSummary> = {
      apns: this.toProviderSummary("apns", providerState.apns, items),
      fcm: this.toProviderSummary("fcm", providerState.fcm, items)
    };
    const dispatchableCount = items.filter((item) => item.dispatchable).length;
    const preview: ReminderDispatchPreview = {
      reminderId: reminder.id,
      userId: reminder.userId,
      subscribed: preference.subscribed,
      scheduledAt: reminder.scheduledAt,
      deepLink: reminder.deepLink,
      planId: reminder.planId,
      taskId: reminder.taskId,
      dispatchableCount,
      skippedCount: items.length - dispatchableCount,
      providerSummary,
      items
    };

    appendAudit(this.store, "reminder_dispatch_previewed", {
      userId: reminder.userId,
      metadata: {
        reminderId: reminder.id,
        dispatchableCount: preview.dispatchableCount,
        skippedCount: preview.skippedCount,
        apnsReady: providerSummary.apns.ready,
        fcmReady: providerSummary.fcm.ready
      }
    });

    return preview;
  }

  private getProviderStates(): Record<ReminderPushProvider, ProviderRuntimeState> {
    const apnsMissingFields = this.providerSettings.apns.bundleId ? [] : ["bundle_id"];
    const fcmMissingFields = this.providerSettings.fcm.projectId ? [] : ["project_id"];

    return {
      apns: {
        enabled: this.providerSettings.apns.enabled,
        configured: apnsMissingFields.length === 0,
        ready: this.providerSettings.apns.enabled && apnsMissingFields.length === 0,
        missingFields: apnsMissingFields,
        bundleId: this.providerSettings.apns.bundleId
      },
      fcm: {
        enabled: this.providerSettings.fcm.enabled,
        configured: fcmMissingFields.length === 0,
        ready: this.providerSettings.fcm.enabled && fcmMissingFields.length === 0,
        missingFields: fcmMissingFields,
        projectId: this.providerSettings.fcm.projectId
      }
    };
  }

  private toPreviewItem(
    device: ReminderDeviceRegistration,
    subscribed: boolean,
    providerState: Record<ReminderPushProvider, ProviderRuntimeState>
  ): ReminderDispatchPreviewItem {
    const deliveryReady = this.reminderService.isDeviceDeliverable(device);
    const runtime = device.pushProvider ? providerState[device.pushProvider] : undefined;

    let dispatchable = false;
    let providerReady = false;
    let skipReason: ReminderDispatchSkipReason | undefined;

    if (!subscribed) {
      skipReason = "USER_UNSUBSCRIBED";
    } else if (!deliveryReady) {
      skipReason = "DEVICE_NOT_DELIVERABLE";
    } else if (!device.pushProvider) {
      skipReason = "PUSH_PROVIDER_MISSING";
    } else if (!runtime?.enabled) {
      skipReason = "PROVIDER_DISABLED";
    } else if (!runtime.ready) {
      skipReason = "PROVIDER_NOT_CONFIGURED";
    } else {
      dispatchable = true;
      providerReady = true;
    }

    return {
      installationId: device.installationId,
      platform: device.platform,
      permissionStatus: device.permissionStatus,
      pushProvider: device.pushProvider,
      pushTokenPreview: toPushTokenPreview(device.pushToken),
      environment: device.environment,
      deliveryReady,
      dispatchable,
      providerReady,
      skipReason,
      deviceLabel: device.deviceLabel,
      appBuild: device.appBuild,
      updatedAt: device.updatedAt
    };
  }

  private toProviderSummary(
    provider: ReminderPushProvider,
    runtime: ProviderRuntimeState,
    items: ReminderDispatchPreviewItem[]
  ): ReminderDispatchProviderSummary {
    const targetItems = items.filter((item) => item.pushProvider === provider);
    const dispatchableItems = targetItems.filter((item) => item.dispatchable);

    return {
      enabled: runtime.enabled,
      configured: runtime.configured,
      ready: runtime.ready,
      missingFields: runtime.missingFields,
      targetCount: targetItems.length,
      dispatchableCount: dispatchableItems.length,
      skippedCount: targetItems.length - dispatchableItems.length,
      bundleId: runtime.bundleId,
      projectId: runtime.projectId
    };
  }
}
