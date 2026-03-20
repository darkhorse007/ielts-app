import { describe, expect, test, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { TokenStorage } from "../src/lib/token-storage";
import { SystemRoleAdminPage } from "../src/pages/SystemRoleAdminPage";

describe("S8 system role admin page", () => {
  test("supports role query/update and audit query", async () => {
    const tokenStorage = new TokenStorage();
    tokenStorage.save({
      accessToken: "access",
      refreshToken: "refresh",
      expiresIn: 900,
      userId: "u-admin"
    });

    const getSystemUserRoles = vi.fn().mockResolvedValue({
      user_id: "u-target-1",
      roles: ["learner", "qa"],
      updated_at: "2026-03-01T00:00:00.000Z"
    });
    const setSystemUserRoles = vi.fn().mockResolvedValue({
      user_id: "u-target-1",
      roles: ["learner", "qa", "ops"],
      updated_at: "2026-03-01T00:10:00.000Z"
    });
    const listSystemRoleAuditLogs = vi.fn().mockResolvedValue({
      total: 1,
      page: 1,
      page_size: 20,
      items: [
        {
          audit_id: "audit-1",
          operator_user_id: "u-admin",
          target_user_id: "u-target-1",
          roles: ["learner", "qa", "ops"],
          created_at: "2026-03-01T00:10:00.000Z"
        }
      ]
    });

    render(
      <SystemRoleAdminPage
        apiClient={{
          getSystemUserRoles,
          setSystemUserRoles,
          listSystemRoleAuditLogs
        }}
        tokenStorage={tokenStorage}
      />
    );

    fireEvent.change(screen.getByLabelText("system_user_id"), {
      target: {
        value: "u-target-1"
      }
    });
    fireEvent.click(screen.getByRole("button", { name: "加载系统角色" }));

    await waitFor(() => {
      expect(getSystemUserRoles).toHaveBeenCalledTimes(1);
    });
    expect(getSystemUserRoles).toHaveBeenCalledWith("access", "u-target-1");

    const roleQaCheckbox = screen.getByLabelText("role_qa");
    const roleOpsCheckbox = screen.getByLabelText("role_ops");
    expect(roleQaCheckbox).toBeChecked();
    expect(roleOpsCheckbox).not.toBeChecked();

    fireEvent.click(roleOpsCheckbox);
    fireEvent.click(screen.getByRole("button", { name: "更新系统角色" }));

    await waitFor(() => {
      expect(setSystemUserRoles).toHaveBeenCalledTimes(1);
    });
    expect(setSystemUserRoles).toHaveBeenCalledWith("access", "u-target-1", {
      roles: ["learner", "qa", "ops"]
    });

    fireEvent.change(screen.getByLabelText("target_user_id"), {
      target: {
        value: "u-target-1"
      }
    });
    fireEvent.change(screen.getByLabelText("operator_user_id"), {
      target: {
        value: "u-admin"
      }
    });
    fireEvent.click(screen.getByRole("button", { name: "加载角色审计" }));

    await waitFor(() => {
      expect(listSystemRoleAuditLogs).toHaveBeenCalledTimes(1);
    });
    expect(listSystemRoleAuditLogs).toHaveBeenCalledWith("access", {
      target_user_id: "u-target-1",
      operator_user_id: "u-admin",
      page: 1,
      page_size: 20
    });
    expect(screen.getByText("audit-1")).toBeInTheDocument();
    expect(screen.getByText("audit_total=1")).toBeInTheDocument();
  });
});
