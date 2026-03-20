import { useState } from "react";
import type { ApiClient } from "../lib/api-client";

type AdminConsolePageProps = {
  apiClient: Pick<
    ApiClient,
    | "adminLogin"
    | "getAdminOrders"
    | "adjustAdminEntitlement"
    | "listAdminUsers"
    | "freezeAdminUser"
    | "unfreezeAdminUser"
    | "listAdminContentItems"
    | "publishAdminContentItem"
    | "unpublishAdminContentItem"
    | "getAdminAuditLogs"
  > &
    Partial<
      Pick<
        ApiClient,
        | "createAdminReviewRequest"
        | "listAdminReviewRequests"
        | "approveAdminReviewRequest"
        | "rejectAdminReviewRequest"
        | "importAdminContentBatch"
        | "reviewAdminContentItem"
        | "rollbackAdminContentImportBatch"
        | "exportAdminReport"
        | "downloadAdminReport"
      >
    >;
};

type UserStatusFilter = "" | "active" | "frozen" | "pending_deletion" | "deleted";
type ContentSkillFilter = "" | "listening" | "speaking" | "reading" | "writing";
type ContentStatusFilter = "" | "draft" | "published" | "unpublished";
type ReviewOperation = "user_freeze" | "entitlement_adjust" | "content_publish";
type ContentReviewDecision = "approve" | "reject";
type ReportType = "operation" | "business";

export const AdminConsolePage = ({ apiClient }: AdminConsolePageProps) => {
  const [email, setEmail] = useState("admin@example.com");
  const [password, setPassword] = useState("AdminPass123");
  const [adminToken, setAdminToken] = useState("");
  const [menusText, setMenusText] = useState("-");

  const [targetUserId, setTargetUserId] = useState("");
  const [orderCount, setOrderCount] = useState(0);
  const [adjustmentId, setAdjustmentId] = useState("");

  const [userFilterEmail, setUserFilterEmail] = useState("");
  const [userFilterPhone, setUserFilterPhone] = useState("");
  const [userFilterStatus, setUserFilterStatus] = useState<UserStatusFilter>("");
  const [managedUserId, setManagedUserId] = useState("");
  const [userCount, setUserCount] = useState(0);
  const [managedUserStatus, setManagedUserStatus] = useState("-");

  const [contentFilterSkill, setContentFilterSkill] = useState<ContentSkillFilter>("");
  const [contentFilterStatus, setContentFilterStatus] = useState<ContentStatusFilter>("");
  const [managedContentId, setManagedContentId] = useState("");
  const [contentCount, setContentCount] = useState(0);
  const [managedContentVersion, setManagedContentVersion] = useState(0);
  const [simulatePublishFailure, setSimulatePublishFailure] = useState(false);
  const [contentReviewDecision, setContentReviewDecision] = useState<ContentReviewDecision>("approve");
  const [importTemplateVersion, setImportTemplateVersion] = useState("template-v1");
  const [importBatchId, setImportBatchId] = useState("");
  const [importFailedCount, setImportFailedCount] = useState(0);
  const [importAtomic, setImportAtomic] = useState(false);
  const [reportType, setReportType] = useState<ReportType>("operation");
  const [reportExportId, setReportExportId] = useState("");
  const [reportRowCount, setReportRowCount] = useState(0);

  const [reviewOperation, setReviewOperation] = useState<ReviewOperation>("user_freeze");
  const [reviewRequestReason, setReviewRequestReason] = useState("manual risk operation requires approval");
  const [reviewId, setReviewId] = useState("");
  const [reviewComment, setReviewComment] = useState("approved by second reviewer");
  const [pendingReviewCount, setPendingReviewCount] = useState(0);

  const [auditType, setAuditType] = useState("");
  const [auditCount, setAuditCount] = useState(0);

  const [status, setStatus] = useState("未开始");
  const [error, setError] = useState<string | null>(null);

  const ensureAdminToken = (): string => {
    if (!adminToken) {
      throw new Error("请先完成后台登录");
    }
    return adminToken;
  };

  const login = async (): Promise<void> => {
    try {
      const result = await apiClient.adminLogin({
        email,
        password
      });
      setAdminToken(result.access_token);
      setMenusText(result.menus.join(" | "));
      setStatus("后台登录成功");
      setError(null);
    } catch (loginError) {
      setError(loginError instanceof Error ? loginError.message : "后台登录失败");
    }
  };

  const loadOrders = async (): Promise<void> => {
    try {
      const result = await apiClient.getAdminOrders(ensureAdminToken(), {
        page: 1,
        page_size: 20
      });
      setOrderCount(result.total);
      setStatus("已加载订单列表");
      setError(null);
    } catch (orderError) {
      setError(orderError instanceof Error ? orderError.message : "加载订单失败");
    }
  };

  const adjustEntitlement = async (): Promise<void> => {
    if (!targetUserId.trim()) {
      setError("请填写目标 user_id");
      return;
    }
    try {
      const result = await apiClient.adjustAdminEntitlement(ensureAdminToken(), targetUserId.trim(), {
        reason: "manual correction by admin console",
        set_tier: "pro",
        delta_days: 30
      });
      setAdjustmentId(result.adjustment.adjustment_id);
      setStatus(`权益校正成功，tier=${result.entitlement.tier}`);
      setError(null);
    } catch (adjustError) {
      setError(adjustError instanceof Error ? adjustError.message : "权益校正失败");
    }
  };

  const rollback = async (): Promise<void> => {
    if (!targetUserId.trim() || !adjustmentId.trim()) {
      setError("请先执行一次权益校正");
      return;
    }
    try {
      const result = await apiClient.adjustAdminEntitlement(ensureAdminToken(), targetUserId.trim(), {
        reason: "rollback the previous adjustment",
        rollback_of_adjustment_id: adjustmentId.trim()
      });
      setStatus(`已回滚 adjustment=${result.adjustment.rollback_of_adjustment_id}`);
      setError(null);
    } catch (rollbackError) {
      setError(rollbackError instanceof Error ? rollbackError.message : "回滚失败");
    }
  };

  const loadUsers = async (): Promise<void> => {
    try {
      const result = await apiClient.listAdminUsers(ensureAdminToken(), {
        email: userFilterEmail.trim() || undefined,
        phone: userFilterPhone.trim() || undefined,
        status: userFilterStatus || undefined,
        page: 1,
        page_size: 20
      });
      setUserCount(result.total);
      const first = result.items[0];
      if (first) {
        setManagedUserId(first.user_id);
        setManagedUserStatus(first.status);
      } else {
        setManagedUserId("");
        setManagedUserStatus("-");
      }
      setStatus("已加载用户列表");
      setError(null);
    } catch (usersError) {
      setError(usersError instanceof Error ? usersError.message : "加载用户失败");
    }
  };

  const freezeUser = async (): Promise<void> => {
    if (!managedUserId.trim()) {
      setError("请先选择 user_id");
      return;
    }
    try {
      const result = await apiClient.freezeAdminUser(ensureAdminToken(), managedUserId.trim(), "risk control freeze");
      setManagedUserStatus(result.status);
      setStatus(`用户冻结完成 status=${result.status}`);
      setError(null);
    } catch (freezeError) {
      setError(freezeError instanceof Error ? freezeError.message : "冻结失败");
    }
  };

  const unfreezeUser = async (): Promise<void> => {
    if (!managedUserId.trim()) {
      setError("请先选择 user_id");
      return;
    }
    try {
      const result = await apiClient.unfreezeAdminUser(ensureAdminToken(), managedUserId.trim(), "manual unfreeze");
      setManagedUserStatus(result.status);
      setStatus(`用户解冻完成 status=${result.status}`);
      setError(null);
    } catch (unfreezeError) {
      setError(unfreezeError instanceof Error ? unfreezeError.message : "解冻失败");
    }
  };

  const loadContentItems = async (): Promise<void> => {
    try {
      const result = await apiClient.listAdminContentItems(ensureAdminToken(), {
        skill: contentFilterSkill || undefined,
        status: contentFilterStatus || undefined,
        page: 1,
        page_size: 20
      });
      setContentCount(result.total);
      const first = result.items[0];
      if (first) {
        setManagedContentId(first.item_id);
        setManagedContentVersion(first.version);
      } else {
        setManagedContentId("");
        setManagedContentVersion(0);
      }
      setStatus("已加载内容列表");
      setError(null);
    } catch (contentError) {
      setError(contentError instanceof Error ? contentError.message : "加载内容失败");
    }
  };

  const publishContent = async (): Promise<void> => {
    if (!managedContentId.trim()) {
      setError("请先选择 item_id");
      return;
    }
    try {
      const result = await apiClient.publishAdminContentItem(ensureAdminToken(), managedContentId.trim(), {
        note: "publish by admin console",
        simulate_failure: simulatePublishFailure
      });
      setManagedContentVersion(result.version);
      setStatus(`内容发布完成 status=${result.status}`);
      setError(null);
    } catch (publishError) {
      setError(publishError instanceof Error ? publishError.message : "发布失败");
    }
  };

  const unpublishContent = async (): Promise<void> => {
    if (!managedContentId.trim()) {
      setError("请先选择 item_id");
      return;
    }
    try {
      const result = await apiClient.unpublishAdminContentItem(ensureAdminToken(), managedContentId.trim(), {
        note: "unpublish by admin console"
      });
      setManagedContentVersion(result.version);
      setStatus(`内容下架完成 status=${result.status}`);
      setError(null);
    } catch (unpublishError) {
      setError(unpublishError instanceof Error ? unpublishError.message : "下架失败");
    }
  };

  const importContentBatch = async (): Promise<void> => {
    if (!apiClient.importAdminContentBatch) {
      setError("当前客户端未接入内容批量导入接口");
      return;
    }
    try {
      const result = await apiClient.importAdminContentBatch(ensureAdminToken(), {
        template_version: importTemplateVersion.trim() || "template-v1",
        atomic: importAtomic,
        items: [
          {
            title: `Imported Reading ${Date.now()}`,
            skill: "reading",
            payload: {
              question_count: 12,
              difficulty: "medium"
            }
          },
          {
            title: `Imported Listening ${Date.now()}`,
            skill: "listening",
            payload: {
              question_count: 10,
              difficulty: "medium"
            }
          }
        ]
      });
      setImportBatchId(result.batch_id);
      setImportFailedCount(result.failed_count);
      const first = result.imported_items[0];
      if (first) {
        setManagedContentId(first.item_id);
        setManagedContentVersion(first.version);
      }
      setStatus(`批量导入完成 imported=${result.imported_count}; failed=${result.failed_count}`);
      setError(null);
    } catch (importError) {
      setError(importError instanceof Error ? importError.message : "批量导入失败");
    }
  };

  const reviewContent = async (): Promise<void> => {
    if (!apiClient.reviewAdminContentItem) {
      setError("当前客户端未接入内容审核接口");
      return;
    }
    if (!managedContentId.trim()) {
      setError("请先选择 item_id");
      return;
    }
    try {
      const result = await apiClient.reviewAdminContentItem(ensureAdminToken(), managedContentId.trim(), {
        decision: contentReviewDecision,
        note: "review by admin console",
        auto_publish: contentReviewDecision === "approve",
        simulate_failure: simulatePublishFailure
      });
      setManagedContentVersion(result.version);
      setStatus(`内容审核完成 review=${result.review_status ?? "-"}; published=${result.published}`);
      setError(null);
    } catch (reviewError) {
      setError(reviewError instanceof Error ? reviewError.message : "内容审核失败");
    }
  };

  const rollbackImportBatch = async (): Promise<void> => {
    if (!apiClient.rollbackAdminContentImportBatch) {
      setError("当前客户端未接入导入回滚接口");
      return;
    }
    if (!importBatchId.trim()) {
      setError("请先填写 batch_id");
      return;
    }
    try {
      const result = await apiClient.rollbackAdminContentImportBatch(ensureAdminToken(), importBatchId.trim());
      setStatus(`导入回滚完成 count=${result.rollback_count}`);
      setError(null);
    } catch (rollbackError) {
      setError(rollbackError instanceof Error ? rollbackError.message : "导入回滚失败");
    }
  };

  const exportReport = async (): Promise<void> => {
    if (!apiClient.exportAdminReport) {
      setError("当前客户端未接入报表导出接口");
      return;
    }
    try {
      const result = await apiClient.exportAdminReport(ensureAdminToken(), {
        report_type: reportType
      });
      setReportExportId(result.export_id);
      setReportRowCount(result.row_count);
      setStatus(`报表导出完成 export=${result.export_id}`);
      setError(null);
    } catch (reportError) {
      setError(reportError instanceof Error ? reportError.message : "报表导出失败");
    }
  };

  const downloadReport = async (): Promise<void> => {
    if (!apiClient.downloadAdminReport) {
      setError("当前客户端未接入报表下载接口");
      return;
    }
    if (!reportExportId.trim()) {
      setError("请先生成 export_id");
      return;
    }
    try {
      const result = await apiClient.downloadAdminReport(ensureAdminToken(), reportExportId.trim());
      setReportRowCount(result.row_count);
      setStatus(`报表下载完成 filename=${result.filename}`);
      setError(null);
    } catch (reportError) {
      setError(reportError instanceof Error ? reportError.message : "报表下载失败");
    }
  };

  const loadAuditLogs = async (): Promise<void> => {
    try {
      const result = await apiClient.getAdminAuditLogs(ensureAdminToken(), {
        type: auditType.trim() || undefined,
        page: 1,
        page_size: 20
      });
      setAuditCount(result.total);
      setStatus("已加载审计日志");
      setError(null);
    } catch (auditError) {
      setError(auditError instanceof Error ? auditError.message : "加载审计日志失败");
    }
  };

  const submitReviewRequest = async (): Promise<void> => {
    if (!apiClient.createAdminReviewRequest) {
      setError("当前客户端未接入双人复核接口");
      return;
    }

    try {
      let payload:
        | {
            operation_type: "user_freeze";
            request_reason: string;
            target_user_id: string;
            freeze: {
              reason: string;
            };
          }
        | {
            operation_type: "entitlement_adjust";
            request_reason: string;
            target_user_id: string;
            entitlement_adjust: {
              reason: string;
              set_tier: "free" | "pro";
              delta_days: number;
            };
          }
        | {
            operation_type: "content_publish";
            request_reason: string;
            target_content_item_id: string;
            content_publish: {
              note: string;
              simulate_failure: boolean;
            };
          };

      if (reviewOperation === "user_freeze") {
        if (!managedUserId.trim()) {
          setError("请先选择 user_id");
          return;
        }
        payload = {
          operation_type: "user_freeze",
          request_reason: reviewRequestReason.trim() || "risk control requires dual review",
          target_user_id: managedUserId.trim(),
          freeze: {
            reason: "risk control freeze"
          }
        };
      } else if (reviewOperation === "entitlement_adjust") {
        if (!targetUserId.trim()) {
          setError("请先填写目标 user_id");
          return;
        }
        payload = {
          operation_type: "entitlement_adjust",
          request_reason: reviewRequestReason.trim() || "entitlement correction requires dual review",
          target_user_id: targetUserId.trim(),
          entitlement_adjust: {
            reason: "manual correction by dual review",
            set_tier: "pro",
            delta_days: 30
          }
        };
      } else {
        if (!managedContentId.trim()) {
          setError("请先选择 item_id");
          return;
        }
        payload = {
          operation_type: "content_publish",
          request_reason: reviewRequestReason.trim() || "content publish requires dual review",
          target_content_item_id: managedContentId.trim(),
          content_publish: {
            note: "publish by dual review",
            simulate_failure: simulatePublishFailure
          }
        };
      }

      const result = await apiClient.createAdminReviewRequest(ensureAdminToken(), payload);
      setReviewId(result.review_id);
      setStatus(`已提交复核请求 review=${result.review_id}`);
      setError(null);
    } catch (reviewError) {
      setError(reviewError instanceof Error ? reviewError.message : "提交复核请求失败");
    }
  };

  const loadPendingReviews = async (): Promise<void> => {
    if (!apiClient.listAdminReviewRequests) {
      setError("当前客户端未接入双人复核接口");
      return;
    }
    try {
      const result = await apiClient.listAdminReviewRequests(ensureAdminToken(), {
        status: "pending",
        page: 1,
        page_size: 20
      });
      setPendingReviewCount(result.total);
      if (!reviewId && result.items[0]) {
        setReviewId(result.items[0].review_id);
      }
      setStatus("已加载待审批请求");
      setError(null);
    } catch (reviewError) {
      setError(reviewError instanceof Error ? reviewError.message : "加载复核请求失败");
    }
  };

  const approveReview = async (): Promise<void> => {
    if (!apiClient.approveAdminReviewRequest) {
      setError("当前客户端未接入双人复核接口");
      return;
    }
    if (!reviewId.trim()) {
      setError("请填写 review_id");
      return;
    }
    try {
      const result = await apiClient.approveAdminReviewRequest(ensureAdminToken(), reviewId.trim(), {
        comment: reviewComment.trim() || undefined
      });
      setStatus(`复核通过 status=${result.status}`);
      setError(null);
    } catch (reviewError) {
      setError(reviewError instanceof Error ? reviewError.message : "审批失败");
    }
  };

  const rejectReview = async (): Promise<void> => {
    if (!apiClient.rejectAdminReviewRequest) {
      setError("当前客户端未接入双人复核接口");
      return;
    }
    if (!reviewId.trim()) {
      setError("请填写 review_id");
      return;
    }
    if (!reviewComment.trim()) {
      setError("请填写驳回原因");
      return;
    }
    try {
      const result = await apiClient.rejectAdminReviewRequest(ensureAdminToken(), reviewId.trim(), {
        comment: reviewComment.trim()
      });
      setStatus(`复核驳回 status=${result.status}`);
      setError(null);
    } catch (reviewError) {
      setError(reviewError instanceof Error ? reviewError.message : "驳回失败");
    }
  };

  return (
    <section>
      <h1>后台登录与订单权益管理</h1>
      {error ? <p role="alert">{error}</p> : null}

      <label htmlFor="admin-email">后台邮箱</label>
      <input id="admin-email" value={email} onChange={(event) => setEmail(event.target.value)} />

      <label htmlFor="admin-password">后台密码</label>
      <input id="admin-password" value={password} onChange={(event) => setPassword(event.target.value)} />

      <button type="button" onClick={() => void login()}>
        后台登录
      </button>
      <button type="button" onClick={() => void loadOrders()}>
        查询订单
      </button>

      <label htmlFor="target-user-id">目标用户ID</label>
      <input id="target-user-id" value={targetUserId} onChange={(event) => setTargetUserId(event.target.value)} />
      <button type="button" onClick={() => void adjustEntitlement()}>
        校正权益
      </button>
      <button type="button" onClick={() => void rollback()}>
        回滚一次
      </button>

      <h2>用户管理</h2>
      <label htmlFor="user-filter-email">用户邮箱筛选</label>
      <input
        id="user-filter-email"
        value={userFilterEmail}
        onChange={(event) => setUserFilterEmail(event.target.value)}
      />
      <label htmlFor="user-filter-phone">用户手机号筛选</label>
      <input
        id="user-filter-phone"
        value={userFilterPhone}
        onChange={(event) => setUserFilterPhone(event.target.value)}
      />
      <label htmlFor="user-filter-status">用户状态筛选</label>
      <select
        id="user-filter-status"
        value={userFilterStatus}
        onChange={(event) => setUserFilterStatus(event.target.value as UserStatusFilter)}
      >
        <option value="">全部</option>
        <option value="active">active</option>
        <option value="frozen">frozen</option>
        <option value="pending_deletion">pending_deletion</option>
        <option value="deleted">deleted</option>
      </select>
      <button type="button" onClick={() => void loadUsers()}>
        查询用户
      </button>

      <label htmlFor="managed-user-id">操作用户ID</label>
      <input id="managed-user-id" value={managedUserId} onChange={(event) => setManagedUserId(event.target.value)} />
      <button type="button" onClick={() => void freezeUser()}>
        冻结用户
      </button>
      <button type="button" onClick={() => void unfreezeUser()}>
        解冻用户
      </button>

      <h2>内容管理</h2>
      <label htmlFor="content-filter-skill">内容科目筛选</label>
      <select
        id="content-filter-skill"
        value={contentFilterSkill}
        onChange={(event) => setContentFilterSkill(event.target.value as ContentSkillFilter)}
      >
        <option value="">全部</option>
        <option value="listening">listening</option>
        <option value="speaking">speaking</option>
        <option value="reading">reading</option>
        <option value="writing">writing</option>
      </select>

      <label htmlFor="content-filter-status">内容状态筛选</label>
      <select
        id="content-filter-status"
        value={contentFilterStatus}
        onChange={(event) => setContentFilterStatus(event.target.value as ContentStatusFilter)}
      >
        <option value="">全部</option>
        <option value="draft">draft</option>
        <option value="published">published</option>
        <option value="unpublished">unpublished</option>
      </select>
      <button type="button" onClick={() => void loadContentItems()}>
        查询内容
      </button>

      <label htmlFor="import-template-version">导入模板版本</label>
      <input
        id="import-template-version"
        value={importTemplateVersion}
        onChange={(event) => setImportTemplateVersion(event.target.value)}
      />
      <label htmlFor="import-atomic">导入失败全量回滚</label>
      <input id="import-atomic" type="checkbox" checked={importAtomic} onChange={(event) => setImportAtomic(event.target.checked)} />
      <button type="button" onClick={() => void importContentBatch()}>
        批量导入内容
      </button>

      <label htmlFor="managed-content-id">操作内容ID</label>
      <input
        id="managed-content-id"
        value={managedContentId}
        onChange={(event) => setManagedContentId(event.target.value)}
      />
      <label htmlFor="simulate-publish-failure">模拟发布失败</label>
      <input
        id="simulate-publish-failure"
        type="checkbox"
        checked={simulatePublishFailure}
        onChange={(event) => setSimulatePublishFailure(event.target.checked)}
      />
      <button type="button" onClick={() => void publishContent()}>
        发布内容
      </button>
      <button type="button" onClick={() => void unpublishContent()}>
        下架内容
      </button>
      <label htmlFor="content-review-decision">审核决定</label>
      <select
        id="content-review-decision"
        value={contentReviewDecision}
        onChange={(event) => setContentReviewDecision(event.target.value as ContentReviewDecision)}
      >
        <option value="approve">approve</option>
        <option value="reject">reject</option>
      </select>
      <button type="button" onClick={() => void reviewContent()}>
        审核内容
      </button>

      <label htmlFor="import-batch-id">导入批次ID</label>
      <input id="import-batch-id" value={importBatchId} onChange={(event) => setImportBatchId(event.target.value)} />
      <button type="button" onClick={() => void rollbackImportBatch()}>
        回滚导入批次
      </button>

      <h2>审计日志</h2>
      <h2>报表导出</h2>
      <label htmlFor="report-type">报表类型</label>
      <select id="report-type" value={reportType} onChange={(event) => setReportType(event.target.value as ReportType)}>
        <option value="operation">operation</option>
        <option value="business">business</option>
      </select>
      <button type="button" onClick={() => void exportReport()}>
        导出报表
      </button>
      <label htmlFor="report-export-id">报表export_id</label>
      <input
        id="report-export-id"
        value={reportExportId}
        onChange={(event) => setReportExportId(event.target.value)}
      />
      <button type="button" onClick={() => void downloadReport()}>
        下载报表
      </button>

      <h2>双人复核</h2>
      <label htmlFor="review-operation">复核操作</label>
      <select
        id="review-operation"
        value={reviewOperation}
        onChange={(event) => setReviewOperation(event.target.value as ReviewOperation)}
      >
        <option value="user_freeze">user_freeze</option>
        <option value="entitlement_adjust">entitlement_adjust</option>
        <option value="content_publish">content_publish</option>
      </select>
      <label htmlFor="review-request-reason">申请原因</label>
      <input
        id="review-request-reason"
        value={reviewRequestReason}
        onChange={(event) => setReviewRequestReason(event.target.value)}
      />
      <button type="button" onClick={() => void submitReviewRequest()}>
        提交复核请求
      </button>
      <button type="button" onClick={() => void loadPendingReviews()}>
        查询待审批
      </button>

      <label htmlFor="review-id">review_id</label>
      <input id="review-id" value={reviewId} onChange={(event) => setReviewId(event.target.value)} />
      <label htmlFor="review-comment">审批/驳回备注</label>
      <input id="review-comment" value={reviewComment} onChange={(event) => setReviewComment(event.target.value)} />
      <button type="button" onClick={() => void approveReview()}>
        通过复核
      </button>
      <button type="button" onClick={() => void rejectReview()}>
        驳回复核
      </button>

      <label htmlFor="audit-type">审计类型筛选</label>
      <input id="audit-type" value={auditType} onChange={(event) => setAuditType(event.target.value)} />
      <button type="button" onClick={() => void loadAuditLogs()}>
        查询审计日志
      </button>

      <p>menus: {menusText}</p>
      <p>order_count: {orderCount}</p>
      <p>adjustment_id: {adjustmentId || "-"}</p>
      <p>user_count: {userCount}</p>
      <p>managed_user_status: {managedUserStatus}</p>
      <p>content_count: {contentCount}</p>
      <p>managed_content_version: {managedContentVersion}</p>
      <p>import_batch_id: {importBatchId || "-"}</p>
      <p>import_failed_count: {importFailedCount}</p>
      <p>report_export_id: {reportExportId || "-"}</p>
      <p>report_row_count: {reportRowCount}</p>
      <p>pending_review_count: {pendingReviewCount}</p>
      <p>audit_count: {auditCount}</p>
      <p>status: {status}</p>
    </section>
  );
};
