import { prisma } from "@/lib/prisma";
import { jsonError, requireAuthCtx, type AuthContext } from "@/lib/auth";

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

/// Helper d'autorisation : exige un utilisateur authentifié ET admin DSI.
/// Retourne { ok: true, auth } ou { ok: false, error } prêt à renvoyer.
export async function requireDsiAdmin(
  req: Request
): Promise<{ ok: true; auth: AuthContext } | { ok: false; error: ReturnType<typeof jsonError> }> {
  const v = requireAuthCtx(req);
  if (!v.ok) return v;
  // Le token contient déjà isDsiAdmin, mais on revérifie côté DB pour ne pas
  // se baser sur un payload qui pourrait être stale après un changement de rôle.
  const ok = await isDsiAdmin(v.auth.id);
  if (!ok) return { ok: false as const, error: jsonError("Accès refusé (admin DSI requis)", 403) };
  return v;
}

/// Helper combiné : autorise si l'utilisateur a l'un des rôles donnés OU s'il est admin DSI.
export async function requireRoleOrDsiAdmin(
  req: Request,
  roles: readonly string[]
): Promise<{ ok: true; auth: AuthContext } | { ok: false; error: ReturnType<typeof jsonError> }> {
  const v = requireAuthCtx(req);
  if (!v.ok) return v;
  if (roles.includes(v.auth.role)) return v;
  const adminOk = await isDsiAdmin(v.auth.id);
  if (adminOk) return v;
  return { ok: false as const, error: jsonError("Accès refusé (rôle insuffisant)", 403) };
}
