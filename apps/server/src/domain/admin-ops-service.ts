import { randomUUID } from "node:crypto";
import { appendAudit } from "./audit.js";
import { nowIso } from "./time.js";
import { InMemoryStore } from "./store.js";
import type { AuthService } from "./auth-service.js";
import type { AdminRoleCode, AdminReportExport, AdminReportType, ContentImportBatch, ContentItem, ContentSkill, User } from "./types.js";

const inTimeRange = (createdAt: string, fromAt?: string, toAt?: string): boolean => {
  const value = new Date(createdAt).getTime();
  if (Number.isNaN(value)) {
    return false;
  }
  if (fromAt && value < new Date(fromAt).getTime()) {
    return false;
  }
  if (toAt && value > new Date(toAt).getTime()) {
    return false;
  }
  return true;
};

const csvEscape = (value: string): string => `"${value.replaceAll("\"", "\"\"")}"`;

export class AdminOpsService {
  constructor(
    private readonly store: InMemoryStore,
    private readonly authService: AuthService
  ) {
    this.seedContentIfNeeded();
  }

  listUsers(input?: {
    email?: string;
    phone?: string;
    status?: "active" | "frozen" | "pending_deletion" | "deleted";
    page?: number;
    pageSize?: number;
  }): {
    items: User[];
    total: number;
    page: number;
    pageSize: number;
  } {
    const page = Math.max(1, input?.page ?? 1);
    const pageSize = Math.max(1, Math.min(100, input?.pageSize ?? 20));
    const users = Array.from(this.store.usersById.values())
      .filter((item) =>
        input?.email ? (item.email ?? "").toLowerCase().includes(input.email.trim().toLowerCase()) : true
      )
      .filter((item) => (input?.phone ? (item.phone ?? "").includes(input.phone.trim()) : true))
      .filter((item) => (input?.status ? item.status === input.status : true))
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
    const start = (page - 1) * pageSize;
    return {
      items: users.slice(start, start + pageSize),
      total: users.length,
      page,
      pageSize
    };
  }

  freezeUser(input: {
    userId: string;
    adminUserId: string;
    reason: string;
  }): {
    user: User;
    revokedSessions: number;
  } {
    const user = this.store.usersById.get(input.userId);
    if (!user) {
      throw new Error("USER_NOT_FOUND");
    }
    if (user.status === "deleted") {
      throw new Error("USER_ALREADY_DELETED");
    }
    if (user.status === "frozen") {
      return {
        user,
        revokedSessions: 0
      };
    }

    const revokedSessions = this.authService.revokeAllSessionsForUser(input.userId);
    user.status = "frozen";
    user.frozenAt = nowIso();
    user.updatedAt = nowIso();
    this.store.usersById.set(user.id, user);

    appendAudit(this.store, "admin_user_frozen", {
      userId: input.userId,
      metadata: {
        adminUserId: input.adminUserId,
        reason: input.reason,
        revokedSessions
      }
    });

    return {
      user,
      revokedSessions
    };
  }

  unfreezeUser(input: {
    userId: string;
    adminUserId: string;
    reason: string;
  }): User {
    const user = this.store.usersById.get(input.userId);
    if (!user) {
      throw new Error("USER_NOT_FOUND");
    }
    if (user.status === "deleted") {
      throw new Error("USER_ALREADY_DELETED");
    }

    user.status = "active";
    user.unfrozenAt = nowIso();
    user.updatedAt = nowIso();
    this.store.usersById.set(user.id, user);

    appendAudit(this.store, "admin_user_unfrozen", {
      userId: input.userId,
      metadata: {
        adminUserId: input.adminUserId,
        reason: input.reason
      }
    });

    return user;
  }

  listContent(input?: {
    skill?: ContentSkill;
    status?: "draft" | "published" | "unpublished";
    page?: number;
    pageSize?: number;
  }): {
    items: ContentItem[];
    total: number;
    page: number;
    pageSize: number;
  } {
    const page = Math.max(1, input?.page ?? 1);
    const pageSize = Math.max(1, Math.min(100, input?.pageSize ?? 20));
    const content = Array.from(this.store.contentItemsById.values())
      .filter((item) => (input?.skill ? item.skill === input.skill : true))
      .filter((item) => (input?.status ? item.status === input.status : true))
      .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
    const start = (page - 1) * pageSize;
    return {
      items: content.slice(start, start + pageSize),
      total: content.length,
      page,
      pageSize
    };
  }

  importContentBatch(input: {
    adminUserId: string;
    templateVersion: string;
    atomic?: boolean;
    items: Array<{
      title: string;
      skill: ContentSkill;
      payload: Record<string, unknown>;
    }>;
  }): {
    batch: ContentImportBatch;
    importedItems: ContentItem[];
    failedItems: Array<{
      index: number;
      title?: string;
      errorCode: string;
      errorMessage: string;
    }>;
  } {
    const atomic = Boolean(input.atomic);
    const batchId = randomUUID();
    const importedItems: ContentItem[] = [];
    const failedItems: Array<{
      index: number;
      title?: string;
      errorCode: string;
      errorMessage: string;
    }> = [];

    for (let index = 0; index < input.items.length; index += 1) {
      const item = input.items[index];
      const title = item.title.trim();
      const questionCount = item.payload.question_count;
      const duplicate = Array.from(this.store.contentItemsById.values()).some(
        (existing) => existing.title === title && existing.skill === item.skill
      );

      if (!title) {
        failedItems.push({
          index,
          title: item.title,
          errorCode: "CONTENT_IMPORT_EMPTY_TITLE",
          errorMessage: "title is required"
        });
        continue;
      }
      if (!Number.isInteger(questionCount) || Number(questionCount) <= 0) {
        failedItems.push({
          index,
          title,
          errorCode: "CONTENT_IMPORT_INVALID_QUESTION_COUNT",
          errorMessage: "payload.question_count must be a positive integer"
        });
        continue;
      }
      if (duplicate) {
        failedItems.push({
          index,
          title,
          errorCode: "CONTENT_IMPORT_DUPLICATE",
          errorMessage: "same title+skill already exists"
        });
        continue;
      }

      const imported: ContentItem = {
        id: randomUUID(),
        title,
        skill: item.skill,
        status: "draft",
        reviewStatus: "pending",
        reviewHistory: [],
        version: 1,
        sourceType: "batch_import",
        importBatchId: batchId,
        currentPayload: item.payload,
        publishHistory: [],
        createdAt: nowIso(),
        updatedAt: nowIso()
      };
      this.store.contentItemsById.set(imported.id, imported);
      importedItems.push(imported);
    }

    let rollbackItemIds: string[] = [];
    let status: ContentImportBatch["status"] = "completed";
    if (atomic && failedItems.length > 0 && importedItems.length > 0) {
      rollbackItemIds = importedItems.map((item) => item.id);
      for (const itemId of rollbackItemIds) {
        this.store.contentItemsById.delete(itemId);
      }
      status = "rolled_back";
    }

    const batch: ContentImportBatch = {
      id: batchId,
      templateVersion: input.templateVersion,
      createdByAdminUserId: input.adminUserId,
      atomic,
      totalCount: input.items.length,
      importedItemIds: importedItems.map((item) => item.id),
      failedItems,
      rollbackItemIds,
      status,
      createdAt: nowIso(),
      updatedAt: nowIso()
    };
    this.store.contentImportBatchesById.set(batch.id, batch);

    appendAudit(this.store, "admin_content_batch_imported", {
      metadata: {
        batchId: batch.id,
        templateVersion: input.templateVersion,
        adminUserId: input.adminUserId,
        totalCount: batch.totalCount,
        importedCount: importedItems.length,
        failedCount: failedItems.length,
        atomic,
        rolledBack: rollbackItemIds.length > 0
      }
    });

    return {
      batch,
      importedItems: rollbackItemIds.length > 0 ? [] : importedItems,
      failedItems
    };
  }

  reviewContent(input: {
    itemId: string;
    adminUserId: string;
    decision: "approve" | "reject";
    note?: string;
    autoPublish?: boolean;
    simulateFailure?: boolean;
  }): {
    item: ContentItem;
    published: boolean;
  } {
    const item = this.store.contentItemsById.get(input.itemId);
    if (!item) {
      throw new Error("CONTENT_NOT_FOUND");
    }
    if (item.reviewStatus !== "pending") {
      throw new Error("CONTENT_REVIEW_NOT_PENDING");
    }

    item.reviewStatus = input.decision === "approve" ? "approved" : "rejected";
    item.reviewHistory.push({
      id: randomUUID(),
      decision: input.decision,
      reviewerAdminUserId: input.adminUserId,
      note: input.note,
      createdAt: nowIso()
    });
    item.updatedAt = nowIso();

    appendAudit(this.store, "admin_content_reviewed", {
      metadata: {
        itemId: item.id,
        decision: input.decision,
        adminUserId: input.adminUserId
      }
    });

    if (input.decision === "approve" && (input.autoPublish ?? true)) {
      const published = this.publishContent({
        itemId: input.itemId,
        adminUserId: input.adminUserId,
        note: input.note,
        simulateFailure: input.simulateFailure
      });
      return {
        item: published,
        published: true
      };
    }

    return {
      item,
      published: false
    };
  }

  rollbackImportBatch(input: {
    batchId: string;
    adminUserId: string;
    itemIds?: string[];
  }): {
    batch: ContentImportBatch;
    rolledBackItemIds: string[];
  } {
    const batch = this.store.contentImportBatchesById.get(input.batchId);
    if (!batch) {
      throw new Error("CONTENT_IMPORT_BATCH_NOT_FOUND");
    }
    const requested = input.itemIds?.length ? input.itemIds : batch.importedItemIds;
    const targetIds = requested.filter((itemId) => batch.importedItemIds.includes(itemId));
    if (targetIds.length === 0) {
      throw new Error("CONTENT_IMPORT_BATCH_EMPTY");
    }

    for (const itemId of targetIds) {
      const item = this.store.contentItemsById.get(itemId);
      if (item && item.status === "published") {
        throw new Error("CONTENT_IMPORT_ROLLBACK_FORBIDDEN_PUBLISHED");
      }
    }

    const rolledBackItemIds: string[] = [];
    for (const itemId of targetIds) {
      if (!batch.rollbackItemIds.includes(itemId)) {
        batch.rollbackItemIds.push(itemId);
      }
      if (this.store.contentItemsById.has(itemId)) {
        this.store.contentItemsById.delete(itemId);
      }
      rolledBackItemIds.push(itemId);
    }

    batch.status = batch.rollbackItemIds.length >= batch.importedItemIds.length ? "rolled_back" : "partial_rolled_back";
    batch.updatedAt = nowIso();

    appendAudit(this.store, "admin_content_batch_rolled_back", {
      metadata: {
        batchId: batch.id,
        adminUserId: input.adminUserId,
        rolledBackCount: rolledBackItemIds.length
      }
    });

    return {
      batch,
      rolledBackItemIds
    };
  }

  exportReport(input: {
    adminUserId: string;
    reportType: AdminReportType;
    fromAt?: string;
    toAt?: string;
    role?: AdminRoleCode;
  }): AdminReportExport {
    if (input.fromAt && input.toAt && new Date(input.fromAt).getTime() > new Date(input.toAt).getTime()) {
      throw new Error("REPORT_RANGE_INVALID");
    }

    if (input.reportType === "operation") {
      const header = ["created_at", "event_type", "actor_role", "actor_email_masked", "target_user_id_masked"];
      const lines = [header.map(csvEscape).join(",")];
      let rowCount = 0;

      for (const event of this.store.auditEvents) {
        if (!inTimeRange(event.createdAt, input.fromAt, input.toAt)) {
          continue;
        }
        const actorAdminUserId = String(event.metadata.adminUserId ?? event.metadata.operatorAdminUserId ?? "");
        const actor = actorAdminUserId ? this.store.adminUsersById.get(actorAdminUserId) : undefined;
        const actorRole = actor?.roles[0];
        if (input.role && actorRole !== input.role) {
          continue;
        }
        lines.push(
          [
            event.createdAt,
            event.type,
            actorRole ?? "-",
            this.maskEmail(actor?.email),
            this.maskId(event.userId)
          ]
            .map(csvEscape)
            .join(",")
        );
        rowCount += 1;
      }

      const exported: AdminReportExport = {
        id: randomUUID(),
        reportType: input.reportType,
        createdByAdminUserId: input.adminUserId,
        filter: {
          fromAt: input.fromAt,
          toAt: input.toAt,
          role: input.role
        },
        rowCount,
        maskedFields: ["actor_email_masked", "target_user_id_masked"],
        filename: `operation-report-${Date.now()}.csv`,
        content: lines.join("\n"),
        createdAt: nowIso(),
        downloadCount: 0
      };
      this.store.adminReportExportsById.set(exported.id, exported);

      appendAudit(this.store, "admin_report_exported", {
        metadata: {
          exportId: exported.id,
          reportType: exported.reportType,
          rowCount: exported.rowCount,
          adminUserId: input.adminUserId
        }
      });

      return exported;
    }

    const header = [
      "created_at",
      "record_type",
      "actor_role",
      "user_id_masked",
      "order_or_adjustment_id",
      "amount_or_delta",
      "status"
    ];
    const lines = [header.map(csvEscape).join(",")];
    let rowCount = 0;

    for (const order of this.store.subscriptionOrdersById.values()) {
      if (!inTimeRange(order.createdAt, input.fromAt, input.toAt)) {
        continue;
      }
      if (input.role && input.role !== "finance") {
        continue;
      }
      lines.push(
        [
          order.createdAt,
          "order",
          "finance",
          this.maskId(order.userId),
          order.id,
          String(order.payableAmountCny),
          order.status
        ]
          .map(csvEscape)
          .join(",")
      );
      rowCount += 1;
    }

    for (const adjustment of this.store.adminEntitlementAdjustmentsById.values()) {
      if (!inTimeRange(adjustment.createdAt, input.fromAt, input.toAt)) {
        continue;
      }
      const actor = this.store.adminUsersById.get(adjustment.adminUserId);
      const actorRole = actor?.roles[0] ?? "finance";
      if (input.role && actorRole !== input.role) {
        continue;
      }
      lines.push(
        [
          adjustment.createdAt,
          "entitlement_adjustment",
          actorRole,
          this.maskId(adjustment.userId),
          adjustment.id,
          String(adjustment.deltaDays ?? 0),
          adjustment.rolledBack ? "rolled_back" : "applied"
        ]
          .map(csvEscape)
          .join(",")
      );
      rowCount += 1;
    }

    const exported: AdminReportExport = {
      id: randomUUID(),
      reportType: input.reportType,
      createdByAdminUserId: input.adminUserId,
      filter: {
        fromAt: input.fromAt,
        toAt: input.toAt,
        role: input.role
      },
      rowCount,
      maskedFields: ["user_id_masked"],
      filename: `business-report-${Date.now()}.csv`,
      content: lines.join("\n"),
      createdAt: nowIso(),
      downloadCount: 0
    };
    this.store.adminReportExportsById.set(exported.id, exported);

    appendAudit(this.store, "admin_report_exported", {
      metadata: {
        exportId: exported.id,
        reportType: exported.reportType,
        rowCount: exported.rowCount,
        adminUserId: input.adminUserId
      }
    });

    return exported;
  }

  downloadReportExport(input: {
    exportId: string;
    adminUserId: string;
  }): AdminReportExport {
    const exported = this.store.adminReportExportsById.get(input.exportId);
    if (!exported) {
      throw new Error("REPORT_EXPORT_NOT_FOUND");
    }
    exported.lastDownloadedAt = nowIso();
    exported.downloadCount += 1;

    appendAudit(this.store, "admin_report_downloaded", {
      metadata: {
        exportId: exported.id,
        reportType: exported.reportType,
        adminUserId: input.adminUserId,
        downloadCount: exported.downloadCount
      }
    });

    return exported;
  }

  publishContent(input: {
    itemId: string;
    adminUserId: string;
    note?: string;
    simulateFailure?: boolean;
  }): ContentItem {
    const item = this.store.contentItemsById.get(input.itemId);
    if (!item) {
      throw new Error("CONTENT_NOT_FOUND");
    }
    if (item.reviewStatus !== "approved") {
      throw new Error("CONTENT_REVIEW_REQUIRED");
    }

    const previousSnapshot = {
      status: item.status,
      version: item.version,
      payload: item.currentPayload
    };

    item.version += 1;
    item.status = "published";
    item.lastPublishedPayload = item.currentPayload;
    item.lastPublishedAt = nowIso();
    item.lastOperatorAdminUserId = input.adminUserId;
    item.updatedAt = nowIso();
    item.publishHistory.push({
      id: randomUUID(),
      action: "publish",
      version: item.version,
      operatorAdminUserId: input.adminUserId,
      note: input.note,
      createdAt: nowIso()
    });

    appendAudit(this.store, "admin_content_published", {
      metadata: {
        itemId: item.id,
        version: item.version,
        adminUserId: input.adminUserId
      }
    });

    if (input.simulateFailure) {
      item.status = previousSnapshot.status;
      item.version = previousSnapshot.version;
      item.currentPayload = previousSnapshot.payload;
      item.lastRollbackAt = nowIso();
      item.updatedAt = nowIso();
      item.publishHistory.push({
        id: randomUUID(),
        action: "rollback",
        version: item.version,
        operatorAdminUserId: input.adminUserId,
        note: "publish rollback due to simulated failure",
        createdAt: nowIso()
      });

      appendAudit(this.store, "admin_content_publish_rollback", {
        metadata: {
          itemId: item.id,
          adminUserId: input.adminUserId
        }
      });
      throw new Error("CONTENT_PUBLISH_FAILED_ROLLED_BACK");
    }

    return item;
  }

  unpublishContent(input: {
    itemId: string;
    adminUserId: string;
    note?: string;
  }): ContentItem {
    const item = this.store.contentItemsById.get(input.itemId);
    if (!item) {
      throw new Error("CONTENT_NOT_FOUND");
    }

    item.version += 1;
    item.status = "unpublished";
    item.lastOperatorAdminUserId = input.adminUserId;
    item.updatedAt = nowIso();
    item.publishHistory.push({
      id: randomUUID(),
      action: "unpublish",
      version: item.version,
      operatorAdminUserId: input.adminUserId,
      note: input.note,
      createdAt: nowIso()
    });

    appendAudit(this.store, "admin_content_unpublished", {
      metadata: {
        itemId: item.id,
        version: item.version,
        adminUserId: input.adminUserId
      }
    });

    return item;
  }

  queryAuditLogs(input?: {
    type?: string;
    userId?: string;
    actorAdminUserId?: string;
    page?: number;
    pageSize?: number;
  }): {
    items: Array<{
      id: string;
      type: string;
      userId?: string;
      createdAt: string;
      metadata: Record<string, unknown>;
    }>;
    total: number;
    page: number;
    pageSize: number;
  } {
    const page = Math.max(1, input?.page ?? 1);
    const pageSize = Math.max(1, Math.min(100, input?.pageSize ?? 20));
    const filtered = this.store.auditEvents
      .filter((item) => (input?.type ? item.type === input.type : true))
      .filter((item) => (input?.userId ? item.userId === input.userId : true))
      .filter((item) =>
        input?.actorAdminUserId
          ? String(item.metadata.adminUserId ?? item.metadata.operatorAdminUserId ?? "") === input.actorAdminUserId
          : true
      )
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt));

    appendAudit(this.store, "admin_audit_logs_queried", {
      metadata: {
        type: input?.type,
        userId: input?.userId,
        actorAdminUserId: input?.actorAdminUserId,
        total: filtered.length
      }
    });

    const start = (page - 1) * pageSize;
    return {
      items: filtered.slice(start, start + pageSize).map((item) => ({
        id: item.id,
        type: item.type,
        userId: item.userId,
        createdAt: item.createdAt,
        metadata: item.metadata
      })),
      total: filtered.length,
      page,
      pageSize
    };
  }

  private seedContentIfNeeded(): void {
    if (this.store.contentItemsById.size > 0) {
      return;
    }
    const now = nowIso();
    const items: ContentItem[] = [
      {
        id: randomUUID(),
        title: "Reading Passage Set A",
        skill: "reading",
        status: "draft",
        reviewStatus: "approved",
        reviewHistory: [],
        version: 1,
        sourceType: "manual",
        currentPayload: {
          question_count: 40
        },
        publishHistory: [],
        createdAt: now,
        updatedAt: now
      },
      {
        id: randomUUID(),
        title: "Listening Map Label Pack",
        skill: "listening",
        status: "draft",
        reviewStatus: "approved",
        reviewHistory: [],
        version: 1,
        sourceType: "manual",
        currentPayload: {
          question_count: 20
        },
        publishHistory: [],
        createdAt: now,
        updatedAt: now
      }
    ];
    for (const item of items) {
      this.store.contentItemsById.set(item.id, item);
    }
  }

  private maskEmail(email?: string): string {
    if (!email || !email.includes("@")) {
      return "-";
    }
    const [local, domain] = email.split("@");
    if (!local) {
      return `***@${domain}`;
    }
    if (local.length <= 2) {
      return `${local[0] ?? "*"}***@${domain}`;
    }
    return `${local.slice(0, 1)}***${local.slice(-1)}@${domain}`;
  }

  private maskId(value?: string): string {
    if (!value) {
      return "-";
    }
    if (value.length <= 8) {
      return `${value.slice(0, 2)}***`;
    }
    return `${value.slice(0, 4)}***${value.slice(-4)}`;
  }
}
