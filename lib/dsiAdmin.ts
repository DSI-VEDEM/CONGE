import { prisma } from "@/lib/prisma";

export async function isDsiAdmin(employeeId: string) {
  const emp = await prisma.employee.findUnique({
    where: { id: employeeId },
    select: {
      role: true,
      department: {
        select: {
          type: true,
        },
      },
    },
  });

  if (!emp || emp.role !== "DEPT_HEAD") return false;

  const isDeptHeadDsi = emp.department?.type === "DSI";

  const activeResp = await prisma.departmentResponsibility.findFirst({
    where: {
      employeeId,
      endAt: null,
      department: { type: "DSI" },
      role: { in: ["RESPONSABLE"] },
    },
    select: { id: true },
  });

  if (activeResp) return true;
  return isDeptHeadDsi;
}
