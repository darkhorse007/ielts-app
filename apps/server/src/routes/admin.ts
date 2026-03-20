import type { FastifyReply, FastifyRequest, FastifyInstance } from "fastify";
import { z } from "zod";
import type { AuthAccountRepository } from "../domain/auth-account-repository.js";
import type { AdminService } from "../domain/admin-service.js";
import type { AdminOpsService } from "../domain/admin-ops-service.js";
import type { AdminReviewService } from "../domain/admin-review-service.js";
import type { SubscriptionService } from "../domain/subscription-service.js";

const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1)
});

const orderQuerySchema = z.object({
  user_id: z.string().uuid().optional(),
  status: z.enum(["created", "paid", "failed", "cancelled", "refunded"]).optional(),
  page: z
    .string()
    .optional()
    .transform((value) => (value ? Number(value) : undefined)),
  page_size: z
    .string()
    .optional()
    .transform((value) => (value ? Number(value) : undefined))
});

const couponQuerySchema = z.object({
  code: z.string().trim().min(3).max(32).optional(),
  status: z.enum(["active", "inactive"]).optional(),
  page: z
    .string()
    .optional()
    .transform((value) => (value ? Number(value) : undefined)),
  page_size: z
    .string()
    .optional()
    .transform((value) => (value ? Number(value) : undefined))
});

const couponParamsSchema = z.object({
  coupon_code: z
    .string()
    .trim()
    .min(3)
    .max(32)
    .regex(/^[A-Za-z0-9_-]+$/)
});

const couponUpsertSchema = z
  .object({
    status: z.enum(["active", "inactive"]).default("active"),
    description: z.string().trim().max(200).optional(),
    discount_type: z.enum(["percentage", "fixed_amount"]),
    discount_value: z.number().positive(),
    max_discount_cny: z.number().int().positive().optional(),
    plan_codes: z.array(z.enum(["pro_monthly", "pro_yearly", "family_duo_monthly"])).min(1).optional(),
    starts_at: z.string().datetime().optional(),
    expires_at: z.string().datetime().optional()
  })
  .superRefine((value, context) => {
    if (value.discount_type === "percentage" && value.discount_value > 100) {
      context.addIssue({
        code: "custom",
        message: "percentage discount_value must be <= 100",
        path: ["discount_value"]
      });
    }
    if (value.starts_at && value.expires_at && new Date(value.starts_at).getTime() >= new Date(value.expires_at).getTime()) {
      context.addIssue({
        code: "custom",
        message: "starts_at must be earlier than expires_at",
        path: ["expires_at"]
      });
    }
  });

const adjustParamsSchema = z.object({
  user_id: z.string().uuid()
});

const adjustSchema = z
  .object({
    reason: z.string().trim().min(3).max(500),
    set_tier: z.enum(["free", "pro"]).optional(),
    delta_days: z.number().int().min(-365).max(365).optional(),
    rollback_of_adjustment_id: z.string().uuid().optional()
  })
  .refine(
    (value) =>
      value.rollback_of_adjustment_id !== undefined || value.set_tier !== undefined || value.delta_days !== undefined,
    {
      message: "set_tier/delta_days/rollback_of_adjustment_id is required"
    }
  );

const usersQuerySchema = z.object({
  email: z.string().trim().optional(),
  phone: z.string().trim().optional(),
  status: z.enum(["active", "frozen", "pending_deletion", "deleted"]).optional(),
  page: z
    .string()
    .optional()
    .transform((value) => (value ? Number(value) : undefined)),
  page_size: z
    .string()
    .optional()
    .transform((value) => (value ? Number(value) : undefined))
});

const userParamsSchema = z.object({
  user_id: z.string().uuid()
});

const freezeSchema = z.object({
  reason: z.string().trim().min(3).max(500)
});

const contentQuerySchema = z.object({
  skill: z.enum(["listening", "speaking", "reading", "writing"]).optional(),
  status: z.enum(["draft", "published", "unpublished"]).optional(),
  page: z
    .string()
    .optional()
    .transform((value) => (value ? Number(value) : undefined)),
  page_size: z
    .string()
    .optional()
    .transform((value) => (value ? Number(value) : undefined))
});

const contentParamsSchema = z.object({
  item_id: z.string().uuid()
});

const publishSchema = z.object({
  note: z.string().trim().max(500).optional(),
  simulate_failure: z.boolean().optional()
});

const unpublishSchema = z.object({
  note: z.string().trim().max(500).optional()
});

const contentImportSchema = z.object({
  template_version: z.string().trim().min(1).max(64),
  atomic: z.boolean().optional(),
  items: z
    .array(
      z.object({
        title: z.string(),
        skill: z.enum(["listening", "speaking", "reading", "writing"]),
        payload: z.record(z.string(), z.unknown())
      })
    )
    .min(1)
    .max(200)
});

const contentImportBatchParamsSchema = z.object({
  batch_id: z.string().uuid()
});

const contentImportRollbackSchema = z.object({
  item_ids: z.array(z.string().uuid()).optional()
});

const contentReviewSchema = z.object({
  decision: z.enum(["approve", "reject"]),
  note: z.string().trim().max(500).optional(),
  auto_publish: z.boolean().optional(),
  simulate_failure: z.boolean().optional()
});

const auditQuerySchema = z.object({
  type: z.string().trim().optional(),
  user_id: z.string().uuid().optional(),
  actor_admin_user_id: z.string().uuid().optional(),
  page: z
    .string()
    .optional()
    .transform((value) => (value ? Number(value) : undefined)),
  page_size: z
    .string()
    .optional()
    .transform((value) => (value ? Number(value) : undefined))
});

const reviewCreateSchema = z
  .object({
    operation_type: z.enum(["user_freeze", "entitlement_adjust", "content_publish"]),
    request_reason: z.string().trim().min(3).max(500),
    target_user_id: z.string().uuid().optional(),
    target_content_item_id: z.string().uuid().optional(),
    freeze: z
      .object({
        reason: z.string().trim().min(3).max(500)
      })
      .optional(),
    entitlement_adjust: z
      .object({
        reason: z.string().trim().min(3).max(500),
        set_tier: z.enum(["free", "pro"]).optional(),
        delta_days: z.number().int().min(-365).max(365).optional(),
        rollback_of_adjustment_id: z.string().uuid().optional()
      })
      .optional(),
    content_publish: z
      .object({
        note: z.string().trim().max(500).optional(),
        simulate_failure: z.boolean().optional()
      })
      .optional()
  })
  .superRefine((value, context) => {
    if (value.operation_type === "user_freeze") {
      if (!value.target_user_id || !value.freeze) {
        context.addIssue({
          code: "custom",
          message: "target_user_id and freeze payload are required for user_freeze"
        });
      }
      return;
    }
    if (value.operation_type === "entitlement_adjust") {
      if (!value.target_user_id || !value.entitlement_adjust) {
        context.addIssue({
          code: "custom",
          message: "target_user_id and entitlement_adjust payload are required for entitlement_adjust"
        });
        return;
      }
      const payload = value.entitlement_adjust;
      if (payload.set_tier === undefined && payload.delta_days === undefined && !payload.rollback_of_adjustment_id) {
        context.addIssue({
          code: "custom",
          message: "set_tier/delta_days/rollback_of_adjustment_id is required for entitlement_adjust"
        });
      }
      return;
    }
    if (!value.target_content_item_id) {
      context.addIssue({
        code: "custom",
        message: "target_content_item_id is required for content_publish"
      });
    }
  });

const reviewQuerySchema = z.object({
  status: z.enum(["pending", "approved", "rejected"]).optional(),
  operation_type: z.enum(["user_freeze", "entitlement_adjust", "content_publish"]).optional(),
  requester_admin_user_id: z.string().uuid().optional(),
  reviewer_admin_user_id: z.string().uuid().optional(),
  page: z
    .string()
    .optional()
    .transform((value) => (value ? Number(value) : undefined)),
  page_size: z
    .string()
    .optional()
    .transform((value) => (value ? Number(value) : undefined))
});

const reviewParamsSchema = z.object({
  review_id: z.string().uuid()
});

const reviewApproveSchema = z.object({
  comment: z.string().trim().max(500).optional()
});

const reviewRejectSchema = z.object({
  comment: z.string().trim().min(3).max(500)
});

const reportExportSchema = z.object({
  report_type: z.enum(["operation", "business"]),
  from_at: z.string().datetime().optional(),
  to_at: z.string().datetime().optional(),
  role: z.enum(["super_admin", "finance", "ops"]).optional()
});

const reportDownloadParamsSchema = z.object({
  export_id: z.string().uuid()
});

type AdminAuthenticatedRequest = FastifyRequest & {
  adminAuth: {
    adminUserId: string;
    roles: Array<"super_admin" | "finance" | "ops">;
    email: string;
  };
};

const toError = (code: string, message: string): { code: string; message: string } => ({
  code,
  message
});

const flushAuthAccountRepository = async (
  repository: AuthAccountRepository | undefined,
  reply: FastifyReply
): Promise<boolean> => {
  try {
    await repository?.flush();
    return true;
  } catch {
    reply.code(503).send(toError("AUTH_ACCOUNT_STORAGE_UNAVAILABLE", "Auth/account storage is unavailable"));
    return false;
  }
};

const serializeCouponRule = (rule: {
  code: string;
  status: "active" | "inactive";
  description?: string;
  discountType: "percentage" | "fixed_amount";
  discountValue: number;
  maxDiscountCny?: number;
  planCodes?: Array<"pro_monthly" | "pro_yearly" | "family_duo_monthly">;
  startsAt?: string;
  expiresAt?: string;
  createdAt: string;
  updatedAt: string;
}) => ({
  code: rule.code,
  status: rule.status,
  description: rule.description,
  discount_type: rule.discountType,
  discount_value: rule.discountValue,
  max_discount_cny: rule.maxDiscountCny,
  plan_codes: rule.planCodes,
  starts_at: rule.startsAt,
  expires_at: rule.expiresAt,
  created_at: rule.createdAt,
  updated_at: rule.updatedAt
});

const authenticateAdmin =
  (adminService: AdminService) =>
  async (request: FastifyRequest, reply: FastifyReply): Promise<void> => {
    const authorization = request.headers.authorization;
    if (!authorization || !authorization.startsWith("Bearer ")) {
      reply.code(401).send(toError("ADMIN_UNAUTHORIZED", "Missing admin bearer token"));
      return;
    }

    const token = authorization.slice("Bearer ".length).trim();
    try {
      const payload = adminService.verifyAccessToken(token);
      (request as AdminAuthenticatedRequest).adminAuth = payload;
    } catch {
      reply.code(401).send(toError("ADMIN_UNAUTHORIZED", "Invalid admin token"));
    }
  };

const serializeReviewRequest = (request: {
  id: string;
  operationType: "user_freeze" | "entitlement_adjust" | "content_publish";
  status: "pending" | "approved" | "rejected";
  requesterAdminUserId: string;
  requesterRoles: Array<"super_admin" | "finance" | "ops">;
  payload:
    | {
        operationType: "user_freeze";
        userId: string;
        reason: string;
      }
    | {
        operationType: "entitlement_adjust";
        userId: string;
        reason: string;
        setTier?: "free" | "pro";
        deltaDays?: number;
        rollbackOfAdjustmentId?: string;
      }
    | {
        operationType: "content_publish";
        itemId: string;
        note?: string;
        simulateFailure?: boolean;
      };
  requestedAt: string;
  reviewedAt?: string;
  reviewerAdminUserId?: string;
  reviewComment?: string;
  execution?: {
    success: boolean;
    executedAt?: string;
    result?: Record<string, unknown>;
    errorCode?: string;
    errorMessage?: string;
  };
}) => {
  const payload =
    request.payload.operationType === "user_freeze"
      ? {
          operation_type: "user_freeze" as const,
          user_id: request.payload.userId,
          reason: request.payload.reason
        }
      : request.payload.operationType === "entitlement_adjust"
        ? {
            operation_type: "entitlement_adjust" as const,
            user_id: request.payload.userId,
            reason: request.payload.reason,
            set_tier: request.payload.setTier,
            delta_days: request.payload.deltaDays,
            rollback_of_adjustment_id: request.payload.rollbackOfAdjustmentId
          }
        : {
            operation_type: "content_publish" as const,
            item_id: request.payload.itemId,
            note: request.payload.note,
            simulate_failure: request.payload.simulateFailure
          };

  return {
    review_id: request.id,
    operation_type: request.operationType,
    status: request.status,
    requester_admin_user_id: request.requesterAdminUserId,
    requester_roles: request.requesterRoles,
    payload,
    requested_at: request.requestedAt,
    reviewed_at: request.reviewedAt,
    reviewer_admin_user_id: request.reviewerAdminUserId,
    review_comment: request.reviewComment,
    execution: request.execution
      ? {
          success: request.execution.success,
          executed_at: request.execution.executedAt,
          result: request.execution.result,
          error_code: request.execution.errorCode,
          error_message: request.execution.errorMessage
        }
      : undefined
  };
};

export const registerAdminRoutes = async (
  app: FastifyInstance,
  services: {
    adminService: AdminService;
    adminOpsService: AdminOpsService;
    adminReviewService: AdminReviewService;
    subscriptionService: SubscriptionService;
    authAccountRepository?: AuthAccountRepository;
  }
): Promise<void> => {
  const assertReviewOperationPermission = (
    auth: AdminAuthenticatedRequest["adminAuth"],
    operationType: "user_freeze" | "entitlement_adjust" | "content_publish",
    payload?: Record<string, unknown>
  ): void => {
    if (operationType === "user_freeze") {
      services.adminService.assertPermission(auth, "users:manage");
      return;
    }
    if (operationType === "content_publish") {
      services.adminService.assertPermission(auth, "content:publish");
      return;
    }
    const rollback = Boolean(payload?.rollbackOfAdjustmentId ?? payload?.rollback_of_adjustment_id);
    services.adminService.assertPermission(auth, rollback ? "entitlement:rollback" : "entitlement:adjust");
  };

  app.post("/v1/admin/auth/login", async (request, reply) => {
    const parsed = loginSchema.safeParse(request.body);
    if (!parsed.success) {
      reply.code(400).send(toError("VALIDATION_ERROR", "admin login payload is invalid"));
      return;
    }

    try {
      const result = services.adminService.login({
        email: parsed.data.email,
        password: parsed.data.password,
        ipAddress: request.ip,
        userAgent: request.headers["user-agent"]
      });
      reply.code(200).send({
        access_token: result.accessToken,
        expires_in: result.expiresIn,
        admin_user_id: result.adminUserId,
        email: result.email,
        display_name: result.displayName,
        roles: result.roles,
        menus: result.menus
      });
    } catch (error) {
      if (error instanceof Error && error.message === "ADMIN_LOGIN_RATE_LIMITED") {
        reply.code(429).send(toError("ADMIN_LOGIN_RATE_LIMITED", "Too many failed admin login attempts"));
        return;
      }
      if (error instanceof Error && error.message === "INVALID_ADMIN_CREDENTIALS") {
        reply.code(403).send(toError("INVALID_ADMIN_CREDENTIALS", "Admin email/password is invalid"));
        return;
      }
      throw error;
    }
  });

  app.get("/v1/admin/orders", { preHandler: authenticateAdmin(services.adminService) }, async (request, reply) => {
    const parsed = orderQuerySchema.safeParse(request.query ?? {});
    if (!parsed.success) {
      reply.code(400).send(toError("VALIDATION_ERROR", "admin orders query is invalid"));
      return;
    }

    const adminRequest = request as AdminAuthenticatedRequest;
    try {
      services.adminService.assertPermission(adminRequest.adminAuth, "orders:read");
    } catch {
      reply.code(403).send(toError("ADMIN_FORBIDDEN", "No permission for order query"));
      return;
    }

    const result = services.subscriptionService.listOrders({
      userId: parsed.data.user_id,
      status: parsed.data.status,
      page: parsed.data.page,
      pageSize: parsed.data.page_size
    });

    reply.code(200).send({
      total: result.total,
      page: result.page,
      page_size: result.pageSize,
      items: result.items.map((item) => ({
        order_id: item.id,
        user_id: item.userId,
        plan_code: item.planCode,
        provider: item.provider,
        status: item.status,
        list_price_cny: item.listPriceCny,
        discount_cny: item.discountCny,
        payable_amount_cny: item.payableAmountCny,
        paid_amount_cny: item.paidAmountCny,
        refunded_amount_cny: item.refundedAmountCny,
        coupon_code: item.couponCode,
        amount_cny: item.amountCny,
        provider_order_id: item.providerOrderId,
        created_at: item.createdAt,
        updated_at: item.updatedAt
      }))
    });
  });

  app.get("/v1/admin/coupons", { preHandler: authenticateAdmin(services.adminService) }, async (request, reply) => {
    const parsed = couponQuerySchema.safeParse(request.query ?? {});
    if (!parsed.success) {
      reply.code(400).send(toError("VALIDATION_ERROR", "admin coupons query is invalid"));
      return;
    }
    const adminRequest = request as AdminAuthenticatedRequest;
    try {
      services.adminService.assertPermission(adminRequest.adminAuth, "coupon:manage");
    } catch {
      reply.code(403).send(toError("ADMIN_FORBIDDEN", "No permission for coupon query"));
      return;
    }

    const result = services.subscriptionService.listCouponRules({
      code: parsed.data.code,
      status: parsed.data.status,
      page: parsed.data.page,
      pageSize: parsed.data.page_size
    });
    reply.code(200).send({
      total: result.total,
      page: result.page,
      page_size: result.pageSize,
      items: result.items.map((item) => serializeCouponRule(item))
    });
  });

  app.put(
    "/v1/admin/coupons/:coupon_code",
    { preHandler: authenticateAdmin(services.adminService) },
    async (request, reply) => {
      const paramsParsed = couponParamsSchema.safeParse(request.params);
      const bodyParsed = couponUpsertSchema.safeParse(request.body);
      if (!paramsParsed.success || !bodyParsed.success) {
        reply.code(400).send(toError("VALIDATION_ERROR", "admin coupon payload is invalid"));
        return;
      }
      const adminRequest = request as AdminAuthenticatedRequest;
      try {
        services.adminService.assertPermission(adminRequest.adminAuth, "coupon:manage");
      } catch {
        reply.code(403).send(toError("ADMIN_FORBIDDEN", "No permission for coupon management"));
        return;
      }

      try {
        const rule = services.subscriptionService.upsertCouponRule({
          code: paramsParsed.data.coupon_code,
          status: bodyParsed.data.status,
          description: bodyParsed.data.description,
          discountType: bodyParsed.data.discount_type,
          discountValue: bodyParsed.data.discount_value,
          maxDiscountCny: bodyParsed.data.max_discount_cny,
          planCodes: bodyParsed.data.plan_codes,
          startsAt: bodyParsed.data.starts_at,
          expiresAt: bodyParsed.data.expires_at
        });
        reply.code(200).send(serializeCouponRule(rule));
      } catch (error) {
        if (error instanceof Error && error.message === "COUPON_RULE_INVALID") {
          reply.code(400).send(toError("COUPON_RULE_INVALID", "coupon rule payload is invalid"));
          return;
        }
        throw error;
      }
    }
  );

  app.post(
    "/v1/admin/entitlements/:user_id/adjust",
    { preHandler: authenticateAdmin(services.adminService) },
    async (request, reply) => {
      const paramsParsed = adjustParamsSchema.safeParse(request.params);
      const bodyParsed = adjustSchema.safeParse(request.body);
      if (!paramsParsed.success || !bodyParsed.success) {
        reply.code(400).send(toError("VALIDATION_ERROR", "admin entitlement adjust payload is invalid"));
        return;
      }

      const adminRequest = request as AdminAuthenticatedRequest;
      const permission = bodyParsed.data.rollback_of_adjustment_id ? "entitlement:rollback" : "entitlement:adjust";
      try {
        services.adminService.assertPermission(adminRequest.adminAuth, permission);
      } catch {
        reply.code(403).send(toError("ADMIN_FORBIDDEN", "No permission for entitlement adjustment"));
        return;
      }

      try {
        const result = services.subscriptionService.adjustEntitlementByAdmin({
          userId: paramsParsed.data.user_id,
          adminUserId: adminRequest.adminAuth.adminUserId,
          reason: bodyParsed.data.reason,
          setTier: bodyParsed.data.set_tier,
          deltaDays: bodyParsed.data.delta_days,
          rollbackOfAdjustmentId: bodyParsed.data.rollback_of_adjustment_id
        });
        reply.code(200).send({
          entitlement: {
            entitlement_id: result.entitlement.id,
            user_id: result.entitlement.userId,
            tier: result.entitlement.tier,
            status: result.entitlement.status,
            daily_quota: result.entitlement.dailyQuota,
            used_today: result.entitlement.usedToday,
            remaining_today: Math.max(0, result.entitlement.dailyQuota - result.entitlement.usedToday),
            expires_at: result.entitlement.expiresAt,
            version: result.entitlement.version,
            updated_at: result.entitlement.updatedAt
          },
          adjustment: {
            adjustment_id: result.adjustment.id,
            user_id: result.adjustment.userId,
            admin_user_id: result.adjustment.adminUserId,
            reason: result.adjustment.reason,
            set_tier: result.adjustment.setTier,
            delta_days: result.adjustment.deltaDays,
            previous_tier: result.adjustment.previousTier,
            previous_expires_at: result.adjustment.previousExpiresAt,
            new_tier: result.adjustment.newTier,
            new_expires_at: result.adjustment.newExpiresAt,
            rolled_back: result.adjustment.rolledBack,
            rolled_back_at: result.adjustment.rolledBackAt,
            rollback_of_adjustment_id: result.adjustment.rollbackOfAdjustmentId,
            created_at: result.adjustment.createdAt,
            updated_at: result.adjustment.updatedAt
          }
        });
      } catch (error) {
        if (error instanceof Error && error.message === "ADJUSTMENT_EMPTY") {
          reply.code(400).send(toError("ADJUSTMENT_EMPTY", "set_tier or delta_days is required"));
          return;
        }
        if (error instanceof Error && error.message === "ADJUSTMENT_NOT_FOUND") {
          reply.code(404).send(toError("ADJUSTMENT_NOT_FOUND", "Adjustment not found"));
          return;
        }
        if (error instanceof Error && error.message === "ADJUSTMENT_ALREADY_ROLLED_BACK") {
          reply.code(409).send(toError("ADJUSTMENT_ALREADY_ROLLED_BACK", "Adjustment already rolled back"));
          return;
        }
        throw error;
      }
    }
  );

  app.post("/v1/admin/reviews", { preHandler: authenticateAdmin(services.adminService) }, async (request, reply) => {
    const parsed = reviewCreateSchema.safeParse(request.body);
    if (!parsed.success) {
      reply.code(400).send(toError("VALIDATION_ERROR", "review request payload is invalid"));
      return;
    }

    const adminRequest = request as AdminAuthenticatedRequest;
    try {
      assertReviewOperationPermission(adminRequest.adminAuth, parsed.data.operation_type, parsed.data.entitlement_adjust);
    } catch {
      reply.code(403).send(toError("ADMIN_FORBIDDEN", "No permission for creating review request"));
      return;
    }

    let payload:
      | {
          operationType: "user_freeze";
          userId: string;
          reason: string;
        }
      | {
          operationType: "entitlement_adjust";
          userId: string;
          reason: string;
          setTier?: "free" | "pro";
          deltaDays?: number;
          rollbackOfAdjustmentId?: string;
        }
      | {
          operationType: "content_publish";
          itemId: string;
          note?: string;
          simulateFailure?: boolean;
        };

    if (parsed.data.operation_type === "user_freeze") {
      payload = {
        operationType: "user_freeze",
        userId: parsed.data.target_user_id as string,
        reason: parsed.data.freeze?.reason as string
      };
    } else if (parsed.data.operation_type === "entitlement_adjust") {
      payload = {
        operationType: "entitlement_adjust",
        userId: parsed.data.target_user_id as string,
        reason: parsed.data.entitlement_adjust?.reason as string,
        setTier: parsed.data.entitlement_adjust?.set_tier,
        deltaDays: parsed.data.entitlement_adjust?.delta_days,
        rollbackOfAdjustmentId: parsed.data.entitlement_adjust?.rollback_of_adjustment_id
      };
    } else {
      payload = {
        operationType: "content_publish",
        itemId: parsed.data.target_content_item_id as string,
        note: parsed.data.content_publish?.note,
        simulateFailure: parsed.data.content_publish?.simulate_failure
      };
    }

    const reviewRequest = services.adminReviewService.createRequest({
      operationType: parsed.data.operation_type,
      payload,
      requesterAdminUserId: adminRequest.adminAuth.adminUserId,
      requesterRoles: adminRequest.adminAuth.roles,
      requestReason: parsed.data.request_reason
    });

    reply.code(201).send(serializeReviewRequest(reviewRequest));
  });

  app.get("/v1/admin/reviews", { preHandler: authenticateAdmin(services.adminService) }, async (request, reply) => {
    const parsed = reviewQuerySchema.safeParse(request.query ?? {});
    if (!parsed.success) {
      reply.code(400).send(toError("VALIDATION_ERROR", "review query is invalid"));
      return;
    }
    const adminRequest = request as AdminAuthenticatedRequest;
    try {
      services.adminService.assertPermission(adminRequest.adminAuth, "audit:read");
    } catch {
      reply.code(403).send(toError("ADMIN_FORBIDDEN", "No permission for review query"));
      return;
    }

    const result = services.adminReviewService.listRequests({
      status: parsed.data.status,
      operationType: parsed.data.operation_type,
      requesterAdminUserId: parsed.data.requester_admin_user_id,
      reviewerAdminUserId: parsed.data.reviewer_admin_user_id,
      page: parsed.data.page,
      pageSize: parsed.data.page_size
    });
    reply.code(200).send({
      total: result.total,
      page: result.page,
      page_size: result.pageSize,
      items: result.items.map((item) => serializeReviewRequest(item))
    });
  });

  app.post(
    "/v1/admin/reviews/:review_id/approve",
    { preHandler: authenticateAdmin(services.adminService) },
    async (request, reply) => {
      const paramsParsed = reviewParamsSchema.safeParse(request.params);
      const bodyParsed = reviewApproveSchema.safeParse(request.body ?? {});
      if (!paramsParsed.success || !bodyParsed.success) {
        reply.code(400).send(toError("VALIDATION_ERROR", "review approval payload is invalid"));
        return;
      }

      const adminRequest = request as AdminAuthenticatedRequest;
      try {
        const approved = services.adminReviewService.approveRequest({
          reviewRequestId: paramsParsed.data.review_id,
          reviewerAdminUserId: adminRequest.adminAuth.adminUserId,
          reviewComment: bodyParsed.data.comment,
          executor: (review) => {
            if (review.payload.operationType === "user_freeze") {
              assertReviewOperationPermission(adminRequest.adminAuth, "user_freeze");
              const result = services.adminOpsService.freezeUser({
                userId: review.payload.userId,
                adminUserId: adminRequest.adminAuth.adminUserId,
                reason: review.payload.reason
              });
              return {
                user_id: result.user.id,
                status: result.user.status,
                revoked_sessions: result.revokedSessions
              };
            }

            if (review.payload.operationType === "entitlement_adjust") {
              assertReviewOperationPermission(adminRequest.adminAuth, "entitlement_adjust", review.payload);
              const result = services.subscriptionService.adjustEntitlementByAdmin({
                userId: review.payload.userId,
                adminUserId: adminRequest.adminAuth.adminUserId,
                reason: review.payload.reason,
                setTier: review.payload.setTier,
                deltaDays: review.payload.deltaDays,
                rollbackOfAdjustmentId: review.payload.rollbackOfAdjustmentId
              });
              return {
                user_id: result.adjustment.userId,
                entitlement_tier: result.entitlement.tier,
                adjustment_id: result.adjustment.id
              };
            }

            assertReviewOperationPermission(adminRequest.adminAuth, "content_publish");
            const item = services.adminOpsService.publishContent({
              itemId: review.payload.itemId,
              adminUserId: adminRequest.adminAuth.adminUserId,
              note: review.payload.note,
              simulateFailure: review.payload.simulateFailure
            });
            return {
              item_id: item.id,
              status: item.status,
              version: item.version
            };
          }
        });
        if (approved.payload.operationType === "user_freeze") {
          if (!(await flushAuthAccountRepository(services.authAccountRepository, reply))) {
            return;
          }
        }
        reply.code(200).send(serializeReviewRequest(approved));
      } catch (error) {
        if (error instanceof Error && error.message === "REVIEW_NOT_FOUND") {
          reply.code(404).send(toError("REVIEW_NOT_FOUND", "Review request not found"));
          return;
        }
        if (error instanceof Error && error.message === "REVIEW_NOT_PENDING") {
          reply.code(409).send(toError("REVIEW_NOT_PENDING", "Review request is not pending"));
          return;
        }
        if (error instanceof Error && error.message === "REVIEW_SELF_APPROVAL_FORBIDDEN") {
          reply.code(409).send(toError("REVIEW_SELF_APPROVAL_FORBIDDEN", "Requester cannot approve own review"));
          return;
        }
        if (error instanceof Error && error.message === "ADMIN_FORBIDDEN") {
          reply.code(403).send(toError("ADMIN_FORBIDDEN", "No permission for review approval"));
          return;
        }
        if (error instanceof Error && error.message === "USER_NOT_FOUND") {
          reply.code(404).send(toError("USER_NOT_FOUND", "User not found"));
          return;
        }
        if (error instanceof Error && error.message === "USER_ALREADY_DELETED") {
          reply.code(409).send(toError("USER_ALREADY_DELETED", "User already deleted"));
          return;
        }
        if (error instanceof Error && error.message === "CONTENT_NOT_FOUND") {
          reply.code(404).send(toError("CONTENT_NOT_FOUND", "Content item not found"));
          return;
        }
        if (error instanceof Error && error.message === "CONTENT_PUBLISH_FAILED_ROLLED_BACK") {
          reply.code(409).send(
            toError("CONTENT_PUBLISH_FAILED_ROLLED_BACK", "Publish failed and rollback has been applied")
          );
          return;
        }
        if (error instanceof Error && error.message === "ADJUSTMENT_NOT_FOUND") {
          reply.code(404).send(toError("ADJUSTMENT_NOT_FOUND", "Adjustment not found"));
          return;
        }
        if (error instanceof Error && error.message === "ADJUSTMENT_ALREADY_ROLLED_BACK") {
          reply.code(409).send(toError("ADJUSTMENT_ALREADY_ROLLED_BACK", "Adjustment already rolled back"));
          return;
        }
        if (error instanceof Error && error.message === "ADJUSTMENT_EMPTY") {
          reply.code(400).send(toError("ADJUSTMENT_EMPTY", "set_tier or delta_days is required"));
          return;
        }
        throw error;
      }
    }
  );

  app.post(
    "/v1/admin/reviews/:review_id/reject",
    { preHandler: authenticateAdmin(services.adminService) },
    async (request, reply) => {
      const paramsParsed = reviewParamsSchema.safeParse(request.params);
      const bodyParsed = reviewRejectSchema.safeParse(request.body ?? {});
      if (!paramsParsed.success || !bodyParsed.success) {
        reply.code(400).send(toError("VALIDATION_ERROR", "review rejection payload is invalid"));
        return;
      }

      const adminRequest = request as AdminAuthenticatedRequest;
      try {
        const review = services.adminReviewService.getRequest(paramsParsed.data.review_id);
        assertReviewOperationPermission(adminRequest.adminAuth, review.operationType, review.payload);
        const rejected = services.adminReviewService.rejectRequest({
          reviewRequestId: paramsParsed.data.review_id,
          reviewerAdminUserId: adminRequest.adminAuth.adminUserId,
          reviewComment: bodyParsed.data.comment
        });
        reply.code(200).send(serializeReviewRequest(rejected));
      } catch (error) {
        if (error instanceof Error && error.message === "REVIEW_NOT_FOUND") {
          reply.code(404).send(toError("REVIEW_NOT_FOUND", "Review request not found"));
          return;
        }
        if (error instanceof Error && error.message === "REVIEW_NOT_PENDING") {
          reply.code(409).send(toError("REVIEW_NOT_PENDING", "Review request is not pending"));
          return;
        }
        if (error instanceof Error && error.message === "REVIEW_SELF_APPROVAL_FORBIDDEN") {
          reply.code(409).send(toError("REVIEW_SELF_APPROVAL_FORBIDDEN", "Requester cannot reject own review"));
          return;
        }
        if (error instanceof Error && error.message === "ADMIN_FORBIDDEN") {
          reply.code(403).send(toError("ADMIN_FORBIDDEN", "No permission for review rejection"));
          return;
        }
        throw error;
      }
    }
  );

  app.get("/v1/admin/users", { preHandler: authenticateAdmin(services.adminService) }, async (request, reply) => {
    const parsed = usersQuerySchema.safeParse(request.query ?? {});
    if (!parsed.success) {
      reply.code(400).send(toError("VALIDATION_ERROR", "admin users query is invalid"));
      return;
    }
    const adminRequest = request as AdminAuthenticatedRequest;
    try {
      services.adminService.assertPermission(adminRequest.adminAuth, "users:manage");
    } catch {
      reply.code(403).send(toError("ADMIN_FORBIDDEN", "No permission for user management"));
      return;
    }

    const result = services.adminOpsService.listUsers({
      email: parsed.data.email,
      phone: parsed.data.phone,
      status: parsed.data.status,
      page: parsed.data.page,
      pageSize: parsed.data.page_size
    });
    reply.code(200).send({
      total: result.total,
      page: result.page,
      page_size: result.pageSize,
      items: result.items.map((item) => ({
        user_id: item.id,
        email: item.email,
        phone: item.phone,
        status: item.status,
        frozen_at: item.frozenAt,
        unfrozen_at: item.unfrozenAt,
        created_at: item.createdAt,
        updated_at: item.updatedAt
      }))
    });
  });

  app.post(
    "/v1/admin/users/:user_id/freeze",
    { preHandler: authenticateAdmin(services.adminService) },
    async (request, reply) => {
      const paramsParsed = userParamsSchema.safeParse(request.params);
      const bodyParsed = freezeSchema.safeParse(request.body);
      if (!paramsParsed.success || !bodyParsed.success) {
        reply.code(400).send(toError("VALIDATION_ERROR", "freeze payload is invalid"));
        return;
      }

      const adminRequest = request as AdminAuthenticatedRequest;
      try {
        services.adminService.assertPermission(adminRequest.adminAuth, "users:manage");
      } catch {
        reply.code(403).send(toError("ADMIN_FORBIDDEN", "No permission for user freeze"));
        return;
      }

      try {
        const result = services.adminOpsService.freezeUser({
          userId: paramsParsed.data.user_id,
          adminUserId: adminRequest.adminAuth.adminUserId,
          reason: bodyParsed.data.reason
        });
        if (!(await flushAuthAccountRepository(services.authAccountRepository, reply))) {
          return;
        }
        reply.code(200).send({
          user_id: result.user.id,
          status: result.user.status,
          frozen_at: result.user.frozenAt,
          revoked_sessions: result.revokedSessions,
          updated_at: result.user.updatedAt
        });
      } catch (error) {
        if (error instanceof Error && error.message === "USER_NOT_FOUND") {
          reply.code(404).send(toError("USER_NOT_FOUND", "User not found"));
          return;
        }
        if (error instanceof Error && error.message === "USER_ALREADY_DELETED") {
          reply.code(409).send(toError("USER_ALREADY_DELETED", "User already deleted"));
          return;
        }
        throw error;
      }
    }
  );

  app.post(
    "/v1/admin/users/:user_id/unfreeze",
    { preHandler: authenticateAdmin(services.adminService) },
    async (request, reply) => {
      const paramsParsed = userParamsSchema.safeParse(request.params);
      const bodyParsed = freezeSchema.safeParse(request.body);
      if (!paramsParsed.success || !bodyParsed.success) {
        reply.code(400).send(toError("VALIDATION_ERROR", "unfreeze payload is invalid"));
        return;
      }

      const adminRequest = request as AdminAuthenticatedRequest;
      try {
        services.adminService.assertPermission(adminRequest.adminAuth, "users:manage");
      } catch {
        reply.code(403).send(toError("ADMIN_FORBIDDEN", "No permission for user unfreeze"));
        return;
      }

      try {
        const user = services.adminOpsService.unfreezeUser({
          userId: paramsParsed.data.user_id,
          adminUserId: adminRequest.adminAuth.adminUserId,
          reason: bodyParsed.data.reason
        });
        if (!(await flushAuthAccountRepository(services.authAccountRepository, reply))) {
          return;
        }
        reply.code(200).send({
          user_id: user.id,
          status: user.status,
          unfrozen_at: user.unfrozenAt,
          updated_at: user.updatedAt
        });
      } catch (error) {
        if (error instanceof Error && error.message === "USER_NOT_FOUND") {
          reply.code(404).send(toError("USER_NOT_FOUND", "User not found"));
          return;
        }
        if (error instanceof Error && error.message === "USER_ALREADY_DELETED") {
          reply.code(409).send(toError("USER_ALREADY_DELETED", "User already deleted"));
          return;
        }
        throw error;
      }
    }
  );

  app.post(
    "/v1/admin/content/import/batches",
    { preHandler: authenticateAdmin(services.adminService) },
    async (request, reply) => {
      const parsed = contentImportSchema.safeParse(request.body);
      if (!parsed.success) {
        reply.code(400).send(toError("VALIDATION_ERROR", "content import payload is invalid"));
        return;
      }

      const adminRequest = request as AdminAuthenticatedRequest;
      try {
        services.adminService.assertPermission(adminRequest.adminAuth, "content:publish");
      } catch {
        reply.code(403).send(toError("ADMIN_FORBIDDEN", "No permission for content import"));
        return;
      }

      const result = services.adminOpsService.importContentBatch({
        adminUserId: adminRequest.adminAuth.adminUserId,
        templateVersion: parsed.data.template_version,
        atomic: parsed.data.atomic,
        items: parsed.data.items.map((item) => ({
          title: item.title,
          skill: item.skill,
          payload: item.payload
        }))
      });
      reply.code(201).send({
        batch_id: result.batch.id,
        template_version: result.batch.templateVersion,
        atomic: result.batch.atomic,
        status: result.batch.status,
        total_count: result.batch.totalCount,
        imported_count: result.importedItems.length,
        failed_count: result.failedItems.length,
        imported_items: result.importedItems.map((item) => ({
          item_id: item.id,
          title: item.title,
          skill: item.skill,
          status: item.status,
          review_status: item.reviewStatus,
          version: item.version
        })),
        failed_items: result.failedItems.map((item) => ({
          index: item.index,
          title: item.title,
          error_code: item.errorCode,
          error_message: item.errorMessage
        })),
        rollback_item_ids: result.batch.rollbackItemIds,
        created_at: result.batch.createdAt
      });
    }
  );

  app.post(
    "/v1/admin/content/import/batches/:batch_id/rollback",
    { preHandler: authenticateAdmin(services.adminService) },
    async (request, reply) => {
      const paramsParsed = contentImportBatchParamsSchema.safeParse(request.params);
      const bodyParsed = contentImportRollbackSchema.safeParse(request.body ?? {});
      if (!paramsParsed.success || !bodyParsed.success) {
        reply.code(400).send(toError("VALIDATION_ERROR", "content import rollback payload is invalid"));
        return;
      }

      const adminRequest = request as AdminAuthenticatedRequest;
      try {
        services.adminService.assertPermission(adminRequest.adminAuth, "content:publish");
      } catch {
        reply.code(403).send(toError("ADMIN_FORBIDDEN", "No permission for content rollback"));
        return;
      }

      try {
        const result = services.adminOpsService.rollbackImportBatch({
          batchId: paramsParsed.data.batch_id,
          adminUserId: adminRequest.adminAuth.adminUserId,
          itemIds: bodyParsed.data.item_ids
        });
        reply.code(200).send({
          batch_id: result.batch.id,
          status: result.batch.status,
          rolled_back_item_ids: result.rolledBackItemIds,
          rollback_count: result.rolledBackItemIds.length,
          updated_at: result.batch.updatedAt
        });
      } catch (error) {
        if (error instanceof Error && error.message === "CONTENT_IMPORT_BATCH_NOT_FOUND") {
          reply.code(404).send(toError("CONTENT_IMPORT_BATCH_NOT_FOUND", "Content import batch not found"));
          return;
        }
        if (error instanceof Error && error.message === "CONTENT_IMPORT_BATCH_EMPTY") {
          reply.code(400).send(toError("CONTENT_IMPORT_BATCH_EMPTY", "No imported items available for rollback"));
          return;
        }
        if (error instanceof Error && error.message === "CONTENT_IMPORT_ROLLBACK_FORBIDDEN_PUBLISHED") {
          reply.code(409).send(
            toError("CONTENT_IMPORT_ROLLBACK_FORBIDDEN_PUBLISHED", "Published items cannot be rolled back")
          );
          return;
        }
        throw error;
      }
    }
  );

  app.get("/v1/admin/content/items", { preHandler: authenticateAdmin(services.adminService) }, async (request, reply) => {
    const parsed = contentQuerySchema.safeParse(request.query ?? {});
    if (!parsed.success) {
      reply.code(400).send(toError("VALIDATION_ERROR", "content list query is invalid"));
      return;
    }

    const adminRequest = request as AdminAuthenticatedRequest;
    try {
      services.adminService.assertPermission(adminRequest.adminAuth, "content:publish");
    } catch {
      reply.code(403).send(toError("ADMIN_FORBIDDEN", "No permission for content management"));
      return;
    }

    const result = services.adminOpsService.listContent({
      skill: parsed.data.skill,
      status: parsed.data.status,
      page: parsed.data.page,
      pageSize: parsed.data.page_size
    });
    reply.code(200).send({
      total: result.total,
      page: result.page,
      page_size: result.pageSize,
      items: result.items.map((item) => ({
        item_id: item.id,
        title: item.title,
        skill: item.skill,
        status: item.status,
        review_status: item.reviewStatus,
        source_type: item.sourceType,
        import_batch_id: item.importBatchId,
        version: item.version,
        last_published_at: item.lastPublishedAt,
        last_rollback_at: item.lastRollbackAt,
        last_operator_admin_user_id: item.lastOperatorAdminUserId,
        updated_at: item.updatedAt
      }))
    });
  });

  app.post(
    "/v1/admin/content/items/:item_id/publish",
    { preHandler: authenticateAdmin(services.adminService) },
    async (request, reply) => {
      const paramsParsed = contentParamsSchema.safeParse(request.params);
      const bodyParsed = publishSchema.safeParse(request.body ?? {});
      if (!paramsParsed.success || !bodyParsed.success) {
        reply.code(400).send(toError("VALIDATION_ERROR", "content publish payload is invalid"));
        return;
      }

      const adminRequest = request as AdminAuthenticatedRequest;
      try {
        services.adminService.assertPermission(adminRequest.adminAuth, "content:publish");
      } catch {
        reply.code(403).send(toError("ADMIN_FORBIDDEN", "No permission for content publish"));
        return;
      }

      try {
        const item = services.adminOpsService.publishContent({
          itemId: paramsParsed.data.item_id,
          adminUserId: adminRequest.adminAuth.adminUserId,
          note: bodyParsed.data.note,
          simulateFailure: bodyParsed.data.simulate_failure
        });
        reply.code(200).send({
          item_id: item.id,
          status: item.status,
          version: item.version,
          last_published_at: item.lastPublishedAt,
          updated_at: item.updatedAt
        });
      } catch (error) {
        if (error instanceof Error && error.message === "CONTENT_NOT_FOUND") {
          reply.code(404).send(toError("CONTENT_NOT_FOUND", "Content item not found"));
          return;
        }
        if (error instanceof Error && error.message === "CONTENT_PUBLISH_FAILED_ROLLED_BACK") {
          reply.code(409).send(
            toError("CONTENT_PUBLISH_FAILED_ROLLED_BACK", "Publish failed and rollback has been applied")
          );
          return;
        }
        if (error instanceof Error && error.message === "CONTENT_REVIEW_REQUIRED") {
          reply.code(409).send(toError("CONTENT_REVIEW_REQUIRED", "Content must be approved before publish"));
          return;
        }
        throw error;
      }
    }
  );

  app.post(
    "/v1/admin/content/items/:item_id/review",
    { preHandler: authenticateAdmin(services.adminService) },
    async (request, reply) => {
      const paramsParsed = contentParamsSchema.safeParse(request.params);
      const bodyParsed = contentReviewSchema.safeParse(request.body ?? {});
      if (!paramsParsed.success || !bodyParsed.success) {
        reply.code(400).send(toError("VALIDATION_ERROR", "content review payload is invalid"));
        return;
      }
      const adminRequest = request as AdminAuthenticatedRequest;
      try {
        services.adminService.assertPermission(adminRequest.adminAuth, "content:publish");
      } catch {
        reply.code(403).send(toError("ADMIN_FORBIDDEN", "No permission for content review"));
        return;
      }

      try {
        const result = services.adminOpsService.reviewContent({
          itemId: paramsParsed.data.item_id,
          adminUserId: adminRequest.adminAuth.adminUserId,
          decision: bodyParsed.data.decision,
          note: bodyParsed.data.note,
          autoPublish: bodyParsed.data.auto_publish,
          simulateFailure: bodyParsed.data.simulate_failure
        });
        reply.code(200).send({
          item_id: result.item.id,
          status: result.item.status,
          review_status: result.item.reviewStatus,
          published: result.published,
          version: result.item.version,
          last_published_at: result.item.lastPublishedAt,
          updated_at: result.item.updatedAt
        });
      } catch (error) {
        if (error instanceof Error && error.message === "CONTENT_NOT_FOUND") {
          reply.code(404).send(toError("CONTENT_NOT_FOUND", "Content item not found"));
          return;
        }
        if (error instanceof Error && error.message === "CONTENT_REVIEW_NOT_PENDING") {
          reply.code(409).send(toError("CONTENT_REVIEW_NOT_PENDING", "Content item review is not pending"));
          return;
        }
        if (error instanceof Error && error.message === "CONTENT_REVIEW_REQUIRED") {
          reply.code(409).send(toError("CONTENT_REVIEW_REQUIRED", "Content must be approved before publish"));
          return;
        }
        if (error instanceof Error && error.message === "CONTENT_PUBLISH_FAILED_ROLLED_BACK") {
          reply.code(409).send(
            toError("CONTENT_PUBLISH_FAILED_ROLLED_BACK", "Publish failed and rollback has been applied")
          );
          return;
        }
        throw error;
      }
    }
  );

  app.post(
    "/v1/admin/content/items/:item_id/unpublish",
    { preHandler: authenticateAdmin(services.adminService) },
    async (request, reply) => {
      const paramsParsed = contentParamsSchema.safeParse(request.params);
      const bodyParsed = unpublishSchema.safeParse(request.body ?? {});
      if (!paramsParsed.success || !bodyParsed.success) {
        reply.code(400).send(toError("VALIDATION_ERROR", "content unpublish payload is invalid"));
        return;
      }

      const adminRequest = request as AdminAuthenticatedRequest;
      try {
        services.adminService.assertPermission(adminRequest.adminAuth, "content:publish");
      } catch {
        reply.code(403).send(toError("ADMIN_FORBIDDEN", "No permission for content unpublish"));
        return;
      }

      try {
        const item = services.adminOpsService.unpublishContent({
          itemId: paramsParsed.data.item_id,
          adminUserId: adminRequest.adminAuth.adminUserId,
          note: bodyParsed.data.note
        });
        reply.code(200).send({
          item_id: item.id,
          status: item.status,
          version: item.version,
          updated_at: item.updatedAt
        });
      } catch (error) {
        if (error instanceof Error && error.message === "CONTENT_NOT_FOUND") {
          reply.code(404).send(toError("CONTENT_NOT_FOUND", "Content item not found"));
          return;
        }
        throw error;
      }
    }
  );

  app.get("/v1/admin/audit-logs", { preHandler: authenticateAdmin(services.adminService) }, async (request, reply) => {
    const parsed = auditQuerySchema.safeParse(request.query ?? {});
    if (!parsed.success) {
      reply.code(400).send(toError("VALIDATION_ERROR", "audit query is invalid"));
      return;
    }
    const adminRequest = request as AdminAuthenticatedRequest;
    try {
      services.adminService.assertPermission(adminRequest.adminAuth, "audit:read");
    } catch {
      reply.code(403).send(toError("ADMIN_FORBIDDEN", "No permission for audit logs"));
      return;
    }

    const result = services.adminOpsService.queryAuditLogs({
      type: parsed.data.type,
      userId: parsed.data.user_id,
      actorAdminUserId: parsed.data.actor_admin_user_id,
      page: parsed.data.page,
      pageSize: parsed.data.page_size
    });
    reply.code(200).send({
      total: result.total,
      page: result.page,
      page_size: result.pageSize,
      items: result.items.map((item) => ({
        id: item.id,
        type: item.type,
        user_id: item.userId,
        metadata: item.metadata,
        created_at: item.createdAt
      }))
    });
  });

  app.post("/v1/admin/reports/export", { preHandler: authenticateAdmin(services.adminService) }, async (request, reply) => {
    const parsed = reportExportSchema.safeParse(request.body ?? {});
    if (!parsed.success) {
      reply.code(400).send(toError("VALIDATION_ERROR", "report export payload is invalid"));
      return;
    }
    const adminRequest = request as AdminAuthenticatedRequest;
    try {
      const permission = parsed.data.report_type === "operation" ? "audit:read" : "orders:read";
      services.adminService.assertPermission(adminRequest.adminAuth, permission);
    } catch {
      reply.code(403).send(toError("ADMIN_FORBIDDEN", "No permission for report export"));
      return;
    }

    try {
      const exported = services.adminOpsService.exportReport({
        adminUserId: adminRequest.adminAuth.adminUserId,
        reportType: parsed.data.report_type,
        fromAt: parsed.data.from_at,
        toAt: parsed.data.to_at,
        role: parsed.data.role
      });
      reply.code(201).send({
        export_id: exported.id,
        report_type: exported.reportType,
        row_count: exported.rowCount,
        masked_fields: exported.maskedFields,
        filename: exported.filename,
        generated_at: exported.createdAt,
        download_url: `/v1/admin/reports/exports/${exported.id}/download`
      });
    } catch (error) {
      if (error instanceof Error && error.message === "REPORT_RANGE_INVALID") {
        reply.code(400).send(toError("REPORT_RANGE_INVALID", "from_at must be earlier than to_at"));
        return;
      }
      throw error;
    }
  });

  app.get(
    "/v1/admin/reports/exports/:export_id/download",
    { preHandler: authenticateAdmin(services.adminService) },
    async (request, reply) => {
      const parsed = reportDownloadParamsSchema.safeParse(request.params);
      if (!parsed.success) {
        reply.code(400).send(toError("VALIDATION_ERROR", "report download params is invalid"));
        return;
      }
      const adminRequest = request as AdminAuthenticatedRequest;
      try {
        services.adminService.assertPermission(adminRequest.adminAuth, "audit:read");
      } catch {
        try {
          services.adminService.assertPermission(adminRequest.adminAuth, "orders:read");
        } catch {
          reply.code(403).send(toError("ADMIN_FORBIDDEN", "No permission for report download"));
          return;
        }
      }

      try {
        const exported = services.adminOpsService.downloadReportExport({
          exportId: parsed.data.export_id,
          adminUserId: adminRequest.adminAuth.adminUserId
        });
        reply.code(200).send({
          export_id: exported.id,
          report_type: exported.reportType,
          filename: exported.filename,
          content: exported.content,
          row_count: exported.rowCount,
          download_count: exported.downloadCount,
          last_downloaded_at: exported.lastDownloadedAt
        });
      } catch (error) {
        if (error instanceof Error && error.message === "REPORT_EXPORT_NOT_FOUND") {
          reply.code(404).send(toError("REPORT_EXPORT_NOT_FOUND", "Report export not found"));
          return;
        }
        throw error;
      }
    }
  );
};
