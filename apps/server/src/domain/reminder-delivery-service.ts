import { randomUUID } from "node:crypto";
import { appendAudit } from "./audit.js";
import { isReminderPushProviderDispatchError } from "./reminder-push-provider-senders.js";
import { InMemoryStore } from "./store.js";
import { nowIso } from "./time.js";
import type {
  ReminderDispatchFailureCode,
  ReminderDeliveryAttempt,
  ReminderDeviceRegistration,
  ReminderPushProvider,
  ReminderRecommendation
} from "./types.js";
import type { ReminderService } from "./reminder-service.js";

export type ReminderPushProviderRuntimeSettings = {
  apns: {
    enabled: boolean;
    bundleId?: string;
    teamId?: string;
    keyId?: string;
    privateKey?: string;
  };
  fcm: {
    enabled: boolean;
    projectId?: string;
    clientEmail?: string;
    privateKey?: string;
    tokenUri?: string;
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

export type ReminderPushDispatchPayload = {
  reminder: ReminderRecommendation;
  device: ReminderDeviceRegistration;
};

export type ReminderPushDispatchReceipt = {
  providerMessageId?: string;
};

export type ReminderPushProviderSender = (
  payload: ReminderPushDispatchPayload
) => Promise<ReminderPushDispatchReceipt>;

export type ReminderPushProviderSenders = Partial<Record<ReminderPushProvider, ReminderPushProviderSender>>;

export type ReminderDispatchExecuteItem = {
  attemptId: string;
  installationId: string;
  platform: "ios" | "android";
  pushProvider?: "apns" | "fcm";
  status: "sent" | "skipped" | "duplicate" | "failed";
  providerMessageId?: string;
  duplicateOfAttemptId?: string;
  skipReason?: ReminderDispatchSkipReason;
  failureCode?: ReminderDispatchFailureCode;
  failureMessage?: string;
  retryCount: number;
  updatedAt: string;
};

export type ReminderDispatchExecuteResult = {
  reminderId: string;
  userId: string;
  dispatchCount: number;
  duplicateCount: number;
  skippedCount: number;
  failedCount: number;
  items: ReminderDispatchExecuteItem[];
};

type ProviderRuntimeState = {
  enabled: boolean;
  configured: boolean;
  ready: boolean;
  missingFields: string[];
  bundleId?: string;
  projectId?: string;
  senderAvailable: boolean;
};

type NormalizedDispatchFailure = {
  failureCode: ReminderDispatchFailureCode;
  failureMessage: string;
  retryable: boolean;
};

const MAX_PROVIDER_RETRY_COUNT = 2;

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
    bundleId: settings?.apns?.bundleId?.trim() || undefined,
    teamId: settings?.apns?.teamId?.trim() || undefined,
    keyId: settings?.apns?.keyId?.trim() || undefined,
    privateKey: settings?.apns?.privateKey?.trim() || undefined
  },
  fcm: {
    enabled: settings?.fcm?.enabled ?? false,
    projectId: settings?.fcm?.projectId?.trim() || undefined,
    clientEmail: settings?.fcm?.clientEmail?.trim() || undefined,
    privateKey: settings?.fcm?.privateKey?.trim() || undefined,
    tokenUri: settings?.fcm?.tokenUri?.trim() || undefined
  }
});

const normalizeDispatchFailure = (error: unknown): NormalizedDispatchFailure => {
  if (isReminderPushProviderDispatchError(error)) {
    return {
      failureCode: error.failureCode,
      failureMessage: error.message,
      retryable: error.retryable
    };
  }

  if (error instanceof Error && error.message.trim()) {
    return {
      failureCode: "PROVIDER_ERROR",
      failureMessage: error.message,
      retryable: false
    };
  }

  return {
    failureCode: "PROVIDER_ERROR",
    failureMessage: "provider dispatch failed",
    retryable: false
  };
};

export class ReminderDeliveryService {
  private readonly providerSettings: ReminderPushProviderRuntimeSettings;
  private readonly senders: ReminderPushProviderSenders;

  constructor(
    private readonly store: InMemoryStore,
    private readonly reminderService: ReminderService,
    providerSettings?: Partial<ReminderPushProviderRuntimeSettings>,
    senders?: ReminderPushProviderSenders
  ) {
    this.providerSettings = normalizeProviderRuntimeSettings(providerSettings);
    this.senders = senders ?? {};
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

  async dispatch(input: {
    reminderId: string;
    requestUserId: string;
  }): Promise<ReminderDispatchExecuteResult> {
    const reminder = this.store.reminderRecommendationsById.get(input.reminderId);
    if (!reminder || reminder.userId !== input.requestUserId) {
      throw new Error("REMINDER_NOT_FOUND");
    }

    const preference = this.reminderService.getPreference(reminder.userId);
    const providerState = this.getProviderStates();
    const items = await Promise.all(
      this.reminderService
        .listDevices(reminder.userId)
        .map((device) => this.dispatchToDevice(reminder, device, preference.subscribed, providerState))
    );

    const result: ReminderDispatchExecuteResult = {
      reminderId: reminder.id,
      userId: reminder.userId,
      dispatchCount: items.filter((item) => item.status === "sent").length,
      duplicateCount: items.filter((item) => item.status === "duplicate").length,
      skippedCount: items.filter((item) => item.status === "skipped").length,
      failedCount: items.filter((item) => item.status === "failed").length,
      items
    };

    appendAudit(this.store, "reminder_dispatch_executed", {
      userId: reminder.userId,
      metadata: {
        reminderId: reminder.id,
        dispatchCount: result.dispatchCount,
        duplicateCount: result.duplicateCount,
        skippedCount: result.skippedCount,
        failedCount: result.failedCount
      }
    });

    return result;
  }

  private getProviderStates(): Record<ReminderPushProvider, ProviderRuntimeState> {
    const apnsSenderAvailable = Boolean(this.senders.apns);
    const fcmSenderAvailable = Boolean(this.senders.fcm);
    const apnsMissingFields = apnsSenderAvailable
      ? []
      : [
          this.providerSettings.apns.bundleId ? null : "bundle_id",
          this.providerSettings.apns.teamId ? null : "team_id",
          this.providerSettings.apns.keyId ? null : "key_id",
          this.providerSettings.apns.privateKey ? null : "private_key"
        ].filter((value): value is string => Boolean(value));
    const fcmMissingFields = fcmSenderAvailable
      ? []
      : [
          this.providerSettings.fcm.projectId ? null : "project_id",
          this.providerSettings.fcm.clientEmail ? null : "client_email",
          this.providerSettings.fcm.privateKey ? null : "private_key"
        ].filter((value): value is string => Boolean(value));

    return {
      apns: {
        enabled: this.providerSettings.apns.enabled,
        configured: apnsSenderAvailable || apnsMissingFields.length === 0,
        ready: this.providerSettings.apns.enabled && (apnsSenderAvailable || apnsMissingFields.length === 0),
        missingFields: apnsMissingFields,
        bundleId: this.providerSettings.apns.bundleId,
        senderAvailable: apnsSenderAvailable
      },
      fcm: {
        enabled: this.providerSettings.fcm.enabled,
        configured: fcmSenderAvailable || fcmMissingFields.length === 0,
        ready: this.providerSettings.fcm.enabled && (fcmSenderAvailable || fcmMissingFields.length === 0),
        missingFields: fcmMissingFields,
        projectId: this.providerSettings.fcm.projectId,
        senderAvailable: fcmSenderAvailable
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

  private async dispatchToDevice(
    reminder: ReminderRecommendation,
    device: ReminderDeviceRegistration,
    subscribed: boolean,
    providerState: Record<ReminderPushProvider, ProviderRuntimeState>
  ): Promise<ReminderDispatchExecuteItem> {
    const preview = this.toPreviewItem(device, subscribed, providerState);
    const dedupeKey = this.getDispatchDedupeKey(reminder.id, device.installationId);
    const previousSentAttempt = this.findSentAttemptByDedupeKey(dedupeKey);

    if (preview.dispatchable && previousSentAttempt) {
      const duplicateAttempt = this.recordAttempt({
        userId: reminder.userId,
        reminderId: reminder.id,
        installationId: device.installationId,
        dedupeKey,
        pushProvider: device.pushProvider,
        status: "duplicate",
        duplicateOfAttemptId: previousSentAttempt.id,
        retryCount: 0
      });
      return this.toExecuteItem(duplicateAttempt, device.platform);
    }

    if (!preview.dispatchable) {
      const skippedAttempt = this.recordAttempt({
        userId: reminder.userId,
        reminderId: reminder.id,
        installationId: device.installationId,
        dedupeKey,
        pushProvider: device.pushProvider,
        status: "skipped",
        skipReason: preview.skipReason,
        retryCount: 0
      });
      return this.toExecuteItem(skippedAttempt, device.platform);
    }

    const sender = device.pushProvider ? this.senders[device.pushProvider] : undefined;
    if (!sender) {
      const failedAttempt = this.recordAttempt({
        userId: reminder.userId,
        reminderId: reminder.id,
        installationId: device.installationId,
        dedupeKey,
        pushProvider: device.pushProvider,
        status: "failed",
        failureCode: "SENDER_UNAVAILABLE",
        failureMessage: `sender unavailable for ${device.pushProvider ?? "unknown"}`,
        retryCount: 0
      });
      return this.toExecuteItem(failedAttempt, device.platform);
    }

    const execution = await this.executeWithRetry(sender, {
      reminder,
      device
    });

    if ("receipt" in execution) {
      const sentAttempt = this.recordAttempt({
        userId: reminder.userId,
        reminderId: reminder.id,
        installationId: device.installationId,
        dedupeKey,
        pushProvider: device.pushProvider,
        status: "sent",
        providerMessageId: execution.receipt.providerMessageId,
        retryCount: execution.retryCount
      });
      return this.toExecuteItem(sentAttempt, device.platform);
    }

    const failedAttempt = this.recordAttempt({
      userId: reminder.userId,
      reminderId: reminder.id,
      installationId: device.installationId,
      dedupeKey,
      pushProvider: device.pushProvider,
      status: "failed",
      failureCode: execution.failure.failureCode,
      failureMessage: execution.failure.failureMessage,
      retryCount: execution.retryCount
    });
    return this.toExecuteItem(failedAttempt, device.platform);
  }

  private async executeWithRetry(
    sender: ReminderPushProviderSender,
    payload: ReminderPushDispatchPayload
  ): Promise<
    | {
        receipt: ReminderPushDispatchReceipt;
        retryCount: number;
      }
    | {
        failure: NormalizedDispatchFailure;
        retryCount: number;
      }
  > {
    let retryCount = 0;

    while (true) {
      try {
        return {
          receipt: await sender(payload),
          retryCount
        };
      } catch (error) {
        const failure = normalizeDispatchFailure(error);
        if (failure.retryable && retryCount < MAX_PROVIDER_RETRY_COUNT) {
          retryCount += 1;
          continue;
        }

        return {
          failure,
          retryCount
        };
      }
    }
  }

  private getDispatchDedupeKey(reminderId: string, installationId: string): string {
    return `${reminderId}:${installationId}`;
  }

  private findSentAttemptByDedupeKey(dedupeKey: string): ReminderDeliveryAttempt | undefined {
    return Array.from(this.store.reminderDeliveryAttemptsById.values()).find(
      (item) => item.dedupeKey === dedupeKey && item.status === "sent"
    );
  }

  private recordAttempt(input: {
    userId: string;
    reminderId: string;
    installationId: string;
    dedupeKey: string;
    pushProvider?: ReminderPushProvider;
    status: "sent" | "skipped" | "duplicate" | "failed";
    providerMessageId?: string;
    duplicateOfAttemptId?: string;
    skipReason?: ReminderDispatchSkipReason;
    failureCode?: ReminderDispatchFailureCode;
    failureMessage?: string;
    retryCount: number;
  }): ReminderDeliveryAttempt {
    const timestamp = nowIso();
    const attempt: ReminderDeliveryAttempt = {
      id: randomUUID(),
      userId: input.userId,
      reminderId: input.reminderId,
      installationId: input.installationId,
      dedupeKey: input.dedupeKey,
      pushProvider: input.pushProvider,
      status: input.status,
      providerMessageId: input.providerMessageId,
      duplicateOfAttemptId: input.duplicateOfAttemptId,
      skipReason: input.skipReason,
      failureCode: input.failureCode,
      failureMessage: input.failureMessage,
      retryCount: input.retryCount,
      createdAt: timestamp,
      updatedAt: timestamp
    };
    this.store.reminderDeliveryAttemptsById.set(attempt.id, attempt);
    return attempt;
  }

  private toExecuteItem(
    attempt: ReminderDeliveryAttempt,
    platform: "ios" | "android"
  ): ReminderDispatchExecuteItem {
    return {
      attemptId: attempt.id,
      installationId: attempt.installationId,
      platform,
      pushProvider: attempt.pushProvider,
      status: attempt.status,
      providerMessageId: attempt.providerMessageId,
      duplicateOfAttemptId: attempt.duplicateOfAttemptId,
      skipReason: attempt.skipReason as ReminderDispatchSkipReason | undefined,
      failureCode: attempt.failureCode,
      failureMessage: attempt.failureMessage,
      retryCount: attempt.retryCount,
      updatedAt: attempt.updatedAt
    };
  }
}
