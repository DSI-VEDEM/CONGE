import { prisma } from "@/lib/prisma";

/**
 * Repository employees — pure data access. Aucune règle métier ici.
 */

export type CreateEmployeeData = {
  firstName: string;
  lastName: string;
  email: string;
  matricule: string | null;
  hashedPassword: string;
  jobTitle?: string | null;
  departmentId?: string | null;
  serviceId?: string | null;
};

const EMPLOYEE_LIST_SELECT = {
  id: true,
  email: true,
  matricule: true,
  firstName: true,
  lastName: true,
  profilePhotoUrl: true,
  jobTitle: true,
  role: true,
  status: true,
  leaveBalance: true,
  hireDate: true,
  departmentId: true,
  serviceId: true,
  createdAt: true,
} as const;

export async function createEmployee(data: CreateEmployeeData) {
  return prisma.employee.create({
    data: {
      firstName: data.firstName,
      lastName: data.lastName,
      email: data.email,
      matricule: data.matricule,
      password: data.hashedPassword,
      jobTitle: data.jobTitle ?? null,
      departmentId: data.departmentId ?? null,
      serviceId: data.serviceId ?? null,
    },
    select: EMPLOYEE_LIST_SELECT,
  });
}

export async function searchEmployees(query: string) {
  return prisma.employee.findMany({
    where: query
      ? {
          OR: [
            { email: { contains: query, mode: "insensitive" } },
            { firstName: { contains: query, mode: "insensitive" } },
            { lastName: { contains: query, mode: "insensitive" } },
            { matricule: { contains: query, mode: "insensitive" } },
          ],
        }
      : undefined,
    select: {
      ...EMPLOYEE_LIST_SELECT,
      leaveBalanceAdjustment: true,
      firstYearLeaveUsedDays: true,
      firstYearLeaveUsedYear: true,
      companyEntryDate: true,
    },
    orderBy: { createdAt: "desc" },
  });
}

export async function findEmployeeById(id: string) {
  return prisma.employee.findUnique({
    where: { id },
    select: { ...EMPLOYEE_LIST_SELECT, password: true },
  });
}
