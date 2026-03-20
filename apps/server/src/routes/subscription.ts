import type { FastifyInstance } from "fastify";
import { z } from "zod";
import type { AuthService } from "../domain/auth-service.js";
import type { SubscriptionService } from "../domain/subscription-service.js";
import { authenticate, type AuthenticatedRequest } from "../middleware/auth.js";
import type { SubscriptionOrder, UserEntitlement } from "../domain/types.js";

const paymentProviders = ["mockpay", "stripe", "alipay"] as const;

const upgradeSchema = z.object({
  plan_code: z.enum(["pro_monthly", "pro_yearly", "family_duo_monthly"]).default("pro_monthly"),
  provider: z.enum(paymentProviders).optional(),
  coupon_code: z
    .string()
    .trim()
    .min(3)
    .max(32)
    .regex(/^[A-Za-z0-9_-]+$/)
    .optional()
});

const webhookSchema = z.object({
  event_id: z.string().trim().min(6),
  order_id: z.string().uuid(),
  status: z.enum(["paid", "failed", "refunded"]),
  provider: z.enum(paymentProviders).optional(),
  provider_order_id: z.string().trim().min(1).optional()
});

const adjustDeviceSchema = z.object({
  device_id: z.string().trim().min(1).max(128).optional()
});

const familyInviteSchema = z.object({
  invitee_user_id: z.string().uuid()
});

const invitationParamsSchema = z.object({
  invitation_id: z.string().uuid()
});

const familyMemberParamsSchema = z.object({
  member_user_id: z.string().uuid()
});

const toError = (code: string, message: string): { code: string; message: string } => ({
  code,
  message
});

const readHeaderValue = (value: string | string[] | undefined): string | undefined => {
  if (Array.isArray(value)) {
    const [first] = value;
    return typeof first === "string" ? first.trim() || undefined : undefined;
  }
  return typeof value === "string" ? value.trim() || undefined : undefined;
};

const serializeEntitlement = (entitlement: UserEntitlement) => ({
  entitlement_id: entitlement.id,
  tier: entitlement.tier,
  status: entitlement.status,
  daily_quota: entitlement.dailyQuota,
  used_today: entitlement.usedToday,
  remaining_today: Math.max(0, entitlement.dailyQuota - entitlement.usedToday),
  quota_date: entitlement.quotaDate,
  auto_renew: entitlement.autoRenew,
  expires_at: entitlement.expiresAt,
  version: entitlement.version,
  last_synced_device_id: entitlement.lastSyncedDeviceId,
  created_at: entitlement.createdAt,
  updated_at: entitlement.updatedAt
});

const serializeOrder = (order: SubscriptionOrder) => ({
  order_id: order.id,
  plan_code: order.planCode,
  provider: order.provider,
  status: order.status,
  list_price_cny: order.listPriceCny,
  discount_cny: order.discountCny,
  payable_amount_cny: order.payableAmountCny,
  paid_amount_cny: order.paidAmountCny,
  refunded_amount_cny: order.refundedAmountCny,
  coupon_code: order.couponCode,
  amount_cny: order.amountCny,
  payment_token: order.paymentToken,
  provider_order_id: order.providerOrderId,
  created_at: order.createdAt,
  updated_at: order.updatedAt
});

const serializeFamilyGroup = (group: {
  id: string;
  ownerUserId: string;
  seatLimit: number;
  status: "active" | "inactive";
  memberUserIds: string[];
  expiresAt?: string;
  updatedAt: string;
}) => ({
  group_id: group.id,
  owner_user_id: group.ownerUserId,
  seat_limit: group.seatLimit,
  used_seats: group.memberUserIds.length + 1,
  available_seats: Math.max(0, group.seatLimit - (group.memberUserIds.length + 1)),
  status: group.status,
  member_user_ids: group.memberUserIds,
  expires_at: group.expiresAt,
  updated_at: group.updatedAt
});

export const registerSubscriptionRoutes = async (
  app: FastifyInstance,
  services: {
    authService: AuthService;
    subscriptionService: SubscriptionService;
  }
): Promise<void> => {
  app.get(
    "/v1/subscription/entitlement",
    { preHandler: authenticate(services.authService) },
    async (request, reply) => {
      const authRequest = request as AuthenticatedRequest;
      const queryParsed = adjustDeviceSchema.safeParse(request.query);
      const entitlement = services.subscriptionService.getEntitlement(
        authRequest.auth.userId,
        queryParsed.success ? queryParsed.data.device_id : undefined
      );
      reply.code(200).send(serializeEntitlement(entitlement));
    }
  );

  app.post("/v1/subscription/upgrade", { preHandler: authenticate(services.authService) }, async (request, reply) => {
    const parsed = upgradeSchema.safeParse(request.body ?? {});
    if (!parsed.success) {
      reply.code(400).send(toError("VALIDATION_ERROR", "subscription upgrade payload is invalid"));
      return;
    }

    const authRequest = request as AuthenticatedRequest;
    try {
      const order = services.subscriptionService.createUpgradeOrder({
        userId: authRequest.auth.userId,
        planCode: parsed.data.plan_code,
        provider: parsed.data.provider,
        couponCode: parsed.data.coupon_code
      });
      reply.code(201).send({
        ...serializeOrder(order),
        payment_retry_supported: true
      });
    } catch (error) {
      if (error instanceof Error && error.message === "INVALID_COUPON") {
        reply.code(409).send(toError("INVALID_COUPON", "coupon_code is invalid or inactive"));
        return;
      }
      if (error instanceof Error && error.message === "PAYMENT_PROVIDER_DISABLED") {
        reply.code(409).send(toError("PAYMENT_PROVIDER_DISABLED", "payment provider is not enabled in current runtime"));
        return;
      }
      throw error;
    }
  });

  app.post("/v1/subscription/cancel", { preHandler: authenticate(services.authService) }, async (request, reply) => {
    const authRequest = request as AuthenticatedRequest;
    try {
      const entitlement = services.subscriptionService.cancelSubscription(authRequest.auth.userId);
      reply.code(200).send(serializeEntitlement(entitlement));
    } catch (error) {
      if (error instanceof Error && error.message === "SUBSCRIPTION_MANAGED_BY_OWNER") {
        reply.code(409).send(toError("SUBSCRIPTION_MANAGED_BY_OWNER", "family member cannot manage owner subscription"));
        return;
      }
      throw error;
    }
  });

  app.post("/v1/subscription/resume", { preHandler: authenticate(services.authService) }, async (request, reply) => {
    const authRequest = request as AuthenticatedRequest;
    try {
      const entitlement = services.subscriptionService.resumeSubscription(authRequest.auth.userId);
      reply.code(200).send(serializeEntitlement(entitlement));
    } catch (error) {
      if (error instanceof Error && error.message === "SUBSCRIPTION_MANAGED_BY_OWNER") {
        reply.code(409).send(toError("SUBSCRIPTION_MANAGED_BY_OWNER", "family member cannot manage owner subscription"));
        return;
      }
      if (error instanceof Error && error.message === "SUBSCRIPTION_NOT_PRO") {
        reply.code(409).send(toError("SUBSCRIPTION_NOT_PRO", "Only paid subscription can be resumed"));
        return;
      }
      throw error;
    }
  });

  app.post(
    "/v1/subscription/family/invitations",
    { preHandler: authenticate(services.authService) },
    async (request, reply) => {
      const parsed = familyInviteSchema.safeParse(request.body);
      if (!parsed.success) {
        reply.code(400).send(toError("VALIDATION_ERROR", "family invitation payload is invalid"));
        return;
      }
      const authRequest = request as AuthenticatedRequest;
      try {
        const result = services.subscriptionService.createFamilyInvitation({
          ownerUserId: authRequest.auth.userId,
          inviteeUserId: parsed.data.invitee_user_id
        });
        reply.code(201).send({
          invitation_id: result.invitation.id,
          invitee_user_id: result.invitation.inviteeUserId,
          status: result.invitation.status,
          created_at: result.invitation.createdAt,
          group: serializeFamilyGroup(result.group)
        });
      } catch (error) {
        if (error instanceof Error && error.message === "FAMILY_PLAN_REQUIRED") {
          reply.code(409).send(toError("FAMILY_PLAN_REQUIRED", "active family plan is required"));
          return;
        }
        if (error instanceof Error && error.message === "FAMILY_INVITEE_NOT_FOUND") {
          reply.code(404).send(toError("FAMILY_INVITEE_NOT_FOUND", "invitee user not found"));
          return;
        }
        if (error instanceof Error && error.message === "FAMILY_MEMBER_SELF_INVITE") {
          reply.code(400).send(toError("FAMILY_MEMBER_SELF_INVITE", "owner cannot invite self"));
          return;
        }
        if (error instanceof Error && error.message === "FAMILY_MEMBER_ALREADY_EXISTS") {
          reply.code(409).send(toError("FAMILY_MEMBER_ALREADY_EXISTS", "invitee is already a family member"));
          return;
        }
        if (error instanceof Error && error.message === "FAMILY_CAPACITY_EXCEEDED") {
          reply.code(409).send(toError("FAMILY_CAPACITY_EXCEEDED", "family plan seat limit reached"));
          return;
        }
        if (error instanceof Error && error.message === "FAMILY_MEMBER_ALREADY_EXISTS") {
          reply.code(409).send(toError("FAMILY_MEMBER_ALREADY_EXISTS", "invitee already belongs to a family plan"));
          return;
        }
        throw error;
      }
    }
  );

  app.post(
    "/v1/subscription/family/invitations/:invitation_id/accept",
    { preHandler: authenticate(services.authService) },
    async (request, reply) => {
      const paramsParsed = invitationParamsSchema.safeParse(request.params);
      if (!paramsParsed.success) {
        reply.code(400).send(toError("VALIDATION_ERROR", "invitation_id is invalid"));
        return;
      }
      const authRequest = request as AuthenticatedRequest;
      try {
        const result = services.subscriptionService.acceptFamilyInvitation({
          userId: authRequest.auth.userId,
          invitationId: paramsParsed.data.invitation_id
        });
        reply.code(200).send({
          invitation_id: result.invitation.id,
          status: result.invitation.status,
          accepted_at: result.invitation.acceptedAt,
          group: serializeFamilyGroup(result.group),
          entitlement: serializeEntitlement(result.entitlement)
        });
      } catch (error) {
        if (error instanceof Error && error.message === "FAMILY_INVITATION_NOT_FOUND") {
          reply.code(404).send(toError("FAMILY_INVITATION_NOT_FOUND", "family invitation not found"));
          return;
        }
        if (error instanceof Error && error.message === "FAMILY_INVITATION_FORBIDDEN") {
          reply.code(403).send(toError("FAMILY_INVITATION_FORBIDDEN", "cannot accept invitation for another user"));
          return;
        }
        if (error instanceof Error && error.message === "FAMILY_INVITATION_INVALID_STATE") {
          reply.code(409).send(toError("FAMILY_INVITATION_INVALID_STATE", "invitation is not pending"));
          return;
        }
        if (error instanceof Error && error.message === "FAMILY_PLAN_REQUIRED") {
          reply.code(409).send(toError("FAMILY_PLAN_REQUIRED", "family plan is not active"));
          return;
        }
        if (error instanceof Error && error.message === "FAMILY_CAPACITY_EXCEEDED") {
          reply.code(409).send(toError("FAMILY_CAPACITY_EXCEEDED", "family plan seat limit reached"));
          return;
        }
        throw error;
      }
    }
  );

  app.get(
    "/v1/subscription/family/members",
    { preHandler: authenticate(services.authService) },
    async (request, reply) => {
      const authRequest = request as AuthenticatedRequest;
      try {
        const result = services.subscriptionService.listFamilyMembers(authRequest.auth.userId);
        reply.code(200).send({
          group: serializeFamilyGroup(result.group),
          members: result.members.map((item) => ({
            user_id: item.userId,
            tier: item.tier,
            status: item.status,
            expires_at: item.expiresAt
          }))
        });
      } catch (error) {
        if (error instanceof Error && error.message === "FAMILY_PLAN_REQUIRED") {
          reply.code(409).send(toError("FAMILY_PLAN_REQUIRED", "active family plan is required"));
          return;
        }
        throw error;
      }
    }
  );

  app.delete(
    "/v1/subscription/family/members/:member_user_id",
    { preHandler: authenticate(services.authService) },
    async (request, reply) => {
      const paramsParsed = familyMemberParamsSchema.safeParse(request.params);
      if (!paramsParsed.success) {
        reply.code(400).send(toError("VALIDATION_ERROR", "member_user_id is invalid"));
        return;
      }
      const authRequest = request as AuthenticatedRequest;
      try {
        const result = services.subscriptionService.removeFamilyMember({
          ownerUserId: authRequest.auth.userId,
          memberUserId: paramsParsed.data.member_user_id
        });
        reply.code(200).send({
          removed_user_id: result.removedUserId,
          group: serializeFamilyGroup(result.group)
        });
      } catch (error) {
        if (error instanceof Error && error.message === "FAMILY_PLAN_REQUIRED") {
          reply.code(409).send(toError("FAMILY_PLAN_REQUIRED", "active family plan is required"));
          return;
        }
        if (error instanceof Error && error.message === "FAMILY_MEMBER_OWNER_NOT_REMOVABLE") {
          reply.code(409).send(toError("FAMILY_MEMBER_OWNER_NOT_REMOVABLE", "owner seat cannot be removed"));
          return;
        }
        if (error instanceof Error && error.message === "FAMILY_MEMBER_NOT_FOUND") {
          reply.code(404).send(toError("FAMILY_MEMBER_NOT_FOUND", "family member not found"));
          return;
        }
        throw error;
      }
    }
  );

  app.post("/v1/payments/webhooks/provider", async (request, reply) => {
    const parsed = webhookSchema.safeParse(request.body);
    if (!parsed.success) {
      reply.code(400).send(toError("VALIDATION_ERROR", "provider webhook payload is invalid"));
      return;
    }

    try {
      const result = services.subscriptionService.processProviderWebhook({
        eventId: parsed.data.event_id,
        orderId: parsed.data.order_id,
        provider: parsed.data.provider,
        status: parsed.data.status,
        providerOrderId: parsed.data.provider_order_id,
        timestamp: readHeaderValue(request.headers["x-ielts-timestamp"]),
        signature: readHeaderValue(request.headers["x-ielts-signature"])
      });
      reply.code(200).send({
        idempotent: result.idempotent,
        webhook_verification: {
          provider_name: result.verification.providerName,
          signature_required: result.verification.signatureRequired,
          signature_verified: result.verification.signatureVerified,
          timestamp: result.verification.timestamp,
          replay_window_seconds: result.verification.replayWindowSeconds
        },
        order: serializeOrder(result.order),
        entitlement: serializeEntitlement(result.entitlement)
      });
    } catch (error) {
      if (error instanceof Error && error.message === "ORDER_NOT_FOUND") {
        reply.code(404).send(toError("ORDER_NOT_FOUND", "Subscription order not found"));
        return;
      }
      if (error instanceof Error && error.message === "PAYMENT_PROVIDER_DISABLED") {
        reply.code(409).send(toError("PAYMENT_PROVIDER_DISABLED", "payment provider is not enabled in current runtime"));
        return;
      }
      if (error instanceof Error && error.message === "PAYMENT_PROVIDER_MISMATCH") {
        reply.code(409).send(toError("PAYMENT_PROVIDER_MISMATCH", "webhook provider does not match order provider"));
        return;
      }
      if (error instanceof Error && error.message === "PAYMENT_WEBHOOK_SIGNATURE_REQUIRED") {
        reply
          .code(401)
          .send(toError("PAYMENT_WEBHOOK_SIGNATURE_REQUIRED", "x-ielts-signature and x-ielts-timestamp are required"));
        return;
      }
      if (error instanceof Error && error.message === "PAYMENT_WEBHOOK_TIMESTAMP_INVALID") {
        reply.code(400).send(toError("PAYMENT_WEBHOOK_TIMESTAMP_INVALID", "x-ielts-timestamp is invalid"));
        return;
      }
      if (error instanceof Error && error.message === "PAYMENT_WEBHOOK_TIMESTAMP_EXPIRED") {
        reply.code(401).send(toError("PAYMENT_WEBHOOK_TIMESTAMP_EXPIRED", "webhook timestamp is outside replay window"));
        return;
      }
      if (
        error instanceof Error &&
        (error.message === "PAYMENT_WEBHOOK_SIGNATURE_INVALID" || error.message === "PAYMENT_WEBHOOK_SECRET_REQUIRED")
      ) {
        reply.code(401).send(toError("PAYMENT_WEBHOOK_SIGNATURE_INVALID", "webhook signature verification failed"));
        return;
      }
      throw error;
    }
  });
};
