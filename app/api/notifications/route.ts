export const runtime = "nodejs";

import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { jsonError, verifyJwt } from "@/lib/auth";
import { norm } from "@/lib/validators";
import type {
  NotificationCategory,
  EmployeeRole,
  EmployeeStatus,
  Prisma,
} from "@/generated/prisma/client";

const ALLOWED_CREATORS: EmployeeRole[] = ["CEO", "ACCOUNTANT"];

function isNotificationCategory(value: unknown): value is NotificationCategory {
  return value === "INFO" || value === "ALERT" || value === "ACTION";
}

function isEmployeeRole(value: unknown): value is EmployeeRole {
  return (
    value === "CEO" ||
    value === "ACCOUNTANT" ||
    value === "DEPT_HEAD" ||
    value === "SERVICE_HEAD" ||
    value === "EMPLOYEE"
  );
}

async function resolveRecipients(options: {
  global: boolean;
  targetRole?: EmployeeRole;
  employeeId?: string | null;
}) {
  if (options.employeeId) {
    const employee = await prisma.employee.findUnique({
      where: { id: options.employeeId },
      select: { id: true },
    });
    return employee ? [employee] : [];
  }

  const filter = {
    status: "ACTIVE" as EmployeeStatus,
    ...(options.targetRole ? { role: options.targetRole } : {}),
  };

  return prisma.employee.findMany({
    where: filter,
    select: { id: true },
  });
}

export async function POST(req: Request) {
  const jwt = verifyJwt(req);
  if (!jwt.ok) return jwt.error;

  const role = jwt.payload?.role as EmployeeRole | undefined;
  if (!role || !ALLOWED_CREATORS.includes(role)) {
    return jsonError("Non autorisé à créer des notifications", 403);
  }

  const body = await req.json().catch(() => ({}));
  const title = norm(body?.title);
  const message = norm(body?.body);
  const rawCategory = norm(body?.category).toUpperCase();
  const category = isNotificationCategory(rawCategory) ? rawCategory : "INFO";
  const rawTargetRole = norm(body?.targetRole).toUpperCase();
  const targetRole = isEmployeeRole(rawTargetRole) ? rawTargetRole : undefined;
  const employeeId = norm(body?.employeeId) || null;
  const global = Boolean(body?.global);
  const metadata = body?.metadata && typeof body?.metadata === "object" ? body.metadata : undefined;

  if (!title || !message) {
    return jsonError("Champs requis : title et body", 400);
  }

  if (!global && !targetRole && !employeeId) {
    return jsonError("Cible invalide : définissez global, targetRole ou employeeId", 400);
  }

  const recipients = await resolveRecipients({ global, targetRole, employeeId });
  if (recipients.length === 0) {
    return jsonError("Aucun destinataire trouvé", 400);
  }

  const created = await prisma.notification.createMany({
    data: recipients.map((recipient) => {
        const base: Prisma.NotificationCreateManyInput = {
        title,
        body: message,
        category,
        employeeId: recipient.id,
        targetRole: targetRole ?? null,
        global,
        isRead: false,
      };
      if (metadata !== undefined) {
        base.metadata = metadata;
      }
      return base;
    }),
  });

  return NextResponse.json({ ok: true, created: created.count });
}

export async function GET(req: Request) {
  const jwt = verifyJwt(req);
  if (!jwt.ok) return jwt.error;

  const employeeId = String(jwt.payload?.sub ?? "");
  if (!employeeId) {
    return jsonError("Token invalide", 401);
  }

  const search = new URL(req.url).searchParams;
  const unreadOnly = search.get("unreadOnly") === "1" || search.get("unreadOnly") === "true";
  const take = Number(search.get("take") ?? 25);

  const [notifications, unreadCount] = await Promise.all([
    prisma.notification.findMany({
      where: {
        employeeId,
        ...(unreadOnly ? { isRead: false } : {}),
      },
      orderBy: { createdAt: "desc" },
      take,
    }),
    prisma.notification.count({
      where: { employeeId, isRead: false },
    }),
  ]);

  return NextResponse.json({
    notifications,
    unreadCount,
  });
}
