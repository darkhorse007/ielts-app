import { useEffect, useMemo, useState } from "react";
import { ApiRequestError, type ApiClient } from "../lib/api-client";
import type {
  InternalMinorGuardianSupportRequestListResponse,
  InternalMinorGuardianSupportRequestResponse,
  MinorGuardianSupportRequestStatusSummary,
  MinorGuardianSupportRequestStatus
} from "../lib/api-types";
import { TokenStorage } from "../lib/token-storage";

type AdminMinorGuardianSupportPageProps = {
  apiClient: Pick<
    ApiClient,
    | "listInternalMinorGuardianSupportRequests"
    | "updateInternalMinorGuardianSupportRequest"
    | "exportInternalMinorGuardianSupportRequests"
  >;
  tokenStorage: TokenStorage;
};

type LoadRequestOptions = {
  preferredRequestId?: string | null;
  preferActionableSelection?: boolean;
  targetPage?: number;
};

type SupportRequestFilter = "all" | MinorGuardianSupportRequestStatus;

const DEFAULT_PAGE_SIZE = 10;
const EMPTY_STATUS_SUMMARY: MinorGuardianSupportRequestStatusSummary = {
  pending_review: 0,
  contacted: 0,
  closed: 0
};

const STATUS_LABELS: Record<MinorGuardianSupportRequestStatus, string> = {
  pending_review: "待审核",
  contacted: "已联系",
  closed: "已关闭"
};

const TOPIC_LABELS: Record<InternalMinorGuardianSupportRequestResponse["topic"], string> = {
  account_review: "账号审查",
  data_deletion: "数据删除",
  usage_concern: "使用顾虑",
  other: "其他"
};

const CONTACT_CHANNEL_LABELS: Record<InternalMinorGuardianSupportRequestResponse["contact_channel"], string> = {
  email: "邮箱",
  phone: "电话"
};

const FILTER_OPTIONS: Array<{ value: SupportRequestFilter; label: string }> = [
  { value: "pending_review", label: "待审核" },
  { value: "contacted", label: "已联系" },
  { value: "closed", label: "已关闭" },
  { value: "all", label: "全部" }
];

const STATUS_OPTIONS: MinorGuardianSupportRequestStatus[] = ["pending_review", "contacted", "closed"];

const ORDER_LABELS: Record<InternalMinorGuardianSupportRequestListResponse["ordered_by"], string> = {
  updated_at_desc: "最近更新优先"
};

const buildContactTemplate = (request: InternalMinorGuardianSupportRequestResponse): string => {
  if (request.contact_channel === "phone") {
    return "已通过电话联系监护人，等待回执。";
  }
  return "已通过邮箱联系监护人，等待反馈。";
};

const buildCloseTemplate = (request: InternalMinorGuardianSupportRequestResponse): string => {
  switch (request.topic) {
    case "account_review":
      return "已向监护人说明账号审查结果与后续动作，工单关闭。";
    case "data_deletion":
      return "已向监护人说明数据导出与删除流程，工单关闭。";
    case "usage_concern":
      return "已向监护人说明未成年学习保护策略与使用建议，工单关闭。";
    default:
      return "已完成监护人协助处理并同步结果，工单关闭。";
  }
};

const canTransitionToStatus = (
  currentStatus: MinorGuardianSupportRequestStatus,
  nextStatus: MinorGuardianSupportRequestStatus
): boolean => {
  if (currentStatus === nextStatus) {
    return true;
  }
  if (currentStatus === "pending_review") {
    return nextStatus === "contacted" || nextStatus === "closed";
  }
  if (currentStatus === "contacted") {
    return nextStatus === "closed";
  }
  return false;
};

const getDefaultNextStatus = (currentStatus: MinorGuardianSupportRequestStatus): MinorGuardianSupportRequestStatus => {
  if (currentStatus === "pending_review") {
    return "contacted";
  }
  return currentStatus;
};

const toDisplayText = (value?: string): string => (value && value.trim().length > 0 ? value : "-");

const getFirstActionableRequestId = (
  items: InternalMinorGuardianSupportRequestResponse[]
): string | null =>
  items.find((item) => item.status !== "closed")?.request_id ?? items[0]?.request_id ?? null;

const getNextActionableRequestId = (
  items: InternalMinorGuardianSupportRequestResponse[],
  currentRequestId: string
): string | null => {
  const currentIndex = items.findIndex((item) => item.request_id === currentRequestId);
  if (currentIndex < 0) {
    return getFirstActionableRequestId(items);
  }

  const nextAfterCurrent = items.slice(currentIndex + 1).find((item) => item.status !== "closed");
  if (nextAfterCurrent) {
    return nextAfterCurrent.request_id;
  }

  const nextBeforeCurrent = items.slice(0, currentIndex).find((item) => item.status !== "closed");
  return nextBeforeCurrent?.request_id ?? null;
};

const resolveSelectedRequestId = (
  response: InternalMinorGuardianSupportRequestListResponse,
  currentRequestId: string | null,
  options?: LoadRequestOptions
): string | null => {
  if (options?.preferActionableSelection) {
    if (
      options.preferredRequestId &&
      response.items.some((item) => item.request_id === options.preferredRequestId && item.status !== "closed")
    ) {
      return options.preferredRequestId;
    }
    return getFirstActionableRequestId(response.items);
  }

  const nextCandidate = options?.preferredRequestId ?? currentRequestId;
  if (nextCandidate && response.items.some((item) => item.request_id === nextCandidate)) {
    return nextCandidate;
  }
  return response.items[0]?.request_id ?? null;
};

export const AdminMinorGuardianSupportPage = ({ apiClient, tokenStorage }: AdminMinorGuardianSupportPageProps) => {
  const [statusFilter, setStatusFilter] = useState<SupportRequestFilter>("pending_review");
  const [searchInput, setSearchInput] = useState("");
  const [searchQuery, setSearchQuery] = useState("");
  const [currentPage, setCurrentPage] = useState(1);
  const [requests, setRequests] = useState<InternalMinorGuardianSupportRequestResponse[]>([]);
  const [totalCount, setTotalCount] = useState(0);
  const [pageSize, setPageSize] = useState(DEFAULT_PAGE_SIZE);
  const [hasNextPage, setHasNextPage] = useState(false);
  const [orderedBy, setOrderedBy] = useState<InternalMinorGuardianSupportRequestListResponse["ordered_by"]>(
    "updated_at_desc"
  );
  const [statusSummary, setStatusSummary] = useState<MinorGuardianSupportRequestStatusSummary>(EMPTY_STATUS_SUMMARY);
  const [selectedRequestId, setSelectedRequestId] = useState<string | null>(null);
  const [handledBy, setHandledBy] = useState("");
  const [operatorNote, setOperatorNote] = useState("");
  const [nextStatus, setNextStatus] = useState<MinorGuardianSupportRequestStatus>("contacted");
  const [statusMessage, setStatusMessage] = useState("未加载工单");
  const [message, setMessage] = useState("未处理");
  const [exportMessage, setExportMessage] = useState("未导出");
  const [lastExportFilename, setLastExportFilename] = useState<string | null>(null);
  const [lastExportContent, setLastExportContent] = useState("");
  const [error, setError] = useState<string | null>(null);

  const pageCount = totalCount === 0 ? 1 : Math.ceil(totalCount / pageSize);
  const selectedRequest = useMemo(
    () => requests.find((item) => item.request_id === selectedRequestId) ?? null,
    [requests, selectedRequestId]
  );

  const loadRequests = async (options?: LoadRequestOptions): Promise<void> => {
    const accessToken = tokenStorage.getAccessToken();
    if (!accessToken) {
      setError("会话已失效，请重新登录");
      setRequests([]);
      setSelectedRequestId(null);
      setTotalCount(0);
      setHasNextPage(false);
      setStatusSummary(EMPTY_STATUS_SUMMARY);
      setStatusMessage("工单加载失败");
      return;
    }

    const targetPage = options?.targetPage ?? currentPage;
    setStatusMessage("正在加载工单");
    try {
      const params: {
        accessToken: string;
        status?: MinorGuardianSupportRequestStatus;
        query?: string;
        page: number;
        pageSize: number;
      } = {
        accessToken,
        page: targetPage,
        pageSize: DEFAULT_PAGE_SIZE
      };
      if (statusFilter !== "all") {
        params.status = statusFilter;
      }
      if (searchQuery.length > 0) {
        params.query = searchQuery;
      }

      const response = await apiClient.listInternalMinorGuardianSupportRequests(params);
      if (response.items.length === 0 && response.total_count > 0 && response.page > 1) {
        setRequests([]);
        setSelectedRequestId(null);
        setTotalCount(response.total_count);
        setPageSize(response.page_size);
        setHasNextPage(response.has_next_page);
        setOrderedBy(response.ordered_by);
        setStatusSummary(response.status_summary);
        setStatusMessage("当前页已空，正在回退上一页");
        setError(null);
        setCurrentPage(response.page - 1);
        return;
      }

      setRequests(response.items);
      setSelectedRequestId((current) => resolveSelectedRequestId(response, current, options));
      setTotalCount(response.total_count);
      setPageSize(response.page_size);
      setHasNextPage(response.has_next_page);
      setOrderedBy(response.ordered_by);
      setStatusSummary(response.status_summary);
      setCurrentPage(response.page);
      setStatusMessage(`已加载 ${response.total_count} 条工单，第 ${response.page}/${pageCountForResponse(response)} 页`);
      setError(null);
    } catch (loadError) {
      if (loadError instanceof ApiRequestError && loadError.statusCode === 403) {
        setError("当前账号没有内部处理权限，仅 ops/admin 可访问监护人工单处理台");
      } else if (loadError instanceof ApiRequestError && loadError.statusCode === 404) {
        setError("内部调试路由未启用，当前环境无法加载监护人工单处理台");
      } else {
        setError(loadError instanceof Error ? loadError.message : "加载监护人工单失败");
      }
      setRequests([]);
      setSelectedRequestId(null);
      setTotalCount(0);
      setHasNextPage(false);
      setPageSize(DEFAULT_PAGE_SIZE);
      setOrderedBy("updated_at_desc");
      setStatusSummary(EMPTY_STATUS_SUMMARY);
      setStatusMessage("工单加载失败");
    }
  };

  useEffect(() => {
    void loadRequests({
      targetPage: currentPage
    });
  }, [statusFilter, searchQuery, currentPage]);

  useEffect(() => {
    if (!selectedRequest) {
      setHandledBy("");
      setOperatorNote("");
      setNextStatus("contacted");
      return;
    }

    setHandledBy(selectedRequest.handled_by ?? "");
    setOperatorNote(selectedRequest.operator_note ?? "");
    setNextStatus(getDefaultNextStatus(selectedRequest.status));
  }, [selectedRequest]);

  const submitUpdate = async (): Promise<void> => {
    const accessToken = tokenStorage.getAccessToken();
    if (!accessToken) {
      setError("会话已失效，请重新登录");
      return;
    }
    if (!selectedRequest) {
      setError("请先选择一条工单");
      return;
    }
    if (handledBy.trim().length === 0) {
      setError("请填写处理人");
      return;
    }

    try {
      const updated = await apiClient.updateInternalMinorGuardianSupportRequest(
        accessToken,
        selectedRequest.request_id,
        {
          status: nextStatus,
          handled_by: handledBy.trim(),
          operator_note: operatorNote.trim() || undefined
        }
      );
      setMessage(`工单 ${updated.request_id} 已更新为 ${STATUS_LABELS[updated.status]}`);
      setError(null);
      const preferActionableSelection = nextStatus === "closed";
      await loadRequests({
        targetPage: currentPage,
        preferredRequestId: preferActionableSelection
          ? getNextActionableRequestId(requests, selectedRequest.request_id)
          : updated.request_id,
        preferActionableSelection
      });
    } catch (updateError) {
      setError(updateError instanceof Error ? updateError.message : "更新工单失败");
    }
  };

  const applySearch = (): void => {
    setCurrentPage(1);
    setSearchQuery(searchInput.trim());
  };

  const clearSearch = (): void => {
    setSearchInput("");
    setCurrentPage(1);
    setSearchQuery("");
  };

  const exportCurrentFilter = async (): Promise<void> => {
    const accessToken = tokenStorage.getAccessToken();
    if (!accessToken) {
      setError("会话已失效，请重新登录");
      return;
    }

    try {
      const exported = await apiClient.exportInternalMinorGuardianSupportRequests({
        accessToken,
        status: statusFilter !== "all" ? statusFilter : undefined,
        query: searchQuery.length > 0 ? searchQuery : undefined
      });
      setLastExportFilename(exported.filename);
      setLastExportContent(exported.content);
      setExportMessage(`已生成导出 ${exported.filename}`);
      setError(null);
    } catch (exportError) {
      setError(exportError instanceof Error ? exportError.message : "导出监护人工单失败");
    }
  };

  const changeStatusFilter = (value: SupportRequestFilter): void => {
    setCurrentPage(1);
    setStatusFilter(value);
  };

  const loadPreviousPage = (): void => {
    setCurrentPage((page) => Math.max(1, page - 1));
  };

  const loadNextPage = (): void => {
    if (!hasNextPage) {
      return;
    }
    setCurrentPage((page) => page + 1);
  };

  const applyContactTemplate = (): void => {
    if (!selectedRequest) {
      setError("请先选择一条工单");
      return;
    }
    setNextStatus("contacted");
    setOperatorNote(buildContactTemplate(selectedRequest));
    setError(null);
  };

  const applyCloseTemplate = (): void => {
    if (!selectedRequest) {
      setError("请先选择一条工单");
      return;
    }
    setNextStatus("closed");
    setOperatorNote(buildCloseTemplate(selectedRequest));
    setError(null);
  };

  return (
    <section>
      <h1>监护人工单处理台</h1>
      <p>用于处理未成年人监护人提交的账号审查、使用顾虑与数据删除协助请求。</p>
      <p>当前页面依赖服务端 `INTERNAL_DEBUG_ROUTES_ENABLED=true`。</p>
      <p>
        <a href="/home">返回首页</a>
      </p>

      {error ? <p role="alert">{error}</p> : null}

      <p>加载状态: {statusMessage}</p>
      <p>消息: {message}</p>
      <p>导出: {exportMessage}</p>
      <p>当前搜索: {searchQuery || "-"}</p>

      <label htmlFor="guardian-support-filter">工单状态筛选</label>
      <select
        id="guardian-support-filter"
        value={statusFilter}
        onChange={(event) => changeStatusFilter(event.target.value as SupportRequestFilter)}
      >
        {FILTER_OPTIONS.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
      <button
        type="button"
        onClick={() =>
          void loadRequests({
            preferredRequestId: selectedRequestId,
            targetPage: currentPage
          })
        }
      >
        刷新工单
      </button>

      <label htmlFor="guardian-support-search">搜索监护人工单</label>
      <input
        id="guardian-support-search"
        value={searchInput}
        onChange={(event) => setSearchInput(event.target.value)}
        placeholder="支持 user_id / 邮箱 / 电话 / request_id / 联系方式"
      />
      <button type="button" onClick={applySearch}>
        搜索工单
      </button>
      <button type="button" onClick={clearSearch}>
        清空搜索
      </button>

      <h2>工单列表</h2>
      <p>总数: {totalCount}</p>
      <p>
        分页: 第 {currentPage} / {pageCount} 页，每页 {pageSize} 条
      </p>
      <p>排序: {ORDER_LABELS[orderedBy]}</p>
      <p>
        队列摘要: 待审核 {statusSummary.pending_review} / 已联系 {statusSummary.contacted} / 已关闭{" "}
        {statusSummary.closed}
      </p>
      <button type="button" onClick={loadPreviousPage} disabled={currentPage <= 1}>
        上一页
      </button>
      <button type="button" onClick={loadNextPage} disabled={!hasNextPage}>
        下一页
      </button>
      <button type="button" onClick={() => void exportCurrentFilter()}>
        导出当前筛选 CSV
      </button>
      {requests.length === 0 ? <p>当前筛选下暂无工单。</p> : null}
      <ul>
        {requests.map((request) => (
          <li key={request.request_id}>
            <button type="button" onClick={() => setSelectedRequestId(request.request_id)}>
              {request.request_id === selectedRequestId ? "[当前]" : "[查看]"} {TOPIC_LABELS[request.topic]} /{" "}
              {STATUS_LABELS[request.status]} / {toDisplayText(request.user_email ?? request.user_phone)}
            </button>
          </li>
        ))}
      </ul>

      {selectedRequest ? (
        <article>
          <h2>工单详情</h2>
          <p>request_id: {selectedRequest.request_id}</p>
          <p>user_id: {selectedRequest.user_id}</p>
          <p>user_email: {toDisplayText(selectedRequest.user_email)}</p>
          <p>user_phone: {toDisplayText(selectedRequest.user_phone)}</p>
          <p>user_display_name: {toDisplayText(selectedRequest.user_display_name)}</p>
          <p>user_status: {selectedRequest.user_status}</p>
          <p>minor_guardian_age_band: {selectedRequest.minor_guardian_age_band}</p>
          <p>topic: {TOPIC_LABELS[selectedRequest.topic]}</p>
          <p>
            contact: {CONTACT_CHANNEL_LABELS[selectedRequest.contact_channel]} / {selectedRequest.contact_value}
          </p>
          <p>message: {selectedRequest.message}</p>
          <p>status: {STATUS_LABELS[selectedRequest.status]}</p>
          <p>created_at: {selectedRequest.created_at}</p>
          <p>updated_at: {selectedRequest.updated_at}</p>
          <p>resolved_at: {toDisplayText(selectedRequest.resolved_at)}</p>
          <p>handled_by: {toDisplayText(selectedRequest.handled_by)}</p>
          <p>operator_note: {toDisplayText(selectedRequest.operator_note)}</p>

          <h3>处理操作</h3>
          <p>快捷模板</p>
          <button type="button" onClick={applyContactTemplate}>
            填入联系模板
          </button>
          <button type="button" onClick={applyCloseTemplate}>
            填入关闭模板
          </button>

          <label htmlFor="guardian-support-handled-by">处理人</label>
          <input
            id="guardian-support-handled-by"
            value={handledBy}
            onChange={(event) => setHandledBy(event.target.value)}
            placeholder="例如 ops-reviewer-1"
          />

          <label htmlFor="guardian-support-next-status">更新状态</label>
          <select
            id="guardian-support-next-status"
            value={nextStatus}
            onChange={(event) => setNextStatus(event.target.value as MinorGuardianSupportRequestStatus)}
          >
            {STATUS_OPTIONS.map((status) => (
              <option
                key={status}
                value={status}
                disabled={!canTransitionToStatus(selectedRequest.status, status)}
              >
                {STATUS_LABELS[status]}
              </option>
            ))}
          </select>

          <label htmlFor="guardian-support-operator-note">处理备注</label>
          <textarea
            id="guardian-support-operator-note"
            rows={4}
            value={operatorNote}
            onChange={(event) => setOperatorNote(event.target.value)}
            placeholder="记录联系结果、后续动作或关闭说明"
          />

          <button type="button" onClick={() => void submitUpdate()}>
            保存处理结果
          </button>
        </article>
      ) : (
        <p>请选择一条工单查看详情。</p>
      )}

      {lastExportFilename ? (
        <section>
          <h2>最近导出</h2>
          <p>filename: {lastExportFilename}</p>
          <textarea aria-label="最近导出内容" rows={8} readOnly value={lastExportContent} />
        </section>
      ) : null}
    </section>
  );
};

const pageCountForResponse = (response: InternalMinorGuardianSupportRequestListResponse): number =>
  response.total_count === 0 ? 1 : Math.ceil(response.total_count / response.page_size);
