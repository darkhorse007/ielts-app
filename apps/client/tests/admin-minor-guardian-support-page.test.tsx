import { beforeEach, describe, expect, test, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { AdminMinorGuardianSupportPage } from "../src/pages/AdminMinorGuardianSupportPage";
import type {
  InternalMinorGuardianSupportRequestListResponse,
  InternalMinorGuardianSupportRequestResponse
} from "../src/lib/api-types";
import { TokenStorage } from "../src/lib/token-storage";

beforeEach(() => {
  localStorage.clear();
});

const SAVED_QUEUE_VIEWS_STORAGE_KEY = "ielts.admin_minor_guardian_support.saved_views";

const buildRequest = (
  overrides: Partial<InternalMinorGuardianSupportRequestResponse> & { request_id: string }
): InternalMinorGuardianSupportRequestResponse => ({
  request_id: overrides.request_id,
  user_id: overrides.user_id ?? `user-${overrides.request_id}`,
  user_email: overrides.user_email ?? `${overrides.request_id}@example.com`,
  user_phone: overrides.user_phone,
  user_display_name: overrides.user_display_name,
  user_status: overrides.user_status ?? "active",
  minor_guardian_age_band: overrides.minor_guardian_age_band ?? "under_18",
  topic: overrides.topic ?? "usage_concern",
  contact_channel: overrides.contact_channel ?? "email",
  contact_value: overrides.contact_value ?? overrides.user_email ?? `${overrides.request_id}@example.com`,
  message: overrides.message ?? "需要客服联系监护人确认学习保护策略。",
  status: overrides.status ?? "pending_review",
  created_at: overrides.created_at ?? "2026-04-03T10:00:00.000Z",
  updated_at: overrides.updated_at ?? "2026-04-03T10:00:00.000Z",
  resolved_at: overrides.resolved_at,
  handled_by: overrides.handled_by,
  operator_note: overrides.operator_note,
  last_activity_at: overrides.last_activity_at ?? overrides.updated_at ?? "2026-04-03T10:00:00.000Z",
  queue_wait_minutes: overrides.queue_wait_minutes ?? 30,
  sla_target_minutes: overrides.sla_target_minutes ?? ((overrides.status ?? "pending_review") === "contacted" ? 1440 : (overrides.status ?? "pending_review") === "closed" ? undefined : 120),
  sla_state: overrides.sla_state ?? ((overrides.status ?? "pending_review") === "closed" ? "closed" : "within_sla"),
  sla_breached: overrides.sla_breached ?? false
});

const buildListResponse = (input: {
  items: InternalMinorGuardianSupportRequestResponse[];
  total_count?: number;
  page?: number;
  page_size?: number;
  has_next_page?: boolean;
  ordered_by?: InternalMinorGuardianSupportRequestListResponse["ordered_by"];
  status_summary?: InternalMinorGuardianSupportRequestListResponse["status_summary"];
  dashboard_summary?: InternalMinorGuardianSupportRequestListResponse["dashboard_summary"];
}): InternalMinorGuardianSupportRequestListResponse => ({
  total_count: input.total_count ?? input.items.length,
  page: input.page ?? 1,
  page_size: input.page_size ?? 10,
  has_next_page: input.has_next_page ?? false,
  ordered_by: input.ordered_by ?? "updated_at_desc",
  status_summary: input.status_summary ?? {
    pending_review: input.items.filter((item) => item.status === "pending_review").length,
    contacted: input.items.filter((item) => item.status === "contacted").length,
    closed: input.items.filter((item) => item.status === "closed").length
  },
  sla_summary: {
    within_sla: input.items.filter((item) => item.sla_state === "within_sla").length,
    due_soon: input.items.filter((item) => item.sla_state === "due_soon").length,
    breached: input.items.filter((item) => item.sla_state === "breached").length
  },
  dashboard_summary: input.dashboard_summary ?? {
    open_count: input.items.filter((item) => item.status !== "closed").length,
    assigned_open_count: input.items.filter(
      (item) => item.status !== "closed" && typeof item.handled_by === "string" && item.handled_by.trim().length > 0
    ).length,
    unassigned_open_count: input.items.filter(
      (item) => item.status !== "closed" && (!item.handled_by || item.handled_by.trim().length === 0)
    ).length,
    breached_open_count: input.items.filter((item) => item.status !== "closed" && item.sla_state === "breached").length,
    due_soon_open_count: input.items.filter((item) => item.status !== "closed" && item.sla_state === "due_soon").length,
    oldest_open_wait_minutes: input.items.reduce(
      (maxWait, item) => (item.status !== "closed" && item.queue_wait_minutes > maxWait ? item.queue_wait_minutes : maxWait),
      0
    ),
    average_open_wait_minutes: (() => {
      const openItems = input.items.filter((item) => item.status !== "closed");
      if (openItems.length === 0) {
        return 0;
      }
      return Math.floor(openItems.reduce((sum, item) => sum + item.queue_wait_minutes, 0) / openItems.length);
    })()
  },
  items: input.items
});

const createTokenStorage = (): TokenStorage => {
  const tokenStorage = new TokenStorage();
  tokenStorage.save({
    accessToken: "ops-access-token",
    refreshToken: "ops-refresh-token",
    expiresIn: 900,
    userId: "ops-user-1"
  });
  return tokenStorage;
};

describe("admin minor guardian support page", () => {
  test("loads guardian requests and updates a request status", async () => {
    const tokenStorage = createTokenStorage();

    const listInternalMinorGuardianSupportRequests = vi
      .fn()
      .mockResolvedValueOnce(
        buildListResponse({
          items: [
            buildRequest({
              request_id: "guardian-request-1",
              user_id: "user-1",
              user_email: "guardian@example.com"
            })
          ]
        })
      )
      .mockResolvedValueOnce(
        buildListResponse({
          total_count: 0,
          items: []
        })
      );

    const updateInternalMinorGuardianSupportRequest = vi.fn().mockResolvedValue(
      buildRequest({
        request_id: "guardian-request-1",
        user_id: "user-1",
        user_email: "guardian@example.com",
        status: "contacted",
        updated_at: "2026-04-03T10:30:00.000Z",
        handled_by: "ops-reviewer-1",
        operator_note: "已邮件联系监护人。"
      })
    );

    render(
      <AdminMinorGuardianSupportPage
        apiClient={{
          bulkUpdateInternalMinorGuardianSupportRequests: vi.fn(),
          listInternalMinorGuardianSupportRequests,
          updateInternalMinorGuardianSupportRequest,
          exportInternalMinorGuardianSupportRequests: vi.fn()
        }}
        tokenStorage={tokenStorage}
      />
    );

    await waitFor(() => {
      expect(listInternalMinorGuardianSupportRequests).toHaveBeenCalledWith({
        accessToken: "ops-access-token",
        orderBy: "updated_at_desc",
        status: "pending_review",
        page: 1,
        pageSize: 10
      });
      expect(screen.getByText(/已加载 1 条工单，第 1\/1 页/)).toBeInTheDocument();
      expect(screen.getByText(/user_email: guardian@example.com/)).toBeInTheDocument();
    });
    await waitFor(() => {
      expect(screen.getByLabelText("处理人")).toHaveValue("ops-user-1");
    });

    fireEvent.change(screen.getByLabelText("处理人"), {
      target: {
        value: "ops-reviewer-1"
      }
    });
    fireEvent.change(screen.getByLabelText("处理备注"), {
      target: {
        value: "已邮件联系监护人。"
      }
    });
    fireEvent.click(screen.getByRole("button", { name: "保存处理结果" }));

    await waitFor(() => {
      expect(updateInternalMinorGuardianSupportRequest).toHaveBeenCalledWith(
        "ops-access-token",
        "guardian-request-1",
        {
          status: "contacted",
          handled_by: "ops-reviewer-1",
          operator_note: "已邮件联系监护人。"
        }
      );
      expect(listInternalMinorGuardianSupportRequests).toHaveBeenCalledTimes(2);
      expect(screen.getByText(/已更新为 已联系/)).toBeInTheDocument();
      expect(screen.getByText("当前筛选下暂无工单。")).toBeInTheDocument();
    });
  });

  test("searches guardian requests and applies a close template", async () => {
    const tokenStorage = createTokenStorage();

    const listInternalMinorGuardianSupportRequests = vi
      .fn()
      .mockResolvedValueOnce(
        buildListResponse({
          items: [
            buildRequest({
              request_id: "guardian-request-1",
              user_id: "user-1",
              user_email: "guardian@example.com",
              contact_channel: "phone",
              contact_value: "13800000000",
              message: "需要客服电话联系。"
            }),
            buildRequest({
              request_id: "guardian-request-2",
              user_id: "user-2",
              user_email: "guardian2@example.com",
              topic: "data_deletion",
              message: "需要了解删除流程。",
              created_at: "2026-04-03T11:00:00.000Z",
              updated_at: "2026-04-03T11:00:00.000Z"
            })
          ]
        })
      )
      .mockResolvedValueOnce(
        buildListResponse({
          items: [
            buildRequest({
              request_id: "guardian-request-2",
              user_id: "user-2",
              user_email: "guardian2@example.com",
              topic: "data_deletion",
              message: "需要了解删除流程。",
              created_at: "2026-04-03T11:00:00.000Z",
              updated_at: "2026-04-03T11:00:00.000Z"
            })
          ]
        })
      );

    const updateInternalMinorGuardianSupportRequest = vi.fn();

    render(
      <AdminMinorGuardianSupportPage
        apiClient={{
          bulkUpdateInternalMinorGuardianSupportRequests: vi.fn(),
          listInternalMinorGuardianSupportRequests,
          updateInternalMinorGuardianSupportRequest,
          exportInternalMinorGuardianSupportRequests: vi.fn()
        }}
        tokenStorage={tokenStorage}
      />
    );

    await waitFor(() => {
      expect(listInternalMinorGuardianSupportRequests).toHaveBeenCalledWith({
        accessToken: "ops-access-token",
        orderBy: "updated_at_desc",
        status: "pending_review",
        page: 1,
        pageSize: 10
      });
    });

    fireEvent.change(screen.getByLabelText("搜索监护人工单"), {
      target: {
        value: "guardian2@example.com"
      }
    });
    fireEvent.click(screen.getByRole("button", { name: "搜索工单" }));

    await waitFor(() => {
      expect(listInternalMinorGuardianSupportRequests).toHaveBeenLastCalledWith({
        accessToken: "ops-access-token",
        orderBy: "updated_at_desc",
        status: "pending_review",
        query: "guardian2@example.com",
        page: 1,
        pageSize: 10
      });
      expect(screen.getByText(/当前搜索: guardian2@example.com/)).toBeInTheDocument();
      expect(screen.getByText(/request_id: guardian-request-2/)).toBeInTheDocument();
    });

    fireEvent.click(screen.getByRole("button", { name: "填入关闭模板" }));

    await waitFor(() => {
      expect(screen.getByLabelText("更新状态")).toHaveValue("closed");
      expect(screen.getByLabelText("处理备注")).toHaveValue("已向监护人说明数据导出与删除流程，工单关闭。");
    });
  });

  test("supports single-request claim actions and next actionable navigation", async () => {
    const tokenStorage = createTokenStorage();

    const listInternalMinorGuardianSupportRequests = vi.fn().mockResolvedValue(
      buildListResponse({
        items: [
          buildRequest({
            request_id: "guardian-request-1",
            user_id: "user-1",
            user_email: "guardian1@example.com",
            contact_channel: "email",
            topic: "usage_concern",
            status: "pending_review"
          }),
          buildRequest({
            request_id: "guardian-request-2",
            user_id: "user-2",
            user_email: "guardian2@example.com",
            topic: "data_deletion",
            status: "pending_review",
            created_at: "2026-04-03T11:00:00.000Z",
            updated_at: "2026-04-03T11:00:00.000Z"
          })
        ]
      })
    );

    render(
      <AdminMinorGuardianSupportPage
        apiClient={{
          bulkUpdateInternalMinorGuardianSupportRequests: vi.fn(),
          listInternalMinorGuardianSupportRequests,
          updateInternalMinorGuardianSupportRequest: vi.fn(),
          exportInternalMinorGuardianSupportRequests: vi.fn()
        }}
        tokenStorage={tokenStorage}
      />
    );

    await waitFor(() => {
      expect(screen.getByText(/request_id: guardian-request-1/)).toBeInTheDocument();
      expect(screen.getByText("详情导航: 当前 1 / 2，下一条待处理 guardian-request-2")).toBeInTheDocument();
    });

    fireEvent.click(screen.getByRole("button", { name: "认领并联系" }));

    await waitFor(() => {
      expect(screen.getByLabelText("处理人")).toHaveValue("ops-user-1");
      expect(screen.getByLabelText("更新状态")).toHaveValue("contacted");
      expect(screen.getByLabelText("处理备注")).toHaveValue("已通过邮箱联系监护人，等待反馈。");
      expect(screen.getByText("消息: 已套用认领并联系动作 guardian-request-1")).toBeInTheDocument();
    });

    fireEvent.click(screen.getByRole("button", { name: "切到下一条待处理" }));

    await waitFor(() => {
      expect(screen.getByText(/request_id: guardian-request-2/)).toBeInTheDocument();
      expect(screen.getByText("消息: 已切换到下一条待处理工单 guardian-request-2")).toBeInTheDocument();
      expect(screen.getByText("详情导航: 当前 2 / 2，下一条待处理 guardian-request-1")).toBeInTheDocument();
    });

    fireEvent.click(screen.getByRole("button", { name: "认领并关闭" }));

    await waitFor(() => {
      expect(screen.getByLabelText("处理人")).toHaveValue("ops-user-1");
      expect(screen.getByLabelText("更新状态")).toHaveValue("closed");
      expect(screen.getByLabelText("处理备注")).toHaveValue("已向监护人说明数据导出与删除流程，工单关闭。");
      expect(screen.getByText("消息: 已套用认领并关闭动作 guardian-request-2")).toBeInTheDocument();
    });
  });

  test("supports detail quick filter linkage from selected request", async () => {
    const tokenStorage = createTokenStorage();

    const listInternalMinorGuardianSupportRequests = vi.fn(async (params?: {
      accessToken?: string;
      query?: string;
      handledBy?: string;
      status?: "pending_review" | "contacted" | "closed";
      slaState?: "within_sla" | "due_soon" | "breached";
      orderBy?: "updated_at_desc" | "sla_priority_desc" | "queue_wait_desc";
      page?: number;
      pageSize?: number;
      unassigned?: boolean;
    }) => {
      if (params?.query === "user-detail-1") {
        return buildListResponse({
          items: [
            buildRequest({
              request_id: "guardian-request-detail-root",
              user_id: "user-detail-1",
              user_email: "detail@example.com",
              handled_by: "ops-reviewer-9",
              status: "contacted",
              sla_state: "breached",
              sla_breached: true,
              queue_wait_minutes: 180
            }),
            buildRequest({
              request_id: "guardian-request-user-history",
              user_id: "user-detail-1",
              user_email: "detail-history@example.com",
              handled_by: "ops-reviewer-9",
              status: "contacted",
              sla_state: "within_sla"
            })
          ]
        });
      }
      if (params?.handledBy === "ops-reviewer-9") {
        return buildListResponse({
          items: [
            buildRequest({
              request_id: "guardian-request-detail-root",
              user_id: "user-detail-1",
              user_email: "detail@example.com",
              handled_by: "ops-reviewer-9",
              status: "contacted",
              sla_state: "breached",
              sla_breached: true,
              queue_wait_minutes: 180
            }),
            buildRequest({
              request_id: "guardian-request-handler-queue",
              user_id: "user-handler-1",
              user_email: "handler@example.com",
              handled_by: "ops-reviewer-9",
              status: "contacted",
              sla_state: "within_sla"
            })
          ]
        });
      }
      if (params?.status === "contacted") {
        return buildListResponse({
          items: [
            buildRequest({
              request_id: "guardian-request-detail-root",
              user_id: "user-detail-1",
              user_email: "detail@example.com",
              handled_by: "ops-reviewer-9",
              status: "contacted",
              sla_state: "breached",
              sla_breached: true,
              queue_wait_minutes: 180
            }),
            buildRequest({
              request_id: "guardian-request-status-queue",
              user_id: "user-status-1",
              user_email: "status@example.com",
              status: "contacted",
              handled_by: "ops-reviewer-2",
              sla_state: "within_sla"
            })
          ]
        });
      }
      if (params?.slaState === "breached" && params?.orderBy === "sla_priority_desc") {
        return buildListResponse({
          ordered_by: "sla_priority_desc",
          items: [
            buildRequest({
              request_id: "guardian-request-detail-root",
              user_id: "user-detail-1",
              user_email: "detail@example.com",
              handled_by: "ops-reviewer-9",
              status: "contacted",
              sla_state: "breached",
              sla_breached: true,
              queue_wait_minutes: 220
            }),
            buildRequest({
              request_id: "guardian-request-risk-queue",
              user_id: "user-risk-1",
              user_email: "risk@example.com",
              status: "pending_review",
              handled_by: "ops-reviewer-4",
              sla_state: "breached",
              sla_breached: true,
              queue_wait_minutes: 210
            })
          ]
        });
      }

      return buildListResponse({
        items: [
          buildRequest({
            request_id: "guardian-request-detail-root",
            user_id: "user-detail-1",
            user_email: "detail@example.com",
            handled_by: "ops-reviewer-9",
            status: "contacted",
            sla_state: "breached",
            sla_breached: true,
            queue_wait_minutes: 180
          })
        ]
      });
    });

    render(
      <AdminMinorGuardianSupportPage
        apiClient={{
          bulkUpdateInternalMinorGuardianSupportRequests: vi.fn(),
          listInternalMinorGuardianSupportRequests,
          updateInternalMinorGuardianSupportRequest: vi.fn(),
          exportInternalMinorGuardianSupportRequests: vi.fn()
        }}
        tokenStorage={tokenStorage}
      />
    );

    await waitFor(() => {
      expect(screen.getByText(/request_id: guardian-request-detail-root/)).toBeInTheDocument();
    });

    fireEvent.click(screen.getByRole("button", { name: "查看该用户历史工单" }));

    await waitFor(() => {
      expect(listInternalMinorGuardianSupportRequests).toHaveBeenLastCalledWith({
        accessToken: "ops-access-token",
        orderBy: "updated_at_desc",
        query: "user-detail-1",
        page: 1,
        pageSize: 10
      });
      expect(screen.getByText("消息: 已切换到用户历史工单 user-detail-1")).toBeInTheDocument();
      expect(screen.getByText("当前搜索: user-detail-1")).toBeInTheDocument();
    });

    fireEvent.click(screen.getByRole("button", { name: "查看该处理人队列" }));

    await waitFor(() => {
      expect(listInternalMinorGuardianSupportRequests).toHaveBeenLastCalledWith({
        accessToken: "ops-access-token",
        handledBy: "ops-reviewer-9",
        orderBy: "updated_at_desc",
        page: 1,
        pageSize: 10
      });
      expect(screen.getByText("消息: 已切换到处理人队列 ops-reviewer-9")).toBeInTheDocument();
      expect(screen.getByText("当前归属: 处理人=ops-reviewer-9")).toBeInTheDocument();
    });

    fireEvent.click(screen.getByRole("button", { name: "查看同状态队列" }));

    await waitFor(() => {
      expect(listInternalMinorGuardianSupportRequests).toHaveBeenLastCalledWith({
        accessToken: "ops-access-token",
        orderBy: "updated_at_desc",
        status: "contacted",
        page: 1,
        pageSize: 10
      });
      expect(screen.getByText("消息: 已切换到同状态队列 已联系")).toBeInTheDocument();
    });

    fireEvent.click(screen.getByRole("button", { name: "查看同风险队列" }));

    await waitFor(() => {
      expect(listInternalMinorGuardianSupportRequests).toHaveBeenLastCalledWith({
        accessToken: "ops-access-token",
        orderBy: "sla_priority_desc",
        slaState: "breached",
        page: 1,
        pageSize: 10
      });
      expect(screen.getByText("消息: 已切换到同风险队列 已超时")).toBeInTheDocument();
      expect(screen.getByText("当前 SLA: 已超时")).toBeInTheDocument();
      expect(screen.getByText("排序: SLA 优先")).toBeInTheDocument();
    });
  });

  test("saves detail shortcut views for later reuse", async () => {
    const tokenStorage = createTokenStorage();

    const listInternalMinorGuardianSupportRequests = vi.fn(async (params?: {
      accessToken?: string;
      query?: string;
      handledBy?: string;
      status?: "pending_review" | "contacted" | "closed";
      slaState?: "within_sla" | "due_soon" | "breached";
      orderBy?: "updated_at_desc" | "sla_priority_desc" | "queue_wait_desc";
      page?: number;
      pageSize?: number;
      unassigned?: boolean;
    }) => {
      if (params?.query === "user-detail-1") {
        return buildListResponse({
          items: [
            buildRequest({
              request_id: "guardian-request-user-history",
              user_id: "user-detail-1",
              user_email: "detail-history@example.com",
              handled_by: "ops-reviewer-9",
              status: "contacted",
              sla_state: "within_sla"
            })
          ]
        });
      }
      if (params?.handledBy === "ops-reviewer-9") {
        return buildListResponse({
          items: [
            buildRequest({
              request_id: "guardian-request-handler-queue",
              user_id: "user-handler-1",
              user_email: "handler@example.com",
              handled_by: "ops-reviewer-9",
              status: "contacted",
              sla_state: "within_sla"
            })
          ]
        });
      }
      if (params?.status === "contacted") {
        return buildListResponse({
          items: [
            buildRequest({
              request_id: "guardian-request-status-queue",
              user_id: "user-status-1",
              user_email: "status@example.com",
              status: "contacted",
              handled_by: "ops-reviewer-2",
              sla_state: "within_sla"
            })
          ]
        });
      }
      if (params?.slaState === "breached" && params?.orderBy === "sla_priority_desc") {
        return buildListResponse({
          ordered_by: "sla_priority_desc",
          items: [
            buildRequest({
              request_id: "guardian-request-risk-queue",
              user_id: "user-risk-1",
              user_email: "risk@example.com",
              status: "pending_review",
              handled_by: "ops-reviewer-4",
              sla_state: "breached",
              sla_breached: true,
              queue_wait_minutes: 210
            })
          ]
        });
      }

      return buildListResponse({
        items: [
          buildRequest({
            request_id: "guardian-request-detail-root",
            user_id: "user-detail-1",
            user_email: "detail@example.com",
            handled_by: "ops-reviewer-9",
            status: "contacted",
            sla_state: "breached",
            sla_breached: true,
            queue_wait_minutes: 180
          })
        ]
      });
    });

    render(
      <AdminMinorGuardianSupportPage
        apiClient={{
          bulkUpdateInternalMinorGuardianSupportRequests: vi.fn(),
          listInternalMinorGuardianSupportRequests,
          updateInternalMinorGuardianSupportRequest: vi.fn(),
          exportInternalMinorGuardianSupportRequests: vi.fn()
        }}
        tokenStorage={tokenStorage}
      />
    );

    await waitFor(() => {
      expect(screen.getByText(/request_id: guardian-request-detail-root/)).toBeInTheDocument();
    });

    fireEvent.click(screen.getByRole("button", { name: "保存用户历史视图" }));
    fireEvent.click(screen.getByRole("button", { name: "保存处理人视图" }));
    fireEvent.click(screen.getByRole("button", { name: "保存同状态视图" }));
    fireEvent.click(screen.getByRole("button", { name: "保存同风险视图" }));

    await waitFor(() => {
      expect(screen.getByText("已保存视图: 4")).toBeInTheDocument();
      expect(screen.getByText("详情快捷视图: 4")).toBeInTheDocument();
      expect(screen.getByText("自定义视图: 0")).toBeInTheDocument();
      expect(screen.getByRole("button", { name: "应用视图 用户历史 user-detail-1" })).toBeInTheDocument();
      expect(screen.getByRole("button", { name: "应用视图 处理人队列 ops-reviewer-9" })).toBeInTheDocument();
      expect(screen.getByRole("button", { name: "应用视图 状态队列 已联系" })).toBeInTheDocument();
      expect(screen.getByRole("button", { name: "应用视图 风险队列 已超时" })).toBeInTheDocument();
      expect(localStorage.getItem(SAVED_QUEUE_VIEWS_STORAGE_KEY)).toContain("风险队列 已超时");
    });

    fireEvent.click(screen.getByRole("button", { name: "应用视图 风险队列 已超时" }));

    await waitFor(() => {
      expect(listInternalMinorGuardianSupportRequests).toHaveBeenLastCalledWith({
        accessToken: "ops-access-token",
        orderBy: "sla_priority_desc",
        slaState: "breached",
        page: 1,
        pageSize: 10
      });
      expect(screen.getByText("消息: 已应用视图 风险队列 已超时")).toBeInTheDocument();
      expect(screen.getByText("当前 SLA: 已超时")).toBeInTheDocument();
      expect(screen.getByText("排序: SLA 优先")).toBeInTheDocument();
      expect(screen.getByText("高频视图: 1")).toBeInTheDocument();
      expect(screen.getByRole("button", { name: "快速应用 风险队列 已超时" })).toBeInTheDocument();
    });
  });

  test("filters queue by mine, unassigned and specific handler", async () => {
    const tokenStorage = createTokenStorage();

    const listInternalMinorGuardianSupportRequests = vi.fn(async (params?: {
      handledBy?: string;
      unassigned?: boolean;
    }) => {
      if (params?.handledBy === "ops-user-1") {
        return buildListResponse({
          items: [
            buildRequest({
              request_id: "guardian-request-mine",
              handled_by: "ops-user-1",
              status: "contacted"
            })
          ]
        });
      }
      if (params?.unassigned) {
        return buildListResponse({
          items: [
            buildRequest({
              request_id: "guardian-request-unassigned"
            })
          ]
        });
      }
      if (params?.handledBy === "ops-reviewer-9") {
        return buildListResponse({
          items: [
            buildRequest({
              request_id: "guardian-request-specific",
              handled_by: "ops-reviewer-9"
            })
          ]
        });
      }
      return buildListResponse({
        items: [
          buildRequest({
            request_id: "guardian-request-1"
          }),
          buildRequest({
            request_id: "guardian-request-2",
            handled_by: "ops-user-1",
            status: "contacted"
          })
        ]
      });
    });

    render(
      <AdminMinorGuardianSupportPage
        apiClient={{
          bulkUpdateInternalMinorGuardianSupportRequests: vi.fn(),
          listInternalMinorGuardianSupportRequests,
          updateInternalMinorGuardianSupportRequest: vi.fn(),
          exportInternalMinorGuardianSupportRequests: vi.fn()
        }}
        tokenStorage={tokenStorage}
      />
    );

    await waitFor(() => {
      expect(listInternalMinorGuardianSupportRequests).toHaveBeenCalledWith({
        accessToken: "ops-access-token",
        orderBy: "updated_at_desc",
        status: "pending_review",
        page: 1,
        pageSize: 10
      });
    });

    fireEvent.change(screen.getByLabelText("工单归属"), {
      target: {
        value: "mine"
      }
    });

    await waitFor(() => {
      expect(listInternalMinorGuardianSupportRequests).toHaveBeenLastCalledWith({
        accessToken: "ops-access-token",
        orderBy: "updated_at_desc",
        status: "pending_review",
        handledBy: "ops-user-1",
        page: 1,
        pageSize: 10
      });
      expect(screen.getByText(/当前归属: 我的工单\(ops-user-1\)/)).toBeInTheDocument();
      expect(screen.getByText(/request_id: guardian-request-mine/)).toBeInTheDocument();
    });

    fireEvent.change(screen.getByLabelText("工单归属"), {
      target: {
        value: "unassigned"
      }
    });

    await waitFor(() => {
      expect(listInternalMinorGuardianSupportRequests).toHaveBeenLastCalledWith({
        accessToken: "ops-access-token",
        orderBy: "updated_at_desc",
        status: "pending_review",
        unassigned: true,
        page: 1,
        pageSize: 10
      });
      expect(screen.getByText("当前归属: 未分配")).toBeInTheDocument();
      expect(screen.getByText(/request_id: guardian-request-unassigned/)).toBeInTheDocument();
    });

    fireEvent.change(screen.getByLabelText("指定处理人"), {
      target: {
        value: "ops-reviewer-9"
      }
    });
    fireEvent.click(screen.getByRole("button", { name: "按处理人筛选" }));

    await waitFor(() => {
      expect(listInternalMinorGuardianSupportRequests).toHaveBeenLastCalledWith({
        accessToken: "ops-access-token",
        orderBy: "updated_at_desc",
        status: "pending_review",
        handledBy: "ops-reviewer-9",
        page: 1,
        pageSize: 10
      });
      expect(screen.getByText("当前归属: 处理人=ops-reviewer-9")).toBeInTheDocument();
      expect(screen.getByText(/request_id: guardian-request-specific/)).toBeInTheDocument();
    });
  });

  test("shows sla summary and filters breached requests", async () => {
    const tokenStorage = createTokenStorage();

    const listInternalMinorGuardianSupportRequests = vi.fn(async (params?: {
      slaState?: "within_sla" | "due_soon" | "breached";
    }) => {
      if (params?.slaState === "breached") {
        return buildListResponse({
          status_summary: {
            pending_review: 2,
            contacted: 1,
            closed: 0
          },
          items: [
            buildRequest({
              request_id: "guardian-request-breached",
              queue_wait_minutes: 180,
              sla_state: "breached",
              sla_breached: true
            })
          ]
        });
      }

      return buildListResponse({
        status_summary: {
          pending_review: 2,
          contacted: 1,
          closed: 0
        },
        items: [
          buildRequest({
            request_id: "guardian-request-due",
            queue_wait_minutes: 100,
            sla_state: "due_soon"
          }),
          buildRequest({
            request_id: "guardian-request-breached",
            queue_wait_minutes: 180,
            sla_state: "breached",
            sla_breached: true
          }),
          buildRequest({
            request_id: "guardian-request-contacted",
            status: "contacted",
            queue_wait_minutes: 20,
            sla_target_minutes: 1440,
            sla_state: "within_sla"
          })
        ]
      });
    });

    render(
      <AdminMinorGuardianSupportPage
        apiClient={{
          bulkUpdateInternalMinorGuardianSupportRequests: vi.fn(),
          listInternalMinorGuardianSupportRequests,
          updateInternalMinorGuardianSupportRequest: vi.fn(),
          exportInternalMinorGuardianSupportRequests: vi.fn()
        }}
        tokenStorage={tokenStorage}
      />
    );

    await waitFor(() => {
      expect(screen.getByText("SLA 摘要: 正常 1 / 临近超时 1 / 已超时 1")).toBeInTheDocument();
      expect(screen.getByText("仪表盘: 待处理 3 / 已分配 0 / 未分配 3")).toBeInTheDocument();
      expect(screen.getByText("风险概览: 已超时 1 / 临近超时 1")).toBeInTheDocument();
      expect(screen.getByText("等待概览: 最久 180 分钟 / 平均 100 分钟")).toBeInTheDocument();
      expect(screen.getByText(/request_id: guardian-request-due/)).toBeInTheDocument();
    });

    fireEvent.change(screen.getByLabelText("SLA 过滤"), {
      target: {
        value: "breached"
      }
    });

    await waitFor(() => {
      expect(listInternalMinorGuardianSupportRequests).toHaveBeenLastCalledWith({
        accessToken: "ops-access-token",
        orderBy: "updated_at_desc",
        status: "pending_review",
        slaState: "breached",
        page: 1,
        pageSize: 10
      });
      expect(screen.getByText("当前 SLA: 已超时")).toBeInTheDocument();
      expect(screen.getByText(/request_id: guardian-request-breached/)).toBeInTheDocument();
      expect(screen.getByText("sla_breached: yes")).toBeInTheDocument();
    });
  });

  test("supports sla priority sorting and quick breached view", async () => {
    const tokenStorage = createTokenStorage();

    const listInternalMinorGuardianSupportRequests = vi.fn(async (params?: {
      slaState?: "within_sla" | "due_soon" | "breached";
      orderBy?: "updated_at_desc" | "sla_priority_desc" | "queue_wait_desc";
    }) => {
      if (params?.slaState === "breached") {
        return buildListResponse({
          ordered_by: "sla_priority_desc",
          items: [
            buildRequest({
              request_id: "guardian-request-breached",
              queue_wait_minutes: 220,
              sla_state: "breached",
              sla_breached: true
            })
          ]
        });
      }

      if (params?.orderBy === "sla_priority_desc") {
        return buildListResponse({
          ordered_by: "sla_priority_desc",
          items: [
            buildRequest({
              request_id: "guardian-request-breached",
              queue_wait_minutes: 220,
              sla_state: "breached",
              sla_breached: true
            }),
            buildRequest({
              request_id: "guardian-request-due",
              queue_wait_minutes: 100,
              sla_state: "due_soon"
            }),
            buildRequest({
              request_id: "guardian-request-normal",
              queue_wait_minutes: 20,
              sla_state: "within_sla"
            })
          ]
        });
      }

      return buildListResponse({
        items: [
          buildRequest({
            request_id: "guardian-request-normal",
            queue_wait_minutes: 20,
            sla_state: "within_sla"
          }),
          buildRequest({
            request_id: "guardian-request-due",
            queue_wait_minutes: 100,
            sla_state: "due_soon"
          }),
          buildRequest({
            request_id: "guardian-request-breached",
            queue_wait_minutes: 220,
            sla_state: "breached",
            sla_breached: true
          })
        ]
      });
    });

    render(
      <AdminMinorGuardianSupportPage
        apiClient={{
          bulkUpdateInternalMinorGuardianSupportRequests: vi.fn(),
          listInternalMinorGuardianSupportRequests,
          updateInternalMinorGuardianSupportRequest: vi.fn(),
          exportInternalMinorGuardianSupportRequests: vi.fn()
        }}
        tokenStorage={tokenStorage}
      />
    );

    await waitFor(() => {
      expect(screen.getByText("排序: 最近更新优先")).toBeInTheDocument();
    });

    fireEvent.change(screen.getByLabelText("队列排序"), {
      target: {
        value: "sla_priority_desc"
      }
    });

    await waitFor(() => {
      expect(listInternalMinorGuardianSupportRequests).toHaveBeenLastCalledWith({
        accessToken: "ops-access-token",
        status: "pending_review",
        orderBy: "sla_priority_desc",
        page: 1,
        pageSize: 10
      });
      expect(screen.getByText("排序: SLA 优先")).toBeInTheDocument();
    });

    fireEvent.click(screen.getByRole("button", { name: "查看已超时队列" }));

    await waitFor(() => {
      expect(listInternalMinorGuardianSupportRequests).toHaveBeenLastCalledWith({
        accessToken: "ops-access-token",
        slaState: "breached",
        orderBy: "sla_priority_desc",
        page: 1,
        pageSize: 10
      });
      expect(screen.getByText("当前快捷视图: 已超时工单")).toBeInTheDocument();
      expect(screen.getByText("当前 SLA: 已超时")).toBeInTheDocument();
    });
  });

  test("saves, renames, and reapplies queue views from local storage", async () => {
    const tokenStorage = createTokenStorage();

    const listInternalMinorGuardianSupportRequests = vi.fn(async (params?: {
      handledBy?: string;
      query?: string;
      orderBy?: "updated_at_desc" | "sla_priority_desc" | "queue_wait_desc";
      slaState?: "within_sla" | "due_soon" | "breached";
    }) => {
      if (
        params?.handledBy === "ops-reviewer-9" &&
        params?.query === "guardian-special" &&
        params?.orderBy === "queue_wait_desc" &&
        params?.slaState === "due_soon"
      ) {
        return buildListResponse({
          ordered_by: "queue_wait_desc",
          items: [
            buildRequest({
              request_id: "guardian-request-saved-view",
              user_email: "guardian-special@example.com",
              queue_wait_minutes: 140,
              handled_by: "ops-reviewer-9",
              sla_state: "due_soon"
            })
          ]
        });
      }

      return buildListResponse({
        items: [
          buildRequest({
            request_id: "guardian-request-1"
          })
        ]
      });
    });

    render(
      <AdminMinorGuardianSupportPage
        apiClient={{
          bulkUpdateInternalMinorGuardianSupportRequests: vi.fn(),
          listInternalMinorGuardianSupportRequests,
          updateInternalMinorGuardianSupportRequest: vi.fn(),
          exportInternalMinorGuardianSupportRequests: vi.fn()
        }}
        tokenStorage={tokenStorage}
      />
    );

    await waitFor(() => {
      expect(screen.getByText(/request_id: guardian-request-1/)).toBeInTheDocument();
    });

    fireEvent.change(screen.getByLabelText("指定处理人"), {
      target: {
        value: "ops-reviewer-9"
      }
    });
    fireEvent.click(screen.getByRole("button", { name: "按处理人筛选" }));
    fireEvent.change(screen.getByLabelText("搜索监护人工单"), {
      target: {
        value: "guardian-special"
      }
    });
    fireEvent.click(screen.getByRole("button", { name: "搜索工单" }));
    fireEvent.change(screen.getByLabelText("SLA 过滤"), {
      target: {
        value: "due_soon"
      }
    });
    fireEvent.change(screen.getByLabelText("队列排序"), {
      target: {
        value: "queue_wait_desc"
      }
    });

    await waitFor(() => {
      expect(listInternalMinorGuardianSupportRequests).toHaveBeenLastCalledWith({
        accessToken: "ops-access-token",
        handledBy: "ops-reviewer-9",
        orderBy: "queue_wait_desc",
        query: "guardian-special",
        slaState: "due_soon",
        status: "pending_review",
        page: 1,
        pageSize: 10
      });
    });

    fireEvent.change(screen.getByLabelText("视图名称"), {
      target: {
        value: "高风险跟进"
      }
    });
    fireEvent.click(screen.getByRole("button", { name: "保存当前视图" }));

    await waitFor(() => {
      expect(screen.getByText("已保存视图: 1")).toBeInTheDocument();
      expect(screen.getByText("高频视图: 0")).toBeInTheDocument();
      expect(screen.getByText("详情快捷视图: 0")).toBeInTheDocument();
      expect(screen.getByText("自定义视图: 1")).toBeInTheDocument();
      expect(screen.getByRole("button", { name: "应用视图 高风险跟进" })).toBeInTheDocument();
      expect(localStorage.getItem(SAVED_QUEUE_VIEWS_STORAGE_KEY)).toContain("高风险跟进");
    });

    fireEvent.click(screen.getByRole("button", { name: "重命名视图 高风险跟进" }));
    fireEvent.change(screen.getByLabelText("视图名称"), {
      target: {
        value: "高风险升级"
      }
    });
    fireEvent.click(screen.getByRole("button", { name: "确认重命名 高风险跟进" }));

    await waitFor(() => {
      expect(screen.getByRole("button", { name: "应用视图 高风险升级" })).toBeInTheDocument();
      expect(screen.getByText("默认保存视图: 未设置")).toBeInTheDocument();
      expect(localStorage.getItem(SAVED_QUEUE_VIEWS_STORAGE_KEY)).toContain("高风险升级");
    });

    fireEvent.click(screen.getByRole("button", { name: "设为默认视图 高风险升级" }));

    await waitFor(() => {
      expect(screen.getByText("默认保存视图: 高风险升级")).toBeInTheDocument();
      expect(localStorage.getItem(SAVED_QUEUE_VIEWS_STORAGE_KEY)).toContain("\"isDefault\":true");
    });

    fireEvent.click(screen.getByRole("button", { name: "恢复系统默认视图" }));
    fireEvent.click(screen.getByRole("button", { name: "清空搜索" }));
    fireEvent.click(screen.getByRole("button", { name: "清空归属筛选" }));

    await waitFor(() => {
      expect(screen.getByText("当前搜索: -")).toBeInTheDocument();
      expect(screen.getByText("当前归属: 全部工单")).toBeInTheDocument();
    });

    fireEvent.click(screen.getByRole("button", { name: "应用视图 高风险升级" }));

    await waitFor(() => {
      expect(listInternalMinorGuardianSupportRequests).toHaveBeenLastCalledWith({
        accessToken: "ops-access-token",
        handledBy: "ops-reviewer-9",
        orderBy: "queue_wait_desc",
        query: "guardian-special",
        slaState: "due_soon",
        status: "pending_review",
        page: 1,
        pageSize: 10
      });
      expect(screen.getByText("当前搜索: guardian-special")).toBeInTheDocument();
      expect(screen.getByText("当前归属: 处理人=ops-reviewer-9")).toBeInTheDocument();
      expect(screen.getByText("当前 SLA: 临近超时")).toBeInTheDocument();
      expect(screen.getByText("排序: 等待时长优先")).toBeInTheDocument();
      expect(screen.getByText("高频视图: 1")).toBeInTheDocument();
      expect(screen.getByRole("button", { name: "快速应用 高风险升级" })).toBeInTheDocument();
      expect(screen.getByText(/request_id: guardian-request-saved-view/)).toBeInTheDocument();
    });
  });

  test("restores default saved queue view on first load", async () => {
    const tokenStorage = createTokenStorage();

    localStorage.setItem(
      SAVED_QUEUE_VIEWS_STORAGE_KEY,
      JSON.stringify([
        {
          name: "默认高风险队列",
          statusFilter: "pending_review",
          assignmentFilter: "handled_by",
          handledByFilterQuery: "ops-reviewer-9",
          searchQuery: "guardian-special",
          slaFilter: "due_soon",
          orderedBy: "queue_wait_desc",
          isDefault: true
        }
      ])
    );

    const listInternalMinorGuardianSupportRequests = vi.fn(async (params?: {
      handledBy?: string;
      query?: string;
      orderBy?: "updated_at_desc" | "sla_priority_desc" | "queue_wait_desc";
      slaState?: "within_sla" | "due_soon" | "breached";
    }) => {
      if (
        params?.handledBy === "ops-reviewer-9" &&
        params?.query === "guardian-special" &&
        params?.orderBy === "queue_wait_desc" &&
        params?.slaState === "due_soon"
      ) {
        return buildListResponse({
          ordered_by: "queue_wait_desc",
          items: [
            buildRequest({
              request_id: "guardian-request-default-view",
              user_email: "guardian-special@example.com",
              queue_wait_minutes: 125,
              handled_by: "ops-reviewer-9",
              sla_state: "due_soon"
            })
          ]
        });
      }

      return buildListResponse({
        items: [
          buildRequest({
            request_id: "guardian-request-fallback"
          })
        ]
      });
    });

    render(
      <AdminMinorGuardianSupportPage
        apiClient={{
          bulkUpdateInternalMinorGuardianSupportRequests: vi.fn(),
          listInternalMinorGuardianSupportRequests,
          updateInternalMinorGuardianSupportRequest: vi.fn(),
          exportInternalMinorGuardianSupportRequests: vi.fn()
        }}
        tokenStorage={tokenStorage}
      />
    );

    await waitFor(() => {
      expect(listInternalMinorGuardianSupportRequests).toHaveBeenLastCalledWith({
        accessToken: "ops-access-token",
        handledBy: "ops-reviewer-9",
        orderBy: "queue_wait_desc",
        query: "guardian-special",
        slaState: "due_soon",
        status: "pending_review",
        page: 1,
        pageSize: 10
      });
      expect(screen.getByText("消息: 已恢复默认保存视图 默认高风险队列")).toBeInTheDocument();
      expect(screen.getByText("默认保存视图: 默认高风险队列")).toBeInTheDocument();
      expect(screen.getByText("当前搜索: guardian-special")).toBeInTheDocument();
      expect(screen.getByText("当前归属: 处理人=ops-reviewer-9")).toBeInTheDocument();
      expect(screen.getByText("当前 SLA: 临近超时")).toBeInTheDocument();
      expect(screen.getByText("排序: 等待时长优先")).toBeInTheDocument();
      expect(screen.getByText(/request_id: guardian-request-default-view/)).toBeInTheDocument();
    });
  });

  test("exports breached and due soon queues with one click", async () => {
    const tokenStorage = createTokenStorage();

    const listInternalMinorGuardianSupportRequests = vi.fn().mockResolvedValue(
      buildListResponse({
        items: [
          buildRequest({
            request_id: "guardian-request-1"
          })
        ]
      })
    );
    const exportInternalMinorGuardianSupportRequests = vi
      .fn()
      .mockResolvedValueOnce({
        filename: "guardian-breached.csv",
        content: "breached"
      })
      .mockResolvedValueOnce({
        filename: "guardian-due-soon.csv",
        content: "due-soon"
      });

    render(
      <AdminMinorGuardianSupportPage
        apiClient={{
          bulkUpdateInternalMinorGuardianSupportRequests: vi.fn(),
          listInternalMinorGuardianSupportRequests,
          updateInternalMinorGuardianSupportRequest: vi.fn(),
          exportInternalMinorGuardianSupportRequests
        }}
        tokenStorage={tokenStorage}
      />
    );

    await waitFor(() => {
      expect(screen.getByText(/request_id: guardian-request-1/)).toBeInTheDocument();
    });

    fireEvent.click(screen.getByRole("button", { name: "导出已超时队列 CSV" }));

    await waitFor(() => {
      expect(exportInternalMinorGuardianSupportRequests).toHaveBeenNthCalledWith(1, {
        accessToken: "ops-access-token",
        query: undefined,
        handledBy: undefined,
        unassigned: undefined,
        slaState: "breached",
        orderBy: "sla_priority_desc"
      });
      expect(screen.getByText(/已生成已超时导出 guardian-breached.csv/)).toBeInTheDocument();
    });

    fireEvent.click(screen.getByRole("button", { name: "导出临近超时队列 CSV" }));

    await waitFor(() => {
      expect(exportInternalMinorGuardianSupportRequests).toHaveBeenNthCalledWith(2, {
        accessToken: "ops-access-token",
        query: undefined,
        handledBy: undefined,
        unassigned: undefined,
        slaState: "due_soon",
        orderBy: "sla_priority_desc"
      });
      expect(screen.getByText(/已生成临近超时导出 guardian-due-soon.csv/)).toBeInTheDocument();
      expect(screen.getByLabelText("最近导出内容")).toHaveValue("due-soon");
    });
  });

  test("exports pending review, unassigned and mine queue templates", async () => {
    const tokenStorage = createTokenStorage();

    const listInternalMinorGuardianSupportRequests = vi.fn().mockResolvedValue(
      buildListResponse({
        items: [
          buildRequest({
            request_id: "guardian-request-1"
          })
        ]
      })
    );
    const exportInternalMinorGuardianSupportRequests = vi
      .fn()
      .mockResolvedValueOnce({
        filename: "guardian-pending-review.csv",
        content: "pending-review"
      })
      .mockResolvedValueOnce({
        filename: "guardian-unassigned.csv",
        content: "unassigned"
      })
      .mockResolvedValueOnce({
        filename: "guardian-mine.csv",
        content: "mine"
      });

    render(
      <AdminMinorGuardianSupportPage
        apiClient={{
          bulkUpdateInternalMinorGuardianSupportRequests: vi.fn(),
          listInternalMinorGuardianSupportRequests,
          updateInternalMinorGuardianSupportRequest: vi.fn(),
          exportInternalMinorGuardianSupportRequests
        }}
        tokenStorage={tokenStorage}
      />
    );

    await waitFor(() => {
      expect(screen.getByText(/request_id: guardian-request-1/)).toBeInTheDocument();
    });

    fireEvent.change(screen.getByLabelText("搜索监护人工单"), {
      target: {
        value: "guardian-special"
      }
    });
    fireEvent.click(screen.getByRole("button", { name: "搜索工单" }));
    fireEvent.change(screen.getByLabelText("指定处理人"), {
      target: {
        value: "ops-reviewer-9"
      }
    });
    fireEvent.click(screen.getByRole("button", { name: "按处理人筛选" }));
    fireEvent.change(screen.getByLabelText("SLA 过滤"), {
      target: {
        value: "breached"
      }
    });

    await waitFor(() => {
      expect(screen.getByText("当前搜索: guardian-special")).toBeInTheDocument();
      expect(screen.getByText("当前 SLA: 已超时")).toBeInTheDocument();
    });

    fireEvent.click(screen.getByRole("button", { name: "导出待审核队列 CSV" }));

    await waitFor(() => {
      expect(exportInternalMinorGuardianSupportRequests).toHaveBeenNthCalledWith(1, {
        accessToken: "ops-access-token",
        status: "pending_review",
        query: "guardian-special",
        handledBy: undefined,
        unassigned: undefined,
        orderBy: "sla_priority_desc"
      });
      expect(screen.getByText(/已生成待审核导出 guardian-pending-review.csv/)).toBeInTheDocument();
    });

    fireEvent.click(screen.getByRole("button", { name: "导出未分配队列 CSV" }));

    await waitFor(() => {
      expect(exportInternalMinorGuardianSupportRequests).toHaveBeenNthCalledWith(2, {
        accessToken: "ops-access-token",
        status: undefined,
        query: "guardian-special",
        handledBy: undefined,
        unassigned: true,
        orderBy: "sla_priority_desc"
      });
      expect(screen.getByText(/已生成未分配导出 guardian-unassigned.csv/)).toBeInTheDocument();
    });

    fireEvent.click(screen.getByRole("button", { name: "导出我的工单 CSV" }));

    await waitFor(() => {
      expect(exportInternalMinorGuardianSupportRequests).toHaveBeenNthCalledWith(3, {
        accessToken: "ops-access-token",
        status: undefined,
        query: "guardian-special",
        handledBy: "ops-user-1",
        unassigned: undefined,
        orderBy: "sla_priority_desc"
      });
      expect(screen.getByText(/已生成我的工单导出 guardian-mine.csv/)).toBeInTheDocument();
      expect(screen.getByLabelText("最近导出内容")).toHaveValue("mine");
    });
  });

  test("applies bulk action templates for selected guardian requests", async () => {
    const tokenStorage = createTokenStorage();

    const listInternalMinorGuardianSupportRequests = vi.fn().mockResolvedValue(
      buildListResponse({
        items: [
          buildRequest({
            request_id: "guardian-request-1",
            user_email: "guardian1@example.com",
            status: "pending_review"
          }),
          buildRequest({
            request_id: "guardian-request-2",
            user_email: "guardian2@example.com",
            status: "contacted",
            handled_by: "ops-reviewer-2"
          }),
          buildRequest({
            request_id: "guardian-request-3",
            user_email: "guardian3@example.com",
            status: "closed",
            handled_by: "ops-reviewer-3"
          })
        ]
      })
    );

    render(
      <AdminMinorGuardianSupportPage
        apiClient={{
          bulkUpdateInternalMinorGuardianSupportRequests: vi.fn(),
          listInternalMinorGuardianSupportRequests,
          updateInternalMinorGuardianSupportRequest: vi.fn(),
          exportInternalMinorGuardianSupportRequests: vi.fn()
        }}
        tokenStorage={tokenStorage}
      />
    );

    await waitFor(() => {
      expect(screen.getByLabelText("选择工单 guardian-request-1")).toBeInTheDocument();
      expect(screen.getByLabelText("选择工单 guardian-request-3")).toBeInTheDocument();
    });

    fireEvent.click(screen.getByLabelText("选择工单 guardian-request-1"));
    fireEvent.click(screen.getByLabelText("选择工单 guardian-request-2"));

    await waitFor(() => {
      expect(screen.getByText("批量预检: 已分配 1 / 未分配 1")).toBeInTheDocument();
      expect(screen.getByText("批量状态分组: 待审核 1 / 已联系 1 / 已关闭 0")).toBeInTheDocument();
      expect(screen.getByText("批量提交条件: 可提交")).toBeInTheDocument();
      expect(screen.getByRole("button", { name: "保存批量处理" })).toBeEnabled();
    });

    fireEvent.click(screen.getByRole("button", { name: "批量领取当前勾选" }));

    await waitFor(() => {
      expect(screen.getByLabelText("批量处理人")).toHaveValue("ops-user-1");
      expect(screen.getByLabelText("批量状态")).toHaveValue("keep");
      expect(screen.getByLabelText("批量备注")).toHaveValue("已批量领取监护人工单，待人工跟进。");
      expect(screen.getByText("消息: 已套用批量领取模板")).toBeInTheDocument();
    });

    fireEvent.click(screen.getByRole("button", { name: "套用批量已联系模板" }));

    await waitFor(() => {
      expect(screen.getByLabelText("批量状态")).toHaveValue("contacted");
      expect(screen.getByLabelText("批量备注")).toHaveValue("已批量联系监护人，等待监护人反馈。");
      expect(screen.getByText("消息: 已套用批量已联系模板")).toBeInTheDocument();
    });

    fireEvent.click(screen.getByRole("button", { name: "套用批量关闭模板" }));

    await waitFor(() => {
      expect(screen.getByLabelText("批量状态")).toHaveValue("closed");
      expect(screen.getByLabelText("批量备注")).toHaveValue("已批量完成监护人跟进并同步结果，工单关闭。");
      expect(screen.getByText("消息: 已套用批量关闭模板")).toBeInTheDocument();
    });

    fireEvent.click(screen.getByRole("button", { name: "清空勾选" }));
    fireEvent.click(screen.getByLabelText("选择工单 guardian-request-3"));
    fireEvent.click(screen.getByRole("button", { name: "套用批量已联系模板" }));

    await waitFor(() => {
      expect(screen.getByText("批量预检: 已分配 1 / 未分配 0")).toBeInTheDocument();
      expect(screen.getByText("批量状态分组: 待审核 0 / 已联系 0 / 已关闭 1")).toBeInTheDocument();
      expect(screen.getByRole("alert")).toHaveTextContent("所选工单无法套用已联系模板");
    });

    fireEvent.change(screen.getByLabelText("批量状态"), {
      target: {
        value: "contacted"
      }
    });

    await waitFor(() => {
      expect(screen.getByText("批量可执行: 0 / 阻塞 1")).toBeInTheDocument();
      expect(screen.getByText("批量阻塞 request_id: guardian-request-3")).toBeInTheDocument();
      expect(screen.getByText("批量提交条件: 目标状态不适用于 guardian-request-3")).toBeInTheDocument();
      expect(screen.getByRole("button", { name: "保存批量处理" })).toBeDisabled();
    });
  });

  test("supports bulk assignment and status updates for selected requests", async () => {
    const tokenStorage = createTokenStorage();

    const listInternalMinorGuardianSupportRequests = vi
      .fn()
      .mockResolvedValueOnce(
        buildListResponse({
          items: [
            buildRequest({
              request_id: "guardian-request-1",
              user_id: "user-1",
              user_email: "guardian1@example.com"
            }),
            buildRequest({
              request_id: "guardian-request-2",
              user_id: "user-2",
              user_email: "guardian2@example.com",
              status: "contacted",
              handled_by: "ops-user-1"
            })
          ]
        })
      )
      .mockResolvedValueOnce(
        buildListResponse({
          total_count: 0,
          items: []
        })
      )
      .mockResolvedValueOnce(
        buildListResponse({
          items: [
            buildRequest({
              request_id: "guardian-request-1",
              user_id: "user-1",
              user_email: "guardian1@example.com",
              status: "closed",
              handled_by: "ops-reviewer-7",
              operator_note: "批量完成监护人回访。",
              resolved_at: "2026-04-03T12:30:00.000Z"
            }),
            buildRequest({
              request_id: "guardian-request-2",
              user_id: "user-2",
              user_email: "guardian2@example.com",
              status: "closed",
              handled_by: "ops-reviewer-7",
              operator_note: "批量完成监护人回访。",
              resolved_at: "2026-04-03T12:30:00.000Z"
            })
          ],
          status_summary: {
            pending_review: 0,
            contacted: 0,
            closed: 2
          }
        })
      );
    const bulkUpdateInternalMinorGuardianSupportRequests = vi.fn().mockResolvedValue({
      updated_count: 2,
      request_ids: ["guardian-request-1", "guardian-request-2"],
      items: [
        buildRequest({
          request_id: "guardian-request-1",
          user_id: "user-1",
          user_email: "guardian1@example.com",
          status: "closed",
          handled_by: "ops-reviewer-7",
          operator_note: "批量完成监护人回访。",
          resolved_at: "2026-04-03T12:30:00.000Z"
        }),
        buildRequest({
          request_id: "guardian-request-2",
          user_id: "user-2",
          user_email: "guardian2@example.com",
          status: "closed",
          handled_by: "ops-reviewer-7",
          operator_note: "批量完成监护人回访。",
          resolved_at: "2026-04-03T12:30:00.000Z"
        })
      ]
    });

    render(
      <AdminMinorGuardianSupportPage
        apiClient={{
          bulkUpdateInternalMinorGuardianSupportRequests,
          listInternalMinorGuardianSupportRequests,
          updateInternalMinorGuardianSupportRequest: vi.fn(),
          exportInternalMinorGuardianSupportRequests: vi.fn()
        }}
        tokenStorage={tokenStorage}
      />
    );

    await waitFor(() => {
      expect(screen.getByText(/request_id: guardian-request-1/)).toBeInTheDocument();
      expect(screen.getByText(/guardian2@example.com/)).toBeInTheDocument();
    });

    fireEvent.click(screen.getByLabelText("选择工单 guardian-request-1"));
    fireEvent.click(screen.getByLabelText("选择工单 guardian-request-2"));
    fireEvent.change(screen.getByLabelText("批量处理人"), {
      target: {
        value: "ops-reviewer-7"
      }
    });
    fireEvent.change(screen.getByLabelText("批量状态"), {
      target: {
        value: "closed"
      }
    });
    fireEvent.change(screen.getByLabelText("批量备注"), {
      target: {
        value: "批量完成监护人回访。"
      }
    });
    fireEvent.click(screen.getByRole("button", { name: "保存批量处理" }));

    await waitFor(() => {
      expect(bulkUpdateInternalMinorGuardianSupportRequests).toHaveBeenCalledWith("ops-access-token", {
        request_ids: ["guardian-request-1", "guardian-request-2"],
        status: "closed",
        handled_by: "ops-reviewer-7",
        operator_note: "批量完成监护人回访。"
      });
      expect(screen.getByText(/已批量更新 2 条工单/)).toBeInTheDocument();
      expect(screen.getByText("最近批量结果: 已更新 2 条")).toBeInTheDocument();
      expect(screen.getByText("最近批量状态: 待审核 0 / 已联系 0 / 已关闭 2")).toBeInTheDocument();
      expect(screen.getByText("最近批量关闭: 2 / 已写入备注 2")).toBeInTheDocument();
      expect(screen.getByText("最近批量处理人: ops-reviewer-7")).toBeInTheDocument();
      expect(screen.getByText("最近批量 request_id: guardian-request-1, guardian-request-2")).toBeInTheDocument();
      expect(screen.getByText("当前筛选下暂无工单。")).toBeInTheDocument();
      expect(screen.getByText("已勾选: 0 条")).toBeInTheDocument();
    });

    fireEvent.click(screen.getByRole("button", { name: "查看最近批量已关闭队列" }));

    await waitFor(() => {
      expect(listInternalMinorGuardianSupportRequests).toHaveBeenLastCalledWith({
        accessToken: "ops-access-token",
        handledBy: "ops-reviewer-7",
        orderBy: "updated_at_desc",
        status: "closed",
        page: 1,
        pageSize: 10
      });
      expect(screen.getByText("消息: 已切换到最近批量关闭队列 ops-reviewer-7")).toBeInTheDocument();
      expect(screen.getByText(/request_id: guardian-request-1/)).toBeInTheDocument();
      expect(screen.getByText("当前归属: 处理人=ops-reviewer-7")).toBeInTheDocument();
    });

    fireEvent.click(screen.getByRole("button", { name: "清除最近批量结果" }));

    await waitFor(() => {
      expect(screen.getByText("消息: 已清除最近批量结果")).toBeInTheDocument();
      expect(screen.getByText("最近批量结果: 暂无")).toBeInTheDocument();
    });
  });

  test("supports pagination controls for guardian requests", async () => {
    const tokenStorage = createTokenStorage();

    const firstPageItems = Array.from({ length: 10 }, (_, index) =>
      buildRequest({
        request_id: `guardian-request-${index + 1}`,
        user_id: `user-${index + 1}`,
        user_email: `guardian${index + 1}@example.com`,
        updated_at: `2026-04-03T1${index}:00:00.000Z`
      })
    );

    const listInternalMinorGuardianSupportRequests = vi
      .fn()
      .mockResolvedValueOnce(
        buildListResponse({
          total_count: 11,
          page: 1,
          has_next_page: true,
          items: firstPageItems
        })
      )
      .mockResolvedValueOnce(
        buildListResponse({
          total_count: 11,
          page: 2,
          has_next_page: false,
          items: [
            buildRequest({
              request_id: "guardian-request-11",
              user_id: "user-11",
              user_email: "guardian11@example.com",
              topic: "account_review",
              updated_at: "2026-04-03T20:00:00.000Z"
            })
          ]
        })
      );

    render(
      <AdminMinorGuardianSupportPage
        apiClient={{
          bulkUpdateInternalMinorGuardianSupportRequests: vi.fn(),
          listInternalMinorGuardianSupportRequests,
          updateInternalMinorGuardianSupportRequest: vi.fn(),
          exportInternalMinorGuardianSupportRequests: vi.fn()
        }}
        tokenStorage={tokenStorage}
      />
    );

    await waitFor(() => {
      expect(screen.getByText("分页: 第 1 / 2 页，每页 10 条")).toBeInTheDocument();
      expect(screen.getByText("队列摘要: 待审核 10 / 已联系 0 / 已关闭 0")).toBeInTheDocument();
      expect(screen.getByText(/request_id: guardian-request-1/)).toBeInTheDocument();
    });

    fireEvent.click(screen.getByRole("button", { name: "下一页" }));

    await waitFor(() => {
      expect(listInternalMinorGuardianSupportRequests).toHaveBeenLastCalledWith({
        accessToken: "ops-access-token",
        orderBy: "updated_at_desc",
        status: "pending_review",
        page: 2,
        pageSize: 10
      });
      expect(screen.getByText("分页: 第 2 / 2 页，每页 10 条")).toBeInTheDocument();
      expect(screen.getByText(/request_id: guardian-request-11/)).toBeInTheDocument();
    });
  });

  test("moves to the next actionable request after closing under all filter", async () => {
    const tokenStorage = createTokenStorage();

    const allFilterBeforeClose = [
      buildRequest({
        request_id: "guardian-request-1",
        user_id: "user-1",
        user_email: "guardian1@example.com",
        updated_at: "2026-04-03T12:00:00.000Z"
      }),
      buildRequest({
        request_id: "guardian-request-2",
        user_id: "user-2",
        user_email: "guardian2@example.com",
        topic: "data_deletion",
        updated_at: "2026-04-03T11:00:00.000Z"
      }),
      buildRequest({
        request_id: "guardian-request-3",
        user_id: "user-3",
        user_email: "guardian3@example.com",
        status: "contacted",
        updated_at: "2026-04-03T10:00:00.000Z"
      })
    ];

    const listInternalMinorGuardianSupportRequests = vi
      .fn()
      .mockResolvedValueOnce(
        buildListResponse({
          items: allFilterBeforeClose.slice(0, 2)
        })
      )
      .mockResolvedValueOnce(
        buildListResponse({
          total_count: 3,
          items: allFilterBeforeClose
        })
      )
      .mockResolvedValueOnce(
        buildListResponse({
          total_count: 3,
          items: [
            buildRequest({
              request_id: "guardian-request-1",
              user_id: "user-1",
              user_email: "guardian1@example.com",
              status: "closed",
              updated_at: "2026-04-03T12:30:00.000Z",
              resolved_at: "2026-04-03T12:30:00.000Z",
              handled_by: "ops-reviewer-1",
              operator_note: "已向监护人说明未成年学习保护策略与使用建议，工单关闭。"
            }),
            buildRequest({
              request_id: "guardian-request-2",
              user_id: "user-2",
              user_email: "guardian2@example.com",
              topic: "data_deletion",
              updated_at: "2026-04-03T11:00:00.000Z"
            }),
            buildRequest({
              request_id: "guardian-request-3",
              user_id: "user-3",
              user_email: "guardian3@example.com",
              status: "contacted",
              updated_at: "2026-04-03T10:00:00.000Z"
            })
          ]
        })
      );

    const updateInternalMinorGuardianSupportRequest = vi.fn().mockResolvedValue(
      buildRequest({
        request_id: "guardian-request-1",
        user_id: "user-1",
        user_email: "guardian1@example.com",
        status: "closed",
        updated_at: "2026-04-03T12:30:00.000Z",
        resolved_at: "2026-04-03T12:30:00.000Z",
        handled_by: "ops-reviewer-1",
        operator_note: "已向监护人说明未成年学习保护策略与使用建议，工单关闭。"
      })
    );

    render(
      <AdminMinorGuardianSupportPage
        apiClient={{
          bulkUpdateInternalMinorGuardianSupportRequests: vi.fn(),
          listInternalMinorGuardianSupportRequests,
          updateInternalMinorGuardianSupportRequest,
          exportInternalMinorGuardianSupportRequests: vi.fn()
        }}
        tokenStorage={tokenStorage}
      />
    );

    await waitFor(() => {
      expect(screen.getByText(/request_id: guardian-request-1/)).toBeInTheDocument();
    });

    fireEvent.change(screen.getByLabelText("工单状态筛选"), {
      target: {
        value: "all"
      }
    });

    await waitFor(() => {
      expect(listInternalMinorGuardianSupportRequests).toHaveBeenLastCalledWith({
        accessToken: "ops-access-token",
        orderBy: "updated_at_desc",
        page: 1,
        pageSize: 10
      });
      expect(screen.getByText(/request_id: guardian-request-1/)).toBeInTheDocument();
    });

    fireEvent.change(screen.getByLabelText("处理人"), {
      target: {
        value: "ops-reviewer-1"
      }
    });
    fireEvent.click(screen.getByRole("button", { name: "填入关闭模板" }));
    fireEvent.click(screen.getByRole("button", { name: "保存处理结果" }));

    await waitFor(() => {
      expect(updateInternalMinorGuardianSupportRequest).toHaveBeenCalledWith(
        "ops-access-token",
        "guardian-request-1",
        {
          status: "closed",
          handled_by: "ops-reviewer-1",
          operator_note: "已向监护人说明未成年学习保护策略与使用建议，工单关闭。"
        }
      );
      expect(screen.getByText(/request_id: guardian-request-2/)).toBeInTheDocument();
      expect(screen.getByText(/user_email: guardian2@example.com/)).toBeInTheDocument();
    });
  });

  test("exports the current filtered queue as csv", async () => {
    const tokenStorage = createTokenStorage();

    const listInternalMinorGuardianSupportRequests = vi.fn().mockResolvedValue(
      buildListResponse({
        total_count: 2,
        status_summary: {
          pending_review: 2,
          contacted: 1,
          closed: 0
        },
        items: [
          buildRequest({
            request_id: "guardian-request-1",
            user_id: "user-1",
            user_email: "guardian@example.com"
          }),
          buildRequest({
            request_id: "guardian-request-2",
            user_id: "user-2",
            user_email: "guardian2@example.com",
            topic: "data_deletion"
          })
        ]
      })
    );
    const exportInternalMinorGuardianSupportRequests = vi.fn().mockResolvedValue({
      filename: "minor-guardian-support-requests-2026-04-04.csv",
      content: 'request_id,user_id\n"guardian-request-1","user-1"'
    });

    render(
      <AdminMinorGuardianSupportPage
        apiClient={{
          bulkUpdateInternalMinorGuardianSupportRequests: vi.fn(),
          listInternalMinorGuardianSupportRequests,
          updateInternalMinorGuardianSupportRequest: vi.fn(),
          exportInternalMinorGuardianSupportRequests
        }}
        tokenStorage={tokenStorage}
      />
    );

    await waitFor(() => {
      expect(screen.getByText("队列摘要: 待审核 2 / 已联系 1 / 已关闭 0")).toBeInTheDocument();
    });

    fireEvent.click(screen.getByRole("button", { name: "导出当前筛选 CSV" }));

    await waitFor(() => {
      expect(exportInternalMinorGuardianSupportRequests).toHaveBeenCalledWith({
        accessToken: "ops-access-token",
        orderBy: "updated_at_desc",
        status: "pending_review",
        query: undefined
      });
      expect(screen.getByText(/已生成导出 minor-guardian-support-requests-2026-04-04.csv/)).toBeInTheDocument();
      expect(screen.getByText("filename: minor-guardian-support-requests-2026-04-04.csv")).toBeInTheDocument();
      expect(screen.getByLabelText("最近导出内容")).toHaveValue('request_id,user_id\n"guardian-request-1","user-1"');
    });
  });
});
