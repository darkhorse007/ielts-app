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
  operator_note: overrides.operator_note
});

const buildListResponse = (input: {
  items: InternalMinorGuardianSupportRequestResponse[];
  total_count?: number;
  page?: number;
  page_size?: number;
  has_next_page?: boolean;
  status_summary?: InternalMinorGuardianSupportRequestListResponse["status_summary"];
}): InternalMinorGuardianSupportRequestListResponse => ({
  total_count: input.total_count ?? input.items.length,
  page: input.page ?? 1,
  page_size: input.page_size ?? 10,
  has_next_page: input.has_next_page ?? false,
  ordered_by: "updated_at_desc",
  status_summary: input.status_summary ?? {
    pending_review: input.items.filter((item) => item.status === "pending_review").length,
    contacted: input.items.filter((item) => item.status === "contacted").length,
    closed: input.items.filter((item) => item.status === "closed").length
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
        status: "pending_review",
        page: 1,
        pageSize: 10
      });
      expect(screen.getByText(/已加载 1 条工单，第 1\/1 页/)).toBeInTheDocument();
      expect(screen.getByText(/user_email: guardian@example.com/)).toBeInTheDocument();
    });
    await waitFor(() => {
      expect(screen.getByLabelText("处理人")).toHaveValue("");
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
        status: "pending_review",
        query: "guardian2@example.com",
        page: 1,
        pageSize: 10
      });
      expect(screen.getByText(/当前搜索: guardian2@example.com/)).toBeInTheDocument();
      expect(screen.getByText(/request_id: guardian-request-2/)).toBeInTheDocument();
    });

    fireEvent.click(screen.getByRole("button", { name: "填入关闭模板" }));

    expect(screen.getByLabelText("更新状态")).toHaveValue("closed");
    expect(screen.getByLabelText("处理备注")).toHaveValue("已向监护人说明数据导出与删除流程，工单关闭。");
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
        status: "pending_review",
        query: undefined
      });
      expect(screen.getByText(/已生成导出 minor-guardian-support-requests-2026-04-04.csv/)).toBeInTheDocument();
      expect(screen.getByText("filename: minor-guardian-support-requests-2026-04-04.csv")).toBeInTheDocument();
      expect(screen.getByLabelText("最近导出内容")).toHaveValue('request_id,user_id\n"guardian-request-1","user-1"');
    });
  });
});
