import { useState } from "react";
import type { ApiClient } from "../lib/api-client";
import type { TokenStorage } from "../lib/token-storage";

type SystemRoleAdminPageProps = {
  apiClient: Pick<ApiClient, "getSystemUserRoles" | "setSystemUserRoles" | "listSystemRoleAuditLogs">;
  tokenStorage: Pick<TokenStorage, "getAccessToken">;
};

type SystemRole = "learner" | "qa" | "ops" | "admin";

type SystemRoleAuditItem = {
  audit_id: string;
  operator_user_id?: string;
  target_user_id?: string;
  roles: SystemRole[];
  created_at: string;
};

export const SystemRoleAdminPage = ({ apiClient, tokenStorage }: SystemRoleAdminPageProps) => {
  const [systemUserId, setSystemUserId] = useState("");
  const [roleLearner, setRoleLearner] = useState(true);
  const [roleQa, setRoleQa] = useState(false);
  const [roleOps, setRoleOps] = useState(false);
  const [roleAdmin, setRoleAdmin] = useState(false);
  const [roleSummary, setRoleSummary] = useState("-");

  const [auditTargetUserId, setAuditTargetUserId] = useState("");
  const [auditOperatorUserId, setAuditOperatorUserId] = useState("");
  const [auditPage, setAuditPage] = useState("1");
  const [auditPageSize, setAuditPageSize] = useState("20");
  const [auditTotal, setAuditTotal] = useState(0);
  const [auditItems, setAuditItems] = useState<SystemRoleAuditItem[]>([]);

  const [status, setStatus] = useState("未开始");
  const [error, setError] = useState<string | null>(null);

  const withToken = (): string => {
    const token = tokenStorage.getAccessToken();
    if (!token) {
      throw new Error("登录态失效，请重新登录");
    }
    return token;
  };

  const collectRoles = (): SystemRole[] => {
    const roles: SystemRole[] = [];
    if (roleLearner) {
      roles.push("learner");
    }
    if (roleQa) {
      roles.push("qa");
    }
    if (roleOps) {
      roles.push("ops");
    }
    if (roleAdmin) {
      roles.push("admin");
    }
    return roles.length > 0 ? roles : ["learner"];
  };

  const applyRoleSelection = (roles: SystemRole[]): void => {
    setRoleLearner(roles.includes("learner"));
    setRoleQa(roles.includes("qa"));
    setRoleOps(roles.includes("ops"));
    setRoleAdmin(roles.includes("admin"));
  };

  const loadSystemRoles = async (): Promise<void> => {
    if (!systemUserId.trim()) {
      setError("请先填写 system_user_id");
      return;
    }
    try {
      const result = await apiClient.getSystemUserRoles(withToken(), systemUserId.trim());
      applyRoleSelection(result.roles);
      setRoleSummary(`user=${result.user_id}; roles=${result.roles.join("|")}; updated=${result.updated_at}`);
      setStatus("系统角色加载完成");
      setError(null);
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "加载系统角色失败");
    }
  };

  const updateSystemRoles = async (): Promise<void> => {
    if (!systemUserId.trim()) {
      setError("请先填写 system_user_id");
      return;
    }
    try {
      const result = await apiClient.setSystemUserRoles(withToken(), systemUserId.trim(), {
        roles: collectRoles()
      });
      applyRoleSelection(result.roles);
      setRoleSummary(`user=${result.user_id}; roles=${result.roles.join("|")}; updated=${result.updated_at}`);
      setStatus("系统角色更新完成");
      setError(null);
    } catch (updateError) {
      setError(updateError instanceof Error ? updateError.message : "更新系统角色失败");
    }
  };

  const loadRoleAudit = async (pageOverride?: number): Promise<void> => {
    try {
      const parsedPage = Number(auditPage);
      const parsedPageSize = Number(auditPageSize);
      const page = Number.isInteger(pageOverride) && (pageOverride as number) > 0 ? (pageOverride as number) : 1;
      const pageSize =
        Number.isInteger(parsedPageSize) && parsedPageSize > 0 ? Math.min(100, parsedPageSize) : 20;
      const effectivePage = Number.isInteger(parsedPage) && parsedPage > 0 ? parsedPage : page;

      const result = await apiClient.listSystemRoleAuditLogs(withToken(), {
        target_user_id: auditTargetUserId.trim() || undefined,
        operator_user_id: auditOperatorUserId.trim() || undefined,
        page: pageOverride ?? effectivePage,
        page_size: pageSize
      });
      setAuditTotal(result.total);
      setAuditPage(String(result.page));
      setAuditPageSize(String(result.page_size));
      setAuditItems(result.items);
      setStatus("角色变更审计已加载");
      setError(null);
    } catch (auditError) {
      setError(auditError instanceof Error ? auditError.message : "加载角色变更审计失败");
    }
  };

  return (
    <section>
      <h1>系统角色管理台</h1>
      {error ? <p role="alert">{error}</p> : null}

      <h2>用户角色管理</h2>
      <label htmlFor="system-role-user-id">system_user_id</label>
      <input
        id="system-role-user-id"
        value={systemUserId}
        onChange={(event) => setSystemUserId(event.target.value)}
      />
      <label htmlFor="system-role-learner-checkbox">role_learner</label>
      <input
        id="system-role-learner-checkbox"
        type="checkbox"
        checked={roleLearner}
        onChange={(event) => setRoleLearner(event.target.checked)}
      />
      <label htmlFor="system-role-qa-checkbox">role_qa</label>
      <input
        id="system-role-qa-checkbox"
        type="checkbox"
        checked={roleQa}
        onChange={(event) => setRoleQa(event.target.checked)}
      />
      <label htmlFor="system-role-ops-checkbox">role_ops</label>
      <input
        id="system-role-ops-checkbox"
        type="checkbox"
        checked={roleOps}
        onChange={(event) => setRoleOps(event.target.checked)}
      />
      <label htmlFor="system-role-admin-checkbox">role_admin</label>
      <input
        id="system-role-admin-checkbox"
        type="checkbox"
        checked={roleAdmin}
        onChange={(event) => setRoleAdmin(event.target.checked)}
      />
      <button type="button" onClick={() => void loadSystemRoles()}>
        加载系统角色
      </button>
      <button type="button" onClick={() => void updateSystemRoles()}>
        更新系统角色
      </button>
      <p>{roleSummary}</p>

      <h2>角色变更审计</h2>
      <label htmlFor="system-role-audit-target-user-id">target_user_id</label>
      <input
        id="system-role-audit-target-user-id"
        value={auditTargetUserId}
        onChange={(event) => setAuditTargetUserId(event.target.value)}
      />
      <label htmlFor="system-role-audit-operator-user-id">operator_user_id</label>
      <input
        id="system-role-audit-operator-user-id"
        value={auditOperatorUserId}
        onChange={(event) => setAuditOperatorUserId(event.target.value)}
      />
      <label htmlFor="system-role-audit-page">audit_page</label>
      <input id="system-role-audit-page" value={auditPage} onChange={(event) => setAuditPage(event.target.value)} />
      <label htmlFor="system-role-audit-page-size">audit_page_size</label>
      <input
        id="system-role-audit-page-size"
        value={auditPageSize}
        onChange={(event) => setAuditPageSize(event.target.value)}
      />
      <button type="button" onClick={() => void loadRoleAudit()}>
        加载角色审计
      </button>
      <button
        type="button"
        onClick={() => {
          const current = Math.max(1, Number(auditPage) || 1);
          void loadRoleAudit(Math.max(1, current - 1));
        }}
      >
        上一页
      </button>
      <button
        type="button"
        onClick={() => {
          const current = Math.max(1, Number(auditPage) || 1);
          void loadRoleAudit(current + 1);
        }}
      >
        下一页
      </button>
      <p>audit_total={auditTotal}</p>
      <table aria-label="system_role_audit_table">
        <thead>
          <tr>
            <th>audit_id</th>
            <th>operator_user_id</th>
            <th>target_user_id</th>
            <th>roles</th>
            <th>created_at</th>
          </tr>
        </thead>
        <tbody>
          {auditItems.map((item) => (
            <tr key={item.audit_id}>
              <td>{item.audit_id}</td>
              <td>{item.operator_user_id ?? "-"}</td>
              <td>{item.target_user_id ?? "-"}</td>
              <td>{item.roles.join("|")}</td>
              <td>{item.created_at}</td>
            </tr>
          ))}
        </tbody>
      </table>

      <p>{status}</p>
    </section>
  );
};
