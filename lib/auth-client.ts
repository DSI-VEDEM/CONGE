import { EmployeeGender } from "@/lib/employee-gender";
import { MaritalStatus } from "@/lib/marital-status";

export type EmployeeRole = "CEO" | "ACCOUNTANT" | "DEPT_HEAD" | "SERVICE_HEAD" | "EMPLOYEE";
export type EmployeeStatus = "PENDING" | "ACTIVE" | "REJECTED";

export type EmployeeSession = {
  id: string;
  email: string;
  matricule?: string | null;
  firstName: string;
  lastName: string;
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

export function routeForRole(
  role: EmployeeRole,
  isDsiAdmin = false,
  _departmentType?: "DAF" | "DSI" | "OPERATIONS" | "OTHERS" | string | null
) {
  void _departmentType;
  switch (role) {
    case "CEO":
      return "/dashboard/ceo";
    case "ACCOUNTANT":
      return "/dashboard/accountant";
    case "DEPT_HEAD":
      return isDsiAdmin ? "/dashboard/dsi" : "/dashboard/operations";
    case "SERVICE_HEAD":
      return "/dashboard/manager";
    default:
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
      if (employee.isDsiAdmin) return "/dashboard/dsi/profile";
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
    hasProfilePhoto(employee) &&
    hasPreciseAddress(employee) &&
    hasPhoneNumber(employee) &&
    hasCompanyEntryDate(employee) &&
    hasCnpsNumber(employee) &&
    hasMaritalStatus(employee) &&
    hasChildrenCount(employee)
  );
}
