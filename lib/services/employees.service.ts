import bcrypt from "bcryptjs";
import { ServiceError } from "@/lib/services/service-error";
import * as employeesRepo from "@/lib/repositories/employees.repo";

/**
 * Service employees — exemple de migration de logique métier hors de route.ts.
 * Les routes API n'ont plus qu'à orchestrer parse → service → response.
 */

export type CreateEmployeeInput = {
  firstName: string;
  lastName: string;
  email: string;
  matricule: string | null;
  password: string;
  jobTitle?: string | null;
  departmentId?: string | null;
  serviceId?: string | null;
};

export async function createEmployee(input: CreateEmployeeInput) {
  if (!input.firstName || !input.lastName || !input.email || !input.password) {
    throw new ServiceError("MISSING_FIELDS", "Champs requis manquants", 400);
  }
  try {
    const hashed = await bcrypt.hash(input.password, 10);
    return await employeesRepo.createEmployee({
      firstName: input.firstName,
      lastName: input.lastName,
      email: input.email,
      matricule: input.matricule ?? null,
      hashedPassword: hashed,
      jobTitle: input.jobTitle ?? null,
      departmentId: input.departmentId ?? null,
      serviceId: input.serviceId ?? null,
    });
  } catch (err: unknown) {
    const e = err as { code?: string };
    if (e?.code === "P2002") {
      throw new ServiceError("DUPLICATE", "Email ou matricule déjà utilisé", 409);
    }
    throw err;
  }
}

export async function listEmployees(query: string) {
  const employees = await employeesRepo.searchEmployees(query);
  return employees.map((employee) => ({
    ...employee,
    annualLeaveBalance: Number(employee.leaveBalance ?? 0),
  }));
}
