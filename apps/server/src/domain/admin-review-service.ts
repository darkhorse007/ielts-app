import { randomUUID } from "node:crypto";
import { appendAudit } from "./audit.js";
import { nowIso } from "./time.js";
import { InMemoryStore } from "./store.js";
import type { AdminReviewOperationType, AdminReviewPayload, AdminReviewRequest, AdminReviewStatus } from "./types.js";

export class AdminReviewService {
  constructor(private readonly store: InMemoryStore) {}

  createRequest(input: {
    operationType: AdminReviewOperationType;
    payload: AdminReviewPayload;
    requesterAdminUserId: string;
    requesterRoles: Array<"super_admin" | "finance" | "ops">;
    requestReason: string;
  }): AdminReviewRequest {
    const request: AdminReviewRequest = {
      id: randomUUID(),
      operationType: input.operationType,
      status: "pending",
      requesterAdminUserId: input.requesterAdminUserId,
      requesterRoles: input.requesterRoles,
      payload: input.payload,
      requestedAt: nowIso()
    };
    this.store.adminReviewRequestsById.set(request.id, request);

    appendAudit(this.store, "admin_review_requested", {
      metadata: {
        reviewRequestId: request.id,
        operationType: input.operationType,
        requesterAdminUserId: input.requesterAdminUserId,
        requestReason: input.requestReason
      }
    });

    return request;
  }

  listRequests(input?: {
    status?: AdminReviewStatus;
    operationType?: AdminReviewOperationType;
    requesterAdminUserId?: string;
    reviewerAdminUserId?: string;
    page?: number;
    pageSize?: number;
  }): {
    items: AdminReviewRequest[];
    total: number;
    page: number;
    pageSize: number;
  } {
    const page = Math.max(1, input?.page ?? 1);
    const pageSize = Math.max(1, Math.min(100, input?.pageSize ?? 20));
    const filtered = Array.from(this.store.adminReviewRequestsById.values())
      .filter((item) => (input?.status ? item.status === input.status : true))
      .filter((item) => (input?.operationType ? item.operationType === input.operationType : true))
      .filter((item) => (input?.requesterAdminUserId ? item.requesterAdminUserId === input.requesterAdminUserId : true))
      .filter((item) => (input?.reviewerAdminUserId ? item.reviewerAdminUserId === input.reviewerAdminUserId : true))
      .sort((a, b) => b.requestedAt.localeCompare(a.requestedAt));

    const start = (page - 1) * pageSize;
    return {
      items: filtered.slice(start, start + pageSize),
      total: filtered.length,
      page,
      pageSize
    };
  }

  getRequest(reviewRequestId: string): AdminReviewRequest {
    const request = this.store.adminReviewRequestsById.get(reviewRequestId);
    if (!request) {
      throw new Error("REVIEW_NOT_FOUND");
    }
    return request;
  }

  approveRequest(input: {
    reviewRequestId: string;
    reviewerAdminUserId: string;
    reviewComment?: string;
    executor: (request: AdminReviewRequest) => Record<string, unknown>;
  }): AdminReviewRequest {
    const request = this.requirePending(input.reviewRequestId);
    if (request.requesterAdminUserId === input.reviewerAdminUserId) {
      throw new Error("REVIEW_SELF_APPROVAL_FORBIDDEN");
    }

    const executionResult = input.executor(request);
    request.status = "approved";
    request.reviewerAdminUserId = input.reviewerAdminUserId;
    request.reviewComment = input.reviewComment;
    request.reviewedAt = nowIso();
    request.execution = {
      success: true,
      executedAt: request.reviewedAt,
      result: executionResult
    };

    appendAudit(this.store, "admin_review_approved", {
      metadata: {
        reviewRequestId: request.id,
        operationType: request.operationType,
        requesterAdminUserId: request.requesterAdminUserId,
        reviewerAdminUserId: input.reviewerAdminUserId
      }
    });

    return request;
  }

  rejectRequest(input: {
    reviewRequestId: string;
    reviewerAdminUserId: string;
    reviewComment: string;
  }): AdminReviewRequest {
    const request = this.requirePending(input.reviewRequestId);
    if (request.requesterAdminUserId === input.reviewerAdminUserId) {
      throw new Error("REVIEW_SELF_APPROVAL_FORBIDDEN");
    }

    request.status = "rejected";
    request.reviewerAdminUserId = input.reviewerAdminUserId;
    request.reviewComment = input.reviewComment;
    request.reviewedAt = nowIso();
    request.execution = {
      success: false,
      errorCode: "REVIEW_REJECTED",
      errorMessage: input.reviewComment
    };

    appendAudit(this.store, "admin_review_rejected", {
      metadata: {
        reviewRequestId: request.id,
        operationType: request.operationType,
        requesterAdminUserId: request.requesterAdminUserId,
        reviewerAdminUserId: input.reviewerAdminUserId
      }
    });

    return request;
  }

  private requirePending(reviewRequestId: string): AdminReviewRequest {
    const request = this.store.adminReviewRequestsById.get(reviewRequestId);
    if (!request) {
      throw new Error("REVIEW_NOT_FOUND");
    }
    if (request.status !== "pending") {
      throw new Error("REVIEW_NOT_PENDING");
    }
    return request;
  }
}
