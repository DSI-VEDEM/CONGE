import { prisma } from "@/lib/prisma";

export async function isDsiAdmin(employeeId: string) {
  const emp = await prisma.employee.findUnique({
    where: { id: employeeId },
    select: { role: true },
  });

  if (!emp || emp.role !== "DEPT_HEAD") return false;

  const activeResp = await prisma.departmentResponsibility.findFirst({
    where: {
      employeeId,
      endAt: null,
      department: { type: "DSI" },
      role: { in: ["RESPONSABLE", "CO_RESPONSABLE"] }, // ajuste si tu veux uniquement RESPONSABLE
    },
    select: { id: true },
  });

  return Boolean(activeResp);
}