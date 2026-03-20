import { describe, expect, test, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { TokenStorage } from "../src/lib/token-storage";
import { MockExamPage } from "../src/pages/MockExamPage";
import { SubscriptionPage } from "../src/pages/SubscriptionPage";
import { AdminConsolePage } from "../src/pages/AdminConsolePage";

describe("S5 mock exam/subscription/admin pages", () => {
  test("supports mock exam flow with report load and undo", async () => {
    const tokenStorage = new TokenStorage();
    tokenStorage.save({
      accessToken: "access",
      refreshToken: "refresh",
      expiresIn: 900,
      userId: "u-1"
    });

    const createMockExam = vi.fn().mockResolvedValue({
      exam_id: "m-1",
      status: "in_progress",
      time_limit_seconds: 7200,
      elapsed_seconds: 10,
      remaining_seconds: 7190,
      current_skill: "reading",
      sections: []
    });
    const getMockExam = vi.fn().mockResolvedValue({
      exam_id: "m-1",
      status: "in_progress",
      time_limit_seconds: 7200,
      elapsed_seconds: 20,
      remaining_seconds: 7180,
      current_skill: "speaking",
      sections: []
    });
    const saveMockExamProgress = vi.fn().mockResolvedValue({
      exam_id: "m-1",
      status: "in_progress",
      time_limit_seconds: 7200,
      elapsed_seconds: 30,
      remaining_seconds: 7170,
      current_skill: "speaking",
      sections: []
    });
    const recoverMockExam = vi.fn().mockResolvedValue({
      exam_id: "m-1",
      status: "in_progress",
      time_limit_seconds: 7200,
      elapsed_seconds: 30,
      remaining_seconds: 7170,
      current_skill: "speaking",
      sections: [],
      recovered: true
    });
    const submitMockExam = vi.fn().mockResolvedValue({
      exam: {
        exam_id: "m-1",
        status: "completed",
        time_limit_seconds: 7200,
        elapsed_seconds: 3000,
        remaining_seconds: 4200,
        current_skill: "writing",
        sections: []
      },
      report: {
        report_id: "r-1",
        exam_id: "m-1",
        total_estimated_band: 6,
        skill_band_estimates: {
          listening: 6,
          speaking: 6,
          reading: 6,
          writing: 6
        },
        error_distribution: {
          listening: 12,
          speaking: 12,
          reading: 12,
          writing: 12
        },
        next_actions: ["a1"],
        generated_at: new Date().toISOString(),
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
      }
    });
    const getMockExamReport = vi.fn().mockResolvedValue({
      report_id: "r-1",
      exam_id: "m-1",
      total_estimated_band: 6,
      skill_band_estimates: {
        listening: 6,
        speaking: 6,
        reading: 6,
        writing: 6
      },
      error_distribution: {
        listening: 12,
        speaking: 12,
        reading: 12,
        writing: 12
      },
      next_actions: ["a1"],
      generated_at: new Date().toISOString(),
      plan_writeback: {
        applied: true,
        reasons: ["r1"],
        undo_available: true,
        changed_tasks: []
      },
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString()
    });
    const undoMockExamWriteback = vi.fn().mockResolvedValue({
      report_id: "r-1",
      exam_id: "m-1",
      total_estimated_band: 6,
      skill_band_estimates: {
        listening: 6,
        speaking: 6,
        reading: 6,
        writing: 6
      },
      error_distribution: {
        listening: 12,
        speaking: 12,
        reading: 12,
        writing: 12
      },
      next_actions: ["a1"],
      generated_at: new Date().toISOString(),
      plan_writeback: {
        applied: true,
        reasons: ["r1"],
        undo_available: false,
        changed_tasks: []
      },
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString()
    });
    const exportMockExamReport = vi.fn().mockResolvedValue({
      filename: "report.txt",
      content: "mock report content"
    });

    render(
      <MockExamPage
        apiClient={{
          createMockExam,
          getMockExam,
          saveMockExamProgress,
          recoverMockExam,
          submitMockExam,
          getMockExamReport,
          undoMockExamWriteback,
          exportMockExamReport
        }}
        tokenStorage={tokenStorage}
      />
    );

    fireEvent.click(screen.getByRole("button", { name: "创建模考" }));
    await waitFor(() => {
      expect(createMockExam).toHaveBeenCalledTimes(1);
      expect(screen.getByText(/exam_id: m-1/)).toBeInTheDocument();
    });

    fireEvent.click(screen.getByRole("button", { name: "拉取模考状态" }));
    await waitFor(() => {
      expect(getMockExam).toHaveBeenCalledTimes(1);
    });

    fireEvent.click(screen.getByRole("button", { name: "保存进度" }));
    await waitFor(() => {
      expect(saveMockExamProgress).toHaveBeenCalledTimes(1);
    });

    fireEvent.click(screen.getByRole("button", { name: "恢复模考" }));
    await waitFor(() => {
      expect(recoverMockExam).toHaveBeenCalledTimes(1);
    });

    fireEvent.click(screen.getByRole("button", { name: "提交整场模考" }));
    await waitFor(() => {
      expect(submitMockExam).toHaveBeenCalledTimes(1);
    });

    fireEvent.click(screen.getByRole("button", { name: "加载复盘报告" }));
    await waitFor(() => {
      expect(getMockExamReport).toHaveBeenCalledTimes(1);
    });

    fireEvent.click(screen.getByRole("button", { name: "撤销计划回写" }));
    await waitFor(() => {
      expect(undoMockExamWriteback).toHaveBeenCalledTimes(1);
    });

    fireEvent.click(screen.getByRole("button", { name: "导出报告" }));

    await waitFor(() => {
      expect(exportMockExamReport).toHaveBeenCalledTimes(1);
      expect(screen.getByText(/status: 已导出报告 report.txt/)).toBeInTheDocument();
    });
  });

  test("supports subscription upgrade webhook cancel resume", async () => {
    const tokenStorage = new TokenStorage();
    tokenStorage.save({
      accessToken: "access",
      refreshToken: "refresh",
      expiresIn: 900,
      userId: "u-1"
    });

    const getEntitlement = vi.fn().mockResolvedValue({
      entitlement_id: "e-1",
      tier: "free",
      status: "active",
      daily_quota: 3,
      used_today: 1,
      remaining_today: 2,
      quota_date: "2026-02-26",
      auto_renew: false,
      version: 1,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString()
    });
    const upgradeSubscription = vi.fn().mockResolvedValue({
      order_id: "o-1",
      plan_code: "pro_monthly",
      provider: "mockpay",
      status: "created",
      list_price_cny: 108,
      discount_cny: 21,
      payable_amount_cny: 87,
      paid_amount_cny: 0,
      refunded_amount_cny: 0,
      coupon_code: "IELTS20",
      amount_cny: 87,
      payment_token: "token",
      payment_retry_supported: true,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString()
    });
    const sendPaymentWebhook = vi
      .fn()
      .mockResolvedValueOnce({
        idempotent: false,
        order: {
          order_id: "o-1",
          plan_code: "pro_monthly",
          provider: "mockpay",
          status: "paid",
          list_price_cny: 108,
          discount_cny: 21,
          payable_amount_cny: 87,
          paid_amount_cny: 87,
          refunded_amount_cny: 0,
          coupon_code: "IELTS20",
          amount_cny: 87,
          payment_token: "token",
          payment_retry_supported: true,
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString()
        },
        entitlement: {
          entitlement_id: "e-1",
          tier: "pro",
          status: "active",
          daily_quota: 999,
          used_today: 1,
          remaining_today: 998,
          quota_date: "2026-02-26",
          auto_renew: true,
          version: 2,
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString()
        }
      })
      .mockResolvedValueOnce({
        idempotent: false,
        order: {
          order_id: "o-1",
          plan_code: "pro_monthly",
          provider: "mockpay",
          status: "refunded",
          list_price_cny: 108,
          discount_cny: 21,
          payable_amount_cny: 87,
          paid_amount_cny: 87,
          refunded_amount_cny: 87,
          coupon_code: "IELTS20",
          amount_cny: 87,
          payment_token: "token",
          payment_retry_supported: true,
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString()
        },
        entitlement: {
          entitlement_id: "e-1",
          tier: "free",
          status: "active",
          daily_quota: 3,
          used_today: 1,
          remaining_today: 2,
          quota_date: "2026-02-26",
          auto_renew: false,
          version: 3,
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString()
        }
      });
    const cancelSubscription = vi.fn().mockResolvedValue({
      entitlement_id: "e-1",
      tier: "pro",
      status: "cancelled",
      daily_quota: 999,
      used_today: 1,
      remaining_today: 998,
      quota_date: "2026-02-26",
      auto_renew: false,
      version: 3,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString()
    });
    const resumeSubscription = vi.fn().mockResolvedValue({
      entitlement_id: "e-1",
      tier: "pro",
      status: "active",
      daily_quota: 999,
      used_today: 1,
      remaining_today: 998,
      quota_date: "2026-02-26",
      auto_renew: true,
      version: 4,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString()
    });
    const createFamilyInvitation = vi.fn().mockResolvedValue({
      invitation_id: "inv-1",
      invitee_user_id: "u-2",
      status: "pending",
      created_at: new Date().toISOString(),
      group: {
        group_id: "g-1",
        owner_user_id: "u-1",
        seat_limit: 2,
        used_seats: 1,
        available_seats: 1,
        status: "active",
        member_user_ids: [],
        updated_at: new Date().toISOString()
      }
    });
    const acceptFamilyInvitation = vi.fn().mockResolvedValue({
      invitation_id: "inv-1",
      status: "accepted",
      accepted_at: new Date().toISOString(),
      group: {
        group_id: "g-1",
        owner_user_id: "u-1",
        seat_limit: 2,
        used_seats: 2,
        available_seats: 0,
        status: "active",
        member_user_ids: ["u-2"],
        updated_at: new Date().toISOString()
      },
      entitlement: {
        entitlement_id: "e-2",
        tier: "family_member",
        status: "active",
        daily_quota: 999,
        used_today: 0,
        remaining_today: 999,
        quota_date: "2026-02-26",
        auto_renew: false,
        version: 1,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
      }
    });
    const getFamilyMembers = vi.fn().mockResolvedValue({
      group: {
        group_id: "g-1",
        owner_user_id: "u-1",
        seat_limit: 2,
        used_seats: 2,
        available_seats: 0,
        status: "active",
        member_user_ids: ["u-2"],
        updated_at: new Date().toISOString()
      },
      members: [
        {
          user_id: "u-1",
          tier: "family_owner",
          status: "active"
        },
        {
          user_id: "u-2",
          tier: "family_member",
          status: "active"
        }
      ]
    });
    const removeFamilyMember = vi.fn().mockResolvedValue({
      removed_user_id: "u-2",
      group: {
        group_id: "g-1",
        owner_user_id: "u-1",
        seat_limit: 2,
        used_seats: 1,
        available_seats: 1,
        status: "active",
        member_user_ids: [],
        updated_at: new Date().toISOString()
      }
    });

    render(
      <SubscriptionPage
        apiClient={{
          getEntitlement,
          upgradeSubscription,
          cancelSubscription,
          resumeSubscription,
          sendPaymentWebhook,
          createFamilyInvitation,
          acceptFamilyInvitation,
          getFamilyMembers,
          removeFamilyMember
        }}
        tokenStorage={tokenStorage}
      />
    );

    fireEvent.click(screen.getByRole("button", { name: "加载权益" }));
    await waitFor(() => {
      expect(getEntitlement).toHaveBeenCalledTimes(1);
    });

    fireEvent.change(screen.getByLabelText("优惠券码"), {
      target: {
        value: "IELTS20"
      }
    });
    fireEvent.click(screen.getByRole("button", { name: "创建升级订单" }));
    await waitFor(() => {
      expect(upgradeSubscription).toHaveBeenCalledTimes(1);
      expect(screen.getByText(/order_id: o-1/)).toBeInTheDocument();
      expect(upgradeSubscription).toHaveBeenCalledWith("access", {
        plan_code: "pro_monthly",
        provider: "mockpay",
        coupon_code: "IELTS20"
      });
    });

    fireEvent.click(screen.getByRole("button", { name: "模拟支付成功回调" }));
    await waitFor(() => {
      expect(sendPaymentWebhook).toHaveBeenCalledTimes(1);
    });

    fireEvent.click(screen.getByRole("button", { name: "模拟退款回调" }));
    await waitFor(() => {
      expect(sendPaymentWebhook).toHaveBeenCalledTimes(2);
      expect(screen.getByText(/status: 退款回调已处理/)).toBeInTheDocument();
    });

    fireEvent.click(screen.getByRole("button", { name: "取消续费" }));
    await waitFor(() => {
      expect(cancelSubscription).toHaveBeenCalledTimes(1);
    });

    fireEvent.click(screen.getByRole("button", { name: "恢复续费" }));

    await waitFor(() => {
      expect(resumeSubscription).toHaveBeenCalledTimes(1);
      expect(screen.getByText(/status: 已恢复续费/)).toBeInTheDocument();
    });

    fireEvent.change(screen.getByLabelText("被邀请用户ID"), {
      target: {
        value: "u-2"
      }
    });
    fireEvent.click(screen.getByRole("button", { name: "创建家庭邀请" }));
    await waitFor(() => {
      expect(createFamilyInvitation).toHaveBeenCalledTimes(1);
    });

    fireEvent.click(screen.getByRole("button", { name: "接受家庭邀请" }));
    await waitFor(() => {
      expect(acceptFamilyInvitation).toHaveBeenCalledTimes(1);
    });

    fireEvent.click(screen.getByRole("button", { name: "加载家庭成员" }));
    await waitFor(() => {
      expect(getFamilyMembers).toHaveBeenCalledTimes(1);
    });

    fireEvent.change(screen.getByLabelText("移除成员用户ID"), {
      target: {
        value: "u-2"
      }
    });
    fireEvent.click(screen.getByRole("button", { name: "移除家庭成员" }));
    await waitFor(() => {
      expect(removeFamilyMember).toHaveBeenCalledTimes(1);
    });
  });

  test("supports admin login order query and entitlement adjustment rollback", async () => {
    const adminLogin = vi.fn().mockResolvedValue({
      access_token: "admin-token",
      expires_in: 3600,
      admin_user_id: "a-1",
      email: "finance@example.com",
      display_name: "Finance Admin",
      roles: ["finance"],
      menus: ["orders", "entitlements"]
    });
    const getAdminOrders = vi.fn().mockResolvedValue({
      total: 2,
      page: 1,
      page_size: 20,
      items: []
    });
    const adjustAdminEntitlement = vi
      .fn()
      .mockResolvedValueOnce({
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
          reason: "r1",
          previous_tier: "free",
          new_tier: "pro",
          rolled_back: false,
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString()
        }
      })
      .mockResolvedValueOnce({
        entitlement: {
          entitlement_id: "e-1",
          user_id: "u-1",
          tier: "free",
          status: "active",
          daily_quota: 3,
          used_today: 0,
          remaining_today: 3,
          version: 3,
          updated_at: new Date().toISOString()
        },
        adjustment: {
          adjustment_id: "ad-2",
          user_id: "u-1",
          admin_user_id: "a-1",
          reason: "r2",
          previous_tier: "pro",
          new_tier: "free",
          rollback_of_adjustment_id: "ad-1",
          rolled_back: false,
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString()
        }
      });

    render(
      <AdminConsolePage
        apiClient={{
          adminLogin,
          getAdminOrders,
          adjustAdminEntitlement,
          listAdminUsers: vi.fn(),
          freezeAdminUser: vi.fn(),
          unfreezeAdminUser: vi.fn(),
          listAdminContentItems: vi.fn(),
          publishAdminContentItem: vi.fn(),
          unpublishAdminContentItem: vi.fn(),
          getAdminAuditLogs: vi.fn()
        }}
      />
    );

    fireEvent.click(screen.getByRole("button", { name: "后台登录" }));
    await waitFor(() => {
      expect(adminLogin).toHaveBeenCalledTimes(1);
    });

    fireEvent.click(screen.getByRole("button", { name: "查询订单" }));
    await waitFor(() => {
      expect(getAdminOrders).toHaveBeenCalledTimes(1);
      expect(screen.getByText(/order_count: 2/)).toBeInTheDocument();
    });

    fireEvent.change(screen.getByLabelText("目标用户ID"), {
      target: {
        value: "u-1"
      }
    });
    fireEvent.click(screen.getByRole("button", { name: "校正权益" }));
    await waitFor(() => {
      expect(adjustAdminEntitlement).toHaveBeenCalledTimes(1);
      expect(screen.getByText(/adjustment_id: ad-1/)).toBeInTheDocument();
    });

    fireEvent.click(screen.getByRole("button", { name: "回滚一次" }));
    await waitFor(() => {
      expect(adjustAdminEntitlement).toHaveBeenCalledTimes(2);
      expect(screen.getByText(/status: 已回滚 adjustment=ad-1/)).toBeInTheDocument();
    });
  });
});
