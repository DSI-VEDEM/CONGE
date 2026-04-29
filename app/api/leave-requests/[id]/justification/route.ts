export const runtime = "nodejs";

import { prisma } from "@/lib/prisma";
import { jsonError } from "@/lib/auth";
import { requireAuth } from "@/lib/leave-requests";
import { decodeLeaveJustificationDataUrl } from "@/lib/leave-justification";

type Ctx = { params: Promise<{ id: string }> };

function sanitizeFileName(fileName: string) {
  return fileName.replace(/[\\/:*?"<>|\r\n]+/g, "_") || "justificatif";
}

export async function GET(req: Request, ctx: Ctx) {
  const authRes = requireAuth(req);
  if (!authRes.ok) return authRes.error;

  const { id: actorId } = authRes.auth;
  const { id } = await ctx.params;
  if (!id) return jsonError("ID demande requis", 400);

  const [actor, leave] = await Promise.all([
    prisma.employee.findUnique({
      where: { id: actorId },
      select: { id: true, role: true, departmentId: true, serviceId: true },
    }),
    prisma.leaveRequest.findUnique({
      where: { id },
      select: {
        employeeId: true,
        currentAssigneeId: true,
        justificationFileName: true,
        justificationMimeType: true,
        justificationFileDataUrl: true,
        employee: { select: { departmentId: true, serviceId: true } },
      },
    }),
  ]);

  if (!actor) return jsonError("Acteur introuvable", 404);
  if (!leave) return jsonError("Demande introuvable", 404);

  const sameDepartment = actor.departmentId && actor.departmentId === leave.employee?.departmentId;
  const sameService = actor.serviceId && actor.serviceId === leave.employee?.serviceId;
  const canRead =
    leave.employeeId === actor.id ||
    leave.currentAssigneeId === actor.id ||
    actor.role === "CEO" ||
    actor.role === "ACCOUNTANT" ||
    (actor.role === "DEPT_HEAD" && Boolean(sameDepartment)) ||
    (actor.role === "SERVICE_HEAD" && Boolean(sameService));

  if (!canRead) return jsonError("Accès refusé", 403);
  if (!leave.justificationFileDataUrl || !leave.justificationFileName) {
    return jsonError("Aucun justificatif pour cette demande", 404);
  }

  const decoded = decodeLeaveJustificationDataUrl(leave.justificationFileDataUrl);
  if (!decoded) return jsonError("Justificatif invalide", 422);

  const safeName = sanitizeFileName(leave.justificationFileName);
  return new Response(new Uint8Array(decoded.bytes), {
    headers: {
      "Content-Type": leave.justificationMimeType || decoded.mimeType || "application/octet-stream",
      "Content-Disposition": `inline; filename="${safeName}"`,
      "Cache-Control": "private, max-age=60",
    },
  });
}
