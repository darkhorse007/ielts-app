import { createHmac, randomUUID, timingSafeEqual } from "node:crypto";
import { appendAudit } from "./audit.js";
import { defaultPaymentRuntimeConfig, type PaymentRuntimeConfig } from "./config.js";
import { addSeconds, isPast, nowIso } from "./time.js";
import { InMemoryStore } from "./store.js";
import type {
  AdminEntitlementAdjustment,
  CouponRule,
  CouponRuleStatus,
  FamilyGroup,
  FamilyInvitation,
  SubscriptionOrder,
  SubscriptionPlanCode,
  UserEntitlement
} from "./types.js";

const FREE_DAILY_QUOTA = 3;
const PRO_DAILY_QUOTA = 999;
const PRO_CYCLE_DAYS = 30;
const FAMILY_SEAT_LIMIT = 2;

const todayKeyUtc = (): string => new Date().toISOString().slice(0, 10);

const toAmountCny = (planCode: SubscriptionPlanCode): number => {
  if (planCode === "pro_yearly") {
    return 998;
  }
  if (planCode === "family_duo_monthly") {
    return 168;
  }
  return 108;
};

const normalizeCouponCode = (couponCode: string): string => couponCode.trim().toUpperCase();

const isValidIso = (value: string): boolean => !Number.isNaN(new Date(value).getTime());

const toDailyQuota = (tier: UserEntitlement["tier"]): number => (tier === "free" ? FREE_DAILY_QUOTA : PRO_DAILY_QUOTA);

const buildWebhookSigningPayload = (input: {
  timestamp: string;
  provider: string;
  eventId: string;
  orderId: string;
  status: "paid" | "failed" | "refunded";
  providerOrderId?: string;
}): string =>
  `${input.timestamp}.${input.provider}.${input.eventId}.${input.orderId}.${input.status}.${input.providerOrderId ?? ""}`;

const safeCompareHex = (left: string, right: string): boolean => {
  const leftBuffer = Buffer.from(left, "hex");
  const rightBuffer = Buffer.from(right, "hex");
  if (leftBuffer.length === 0 || leftBuffer.length !== rightBuffer.length) {
    return false;
  }
  return timingSafeEqual(leftBuffer, rightBuffer);
};

const toEpochSeconds = (value: string): number | undefined => {
  const numeric = Number(value);
  if (Number.isInteger(numeric) && numeric > 0) {
    return numeric;
  }
  const parsed = Date.parse(value);
  if (Number.isNaN(parsed)) {
    return undefined;
  }
  return Math.floor(parsed / 1000);
};

export class SubscriptionService {
  constructor(
    private readonly store: InMemoryStore,
    private readonly paymentRuntime: PaymentRuntimeConfig = defaultPaymentRuntimeConfig
  ) {}

  getPaymentRuntimeSummary(): {
    defaultProvider: PaymentRuntimeConfig["defaultProvider"];
    timestampToleranceSeconds: number;
    providers: Array<{
      providerName: string;
      enabled: boolean;
      upgradeEnabled: boolean;
      mode: string;
      webhookPath: string;
      signatureRequired: boolean;
      webhookSecretConfigured: boolean;
      replayWindowSeconds: number;
      refundHandling: string;
    }>;
  } {
    return {
      defaultProvider: this.paymentRuntime.defaultProvider,
      timestampToleranceSeconds: this.paymentRuntime.timestampToleranceSeconds,
      providers: this.paymentRuntime.providers.map((provider) => ({
        providerName: provider.providerName,
        enabled: provider.enabled,
        upgradeEnabled: provider.upgradeEnabled,
        mode: provider.mode,
        webhookPath: provider.webhookPath,
        signatureRequired: provider.signatureRequired,
        webhookSecretConfigured: provider.webhookSecretConfigured,
        replayWindowSeconds: provider.replayWindowSeconds,
        refundHandling: provider.refundHandling
      }))
    };
  }

  getEntitlement(userId: string, deviceId?: string): UserEntitlement {
    const entitlement = this.ensureEntitlement(userId);
    this.syncEntitlement(entitlement, deviceId);

    appendAudit(this.store, "entitlement_checked", {
      userId,
      metadata: {
        tier: entitlement.tier,
        status: entitlement.status,
        remainingQuota: Math.max(0, entitlement.dailyQuota - entitlement.usedToday),
        version: entitlement.version
      }
    });

    return entitlement;
  }

  consumeDailyQuotaForSessionStart(userId: string, feature: string, deviceId?: string): UserEntitlement {
    const entitlement = this.ensureEntitlement(userId);
    this.syncEntitlement(entitlement, deviceId);

    if (entitlement.tier === "free" && entitlement.usedToday >= entitlement.dailyQuota) {
      throw new Error("ENTITLEMENT_LIMIT_REACHED");
    }

    entitlement.usedToday += 1;
    entitlement.version += 1;
    entitlement.updatedAt = nowIso();
    if (deviceId) {
      entitlement.lastSyncedDeviceId = deviceId;
    }

    appendAudit(this.store, "entitlement_consumed", {
      userId,
      metadata: {
        feature,
        usedToday: entitlement.usedToday,
        dailyQuota: entitlement.dailyQuota,
        tier: entitlement.tier
      }
    });

    return entitlement;
  }

  createUpgradeOrder(input: {
    userId: string;
    planCode: SubscriptionPlanCode;
    provider?: string;
    couponCode?: string;
  }): SubscriptionOrder {
    const providerConfig = this.assertProviderAvailableForUpgrade(input.provider ?? this.paymentRuntime.defaultProvider);
    const now = nowIso();
    const listPriceCny = toAmountCny(input.planCode);
    let discountCny = 0;
    let couponCode: string | undefined;

    if (input.couponCode) {
      const resolved = this.resolveCoupon(input.planCode, input.couponCode);
      discountCny = resolved.discountCny;
      couponCode = resolved.code;
    }

    const payableAmountCny = Math.max(0, listPriceCny - discountCny);
    const order: SubscriptionOrder = {
      id: randomUUID(),
      userId: input.userId,
      planCode: input.planCode,
      provider: providerConfig.providerName,
      status: "created",
      listPriceCny,
      discountCny,
      payableAmountCny,
      paidAmountCny: 0,
      refundedAmountCny: 0,
      couponCode,
      amountCny: payableAmountCny,
      paymentToken: randomUUID().replaceAll("-", ""),
      createdAt: now,
      updatedAt: now
    };
    this.store.subscriptionOrdersById.set(order.id, order);

    appendAudit(this.store, "subscription_upgrade_created", {
      userId: input.userId,
      metadata: {
        orderId: order.id,
        planCode: order.planCode,
        provider: order.provider,
        couponCode: order.couponCode,
        listPriceCny: order.listPriceCny,
        discountCny: order.discountCny,
        payableAmountCny: order.payableAmountCny
      }
    });

    return order;
  }

  cancelSubscription(userId: string): UserEntitlement {
    const entitlement = this.ensureEntitlement(userId);
    this.syncEntitlement(entitlement);
    if (entitlement.tier === "family_member") {
      throw new Error("SUBSCRIPTION_MANAGED_BY_OWNER");
    }
    entitlement.autoRenew = false;
    if (entitlement.tier === "pro" || entitlement.tier === "family_owner") {
      entitlement.status = "cancelled";
    }
    entitlement.version += 1;
    entitlement.updatedAt = nowIso();

    appendAudit(this.store, "subscription_cancelled", {
      userId,
      metadata: {
        tier: entitlement.tier,
        expiresAt: entitlement.expiresAt
      }
    });

    return entitlement;
  }

  resumeSubscription(userId: string): UserEntitlement {
    const entitlement = this.ensureEntitlement(userId);
    this.syncEntitlement(entitlement);
    if (entitlement.tier === "family_member") {
      throw new Error("SUBSCRIPTION_MANAGED_BY_OWNER");
    }
    if (entitlement.tier !== "pro" && entitlement.tier !== "family_owner") {
      throw new Error("SUBSCRIPTION_NOT_PRO");
    }
    entitlement.autoRenew = true;
    entitlement.status = "active";
    entitlement.version += 1;
    entitlement.updatedAt = nowIso();

    appendAudit(this.store, "subscription_resumed", {
      userId,
      metadata: {
        expiresAt: entitlement.expiresAt
      }
    });

    return entitlement;
  }

  handleProviderWebhook(input: {
    eventId: string;
    orderId: string;
    providerOrderId?: string;
    provider?: string;
    status: "paid" | "failed" | "refunded";
  }): {
    order: SubscriptionOrder;
    entitlement: UserEntitlement;
    idempotent: boolean;
  } {
    const order = this.store.subscriptionOrdersById.get(input.orderId);
    if (!order) {
      throw new Error("ORDER_NOT_FOUND");
    }
    if (input.provider && input.provider !== order.provider) {
      throw new Error("PAYMENT_PROVIDER_MISMATCH");
    }

    if (this.store.processedPaymentEventIds.has(input.eventId)) {
      return {
        order,
        entitlement: this.getEntitlement(order.userId),
        idempotent: true
      };
    }

    this.store.processedPaymentEventIds.add(input.eventId);
    order.status = input.status;
    order.providerOrderId = input.providerOrderId ?? order.providerOrderId;

    if (input.status === "paid") {
      order.paidAmountCny = order.payableAmountCny;
      order.refundedAmountCny = Math.min(order.refundedAmountCny, order.paidAmountCny);
    } else if (input.status === "refunded") {
      order.refundedAmountCny = Math.min(order.paidAmountCny, order.payableAmountCny);
    }

    order.updatedAt = nowIso();

    const entitlement = this.ensureEntitlement(order.userId);
    this.syncEntitlement(entitlement);

    if (input.status === "paid") {
      if (order.planCode === "family_duo_monthly") {
        const expiresAt = addSeconds(nowIso(), PRO_CYCLE_DAYS * 24 * 3600);
        const group = this.ensureFamilyGroup(order.userId, expiresAt);
        group.status = "active";
        group.planCode = "family_duo_monthly";
        group.expiresAt = expiresAt;
        group.updatedAt = nowIso();

        entitlement.tier = "family_owner";
        entitlement.status = "active";
        entitlement.autoRenew = true;
        entitlement.dailyQuota = PRO_DAILY_QUOTA;
        entitlement.expiresAt = expiresAt;
        entitlement.familyGroupId = group.id;
        entitlement.version += 1;
        entitlement.updatedAt = nowIso();
      } else {
        entitlement.tier = "pro";
        entitlement.status = "active";
        entitlement.autoRenew = true;
        entitlement.dailyQuota = PRO_DAILY_QUOTA;
        entitlement.expiresAt = addSeconds(nowIso(), PRO_CYCLE_DAYS * 24 * 3600);
        entitlement.familyGroupId = undefined;
        entitlement.version += 1;
        entitlement.updatedAt = nowIso();
      }
    } else if (input.status === "refunded") {
      if (order.planCode === "family_duo_monthly") {
        this.downgradeFamilyGroup(order.userId);
      } else {
        entitlement.tier = "free";
        entitlement.status = "active";
        entitlement.autoRenew = false;
        entitlement.dailyQuota = FREE_DAILY_QUOTA;
        entitlement.expiresAt = undefined;
        entitlement.familyGroupId = undefined;
        entitlement.version += 1;
        entitlement.updatedAt = nowIso();
      }
    }

    const event = {
      id: randomUUID(),
      userId: order.userId,
      orderId: order.id,
      eventId: input.eventId,
      type: `payment_${input.status}`,
      payload: {
        providerOrderId: order.providerOrderId,
        paidAmountCny: order.paidAmountCny,
        refundedAmountCny: order.refundedAmountCny
      },
      createdAt: nowIso()
    };
    this.store.subscriptionEventsById.set(event.id, event);

    appendAudit(this.store, "payment_webhook_received", {
      userId: order.userId,
      metadata: {
        eventId: input.eventId,
        orderId: order.id,
        status: input.status,
        paidAmountCny: order.paidAmountCny,
        refundedAmountCny: order.refundedAmountCny
      }
    });

    return {
      order,
      entitlement,
      idempotent: false
    };
  }

  processProviderWebhook(input: {
    eventId: string;
    orderId: string;
    providerOrderId?: string;
    provider?: string;
    status: "paid" | "failed" | "refunded";
    timestamp?: string;
    signature?: string;
  }): {
    order: SubscriptionOrder;
    entitlement: UserEntitlement;
    idempotent: boolean;
    verification: {
      providerName: string;
      signatureRequired: boolean;
      signatureVerified: boolean;
      timestamp?: string;
      replayWindowSeconds: number;
    };
  } {
    const order = this.store.subscriptionOrdersById.get(input.orderId);
    if (!order) {
      throw new Error("ORDER_NOT_FOUND");
    }
    const resolvedProviderName = input.provider?.trim() || order.provider;
    if (resolvedProviderName !== order.provider) {
      throw new Error("PAYMENT_PROVIDER_MISMATCH");
    }

    const providerConfig = this.getProviderRuntime(resolvedProviderName);
    if (!providerConfig?.enabled) {
      throw new Error("PAYMENT_PROVIDER_DISABLED");
    }

    const verification = this.verifyWebhook(providerConfig.providerName, {
      eventId: input.eventId,
      orderId: input.orderId,
      status: input.status,
      providerOrderId: input.providerOrderId,
      timestamp: input.timestamp,
      signature: input.signature
    });
    const result = this.handleProviderWebhook({
      eventId: input.eventId,
      orderId: input.orderId,
      providerOrderId: input.providerOrderId,
      provider: providerConfig.providerName,
      status: input.status
    });

    return {
      ...result,
      verification
    };
  }

  listOrders(input?: {
    userId?: string;
    status?: SubscriptionOrder["status"];
    page?: number;
    pageSize?: number;
  }): {
    items: SubscriptionOrder[];
    total: number;
    page: number;
    pageSize: number;
  } {
    const page = Math.max(1, input?.page ?? 1);
    const pageSize = Math.max(1, Math.min(100, input?.pageSize ?? 20));
    const filtered = Array.from(this.store.subscriptionOrdersById.values())
      .filter((order) => (input?.userId ? order.userId === input.userId : true))
      .filter((order) => (input?.status ? order.status === input.status : true))
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt));

    const start = (page - 1) * pageSize;
    return {
      items: filtered.slice(start, start + pageSize),
      total: filtered.length,
      page,
      pageSize
    };
  }

  listCouponRules(input?: {
    code?: string;
    status?: CouponRuleStatus;
    page?: number;
    pageSize?: number;
  }): {
    items: CouponRule[];
    total: number;
    page: number;
    pageSize: number;
  } {
    const page = Math.max(1, input?.page ?? 1);
    const pageSize = Math.max(1, Math.min(100, input?.pageSize ?? 20));
    const code = input?.code ? normalizeCouponCode(input.code) : undefined;
    const filtered = Array.from(this.store.subscriptionCouponRulesByCode.values())
      .filter((rule) => (code ? rule.code === code : true))
      .filter((rule) => (input?.status ? rule.status === input.status : true))
      .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));

    const start = (page - 1) * pageSize;
    return {
      items: filtered.slice(start, start + pageSize),
      total: filtered.length,
      page,
      pageSize
    };
  }

  upsertCouponRule(input: {
    code: string;
    status: CouponRuleStatus;
    description?: string;
    discountType: CouponRule["discountType"];
    discountValue: number;
    maxDiscountCny?: number;
    planCodes?: SubscriptionPlanCode[];
    startsAt?: string;
    expiresAt?: string;
  }): CouponRule {
    if (input.discountType === "percentage" && (input.discountValue <= 0 || input.discountValue > 100)) {
      throw new Error("COUPON_RULE_INVALID");
    }
    if (input.discountType === "fixed_amount" && input.discountValue <= 0) {
      throw new Error("COUPON_RULE_INVALID");
    }
    if (input.maxDiscountCny !== undefined && input.maxDiscountCny <= 0) {
      throw new Error("COUPON_RULE_INVALID");
    }
    if (input.startsAt && !isValidIso(input.startsAt)) {
      throw new Error("COUPON_RULE_INVALID");
    }
    if (input.expiresAt && !isValidIso(input.expiresAt)) {
      throw new Error("COUPON_RULE_INVALID");
    }
    if (input.startsAt && input.expiresAt && new Date(input.startsAt).getTime() >= new Date(input.expiresAt).getTime()) {
      throw new Error("COUPON_RULE_INVALID");
    }

    const code = normalizeCouponCode(input.code);
    const existing = this.store.subscriptionCouponRulesByCode.get(code);
    const now = nowIso();
    const rule: CouponRule = {
      code,
      status: input.status,
      description: input.description?.trim() || undefined,
      discountType: input.discountType,
      discountValue: input.discountValue,
      maxDiscountCny: input.maxDiscountCny,
      planCodes: input.planCodes ? Array.from(new Set(input.planCodes)) : undefined,
      startsAt: input.startsAt,
      expiresAt: input.expiresAt,
      createdAt: existing?.createdAt ?? now,
      updatedAt: now
    };
    this.store.subscriptionCouponRulesByCode.set(code, rule);
    return rule;
  }

  createFamilyInvitation(input: {
    ownerUserId: string;
    inviteeUserId: string;
  }): {
    group: FamilyGroup;
    invitation: FamilyInvitation;
  } {
    if (input.ownerUserId === input.inviteeUserId) {
      throw new Error("FAMILY_MEMBER_SELF_INVITE");
    }
    const invitee = this.store.usersById.get(input.inviteeUserId);
    if (!invitee || invitee.status !== "active") {
      throw new Error("FAMILY_INVITEE_NOT_FOUND");
    }

    const group = this.ensureOwnerFamilyGroup(input.ownerUserId);
    const inviteeEntitlement = this.ensureEntitlement(input.inviteeUserId);
    this.syncEntitlement(inviteeEntitlement);
    if (inviteeEntitlement.tier === "family_owner") {
      throw new Error("FAMILY_MEMBER_ALREADY_EXISTS");
    }
    if (inviteeEntitlement.tier === "family_member" && inviteeEntitlement.familyGroupId !== group.id) {
      throw new Error("FAMILY_MEMBER_ALREADY_EXISTS");
    }
    if (group.memberUserIds.includes(input.inviteeUserId)) {
      throw new Error("FAMILY_MEMBER_ALREADY_EXISTS");
    }
    if (group.memberUserIds.length + 1 >= group.seatLimit) {
      throw new Error("FAMILY_CAPACITY_EXCEEDED");
    }

    const pending = Array.from(this.store.subscriptionFamilyInvitationsById.values()).find(
      (item) => item.groupId === group.id && item.inviteeUserId === input.inviteeUserId && item.status === "pending"
    );
    if (pending) {
      return {
        group,
        invitation: pending
      };
    }

    const now = nowIso();
    const invitation: FamilyInvitation = {
      id: randomUUID(),
      groupId: group.id,
      inviterUserId: input.ownerUserId,
      inviteeUserId: input.inviteeUserId,
      status: "pending",
      createdAt: now,
      updatedAt: now
    };
    this.store.subscriptionFamilyInvitationsById.set(invitation.id, invitation);

    appendAudit(this.store, "subscription_family_invitation_created", {
      userId: input.ownerUserId,
      metadata: {
        groupId: group.id,
        invitationId: invitation.id,
        inviteeUserId: input.inviteeUserId
      }
    });

    return {
      group,
      invitation
    };
  }

  acceptFamilyInvitation(input: {
    userId: string;
    invitationId: string;
  }): {
    group: FamilyGroup;
    invitation: FamilyInvitation;
    entitlement: UserEntitlement;
  } {
    const invitation = this.store.subscriptionFamilyInvitationsById.get(input.invitationId);
    if (!invitation) {
      throw new Error("FAMILY_INVITATION_NOT_FOUND");
    }
    if (invitation.inviteeUserId !== input.userId) {
      throw new Error("FAMILY_INVITATION_FORBIDDEN");
    }
    if (invitation.status !== "pending") {
      throw new Error("FAMILY_INVITATION_INVALID_STATE");
    }

    const group = this.store.subscriptionFamilyGroupsById.get(invitation.groupId);
    if (!group || group.status !== "active") {
      throw new Error("FAMILY_PLAN_REQUIRED");
    }
    const inviteeEntitlement = this.ensureEntitlement(input.userId);
    this.syncEntitlement(inviteeEntitlement);
    if (inviteeEntitlement.tier === "family_member" && inviteeEntitlement.familyGroupId !== group.id) {
      throw new Error("FAMILY_MEMBER_ALREADY_EXISTS");
    }
    if (inviteeEntitlement.tier === "family_owner") {
      throw new Error("FAMILY_MEMBER_ALREADY_EXISTS");
    }
    if (group.memberUserIds.length + 1 >= group.seatLimit) {
      throw new Error("FAMILY_CAPACITY_EXCEEDED");
    }
    if (!group.memberUserIds.includes(input.userId)) {
      group.memberUserIds.push(input.userId);
    }
    group.updatedAt = nowIso();

    invitation.status = "accepted";
    invitation.acceptedAt = nowIso();
    invitation.updatedAt = nowIso();

    const entitlement = inviteeEntitlement;
    entitlement.tier = "family_member";
    entitlement.status = "active";
    entitlement.autoRenew = false;
    entitlement.dailyQuota = PRO_DAILY_QUOTA;
    entitlement.expiresAt = group.expiresAt;
    entitlement.familyGroupId = group.id;
    entitlement.version += 1;
    entitlement.updatedAt = nowIso();

    appendAudit(this.store, "subscription_family_invitation_accepted", {
      userId: input.userId,
      metadata: {
        groupId: group.id,
        invitationId: invitation.id,
        ownerUserId: group.ownerUserId
      }
    });

    return {
      group,
      invitation,
      entitlement
    };
  }

  listFamilyMembers(ownerUserId: string): {
    group: FamilyGroup;
    members: Array<{
      userId: string;
      tier: UserEntitlement["tier"];
      status: UserEntitlement["status"];
      expiresAt?: string;
    }>;
  } {
    const group = this.ensureOwnerFamilyGroup(ownerUserId);
    const members = [group.ownerUserId, ...group.memberUserIds].map((userId) => {
      const entitlement = this.ensureEntitlement(userId);
      this.syncEntitlement(entitlement);
      return {
        userId,
        tier: entitlement.tier,
        status: entitlement.status,
        expiresAt: entitlement.expiresAt
      };
    });
    return {
      group,
      members
    };
  }

  removeFamilyMember(input: {
    ownerUserId: string;
    memberUserId: string;
  }): {
    group: FamilyGroup;
    removedUserId: string;
  } {
    if (input.ownerUserId === input.memberUserId) {
      throw new Error("FAMILY_MEMBER_OWNER_NOT_REMOVABLE");
    }
    const group = this.ensureOwnerFamilyGroup(input.ownerUserId);
    if (!group.memberUserIds.includes(input.memberUserId)) {
      throw new Error("FAMILY_MEMBER_NOT_FOUND");
    }

    group.memberUserIds = group.memberUserIds.filter((memberUserId) => memberUserId !== input.memberUserId);
    group.updatedAt = nowIso();

    const entitlement = this.ensureEntitlement(input.memberUserId);
    this.downgradeEntitlementToFree(entitlement);
    entitlement.status = "active";
    entitlement.updatedAt = nowIso();

    for (const invitation of this.store.subscriptionFamilyInvitationsById.values()) {
      if (
        invitation.groupId === group.id &&
        invitation.inviteeUserId === input.memberUserId &&
        invitation.status === "pending"
      ) {
        invitation.status = "revoked";
        invitation.revokedAt = nowIso();
        invitation.updatedAt = nowIso();
      }
    }

    appendAudit(this.store, "subscription_family_member_removed", {
      userId: input.ownerUserId,
      metadata: {
        groupId: group.id,
        removedUserId: input.memberUserId
      }
    });

    return {
      group,
      removedUserId: input.memberUserId
    };
  }

  adjustEntitlementByAdmin(input: {
    userId: string;
    adminUserId: string;
    reason: string;
    setTier?: "free" | "pro";
    deltaDays?: number;
    rollbackOfAdjustmentId?: string;
  }): {
    entitlement: UserEntitlement;
    adjustment: AdminEntitlementAdjustment;
  } {
    const entitlement = this.ensureEntitlement(input.userId);
    this.syncEntitlement(entitlement);

    if (input.rollbackOfAdjustmentId) {
      const source = this.store.adminEntitlementAdjustmentsById.get(input.rollbackOfAdjustmentId);
      if (!source || source.userId !== input.userId) {
        throw new Error("ADJUSTMENT_NOT_FOUND");
      }
      if (source.rolledBack) {
        throw new Error("ADJUSTMENT_ALREADY_ROLLED_BACK");
      }

      entitlement.tier = source.previousTier;
      entitlement.expiresAt = source.previousExpiresAt;
      entitlement.dailyQuota = toDailyQuota(source.previousTier);
      entitlement.status = "active";
      entitlement.familyGroupId = source.previousTier === "family_owner" || source.previousTier === "family_member" ? entitlement.familyGroupId : undefined;
      entitlement.version += 1;
      entitlement.updatedAt = nowIso();

      source.rolledBack = true;
      source.rolledBackAt = nowIso();
      source.updatedAt = nowIso();

      const rollbackAdjustment: AdminEntitlementAdjustment = {
        id: randomUUID(),
        userId: input.userId,
        adminUserId: input.adminUserId,
        reason: input.reason,
        previousTier: source.newTier,
        previousExpiresAt: source.newExpiresAt,
        newTier: source.previousTier,
        newExpiresAt: source.previousExpiresAt,
        rolledBack: false,
        rollbackOfAdjustmentId: source.id,
        createdAt: nowIso(),
        updatedAt: nowIso()
      };
      this.store.adminEntitlementAdjustmentsById.set(rollbackAdjustment.id, rollbackAdjustment);

      appendAudit(this.store, "admin_entitlement_adjust_rolled_back", {
        userId: input.userId,
        metadata: {
          adminUserId: input.adminUserId,
          adjustmentId: source.id,
          rollbackAdjustmentId: rollbackAdjustment.id
        }
      });

      return {
        entitlement,
        adjustment: rollbackAdjustment
      };
    }

    if (input.setTier === undefined && input.deltaDays === undefined) {
      throw new Error("ADJUSTMENT_EMPTY");
    }

    const previousTier = entitlement.tier;
    const previousExpiresAt = entitlement.expiresAt;

    if (input.setTier) {
      if (entitlement.tier === "family_owner") {
        this.downgradeFamilyGroup(input.userId);
      }
      entitlement.tier = input.setTier;
      entitlement.dailyQuota = toDailyQuota(input.setTier);
      if (input.setTier === "free") {
        entitlement.expiresAt = undefined;
        entitlement.autoRenew = false;
        entitlement.familyGroupId = undefined;
      } else if (!entitlement.expiresAt || isPast(entitlement.expiresAt)) {
        entitlement.expiresAt = addSeconds(nowIso(), PRO_CYCLE_DAYS * 24 * 3600);
        entitlement.familyGroupId = undefined;
      }
      entitlement.status = "active";
    }

    if (typeof input.deltaDays === "number" && input.deltaDays !== 0) {
      const base = entitlement.expiresAt ?? nowIso();
      entitlement.expiresAt = addSeconds(base, input.deltaDays * 24 * 3600);
      if (isPast(entitlement.expiresAt)) {
        entitlement.status = "expired";
      } else {
        entitlement.status = "active";
      }
    }

    entitlement.version += 1;
    entitlement.updatedAt = nowIso();

    const adjustment: AdminEntitlementAdjustment = {
      id: randomUUID(),
      userId: input.userId,
      adminUserId: input.adminUserId,
      reason: input.reason,
      setTier: input.setTier,
      deltaDays: input.deltaDays,
      previousTier,
      previousExpiresAt,
      newTier: entitlement.tier,
      newExpiresAt: entitlement.expiresAt,
      rolledBack: false,
      createdAt: nowIso(),
      updatedAt: nowIso()
    };
    this.store.adminEntitlementAdjustmentsById.set(adjustment.id, adjustment);

    appendAudit(this.store, "admin_entitlement_adjusted", {
      userId: input.userId,
      metadata: {
        adminUserId: input.adminUserId,
        adjustmentId: adjustment.id,
        setTier: input.setTier,
        deltaDays: input.deltaDays
      }
    });

    return {
      entitlement,
      adjustment
    };
  }

  private ensureEntitlement(userId: string): UserEntitlement {
    const existing = this.store.subscriptionEntitlementsByUserId.get(userId);
    if (existing) {
      return existing;
    }
    const now = nowIso();
    const created: UserEntitlement = {
      id: randomUUID(),
      userId,
      tier: "free",
      status: "active",
      dailyQuota: FREE_DAILY_QUOTA,
      usedToday: 0,
      quotaDate: todayKeyUtc(),
      autoRenew: false,
      version: 1,
      createdAt: now,
      updatedAt: now
    };
    this.store.subscriptionEntitlementsByUserId.set(userId, created);
    return created;
  }

  private syncEntitlement(entitlement: UserEntitlement, deviceId?: string): void {
    const today = todayKeyUtc();
    if (entitlement.quotaDate !== today) {
      entitlement.quotaDate = today;
      entitlement.usedToday = 0;
      entitlement.version += 1;
      entitlement.updatedAt = nowIso();
    }

    if ((entitlement.tier === "pro" || entitlement.tier === "family_owner") && entitlement.expiresAt && isPast(entitlement.expiresAt)) {
      if (entitlement.tier === "family_owner") {
        this.downgradeFamilyGroup(entitlement.userId);
      } else {
        this.downgradeEntitlementToFree(entitlement);
        entitlement.status = "expired";
        entitlement.updatedAt = nowIso();
      }
    }

    if (entitlement.tier === "family_member") {
      const groupId = entitlement.familyGroupId;
      const group = groupId ? this.store.subscriptionFamilyGroupsById.get(groupId) : undefined;
      const ownerEntitlement = group ? this.store.subscriptionEntitlementsByUserId.get(group.ownerUserId) : undefined;
      const invalid =
        !group ||
        group.status !== "active" ||
        !group.memberUserIds.includes(entitlement.userId) ||
        !ownerEntitlement ||
        ownerEntitlement.tier !== "family_owner";
      if (invalid) {
        this.downgradeEntitlementToFree(entitlement);
        entitlement.status = "active";
        entitlement.updatedAt = nowIso();
      } else {
        entitlement.dailyQuota = PRO_DAILY_QUOTA;
        entitlement.expiresAt = group.expiresAt;
      }
    }

    if (deviceId) {
      entitlement.lastSyncedDeviceId = deviceId;
      entitlement.updatedAt = nowIso();
    }
  }

  private ensureFamilyGroup(ownerUserId: string, expiresAt?: string): FamilyGroup {
    const groupId = this.store.subscriptionFamilyGroupIdByOwnerUserId.get(ownerUserId);
    if (groupId) {
      const existing = this.store.subscriptionFamilyGroupsById.get(groupId);
      if (existing) {
        if (expiresAt) {
          existing.expiresAt = expiresAt;
        }
        return existing;
      }
    }

    const now = nowIso();
    const created: FamilyGroup = {
      id: randomUUID(),
      ownerUserId,
      planCode: "family_duo_monthly",
      status: "active",
      seatLimit: FAMILY_SEAT_LIMIT,
      memberUserIds: [],
      expiresAt,
      createdAt: now,
      updatedAt: now
    };
    this.store.subscriptionFamilyGroupsById.set(created.id, created);
    this.store.subscriptionFamilyGroupIdByOwnerUserId.set(ownerUserId, created.id);
    return created;
  }

  private ensureOwnerFamilyGroup(ownerUserId: string): FamilyGroup {
    const entitlement = this.ensureEntitlement(ownerUserId);
    this.syncEntitlement(entitlement);
    if (entitlement.tier !== "family_owner") {
      throw new Error("FAMILY_PLAN_REQUIRED");
    }

    const groupId = entitlement.familyGroupId ?? this.store.subscriptionFamilyGroupIdByOwnerUserId.get(ownerUserId);
    const group = groupId ? this.store.subscriptionFamilyGroupsById.get(groupId) : undefined;
    if (!group || group.ownerUserId !== ownerUserId || group.status !== "active") {
      throw new Error("FAMILY_PLAN_REQUIRED");
    }
    return group;
  }

  private downgradeEntitlementToFree(entitlement: UserEntitlement): void {
    entitlement.tier = "free";
    entitlement.autoRenew = false;
    entitlement.dailyQuota = FREE_DAILY_QUOTA;
    entitlement.expiresAt = undefined;
    entitlement.familyGroupId = undefined;
    entitlement.version += 1;
    entitlement.updatedAt = nowIso();
  }

  private downgradeFamilyGroup(ownerUserId: string): void {
    const ownerEntitlement = this.ensureEntitlement(ownerUserId);
    const groupId = ownerEntitlement.familyGroupId ?? this.store.subscriptionFamilyGroupIdByOwnerUserId.get(ownerUserId);
    const group = groupId ? this.store.subscriptionFamilyGroupsById.get(groupId) : undefined;
    if (group) {
      group.status = "inactive";
      group.updatedAt = nowIso();
      for (const memberUserId of group.memberUserIds) {
        const memberEntitlement = this.ensureEntitlement(memberUserId);
        this.downgradeEntitlementToFree(memberEntitlement);
      }
    }
    this.downgradeEntitlementToFree(ownerEntitlement);
    ownerEntitlement.status = "active";
    ownerEntitlement.updatedAt = nowIso();
  }

  private resolveCoupon(
    planCode: SubscriptionPlanCode,
    couponCode: string
  ): {
    code: string;
    discountCny: number;
  } {
    const code = normalizeCouponCode(couponCode);
    const rule = this.store.subscriptionCouponRulesByCode.get(code);
    if (!rule || rule.status !== "active") {
      throw new Error("INVALID_COUPON");
    }
    if (rule.startsAt && new Date(rule.startsAt).getTime() > Date.now()) {
      throw new Error("INVALID_COUPON");
    }
    if (rule.expiresAt && isPast(rule.expiresAt)) {
      throw new Error("INVALID_COUPON");
    }
    if (rule.planCodes && !rule.planCodes.includes(planCode)) {
      throw new Error("INVALID_COUPON");
    }

    const listPriceCny = toAmountCny(planCode);
    let discountCny =
      rule.discountType === "percentage"
        ? Math.floor((listPriceCny * rule.discountValue) / 100)
        : Math.floor(rule.discountValue);

    if (rule.maxDiscountCny !== undefined) {
      discountCny = Math.min(discountCny, rule.maxDiscountCny);
    }
    discountCny = Math.min(listPriceCny, Math.max(0, discountCny));

    if (discountCny <= 0) {
      throw new Error("INVALID_COUPON");
    }

    return {
      code: rule.code,
      discountCny
    };
  }

  private getProviderRuntime(providerName: string) {
    return this.paymentRuntime.providers.find((provider) => provider.providerName === providerName);
  }

  private assertProviderAvailableForUpgrade(providerName: string) {
    const provider = this.getProviderRuntime(providerName);
    if (!provider?.enabled || !provider.upgradeEnabled) {
      throw new Error("PAYMENT_PROVIDER_DISABLED");
    }
    return provider;
  }

  private verifyWebhook(
    providerName: string,
    input: {
      eventId: string;
      orderId: string;
      providerOrderId?: string;
      status: "paid" | "failed" | "refunded";
      timestamp?: string;
      signature?: string;
    }
  ): {
    providerName: string;
    signatureRequired: boolean;
    signatureVerified: boolean;
    timestamp?: string;
    replayWindowSeconds: number;
  } {
    const provider = this.getProviderRuntime(providerName);
    if (!provider?.enabled) {
      throw new Error("PAYMENT_PROVIDER_DISABLED");
    }
    if (!provider.signatureRequired) {
      return {
        providerName: provider.providerName,
        signatureRequired: false,
        signatureVerified: false,
        timestamp: input.timestamp,
        replayWindowSeconds: provider.replayWindowSeconds
      };
    }

    const timestamp = input.timestamp?.trim();
    const signature = input.signature?.trim().toLowerCase();
    if (!timestamp || !signature) {
      throw new Error("PAYMENT_WEBHOOK_SIGNATURE_REQUIRED");
    }
    const eventEpoch = toEpochSeconds(timestamp);
    if (!eventEpoch) {
      throw new Error("PAYMENT_WEBHOOK_TIMESTAMP_INVALID");
    }
    const currentEpoch = Math.floor(Date.now() / 1000);
    if (Math.abs(currentEpoch - eventEpoch) > provider.replayWindowSeconds) {
      throw new Error("PAYMENT_WEBHOOK_TIMESTAMP_EXPIRED");
    }
    if (!provider.webhookSecret) {
      throw new Error("PAYMENT_WEBHOOK_SECRET_REQUIRED");
    }

    const expectedSignature = createHmac("sha256", provider.webhookSecret)
      .update(
        buildWebhookSigningPayload({
          timestamp,
          provider: provider.providerName,
          eventId: input.eventId,
          orderId: input.orderId,
          status: input.status,
          providerOrderId: input.providerOrderId
        })
      )
      .digest("hex");
    if (!safeCompareHex(signature, expectedSignature)) {
      throw new Error("PAYMENT_WEBHOOK_SIGNATURE_INVALID");
    }

    return {
      providerName: provider.providerName,
      signatureRequired: true,
      signatureVerified: true,
      timestamp,
      replayWindowSeconds: provider.replayWindowSeconds
    };
  }
}
