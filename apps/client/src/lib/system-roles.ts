import type { SystemRole } from "./api-types";

export const hasInternalOpsAccess = (roles: SystemRole[]): boolean =>
  roles.includes("ops") || roles.includes("admin");
