import { ServiceError } from "@/lib/services/service-error";
import * as departmentsRepo from "@/lib/repositories/departments.repo";

/**
 * Service departments — orchestration métier.
 */

export type CreateDepartmentInput = {
  type: string;
  name: string;
  description?: string | null;
};

const ALLOWED_DEPT_TYPES = new Set(["DAF", "DSI", "OPERATIONS", "OTHERS"]);

export async function createDepartment(input: CreateDepartmentInput) {
  if (!input.type || !input.name) {
    throw new ServiceError("MISSING_FIELDS", "Champs requis: type, name", 400);
  }
  if (!ALLOWED_DEPT_TYPES.has(input.type)) {
    throw new ServiceError(
      "INVALID_TYPE",
      `Type de département invalide (attendu: ${[...ALLOWED_DEPT_TYPES].join(", ")})`,
      400
    );
  }
  try {
    return await departmentsRepo.createDepartment(input);
  } catch (err: unknown) {
    const e = err as { code?: string };
    if (e?.code === "P2002") {
      throw new ServiceError("DUPLICATE", "Un département de ce type existe déjà", 409);
    }
    throw err;
  }
}

export async function listDepartments() {
  return departmentsRepo.listDepartments();
}

export async function getDepartmentDetail(id: string) {
  const department = await departmentsRepo.findDepartmentDetail(id);
  if (!department) {
    throw new ServiceError("NOT_FOUND", "Département introuvable", 404);
  }
  return department;
}

export async function updateDepartment(id: string, data: { name?: string; description?: string | null }) {
  try {
    return await departmentsRepo.updateDepartment(id, data);
  } catch (err: unknown) {
    const e = err as { code?: string };
    if (e?.code === "P2025") {
      throw new ServiceError("NOT_FOUND", "Département introuvable", 404);
    }
    throw err;
  }
}

export async function deleteDepartment(id: string) {
  try {
    await departmentsRepo.deleteDepartment(id);
    return { ok: true };
  } catch (err: unknown) {
    const e = err as { code?: string };
    if (e?.code === "P2025") {
      throw new ServiceError("NOT_FOUND", "Département introuvable", 404);
    }
    throw err;
  }
}
