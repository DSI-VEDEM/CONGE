export const runtime = "nodejs";

import { NextResponse } from "next/server";
import { verifyJwt } from "@/lib/auth";
import { requireRoleOrDsiAdmin } from "@/lib/dsiAdmin";
import * as departmentsService from "@/lib/services/departments.service";
import { serviceErrorToResponse } from "@/lib/services/service-error";
import { logError } from "@/lib/logger";

export async function GET(req: Request) {
  // Liste des départements (accessible à tout utilisateur authentifié).
  const v = verifyJwt(req);
  if (!v.ok) return v.error;

  const departments = await departmentsService.listDepartments();
  return NextResponse.json({ departments });
}

export async function POST(req: Request) {
  // Création de département : réservée au CEO ou à l'admin DSI.
  const v = await requireRoleOrDsiAdmin(req, ["CEO"]);
  if (!v.ok) return v.error;

  try {
    const body = await req.json().catch(() => ({}));
    const created = await departmentsService.createDepartment({
      type: String(body?.type ?? "").trim(),
      name: String(body?.name ?? "").trim(),
      description: body?.description ?? null,
    });
    return NextResponse.json({ department: created }, { status: 201 });
  } catch (e: unknown) {
    logError("departments:POST", e, "création département : erreur");
    return serviceErrorToResponse(e);
  }
}
