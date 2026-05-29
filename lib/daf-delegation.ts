import { prisma } from "@/lib/prisma";

export type DafDelegationPermission = "holidays" | "leaveBalance" | "contractDocuments";

export type DafDelegationFlags = {
  canManageDafHolidays?: boolean | null;
  canManageDafLeaveBalances?: boolean | null;
  canManageDafContractDocuments?: boolean | null;
};

export type DafPermissions = {
  holidays: boolean;
  leaveBalance: boolean;
  contractDocuments: boolean;
};

const permissionField: Record<DafDelegationPermission, keyof DafDelegationFlags> = {
  holidays: "canManageDafHolidays",
  leaveBalance: "canManageDafLeaveBalances",
  contractDocuments: "canManageDafContractDocuments",
};

export function normalizeDafPermissions(flags?: DafDelegationFlags | null): DafPermissions {
  return {
    holidays: Boolean(flags?.canManageDafHolidays),
    leaveBalance: Boolean(flags?.canManageDafLeaveBalances),
    contractDocuments: Boolean(flags?.canManageDafContractDocuments),
  };
}

export function hasStoredDafPermission(
  flags: DafDelegationFlags | null | undefined,
  permission: DafDelegationPermission
) {
  return Boolean(flags?.[permissionField[permission]]);
}

export function hasAnyStoredDafPermission(flags?: DafDelegationFlags | null) {
  return Boolean(
    flags?.canManageDafHolidays ||
      flags?.canManageDafLeaveBalances ||
      flags?.canManageDafContractDocuments
  );
}

export async function isDafDirector(employeeId: string) {
  const employee = await prisma.employee.findUnique({
    where: { id: employeeId },
    select: {
      id: true,
      role: true,
      status: true,
      department: { select: { type: true } },
    },
  });

  if (!employee || employee.status !== "ACTIVE") return false;
  const inDaf = employee.department?.type === "DAF";
  if (inDaf && (employee.role === "ACCOUNTANT" || employee.role === "DEPT_HEAD")) return true;

  const responsibility = await prisma.departmentResponsibility.findFirst({
    where: {
      employeeId,
      endAt: null,
      department: { type: "DAF" },
      role: { in: ["RESPONSABLE", "CO_RESPONSABLE"] },
    },
    select: { id: true },
  });

  return Boolean(responsibility);
}

export async function actorHasDafPermission(employeeId: string, permission: DafDelegationPermission) {
  const employee = await prisma.employee.findUnique({
    where: { id: employeeId },
    select: {
      role: true,
      status: true,
      department: { select: { type: true } },
      canManageDafHolidays: true,
      canManageDafLeaveBalances: true,
      canManageDafContractDocuments: true,
    },
  });

  if (!employee || employee.status !== "ACTIVE") return false;
  const inDaf = employee.department?.type === "DAF";
  if (!inDaf) return false;
  if (employee.role === "ACCOUNTANT" || employee.role === "DEPT_HEAD") return true;

  return hasStoredDafPermission(employee, permission);
}
