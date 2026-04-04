import { useEffect, useMemo, useState } from "react";
import { ApiRequestError, type ApiClient } from "../lib/api-client";
import type {
  InternalMinorGuardianSupportRequestDashboardSummary,
  InternalMinorGuardianSupportRequestListResponse,
  InternalMinorGuardianSupportRequestOrderBy,
  InternalMinorGuardianSupportRequestResponse,
  MinorGuardianSupportRequestSlaSummary,
  MinorGuardianSupportRequestSlaState,
  MinorGuardianSupportRequestStatusSummary,
  MinorGuardianSupportRequestStatus
} from "../lib/api-types";
import { TokenStorage } from "../lib/token-storage";

type AdminMinorGuardianSupportPageProps = {
  apiClient: Pick<
    ApiClient,
    | "bulkUpdateInternalMinorGuardianSupportRequests"
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
type AssignmentFilter = "all" | "mine" | "unassigned" | "handled_by";
type SlaFilter = "all" | "due_soon" | "breached";
type QuickViewFilter = "default" | "breached" | "due_soon";
type QueueExportTemplate = "pending_review" | "unassigned" | "mine";
type BulkActionTemplate = "claim" | "contacted" | "closed";
type SavedQueueView = {
  name: string;
  statusFilter: SupportRequestFilter;
  assignmentFilter: AssignmentFilter;
  handledByFilterQuery: string;
  searchQuery: string;
  slaFilter: SlaFilter;
  orderedBy: InternalMinorGuardianSupportRequestOrderBy;
  isDefault: boolean;
};

type SavedQueueViewStateSnapshot = {
  savedViews: SavedQueueView[];
  defaultView: SavedQueueView | null;
};

type BulkUpdateResultSummary = {
  updatedCount: number;
  requestIds: string[];
  statusSummary: MinorGuardianSupportRequestStatusSummary;
  closedCount: number;
  notedCount: number;
  handledByValues: string[];
};

const DEFAULT_PAGE_SIZE = 10;
const SAVED_QUEUE_VIEWS_STORAGE_KEY = "ielts.admin_minor_guardian_support.saved_views";
const EMPTY_STATUS_SUMMARY: MinorGuardianSupportRequestStatusSummary = {
  pending_review: 0,
  contacted: 0,
  closed: 0
};
const EMPTY_SLA_SUMMARY: MinorGuardianSupportRequestSlaSummary = {
  within_sla: 0,
  due_soon: 0,
  breached: 0
};
const EMPTY_DASHBOARD_SUMMARY: InternalMinorGuardianSupportRequestDashboardSummary = {
  open_count: 0,
  assigned_open_count: 0,
  unassigned_open_count: 0,
  breached_open_count: 0,
  due_soon_open_count: 0,
  oldest_open_wait_minutes: 0,
  average_open_wait_minutes: 0
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
const ASSIGNMENT_OPTIONS: Array<{ value: AssignmentFilter; label: string }> = [
  { value: "all", label: "全部工单" },
  { value: "mine", label: "我的工单" },
  { value: "unassigned", label: "未分配" },
  { value: "handled_by", label: "指定处理人" }
];
const SLA_FILTER_OPTIONS: Array<{ value: SlaFilter; label: string }> = [
  { value: "all", label: "全部 SLA" },
  { value: "due_soon", label: "临近超时" },
  { value: "breached", label: "已超时" }
];

const STATUS_OPTIONS: MinorGuardianSupportRequestStatus[] = ["pending_review", "contacted", "closed"];

const ORDER_LABELS: Record<InternalMinorGuardianSupportRequestOrderBy, string> = {
  updated_at_desc: "最近更新优先",
  sla_priority_desc: "SLA 优先",
  queue_wait_desc: "等待时长优先"
};
const ORDER_OPTIONS: Array<{ value: InternalMinorGuardianSupportRequestOrderBy; label: string }> = [
  { value: "updated_at_desc", label: "最近更新优先" },
  { value: "sla_priority_desc", label: "SLA 优先" },
  { value: "queue_wait_desc", label: "等待时长优先" }
];
const SLA_LABELS: Record<MinorGuardianSupportRequestSlaState, string> = {
  within_sla: "SLA 正常",
  due_soon: "临近超时",
  breached: "已超时",
  closed: "已关闭"
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

const BULK_TEMPLATE_NOTES: Record<BulkActionTemplate, string> = {
  claim: "已批量领取监护人工单，待人工跟进。",
  contacted: "已批量联系监护人，等待监护人反馈。",
  closed: "已批量完成监护人跟进并同步结果，工单关闭。"
};

const formatRequestIdList = (requestIds: string[]): string => (requestIds.length > 0 ? requestIds.join(", ") : "-");

const buildBulkUpdateResultSummary = (
  updatedCount: number,
  requestIds: string[],
  items: InternalMinorGuardianSupportRequestResponse[]
): BulkUpdateResultSummary => ({
  updatedCount,
  requestIds,
  statusSummary: items.reduce<MinorGuardianSupportRequestStatusSummary>(
    (summary, item) => ({
      ...summary,
      [item.status]: summary[item.status] + 1
    }),
    {
      pending_review: 0,
      contacted: 0,
      closed: 0
    }
  ),
  closedCount: items.filter((item) => item.status === "closed").length,
  notedCount: items.filter((item) => typeof item.operator_note === "string" && item.operator_note.trim().length > 0).length,
  handledByValues: Array.from(
    new Set(
      items
        .map((item) => item.handled_by?.trim() ?? "")
        .filter((handledBy) => handledBy.length > 0)
    )
  )
});

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

const parseSavedQueueViews = (): SavedQueueView[] => {
  const raw = localStorage.getItem(SAVED_QUEUE_VIEWS_STORAGE_KEY);
  if (!raw) {
    return [];
  }

  try {
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) {
      return [];
    }

    let hasDefaultView = false;
    return parsed.flatMap((item) => {
      if (!item || typeof item !== "object") {
        return [];
      }

      const candidate = item as Partial<SavedQueueView>;
      if (
        typeof candidate.name !== "string" ||
        typeof candidate.statusFilter !== "string" ||
        typeof candidate.assignmentFilter !== "string" ||
        typeof candidate.handledByFilterQuery !== "string" ||
        typeof candidate.searchQuery !== "string" ||
        typeof candidate.slaFilter !== "string" ||
        typeof candidate.orderedBy !== "string"
      ) {
        return [];
      }

      const isDefault = candidate.isDefault === true && !hasDefaultView;
      if (isDefault) {
        hasDefaultView = true;
      }

      return [
        {
          name: candidate.name,
          statusFilter: candidate.statusFilter,
          assignmentFilter: candidate.assignmentFilter,
          handledByFilterQuery: candidate.handledByFilterQuery,
          searchQuery: candidate.searchQuery,
          slaFilter: candidate.slaFilter,
          orderedBy: candidate.orderedBy,
          isDefault
        }
      ];
    });
  } catch {
    return [];
  }
};

const getDefaultSavedQueueView = (views: SavedQueueView[]): SavedQueueView | null =>
  views.find((view) => view.isDefault) ?? null;

const loadSavedQueueViewState = (): SavedQueueViewStateSnapshot => {
  const savedViews = parseSavedQueueViews();
  return {
    savedViews,
    defaultView: getDefaultSavedQueueView(savedViews)
  };
};

const persistSavedQueueViews = (views: SavedQueueView[]): void => {
  localStorage.setItem(SAVED_QUEUE_VIEWS_STORAGE_KEY, JSON.stringify(views));
};

export const AdminMinorGuardianSupportPage = ({ apiClient, tokenStorage }: AdminMinorGuardianSupportPageProps) => {
  const currentOperatorId = tokenStorage.getUserId() ?? "";
  const initialSavedQueueViewState = useMemo(() => loadSavedQueueViewState(), []);
  const initialDefaultSavedView = initialSavedQueueViewState.defaultView;
  const [statusFilter, setStatusFilter] = useState<SupportRequestFilter>(
    initialDefaultSavedView?.statusFilter ?? "pending_review"
  );
  const [assignmentFilter, setAssignmentFilter] = useState<AssignmentFilter>(
    initialDefaultSavedView?.assignmentFilter ?? "all"
  );
  const [slaFilter, setSlaFilter] = useState<SlaFilter>(initialDefaultSavedView?.slaFilter ?? "all");
  const [handledByFilterInput, setHandledByFilterInput] = useState(initialDefaultSavedView?.handledByFilterQuery ?? "");
  const [handledByFilterQuery, setHandledByFilterQuery] = useState(initialDefaultSavedView?.handledByFilterQuery ?? "");
  const [searchInput, setSearchInput] = useState(initialDefaultSavedView?.searchQuery ?? "");
  const [searchQuery, setSearchQuery] = useState(initialDefaultSavedView?.searchQuery ?? "");
  const [currentPage, setCurrentPage] = useState(1);
  const [requests, setRequests] = useState<InternalMinorGuardianSupportRequestResponse[]>([]);
  const [totalCount, setTotalCount] = useState(0);
  const [pageSize, setPageSize] = useState(DEFAULT_PAGE_SIZE);
  const [hasNextPage, setHasNextPage] = useState(false);
  const [orderedBy, setOrderedBy] = useState<InternalMinorGuardianSupportRequestOrderBy>(
    initialDefaultSavedView?.orderedBy ?? "updated_at_desc"
  );
  const [quickView, setQuickView] = useState<QuickViewFilter>("default");
  const [statusSummary, setStatusSummary] = useState<MinorGuardianSupportRequestStatusSummary>(EMPTY_STATUS_SUMMARY);
  const [slaSummary, setSlaSummary] = useState<MinorGuardianSupportRequestSlaSummary>(EMPTY_SLA_SUMMARY);
  const [dashboardSummary, setDashboardSummary] = useState<InternalMinorGuardianSupportRequestDashboardSummary>(
    EMPTY_DASHBOARD_SUMMARY
  );
  const [selectedRequestId, setSelectedRequestId] = useState<string | null>(null);
  const [selectedRequestIds, setSelectedRequestIds] = useState<string[]>([]);
  const [handledBy, setHandledBy] = useState("");
  const [operatorNote, setOperatorNote] = useState("");
  const [nextStatus, setNextStatus] = useState<MinorGuardianSupportRequestStatus>("contacted");
  const [bulkHandledBy, setBulkHandledBy] = useState(currentOperatorId);
  const [bulkOperatorNote, setBulkOperatorNote] = useState("");
  const [bulkNextStatus, setBulkNextStatus] = useState<"keep" | MinorGuardianSupportRequestStatus>("keep");
  const [lastBulkUpdateSummary, setLastBulkUpdateSummary] = useState<BulkUpdateResultSummary | null>(null);
  const [statusMessage, setStatusMessage] = useState("未加载工单");
  const [message, setMessage] = useState(
    initialDefaultSavedView ? `已恢复默认保存视图 ${initialDefaultSavedView.name}` : "未处理"
  );
  const [exportMessage, setExportMessage] = useState("未导出");
  const [savedViewName, setSavedViewName] = useState("");
  const [savedViewRenameSource, setSavedViewRenameSource] = useState<string | null>(null);
  const [savedViews, setSavedViews] = useState<SavedQueueView[]>(() => initialSavedQueueViewState.savedViews);
  const [lastExportFilename, setLastExportFilename] = useState<string | null>(null);
  const [lastExportContent, setLastExportContent] = useState("");
  const [error, setError] = useState<string | null>(null);

  const pageCount = totalCount === 0 ? 1 : Math.ceil(totalCount / pageSize);
  const selectedRequest = useMemo(
    () => requests.find((item) => item.request_id === selectedRequestId) ?? null,
    [requests, selectedRequestId]
  );
  const selectedRequests = useMemo(() => {
    const selectedIds = new Set(selectedRequestIds);
    return requests.filter((item) => selectedIds.has(item.request_id));
  }, [requests, selectedRequestIds]);
  const defaultSavedView = useMemo(() => getDefaultSavedQueueView(savedViews), [savedViews]);
  const selectedRequestStatusSummary = useMemo(
    () =>
      selectedRequests.reduce<MinorGuardianSupportRequestStatusSummary>(
        (summary, request) => ({
          ...summary,
          [request.status]: summary[request.status] + 1
        }),
        {
          pending_review: 0,
          contacted: 0,
          closed: 0
        }
      ),
    [selectedRequests]
  );
  const selectedAssignedCount = useMemo(
    () => selectedRequests.filter((request) => typeof request.handled_by === "string" && request.handled_by.trim().length > 0).length,
    [selectedRequests]
  );
  const selectedUnassignedCount = selectedRequests.length - selectedAssignedCount;
  const bulkInvalidTransitionRequests = useMemo(
    () =>
      bulkNextStatus === "keep"
        ? []
        : selectedRequests
            .filter((request) => !canTransitionToStatus(request.status, bulkNextStatus))
            .map((request) => request.request_id),
    [bulkNextStatus, selectedRequests]
  );
  const bulkExecutableCount = selectedRequests.length - bulkInvalidTransitionRequests.length;
  const bulkBlockingReason = useMemo(() => {
    if (selectedRequestIds.length === 0) {
      return "请先勾选至少一条工单";
    }
    if (bulkHandledBy.trim().length === 0) {
      return "请填写批量处理人";
    }
    if (bulkInvalidTransitionRequests.length > 0) {
      return `目标状态不适用于 ${formatRequestIdList(bulkInvalidTransitionRequests)}`;
    }
    return null;
  }, [bulkHandledBy, bulkInvalidTransitionRequests, selectedRequestIds.length]);
  const canApplyBulkContactTemplate =
    selectedRequests.length > 0 && selectedRequests.every((request) => canTransitionToStatus(request.status, "contacted"));
  const canApplyBulkCloseTemplate =
    selectedRequests.length > 0 && selectedRequests.every((request) => canTransitionToStatus(request.status, "closed"));

  const activeHandledByFilter = assignmentFilter === "mine"
    ? currentOperatorId
    : assignmentFilter === "handled_by"
      ? handledByFilterQuery
      : undefined;
  const activeUnassignedFilter = assignmentFilter === "unassigned";
  const activeSlaFilter = slaFilter === "all" ? undefined : slaFilter;

  const loadRequests = async (options?: LoadRequestOptions): Promise<void> => {
    const accessToken = tokenStorage.getAccessToken();
    if (!accessToken) {
      setError("会话已失效，请重新登录");
      setRequests([]);
      setSelectedRequestId(null);
      setTotalCount(0);
      setHasNextPage(false);
      setStatusSummary(EMPTY_STATUS_SUMMARY);
      setSlaSummary(EMPTY_SLA_SUMMARY);
      setDashboardSummary(EMPTY_DASHBOARD_SUMMARY);
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
        handledBy?: string;
        unassigned?: boolean;
        slaState?: "due_soon" | "breached";
        orderBy: InternalMinorGuardianSupportRequestOrderBy;
        page: number;
        pageSize: number;
      } = {
        accessToken,
        orderBy: orderedBy,
        page: targetPage,
        pageSize: DEFAULT_PAGE_SIZE
      };
      if (statusFilter !== "all") {
        params.status = statusFilter;
      }
      if (searchQuery.length > 0) {
        params.query = searchQuery;
      }
      if (activeHandledByFilter && activeHandledByFilter.trim().length > 0) {
        params.handledBy = activeHandledByFilter;
      }
      if (activeUnassignedFilter) {
        params.unassigned = true;
      }
      if (activeSlaFilter) {
        params.slaState = activeSlaFilter;
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
        setSlaSummary(response.sla_summary);
        setDashboardSummary(response.dashboard_summary);
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
      setSlaSummary(response.sla_summary);
      setDashboardSummary(response.dashboard_summary);
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
      setQuickView("default");
      setStatusSummary(EMPTY_STATUS_SUMMARY);
      setSlaSummary(EMPTY_SLA_SUMMARY);
      setDashboardSummary(EMPTY_DASHBOARD_SUMMARY);
      setStatusMessage("工单加载失败");
    }
  };

  useEffect(() => {
    void loadRequests({
      targetPage: currentPage
    });
  }, [statusFilter, searchQuery, activeHandledByFilter, activeUnassignedFilter, activeSlaFilter, orderedBy, currentPage]);

  useEffect(() => {
    if (!selectedRequest) {
      setHandledBy(currentOperatorId);
      setOperatorNote("");
      setNextStatus("contacted");
      return;
    }

    setHandledBy(selectedRequest.handled_by ?? currentOperatorId);
    setOperatorNote(selectedRequest.operator_note ?? "");
    setNextStatus(getDefaultNextStatus(selectedRequest.status));
  }, [selectedRequest, currentOperatorId]);

  useEffect(() => {
    setSelectedRequestIds((current) => current.filter((requestId) => requests.some((item) => item.request_id === requestId)));
  }, [requests]);

  useEffect(() => {
    setBulkHandledBy((current) => (current.trim().length > 0 ? current : currentOperatorId));
  }, [currentOperatorId]);

  useEffect(() => {
    if (slaFilter === "breached") {
      setQuickView("breached");
      return;
    }
    if (slaFilter === "due_soon") {
      setQuickView("due_soon");
      return;
    }
    setQuickView("default");
  }, [slaFilter]);

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

  const submitBulkUpdate = async (): Promise<void> => {
    const accessToken = tokenStorage.getAccessToken();
    if (!accessToken) {
      setError("会话已失效，请重新登录");
      return;
    }
    if (selectedRequestIds.length === 0) {
      setError("请先勾选至少一条工单");
      return;
    }
    if (bulkHandledBy.trim().length === 0) {
      setError("请填写批量处理人");
      return;
    }
    if (bulkInvalidTransitionRequests.length > 0) {
      setError("所选工单无法批量更新到目标状态");
      return;
    }

    try {
      const updated = await apiClient.bulkUpdateInternalMinorGuardianSupportRequests(accessToken, {
        request_ids: selectedRequestIds,
        status: bulkNextStatus === "keep" ? undefined : bulkNextStatus,
        handled_by: bulkHandledBy.trim(),
        operator_note: bulkOperatorNote.trim() || undefined
      });
      setLastBulkUpdateSummary(buildBulkUpdateResultSummary(updated.updated_count, updated.request_ids, updated.items));
      setMessage(`已批量更新 ${updated.updated_count} 条工单`);
      setError(null);
      setSelectedRequestIds([]);
      setBulkNextStatus("keep");
      setBulkOperatorNote("");
      await loadRequests({
        targetPage: currentPage,
        preferredRequestId: selectedRequestId
      });
    } catch (updateError) {
      setError(updateError instanceof Error ? updateError.message : "批量更新工单失败");
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

  const applyHandledByFilter = (): void => {
    setCurrentPage(1);
    setAssignmentFilter("handled_by");
    setHandledByFilterQuery(handledByFilterInput.trim());
  };

  const clearHandledByFilter = (): void => {
    setHandledByFilterInput("");
    setHandledByFilterQuery("");
    setCurrentPage(1);
    setAssignmentFilter("all");
  };

  const exportTemplateQueue = async (template: QueueExportTemplate): Promise<void> => {
    const accessToken = tokenStorage.getAccessToken();
    if (!accessToken) {
      setError("会话已失效，请重新登录");
      return;
    }
    if (template === "mine" && currentOperatorId.trim().length === 0) {
      setError("当前账号缺少用户 ID，无法导出我的工单");
      return;
    }

    try {
      const exported = await apiClient.exportInternalMinorGuardianSupportRequests({
        accessToken,
        status: template === "pending_review" ? "pending_review" : undefined,
        query: searchQuery.length > 0 ? searchQuery : undefined,
        handledBy: template === "mine" ? currentOperatorId : undefined,
        unassigned: template === "unassigned" ? true : undefined,
        orderBy: "sla_priority_desc"
      });
      setLastExportFilename(exported.filename);
      setLastExportContent(exported.content);
      setExportMessage(
        `已生成${template === "pending_review" ? "待审核" : template === "unassigned" ? "未分配" : "我的工单"}导出 ${
          exported.filename
        }`
      );
      setError(null);
    } catch (exportError) {
      setError(exportError instanceof Error ? exportError.message : "导出模板队列失败");
    }
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
        query: searchQuery.length > 0 ? searchQuery : undefined,
        handledBy: activeHandledByFilter && activeHandledByFilter.trim().length > 0 ? activeHandledByFilter : undefined,
        unassigned: activeUnassignedFilter ? true : undefined,
        slaState: activeSlaFilter,
        orderBy: orderedBy
      });
      setLastExportFilename(exported.filename);
      setLastExportContent(exported.content);
      setExportMessage(`已生成导出 ${exported.filename}`);
      setError(null);
    } catch (exportError) {
      setError(exportError instanceof Error ? exportError.message : "导出监护人工单失败");
    }
  };

  const exportRiskQueue = async (slaState: "due_soon" | "breached"): Promise<void> => {
    const accessToken = tokenStorage.getAccessToken();
    if (!accessToken) {
      setError("会话已失效，请重新登录");
      return;
    }

    try {
      const exported = await apiClient.exportInternalMinorGuardianSupportRequests({
        accessToken,
        query: searchQuery.length > 0 ? searchQuery : undefined,
        handledBy: activeHandledByFilter && activeHandledByFilter.trim().length > 0 ? activeHandledByFilter : undefined,
        unassigned: activeUnassignedFilter ? true : undefined,
        slaState,
        orderBy: "sla_priority_desc"
      });
      setLastExportFilename(exported.filename);
      setLastExportContent(exported.content);
      setExportMessage(`已生成${slaState === "breached" ? "已超时" : "临近超时"}导出 ${exported.filename}`);
      setError(null);
    } catch (exportError) {
      setError(exportError instanceof Error ? exportError.message : "导出风险队列失败");
    }
  };

  const changeStatusFilter = (value: SupportRequestFilter): void => {
    setCurrentPage(1);
    setStatusFilter(value);
  };

  const changeSlaFilter = (value: SlaFilter): void => {
    setCurrentPage(1);
    setSlaFilter(value);
  };

  const changeOrderBy = (value: InternalMinorGuardianSupportRequestOrderBy): void => {
    setCurrentPage(1);
    setOrderedBy(value);
  };

  const changeAssignmentFilter = (value: AssignmentFilter): void => {
    setCurrentPage(1);
    setAssignmentFilter(value);
    if (value === "handled_by") {
      setHandledByFilterQuery(handledByFilterInput.trim());
      return;
    }
    if (value !== "mine") {
      setHandledByFilterQuery("");
    }
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

  const toggleRequestSelection = (requestId: string): void => {
    setSelectedRequestIds((current) =>
      current.includes(requestId) ? current.filter((item) => item !== requestId) : [...current, requestId]
    );
  };

  const toggleSelectAllCurrentPage = (): void => {
    if (requests.length === 0) {
      return;
    }

    setSelectedRequestIds((current) => {
      const requestIds = requests.map((request) => request.request_id);
      const allSelected = requestIds.every((requestId) => current.includes(requestId));
      if (allSelected) {
        return current.filter((requestId) => !requestIds.includes(requestId));
      }

      return Array.from(new Set([...current, ...requestIds]));
    });
  };

  const clearSelectedRequests = (): void => {
    setSelectedRequestIds([]);
  };

  const applyBulkActionTemplate = (template: BulkActionTemplate): void => {
    if (selectedRequests.length === 0) {
      setError("请先勾选至少一条工单");
      return;
    }

    const nextHandledBy = currentOperatorId.trim().length > 0 ? currentOperatorId : bulkHandledBy.trim();
    if (nextHandledBy.length === 0) {
      setError("当前账号缺少用户 ID，请手动填写批量处理人");
      return;
    }

    if (template === "contacted" && !canApplyBulkContactTemplate) {
      setError("所选工单无法套用已联系模板");
      return;
    }
    if (template === "closed" && !canApplyBulkCloseTemplate) {
      setError("所选工单无法套用关闭模板");
      return;
    }

    setBulkHandledBy(nextHandledBy);
    setBulkOperatorNote(BULK_TEMPLATE_NOTES[template]);
    setBulkNextStatus(template === "claim" ? "keep" : template);
    setMessage(
      template === "claim"
        ? "已套用批量领取模板"
        : template === "contacted"
          ? "已套用批量已联系模板"
          : "已套用批量关闭模板"
    );
    setError(null);
  };

  const allCurrentPageSelected = requests.length > 0 && requests.every((request) => selectedRequestIds.includes(request.request_id));

  const saveCurrentView = (): void => {
    const normalizedName = savedViewName.trim();
    if (normalizedName.length === 0) {
      setError("请填写保存视图名称");
      return;
    }

    const nextView: SavedQueueView = {
      name: normalizedName,
      statusFilter,
      assignmentFilter,
      handledByFilterQuery,
      searchQuery,
      slaFilter,
      orderedBy,
      isDefault: false
    };
    setSavedViews((current) => {
      const existingView = current.find((view) => view.name === normalizedName);
      const nextViews = [
        {
          ...nextView,
          isDefault: existingView?.isDefault ?? false
        },
        ...current.filter((view) => view.name !== normalizedName)
      ].slice(0, 6);
      persistSavedQueueViews(nextViews);
      return nextViews;
    });
    setSavedViewName("");
    setSavedViewRenameSource(null);
    setMessage(`已保存视图 ${normalizedName}`);
    setError(null);
  };

  const applySavedView = (view: SavedQueueView): void => {
    setCurrentPage(1);
    setStatusFilter(view.statusFilter);
    setAssignmentFilter(view.assignmentFilter);
    setHandledByFilterInput(view.handledByFilterQuery);
    setHandledByFilterQuery(view.handledByFilterQuery);
    setSearchInput(view.searchQuery);
    setSearchQuery(view.searchQuery);
    setSlaFilter(view.slaFilter);
    setOrderedBy(view.orderedBy);
    setMessage(`已应用视图 ${view.name}`);
    setError(null);
  };

  const deleteSavedView = (name: string): void => {
    setSavedViews((current) => {
      const nextViews = current.filter((view) => view.name !== name);
      persistSavedQueueViews(nextViews);
      return nextViews;
    });
    if (savedViewRenameSource === name) {
      setSavedViewRenameSource(null);
      setSavedViewName("");
    }
    setMessage(`已删除视图 ${name}`);
    setError(null);
  };

  const startRenamingSavedView = (name: string): void => {
    setSavedViewRenameSource(name);
    setSavedViewName(name);
    setError(null);
  };

  const cancelRenamingSavedView = (): void => {
    setSavedViewRenameSource(null);
    setSavedViewName("");
    setError(null);
  };

  const renameSavedView = (): void => {
    if (!savedViewRenameSource) {
      saveCurrentView();
      return;
    }

    const normalizedName = savedViewName.trim();
    if (normalizedName.length === 0) {
      setError("请填写重命名后的视图名称");
      return;
    }
    if (normalizedName !== savedViewRenameSource && savedViews.some((view) => view.name === normalizedName)) {
      setError("视图名称已存在，请更换名称");
      return;
    }

    setSavedViews((current) => {
      const nextViews = current.map((view) =>
        view.name === savedViewRenameSource
          ? {
              ...view,
              name: normalizedName
            }
          : view
      );
      persistSavedQueueViews(nextViews);
      return nextViews;
    });
    setSavedViewRenameSource(null);
    setSavedViewName("");
    setMessage(`已将视图 ${savedViewRenameSource} 重命名为 ${normalizedName}`);
    setError(null);
  };

  const toggleDefaultSavedView = (name: string): void => {
    const targetView = savedViews.find((view) => view.name === name);
    if (!targetView) {
      setError("未找到要设置的视图");
      return;
    }

    const nextDefaultState = !targetView.isDefault;
    setSavedViews((current) => {
      const nextViews = current.map((view) =>
        view.name === name
          ? {
              ...view,
              isDefault: nextDefaultState
            }
          : {
              ...view,
              isDefault: false
            }
      );
      persistSavedQueueViews(nextViews);
      return nextViews;
    });
    setMessage(nextDefaultState ? `已将视图 ${name} 设为默认保存视图` : `已取消默认保存视图 ${name}`);
    setError(null);
  };

  const applyQuickView = (view: QuickViewFilter): void => {
    setCurrentPage(1);
    if (view === "default") {
      setStatusFilter("pending_review");
      setSlaFilter("all");
      setOrderedBy("updated_at_desc");
      return;
    }

    setStatusFilter("all");
    setSlaFilter(view);
    setOrderedBy("sla_priority_desc");
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
      <p>当前归属: {assignmentFilter === "mine" ? `我的工单(${toDisplayText(currentOperatorId)})` : assignmentFilter === "unassigned" ? "未分配" : assignmentFilter === "handled_by" ? `处理人=${handledByFilterQuery || "-"}` : "全部工单"}</p>
      <p>当前 SLA: {slaFilter === "all" ? "全部 SLA" : SLA_LABELS[slaFilter]}</p>
      <p>当前快捷视图: {quickView === "default" ? "默认待审核视图" : quickView === "breached" ? "已超时工单" : "临近超时工单"}</p>

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
      <button type="button" onClick={() => applyQuickView("breached")}>
        查看已超时队列
      </button>
      <button type="button" onClick={() => applyQuickView("due_soon")}>
        查看临近超时队列
      </button>
      <button type="button" onClick={() => applyQuickView("default")}>
        恢复系统默认视图
      </button>

      <label htmlFor="guardian-support-sla-filter">SLA 过滤</label>
      <select
        id="guardian-support-sla-filter"
        value={slaFilter}
        onChange={(event) => changeSlaFilter(event.target.value as SlaFilter)}
      >
        {SLA_FILTER_OPTIONS.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>

      <label htmlFor="guardian-support-order-by">队列排序</label>
      <select
        id="guardian-support-order-by"
        value={orderedBy}
        onChange={(event) => changeOrderBy(event.target.value as InternalMinorGuardianSupportRequestOrderBy)}
      >
        {ORDER_OPTIONS.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>

      <label htmlFor="guardian-support-assignment-filter">工单归属</label>
      <select
        id="guardian-support-assignment-filter"
        value={assignmentFilter}
        onChange={(event) => changeAssignmentFilter(event.target.value as AssignmentFilter)}
      >
        {ASSIGNMENT_OPTIONS.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
      <label htmlFor="guardian-support-handled-by-filter">指定处理人</label>
      <input
        id="guardian-support-handled-by-filter"
        value={handledByFilterInput}
        onChange={(event) => setHandledByFilterInput(event.target.value)}
        placeholder="例如 ops-user-1"
      />
      <button type="button" onClick={applyHandledByFilter}>
        按处理人筛选
      </button>
      <button type="button" onClick={clearHandledByFilter}>
        清空归属筛选
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
      <p>
        SLA 摘要: 正常 {slaSummary.within_sla} / 临近超时 {slaSummary.due_soon} / 已超时 {slaSummary.breached}
      </p>
      <p>
        仪表盘: 待处理 {dashboardSummary.open_count} / 已分配 {dashboardSummary.assigned_open_count} / 未分配{" "}
        {dashboardSummary.unassigned_open_count}
      </p>
      <p>
        风险概览: 已超时 {dashboardSummary.breached_open_count} / 临近超时 {dashboardSummary.due_soon_open_count}
      </p>
      <p>
        等待概览: 最久 {dashboardSummary.oldest_open_wait_minutes} 分钟 / 平均 {dashboardSummary.average_open_wait_minutes} 分钟
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
      <button type="button" onClick={() => void exportRiskQueue("breached")}>
        导出已超时队列 CSV
      </button>
      <button type="button" onClick={() => void exportRiskQueue("due_soon")}>
        导出临近超时队列 CSV
      </button>
      <button type="button" onClick={() => void exportTemplateQueue("pending_review")}>
        导出待审核队列 CSV
      </button>
      <button type="button" onClick={() => void exportTemplateQueue("unassigned")}>
        导出未分配队列 CSV
      </button>
      <button type="button" onClick={() => void exportTemplateQueue("mine")}>
        导出我的工单 CSV
      </button>

      <h3>保存视图</h3>
      <label htmlFor="guardian-support-saved-view-name">视图名称</label>
      <input
        id="guardian-support-saved-view-name"
        value={savedViewName}
        onChange={(event) => setSavedViewName(event.target.value)}
        placeholder="例如 我的高风险队列"
      />
      <button type="button" onClick={savedViewRenameSource ? renameSavedView : saveCurrentView}>
        {savedViewRenameSource ? `确认重命名 ${savedViewRenameSource}` : "保存当前视图"}
      </button>
      {savedViewRenameSource ? (
        <button type="button" onClick={cancelRenamingSavedView}>
          取消重命名
        </button>
      ) : null}
      <p>已保存视图: {savedViews.length}</p>
      <p>默认保存视图: {defaultSavedView?.name ?? "未设置"}</p>
      {savedViews.length === 0 ? <p>暂无已保存视图。</p> : null}
      <ul>
        {savedViews.map((view) => (
          <li key={view.name}>
            <button type="button" onClick={() => applySavedView(view)}>
              应用视图 {view.name}
            </button>
            <button type="button" onClick={() => startRenamingSavedView(view.name)}>
              重命名视图 {view.name}
            </button>
            <button type="button" onClick={() => toggleDefaultSavedView(view.name)}>
              {view.isDefault ? `取消默认视图 ${view.name}` : `设为默认视图 ${view.name}`}
            </button>
            <button type="button" onClick={() => deleteSavedView(view.name)}>
              删除视图 {view.name}
            </button>
          </li>
        ))}
      </ul>

      <h3>批量处理</h3>
      <p>已勾选: {selectedRequestIds.length} 条</p>
      <p>已选 request_id: {formatRequestIdList(selectedRequestIds)}</p>
      <button type="button" onClick={toggleSelectAllCurrentPage} disabled={requests.length === 0}>
        {allCurrentPageSelected ? "取消全选当前页" : "全选当前页"}
      </button>
      <button type="button" onClick={clearSelectedRequests} disabled={selectedRequestIds.length === 0}>
        清空勾选
      </button>
      <p>批量模板: 领取 / 已联系 / 关闭</p>
      <button type="button" onClick={() => applyBulkActionTemplate("claim")} disabled={selectedRequestIds.length === 0}>
        批量领取当前勾选
      </button>
      <button
        type="button"
        onClick={() => applyBulkActionTemplate("contacted")}
        disabled={selectedRequestIds.length === 0}
      >
        套用批量已联系模板
      </button>
      <button type="button" onClick={() => applyBulkActionTemplate("closed")} disabled={selectedRequestIds.length === 0}>
        套用批量关闭模板
      </button>
      <p>
        批量预检: 已分配 {selectedAssignedCount} / 未分配 {selectedUnassignedCount}
      </p>
      <p>
        批量状态分组: 待审核 {selectedRequestStatusSummary.pending_review} / 已联系{" "}
        {selectedRequestStatusSummary.contacted} / 已关闭 {selectedRequestStatusSummary.closed}
      </p>
      <p>
        批量目标状态: {bulkNextStatus === "keep" ? "保持当前状态" : STATUS_LABELS[bulkNextStatus]}
      </p>
      <p>
        批量可执行: {bulkExecutableCount} / 阻塞 {bulkInvalidTransitionRequests.length}
      </p>
      {bulkInvalidTransitionRequests.length > 0 ? (
        <p>批量阻塞 request_id: {formatRequestIdList(bulkInvalidTransitionRequests)}</p>
      ) : null}
      <p>批量提交条件: {bulkBlockingReason ?? "可提交"}</p>

      <label htmlFor="guardian-support-bulk-handled-by">批量处理人</label>
      <input
        id="guardian-support-bulk-handled-by"
        value={bulkHandledBy}
        onChange={(event) => setBulkHandledBy(event.target.value)}
        placeholder="默认回填当前登录用户 ID"
      />
      <button type="button" onClick={() => setBulkHandledBy(currentOperatorId)}>
        批量使用我的账号 ID
      </button>

      <label htmlFor="guardian-support-bulk-next-status">批量状态</label>
      <select
        id="guardian-support-bulk-next-status"
        value={bulkNextStatus}
        onChange={(event) => setBulkNextStatus(event.target.value as "keep" | MinorGuardianSupportRequestStatus)}
      >
        <option value="keep">保持当前状态</option>
        {STATUS_OPTIONS.map((status) => (
          <option
            key={status}
            value={status}
            disabled={
              selectedRequests.length > 0 &&
              selectedRequests.some((request) => !canTransitionToStatus(request.status, status))
            }
          >
            {STATUS_LABELS[status]}
          </option>
        ))}
      </select>

      <label htmlFor="guardian-support-bulk-operator-note">批量备注</label>
      <textarea
        id="guardian-support-bulk-operator-note"
        rows={3}
        value={bulkOperatorNote}
        onChange={(event) => setBulkOperatorNote(event.target.value)}
        placeholder="用于统一记录批量跟进结果或备注"
      />

      <button type="button" onClick={() => void submitBulkUpdate()} disabled={bulkBlockingReason !== null}>
        保存批量处理
      </button>
      {lastBulkUpdateSummary ? (
        <>
          <p>最近批量结果: 已更新 {lastBulkUpdateSummary.updatedCount} 条</p>
          <p>
            最近批量状态: 待审核 {lastBulkUpdateSummary.statusSummary.pending_review} / 已联系{" "}
            {lastBulkUpdateSummary.statusSummary.contacted} / 已关闭 {lastBulkUpdateSummary.statusSummary.closed}
          </p>
          <p>
            最近批量关闭: {lastBulkUpdateSummary.closedCount} / 已写入备注 {lastBulkUpdateSummary.notedCount}
          </p>
          <p>最近批量处理人: {formatRequestIdList(lastBulkUpdateSummary.handledByValues)}</p>
          <p>最近批量 request_id: {formatRequestIdList(lastBulkUpdateSummary.requestIds)}</p>
        </>
      ) : (
        <p>最近批量结果: 暂无</p>
      )}

      {requests.length === 0 ? <p>当前筛选下暂无工单。</p> : null}
      <ul>
        {requests.map((request) => (
          <li key={request.request_id}>
            <label>
              <input
                type="checkbox"
                aria-label={`选择工单 ${request.request_id}`}
                checked={selectedRequestIds.includes(request.request_id)}
                onChange={() => toggleRequestSelection(request.request_id)}
              />
              勾选
            </label>
            <button type="button" onClick={() => setSelectedRequestId(request.request_id)}>
              {request.request_id === selectedRequestId ? "[当前]" : "[查看]"} {TOPIC_LABELS[request.topic]} /{" "}
              {STATUS_LABELS[request.status]} / {SLA_LABELS[request.sla_state]} / 等待 {request.queue_wait_minutes} 分钟 /{" "}
              {toDisplayText(request.user_email ?? request.user_phone)}
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
          <p>last_activity_at: {selectedRequest.last_activity_at}</p>
          <p>queue_wait_minutes: {selectedRequest.queue_wait_minutes}</p>
          <p>sla_target_minutes: {toDisplayText(String(selectedRequest.sla_target_minutes ?? "-"))}</p>
          <p>sla_state: {SLA_LABELS[selectedRequest.sla_state]}</p>
          <p>sla_breached: {selectedRequest.sla_breached ? "yes" : "no"}</p>
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
            placeholder="默认回填当前登录用户 ID"
          />
          <button type="button" onClick={() => setHandledBy(currentOperatorId)}>
            使用我的账号 ID
          </button>

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
