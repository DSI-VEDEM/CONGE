import { prisma } from "@/lib/prisma";

/**
 * Repository departments — accès données pur (pas de logique métier).
 */

export async function listDepartments() {
  return prisma.department.findMany({
    select: {
      id: true,
      type: true,
      name: true,
      description: true,
      createdAt: true,
      updatedAt: true,
      _count: { select: { members: true, services: true, responsables: true } },
    },
    orderBy: { createdAt: "desc" },
  });
}

export type CreateDepartmentData = {
  type: string;
  name: string;
  description?: string | null;
};

export async function createDepartment(data: CreateDepartmentData) {
  return prisma.department.create({
    data: {
      type: data.type as Parameters<typeof prisma.department.create>[0]["data"]["type"],
      name: data.name,
      description: data.description ?? null,
    },
  });
}

export async function findDepartmentDetail(id: string) {
  return prisma.department.findUnique({
    where: { id },
    include: {
      services: true,
      responsables: { where: { endAt: null }, include: { employee: true, supervisor: true } },
    },
  });
}

export type UpdateDepartmentData = { name?: string; description?: string | null };

export async function updateDepartment(id: string, data: UpdateDepartmentData) {
  return prisma.department.update({
    where: { id },
    data: {
      name: data.name ? data.name : undefined,
      description: data.description ? data.description : undefined,
    },
  });
}

export async function deleteDepartment(id: string) {
  return prisma.department.delete({ where: { id } });
}
