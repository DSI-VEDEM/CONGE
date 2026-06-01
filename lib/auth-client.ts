import { EmployeeGender } from "@/lib/employee-gender";
import { MaritalStatus } from "@/lib/marital-status";

export type EmployeeRole = "CEO" | "ACCOUNTANT" | "DEPT_HEAD" | "SERVICE_HEAD" | "EMPLOYEE";
export type EmployeeStatus = "PENDING" | "ACTIVE" | "REJECTED";
export type DafDelegationPermission = "holidays" | "leaveBalance" | "contractDocuments" | "salarySlips";

export type DafPermissions = {
  holidays?: boolean | null;
  leaveBalance?: boolean | null;
  contractDocuments?: boolean | null;
  salarySlips?: boolean | null;
};

export type EmployeeSession = {
  id: string;
  email: string;
  matricule?: string | null;
  firstName: string;
  lastName: string;
  jobTitle?: string | null;
  phone?: string | null;
  profilePhotoUrl?: string | null;
  fullAddress?: string | null;
  hireDate?: string | null;
  companyEntryDate?: string | null;
  cnpsNumber?: string | null;
  gender?: EmployeeGender | null;
  maritalStatus?: MaritalStatus | null;
  childrenCount?: number | null;
  role: EmployeeRole;
  status: EmployeeStatus;
  leaveBalance?: number;
  departmentId?: string | null;
  serviceId?: string | null;
  isDsiAdmin?: boolean;
  departmentType?: "DAF" | "DSI" | "OPERATIONS" | "OTHERS" | string | null;
  dafPermissions?: DafPermissions | null;
  hireDateFormatted?: string | null;
};

export function getToken(): string | null {
  if (typeof window === "undefined") return null;
  return localStorage.getItem("token");
}

export function getEmployee(): EmployeeSession | null {
  if (typeof window === "undefined") return null;
  const raw = localStorage.getItem("employee");
  if (!raw) return null;
  try {
    return JSON.parse(raw) as EmployeeSession;
  } catch {
    return null;
  }
}

export function logout() {
  if (typeof window === "undefined") return;
  localStorage.removeItem("token");
  localStorage.removeItem("employee");
}

export function isDsiLeader(
  isDsiAdmin?: boolean,
  departmentType?: "DAF" | "DSI" | "OPERATIONS" | "OTHERS" | string | null
) {
  return Boolean(isDsiAdmin || departmentType === "DSI");
}

export function isDafLeader(
  role: EmployeeRole | string,
  departmentType?: "DAF" | "DSI" | "OPERATIONS" | "OTHERS" | string | null
) {
  return role === "ACCOUNTANT" || (role === "DEPT_HEAD" && departmentType === "DAF");
}

export function routeForRole(
  role: EmployeeRole,
  isDsiAdmin = false,
  departmentType?: "DAF" | "DSI" | "OPERATIONS" | "OTHERS" | string | null,
  dafPermissions?: DafPermissions | null
) {
  const isDsi = isDsiLeader(isDsiAdmin, departmentType);
  switch (role) {
    case "CEO":
      return "/dashboard/ceo";
    case "ACCOUNTANT":
      return "/dashboard/accountant";
    case "DEPT_HEAD":
      if (departmentType === "DAF") return "/dashboard/accountant";
      return isDsi ? "/dashboard/dsi" : "/dashboard/operations";
    case "SERVICE_HEAD":
      return "/dashboard/manager";
    default:
      if (hasAnyDafPermission(dafPermissions)) return firstDafDelegationRoute(dafPermissions);
      return "/dashboard/employee";
  }
}

export function profileRouteForSession(employee: EmployeeSession) {
  switch (employee.role) {
    case "CEO":
      return "/dashboard/ceo/profile";
    case "ACCOUNTANT":
      return "/dashboard/accountant/profile";
    case "DEPT_HEAD":
      if (employee.departmentType === "DAF") return "/dashboard/accountant/profile";
      if (isDsiLeader(employee.isDsiAdmin, employee.departmentType ?? null)) return "/dashboard/dsi/profile";
      return "/dashboard/operations/profile";
    case "SERVICE_HEAD":
      return "/dashboard/manager/profile";
    default:
      return "/dashboard/employee/profile";
  }
}

export function hasProfilePhoto(employee?: EmployeeSession | null) {
  return Boolean(employee?.profilePhotoUrl && String(employee.profilePhotoUrl).trim().length > 0);
}

export function hasPreciseAddress(employee?: EmployeeSession | null) {
  return Boolean(employee?.fullAddress && String(employee.fullAddress).trim().length > 0);
}

export function hasPhoneNumber(employee?: EmployeeSession | null) {
  return Boolean(employee?.phone && String(employee.phone).trim().length > 0);
}

export function hasCompanyEntryDate(employee?: EmployeeSession | null) {
  const value = employee?.companyEntryDate ?? employee?.hireDate;
  return Boolean(value && String(value).trim().length > 0);
}

export function hasCnpsNumber(employee?: EmployeeSession | null) {
  return Boolean(employee?.cnpsNumber && String(employee.cnpsNumber).trim().length > 0);
}

export function hasMaritalStatus(employee?: EmployeeSession | null) {
  return Boolean(employee?.maritalStatus);
}

export function hasChildrenCount(employee?: EmployeeSession | null) {
  const value = employee?.childrenCount;
  return typeof value === "number" && Number.isInteger(value) && value >= 0;
}

export function hasRequiredProfileData(employee?: EmployeeSession | null) {
  return (
    hasPreciseAddress(employee) &&
    hasPhoneNumber(employee) &&
    hasCompanyEntryDate(employee) &&
    hasCnpsNumber(employee) &&
    hasMaritalStatus(employee) &&
    hasChildrenCount(employee)
  );
}

export function hasDafPermission(
  employeeOrPermissions: EmployeeSession | DafPermissions | null | undefined,
  permission: DafDelegationPermission
) {
  if (!employeeOrPermissions) return false;
  const permissions: DafPermissions | null | undefined =
    "role" in employeeOrPermissions ? employeeOrPermissions.dafPermissions : employeeOrPermissions;
  return Boolean(permissions?.[permission]);
}

export function hasAnyDafPermission(employeeOrPermissions?: EmployeeSession | DafPermissions | null) {
  return (
    hasDafPermission(employeeOrPermissions, "holidays") ||
    hasDafPermission(employeeOrPermissions, "leaveBalance") ||
    hasDafPermission(employeeOrPermissions, "contractDocuments") ||
    hasDafPermission(employeeOrPermissions, "salarySlips")
  );
}

export function firstDafDelegationRoute(permissions?: DafPermissions | null) {
  if (hasDafPermission(permissions, "holidays")) return "/dashboard/accountant/holidays";
  if (hasDafPermission(permissions, "leaveBalance"))
    return "/dashboard/accountant/department/leave-adjustment";
  if (hasDafPermission(permissions, "contractDocuments"))
    return "/dashboard/accountant/administration/contracts/types";
  if (hasDafPermission(permissions, "salarySlips")) return "/dashboard/accountant/payslips/imported";
  return "/dashboard/employee";
}
