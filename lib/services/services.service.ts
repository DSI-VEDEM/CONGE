import { ServiceError } from "@/lib/services/service-error";
import * as servicesRepo from "@/lib/repositories/services.repo";

/**
 * Service "services" (unités/sous-services attachés à un département).
 */

export async function listServices() {
  return servicesRepo.listServices();
}

export type CreateServiceInput = {
  departmentId: string;
  type: string;
  name: string;
  description?: string | null;
};

export async function createService(input: CreateServiceInput) {
  if (!input.departmentId || !input.type || !input.name) {
    throw new ServiceError("MISSING_FIELDS", "Champs requis: departmentId, type, name", 400);
  }
  try {
    return await servicesRepo.createService(input);
  } catch (err: unknown) {
    const e = err as { code?: string };
    if (e?.code === "P2002") {
      throw new ServiceError("DUPLICATE", "Un service de ce type existe déjà dans ce département", 409);
    }
    throw err;
  }
}

export async function getService(id: string) {
  const service = await servicesRepo.findServiceById(id);
  if (!service) throw new ServiceError("NOT_FOUND", "Service introuvable", 404);
  return service;
}

export async function updateService(id: string, data: { name?: string; description?: string | null }) {
  try {
    return await servicesRepo.updateService(id, data);
  } catch (err: unknown) {
    const e = err as { code?: string };
    if (e?.code === "P2025") throw new ServiceError("NOT_FOUND", "Service introuvable", 404);
    throw err;
  }
}

export async function deleteService(id: string) {
  try {
    await servicesRepo.deleteService(id);
    return { ok: true };
  } catch (err: unknown) {
    const e = err as { code?: string };
    if (e?.code === "P2025") throw new ServiceError("NOT_FOUND", "Service introuvable", 404);
    throw err;
  }
}
