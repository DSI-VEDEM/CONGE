import { prisma } from "@/lib/prisma";

/**
 * Repository services — accès données pur.
 */

export async function listServices() {
  return prisma.service.findMany({
    include: { department: true, _count: { select: { members: true } } },
    orderBy: { createdAt: "desc" },
  });
}

export type CreateServiceData = {
  departmentId: string;
  type: string;
  name: string;
  description?: string | null;
};

export async function createService(data: CreateServiceData) {
  return prisma.service.create({
    data: {
      departmentId: data.departmentId,
      type: data.type as Parameters<typeof prisma.service.create>[0]["data"]["type"],
      name: data.name,
      description: data.description ?? null,
    },
  });
}

export async function findServiceById(id: string) {
  return prisma.service.findUnique({
    where: { id },
    include: { department: true, members: true },
  });
}

export type UpdateServiceData = { name?: string; description?: string | null };

export async function updateService(id: string, data: UpdateServiceData) {
  return prisma.service.update({
    where: { id },
    data: {
      name: data.name ? data.name : undefined,
      description: data.description ? data.description : undefined,
    },
  });
}

export async function deleteService(id: string) {
  return prisma.service.delete({ where: { id } });
}
