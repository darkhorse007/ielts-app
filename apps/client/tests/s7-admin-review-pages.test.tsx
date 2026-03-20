import { beforeEach, describe, expect, test, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { AdminConsolePage } from "../src/pages/AdminConsolePage";

describe("S7 admin review page", () => {
  beforeEach(() => {
    localStorage.clear();
  });

  test("supports report export/download and dual-review/content workflows", async () => {
    const adminLogin = vi.fn().mockResolvedValue({
      access_token: "admin-token",
      expires_in: 3600,
      admin_user_id: "a-1",
      email: "admin@example.com",
      display_name: "Admin",
      roles: ["super_admin"],
      menus: ["orders", "entitlements", "users", "content", "audit"]
    });
    const getAdminOrders = vi.fn().mockResolvedValue({
      total: 0,
      page: 1,
      page_size: 20,
      items: []
    });
    const adjustAdminEntitlement = vi.fn().mockResolvedValue({
      entitlement: {
        entitlement_id: "e-1",
        user_id: "u-1",
        tier: "pro",
        status: "active",
        daily_quota: 999,
        used_today: 0,
        remaining_today: 999,
        version: 2,
        updated_at: new Date().toISOString()
      },
      adjustment: {
        adjustment_id: "ad-1",
        user_id: "u-1",
        admin_user_id: "a-1",
        reason: "manual",
        previous_tier: "free",
        new_tier: "pro",
        rolled_back: false,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
      }
    });
    const listAdminUsers = vi.fn().mockResolvedValue({
      total: 1,
      page: 1,
      page_size: 20,
      items: [
        {
          user_id: "u-1",
          email: "u-1@example.com",
          status: "active",
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString()
        }
      ]
    });
    const freezeAdminUser = vi.fn();
    const unfreezeAdminUser = vi.fn();
    const listAdminContentItems = vi.fn().mockResolvedValue({
      total: 1,
      page: 1,
      page_size: 20,
      items: [
        {
          item_id: "c-1",
          title: "Reading Set A",
          skill: "reading",
          status: "draft",
          version: 1,
          updated_at: new Date().toISOString()
        }
      ]
    });
    const publishAdminContentItem = vi.fn();
    const unpublishAdminContentItem = vi.fn();
    const getAdminAuditLogs = vi.fn().mockResolvedValue({
      total: 0,
      page: 1,
      page_size: 20,
      items: []
    });
    const createAdminReviewRequest = vi.fn().mockResolvedValue({
      review_id: "rv-1",
      operation_type: "user_freeze",
      status: "pending",
      requester_admin_user_id: "a-1",
      requester_roles: ["super_admin"],
      payload: {},
      requested_at: new Date().toISOString()
    });
    const listAdminReviewRequests = vi.fn().mockResolvedValue({
      total: 1,
      page: 1,
      page_size: 20,
      items: [
        {
          review_id: "rv-1",
          operation_type: "user_freeze",
          status: "pending",
          requester_admin_user_id: "a-1",
          requester_roles: ["super_admin"],
          payload: {},
          requested_at: new Date().toISOString()
        }
      ]
    });
    const approveAdminReviewRequest = vi.fn().mockResolvedValue({
      review_id: "rv-1",
      operation_type: "user_freeze",
      status: "approved",
      requester_admin_user_id: "a-1",
      requester_roles: ["super_admin"],
      payload: {},
      requested_at: new Date().toISOString(),
      reviewed_at: new Date().toISOString(),
      reviewer_admin_user_id: "a-2"
    });
    const rejectAdminReviewRequest = vi.fn().mockResolvedValue({
      review_id: "rv-1",
      operation_type: "user_freeze",
      status: "rejected",
      requester_admin_user_id: "a-1",
      requester_roles: ["super_admin"],
      payload: {},
      requested_at: new Date().toISOString(),
      reviewed_at: new Date().toISOString(),
      reviewer_admin_user_id: "a-2"
    });
    const importAdminContentBatch = vi.fn().mockResolvedValue({
      batch_id: "batch-1",
      template_version: "template-v1",
      atomic: false,
      status: "completed",
      total_count: 2,
      imported_count: 2,
      failed_count: 0,
      imported_items: [
        {
          item_id: "c-import-1",
          title: "Imported Reading",
          skill: "reading",
          status: "draft",
          review_status: "pending",
          version: 1
        }
      ],
      failed_items: [],
      rollback_item_ids: [],
      created_at: new Date().toISOString()
    });
    const reviewAdminContentItem = vi.fn().mockResolvedValue({
      item_id: "c-import-1",
      status: "published",
      review_status: "approved",
      published: true,
      version: 2,
      updated_at: new Date().toISOString()
    });
    const rollbackAdminContentImportBatch = vi.fn().mockResolvedValue({
      batch_id: "batch-1",
      status: "rolled_back",
      rolled_back_item_ids: ["c-import-1"],
      rollback_count: 1,
      updated_at: new Date().toISOString()
    });
    const exportAdminReport = vi.fn().mockResolvedValue({
      export_id: "exp-1",
      report_type: "operation",
      row_count: 3,
      masked_fields: ["actor_email_masked", "target_user_id_masked"],
      filename: "operation-report.csv",
      generated_at: new Date().toISOString(),
      download_url: "/v1/admin/reports/exports/exp-1/download"
    });
    const downloadAdminReport = vi.fn().mockResolvedValue({
      export_id: "exp-1",
      report_type: "operation",
      filename: "operation-report.csv",
      content: "csv-content",
      row_count: 4,
      download_count: 1,
      last_downloaded_at: new Date().toISOString()
    });

    render(
      <AdminConsolePage
        apiClient={{
          adminLogin,
          getAdminOrders,
          adjustAdminEntitlement,
          listAdminUsers,
          freezeAdminUser,
          unfreezeAdminUser,
          listAdminContentItems,
          publishAdminContentItem,
          unpublishAdminContentItem,
          getAdminAuditLogs,
          createAdminReviewRequest,
          listAdminReviewRequests,
          approveAdminReviewRequest,
          rejectAdminReviewRequest,
          importAdminContentBatch,
          reviewAdminContentItem,
          rollbackAdminContentImportBatch,
          exportAdminReport,
          downloadAdminReport
        }}
      />
    );

    fireEvent.click(screen.getByRole("button", { name: "后台登录" }));
    await waitFor(() => {
      expect(adminLogin).toHaveBeenCalledTimes(1);
    });

    fireEvent.click(screen.getByRole("button", { name: "查询用户" }));
    await waitFor(() => {
      expect(listAdminUsers).toHaveBeenCalledTimes(1);
      expect(screen.getByDisplayValue("u-1")).toBeInTheDocument();
    });

    fireEvent.click(screen.getByRole("button", { name: "提交复核请求" }));
    await waitFor(() => {
      expect(createAdminReviewRequest).toHaveBeenCalledTimes(1);
      expect(screen.getByDisplayValue("rv-1")).toBeInTheDocument();
    });

    fireEvent.click(screen.getByRole("button", { name: "查询待审批" }));
    await waitFor(() => {
      expect(listAdminReviewRequests).toHaveBeenCalledTimes(1);
      expect(screen.getByText(/pending_review_count: 1/)).toBeInTheDocument();
    });

    fireEvent.click(screen.getByRole("button", { name: "通过复核" }));
    await waitFor(() => {
      expect(approveAdminReviewRequest).toHaveBeenCalledTimes(1);
    });

    fireEvent.click(screen.getByRole("button", { name: "驳回复核" }));
    await waitFor(() => {
      expect(rejectAdminReviewRequest).toHaveBeenCalledTimes(1);
    });

    fireEvent.click(screen.getByRole("button", { name: "批量导入内容" }));
    await waitFor(() => {
      expect(importAdminContentBatch).toHaveBeenCalledTimes(1);
      expect(screen.getByDisplayValue("batch-1")).toBeInTheDocument();
      expect(screen.getByDisplayValue("c-import-1")).toBeInTheDocument();
    });

    fireEvent.click(screen.getByRole("button", { name: "审核内容" }));
    await waitFor(() => {
      expect(reviewAdminContentItem).toHaveBeenCalledTimes(1);
      expect(screen.getByText(/managed_content_version: 2/)).toBeInTheDocument();
    });

    fireEvent.click(screen.getByRole("button", { name: "回滚导入批次" }));
    await waitFor(() => {
      expect(rollbackAdminContentImportBatch).toHaveBeenCalledTimes(1);
    });

    fireEvent.click(screen.getByRole("button", { name: "导出报表" }));
    await waitFor(() => {
      expect(exportAdminReport).toHaveBeenCalledTimes(1);
      expect(exportAdminReport).toHaveBeenCalledWith("admin-token", {
        report_type: "operation"
      });
      expect(screen.getByDisplayValue("exp-1")).toBeInTheDocument();
      expect(screen.getByText(/report_row_count: 3/)).toBeInTheDocument();
    });

    fireEvent.click(screen.getByRole("button", { name: "下载报表" }));
    await waitFor(() => {
      expect(downloadAdminReport).toHaveBeenCalledTimes(1);
      expect(downloadAdminReport).toHaveBeenCalledWith("admin-token", "exp-1");
      expect(screen.getByText(/report_row_count: 4/)).toBeInTheDocument();
    });
  });
});
