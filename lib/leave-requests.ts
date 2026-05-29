import { prisma } from "@/lib/prisma";
import { jsonError, verifyJwt } from "@/lib/auth";
import type { EmployeeRole, NotificationCategory } from "@/generated/prisma/client";

type Auth = {
  id: string;
  role: string;
  departmentId?: string | null;
  isDsiAdmin?: boolean;
  departmentType?: string | null;
};

type OperationsDirectorFallbackLeave = {
  currentAssigneeId?: string | null;
  employee?: { department?: { type?: string | null } | null } | null;
  currentAssignee?: { role?: string | null; department?: { type?: string | null } | null } | null;
};

export function requireAuth(req: Request) {
  const v = verifyJwt(req);
  if (!v.ok) return { ok: false as const, error: v.error };

  const id = String(v.payload?.sub ?? "");
  if (!id) return { ok: false as const, error: jsonError("Token invalide", 401) };

  const role = String(v.payload?.role ?? "");
  const departmentId = v.payload?.departmentId ?? null;
  const isDsiAdmin = Boolean(v.payload?.isDsiAdmin);
  const departmentType = v.payload?.departmentType ?? null;
  const auth: Auth = { id, role, departmentId, isDsiAdmin, departmentType };
  return { ok: true as const, auth };
}

export function isFinalStatus(status: string) {
  return status === "APPROVED" || status === "REJECTED" || status === "CANCELLED";
}

export async function findActiveEmployeeByRole(role: string, departmentId?: string | null) {
  return prisma.employee.findFirst({
    where: {
      role: role as any,
      status: "ACTIVE",
      ...(departmentId ? { departmentId } : {}),
    },
    select: { id: true, role: true, departmentId: true },
  });
}

export async function findActiveDepartmentHeadOrDsiFallback(departmentId?: string | null) {
  const departmentHead = await findActiveEmployeeByRole("DEPT_HEAD", departmentId);
  if (departmentHead || !departmentId) return departmentHead;

  const department = await prisma.department.findUnique({
    where: { id: departmentId },
    select: { type: true },
  });
  if (department?.type !== "OPERATIONS") return null;

  return prisma.employee.findFirst({
    where: {
      role: "DEPT_HEAD",
      status: "ACTIVE",
      department: { type: "DSI" },
    },
    select: { id: true, role: true, departmentId: true },
  });
}

export async function canActAsOperationsDirectorFallback(
  actorId: string,
  leave: OperationsDirectorFallbackLeave
) {
  if (leave.currentAssigneeId === actorId) return true;
  if (leave.employee?.department?.type !== "OPERATIONS") return false;
  if (
    leave.currentAssignee?.role !== "DEPT_HEAD" ||
    leave.currentAssignee?.department?.type !== "OPERATIONS"
  ) {
    return false;
  }

  const actor = await prisma.employee.findUnique({
    where: { id: actorId },
    select: {
      role: true,
      status: true,
      department: { select: { type: true } },
    },
  });

  return actor?.role === "DEPT_HEAD" && actor.status === "ACTIVE" && actor.department?.type === "DSI";
}

export async function autoApproveOverdueForDeptHead(deptHeadId: string, days: number) {
  if (!Number.isFinite(days) || days <= 0) return 0;

  const now = new Date();
  const cutoff = new Date(now.getTime() - days * 24 * 60 * 60 * 1000);

  const overdue = await prisma.leaveRequest.findMany({
    where: {
      currentAssigneeId: deptHeadId,
      status: { in: ["SUBMITTED", "PENDING"] },
      deptHeadAssignedAt: { lt: cutoff },
    },
    select: { id: true },
  });

  if (overdue.length === 0) return 0;

  const approvedCount = await prisma.$transaction(async (tx) => {
    let count = 0;

    for (const leave of overdue) {
      const updated = await tx.leaveRequest.updateMany({
        where: {
          id: leave.id,
          currentAssigneeId: deptHeadId,
          status: { in: ["SUBMITTED", "PENDING"] },
        },
        data: {
          status: "APPROVED",
          currentAssigneeId: null,
          deptHeadAssignedAt: null,
        },
      });

      if (updated.count === 0) continue;

      await tx.leaveDecision.create({
        data: {
          leaveRequestId: leave.id,
          actorId: deptHeadId,
          type: "APPROVE",
          comment: "Auto-approval after DEPT_HEAD/SERVICE_HEAD validation delay",
        },
      });
      count += 1;
    }

    return count;
  });

  return approvedCount;
}

export async function autoApproveOverdueDirectorLeavesForCeo(ceoId: string, days: number) {
  if (!Number.isFinite(days) || days <= 0) return 0;

  const now = new Date();
  const cutoff = new Date(now.getTime() - days * 24 * 60 * 60 * 1000);

  const overdue = await prisma.leaveRequest.findMany({
    where: {
      status: { in: ["SUBMITTED", "PENDING"] },
      employee: { role: { in: DIRECTOR_ROLES } },
      reachedCeoAt: { lt: cutoff },
    },
    select: {
      id: true,
      employeeId: true,
      employee: { select: { firstName: true, lastName: true } },
    },
  });

  if (overdue.length === 0) return 0;

  const approved = await prisma.$transaction(async (tx) => {
    const items: typeof overdue = [];

    for (const leave of overdue) {
      const updated = await tx.leaveRequest.updateMany({
        where: {
          id: leave.id,
          status: { in: ["SUBMITTED", "PENDING"] },
        },
        data: {
          status: "APPROVED",
          currentAssigneeId: null,
          deptHeadAssignedAt: null,
        },
      });

      if (updated.count === 0) continue;

      await tx.leaveDecision.create({
        data: {
          leaveRequestId: leave.id,
          actorId: ceoId,
          type: "APPROVE",
          comment: "Auto-approval after CEO validation delay (director leave request).",
        },
      });
      items.push(leave);
    }

    return items;
  });

  const actorLabel = describeActorRole("CEO");
  await Promise.all(
    approved.map((leave) => {
      const employeeName =
        [leave.employee?.firstName, leave.employee?.lastName].filter(Boolean).join(" ") || "cet employé";
      return notifyEmployeeOfLeaveDecision({
        leaveRequestId: leave.id,
        employeeId: leave.employeeId,
        employeeName,
        actorLabel,
        status: "APPROVED",
      });
    })
  );

  return approved.length;
}

function getDeptHeadValidationDelayDays() {
  const raw = process.env.DEPT_HEAD_VALIDATION_DAYS;
  const parsed = raw ? Number(raw) : 5;
  return Number.isFinite(parsed) ? parsed : 5;
}

function getCeoDirectorValidationDelayDays() {
  const raw = process.env.CEO_DIRECTOR_VALIDATION_DAYS;
  const parsed = raw ? Number(raw) : 2;
  return Number.isFinite(parsed) ? parsed : 2;
}

export async function autoApproveOverdueForActor(actorId: string, role: string) {
  let deptHeadApprovedCount = 0;
  let ceoDirectorApprovedCount = 0;

  if (role === "DEPT_HEAD" || role === "SERVICE_HEAD") {
    deptHeadApprovedCount = await autoApproveOverdueForDeptHead(actorId, getDeptHeadValidationDelayDays());
  }

  if (role === "CEO") {
    ceoDirectorApprovedCount = await autoApproveOverdueDirectorLeavesForCeo(
      actorId,
      getCeoDirectorValidationDelayDays()
    );
  }

  return {
    deptHeadApprovedCount,
    ceoDirectorApprovedCount,
    totalApprovedCount: deptHeadApprovedCount + ceoDirectorApprovedCount,
  };
}

export function parseDate(value: string | null) {
  if (!value) return null;
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return null;
  return d;
}

const DIRECTOR_ROLES: EmployeeRole[] = ["DEPT_HEAD", "SERVICE_HEAD"];

function formatLeaveRange(start: Date, end: Date) {
  const pad = (value: number) => String(value).padStart(2, "0");
  const from = `${start.getFullYear()}-${pad(start.getMonth() + 1)}-${pad(start.getDate())}`;
  const to = `${end.getFullYear()}-${pad(end.getMonth() + 1)}-${pad(end.getDate())}`;
  return `${from} → ${to}`;
}

export async function notifyAccountantOfLeaveRequest(options: {
  leaveRequestId: string;
  employeeName: string;
  actorRole?: string;
  startDate: Date;
  endDate: Date;
}) {
  const accountant = await findActiveEmployeeByRole("ACCOUNTANT");
  if (!accountant) return;

  await prisma.notification.create({
    data: {
      title: "Nouvelle demande de congé",
      body: `${options.employeeName} (${options.actorRole ?? "collaborateur"}) a demandé un congé : ${formatLeaveRange(
        options.startDate,
        options.endDate
      )}.`,
      category: "INFO" as NotificationCategory,
      employeeId: accountant.id,
      targetRole: "ACCOUNTANT",
      global: false,
      metadata: {
        leaveRequestId: options.leaveRequestId,
        actorRole: options.actorRole ?? null,
        requesterName: options.employeeName,
        actionPath: "/dashboard/accountant/inbox",
      },
    },
  });
}

export async function notifyCeoOfDirectorLeaveRequest(options: {
  leaveRequestId: string;
  employeeName: string;
  actorRole?: string;
  startDate: Date;
  endDate: Date;
}) {
  if (!options.actorRole || !DIRECTOR_ROLES.includes(options.actorRole as EmployeeRole)) return;

  const ceo = await findActiveEmployeeByRole("CEO");
  if (!ceo) return;

  await prisma.notification.create({
    data: {
      title: "Demande des directeurs",
      body: `${options.employeeName} (directeur ${options.actorRole.replace("_", " ").toLowerCase()}) a transmis une demande de congé ${formatLeaveRange(
        options.startDate,
        options.endDate
      )}.`,
      category: "ACTION" as NotificationCategory,
      employeeId: ceo.id,
      targetRole: "CEO",
      global: false,
      metadata: {
        leaveRequestId: options.leaveRequestId,
        actorRole: options.actorRole,
        requesterName: options.employeeName,
        actionPath: "/dashboard/ceo/inbox",
      },
    },
  });
}

const ROLE_LABELS: Record<EmployeeRole, string> = {
  CEO: "le PDG",
  ACCOUNTANT: "la comptable",
  DEPT_HEAD: "le Directeur de Département",
  SERVICE_HEAD: "le Directeur Adjoint",
  EMPLOYEE: "l'employé",
};

export function describeActorRole(role?: string) {
  return ROLE_LABELS[(role ?? "") as EmployeeRole] ?? (role ? role.toLowerCase() : "un collaborateur");
}

export async function notifyCeoAboutLeaveDecision(options: {
  leaveRequestId: string;
  employeeName: string;
  status: "APPROVED" | "REJECTED";
  actorRole: string;
}) {
  const ceo = await findActiveEmployeeByRole("CEO");
  if (!ceo) return;

  const actorLabel = describeActorRole(options.actorRole);
  const actionLabel = options.status === "APPROVED" ? "approuvée" : "rejetée";

  await prisma.notification.create({
    data: {
      title: "Décision sur la demande de congé",
      body: `La demande de congé de ${options.employeeName} a été ${actionLabel} par ${actorLabel}.`,
      category: "ACTION" as NotificationCategory,
      employeeId: ceo.id,
      targetRole: "CEO",
      global: false,
      metadata: { leaveRequestId: options.leaveRequestId, status: options.status },
    },
  });
}

export async function notifyEmployeeOfLeaveDecision(options: {
  leaveRequestId: string;
  employeeId: string;
  employeeName: string;
  actorLabel: string;
  status: "APPROVED" | "REJECTED";
}) {
  await prisma.notification.create({
    data: {
      title: "Votre demande de congé",
      body: `Votre demande a été ${options.status === "APPROVED" ? "approuvée" : "rejetée"} par ${options.actorLabel}.`,
      category: "INFO" as NotificationCategory,
      employeeId: options.employeeId,
      targetRole: "EMPLOYEE",
      global: false,
      metadata: {
        leaveRequestId: options.leaveRequestId,
        status: options.status,
        requesterName: options.employeeName,
        actionPath: "/dashboard/employee/requests",
      },
    },
  });
}
