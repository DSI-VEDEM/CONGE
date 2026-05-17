export const runtime = "nodejs";

import { NextResponse } from "next/server";
import { verifyJwt } from "@/lib/auth";
import { requireRoleOrDsiAdmin } from "@/lib/dsiAdmin";
import * as departmentsService from "@/lib/services/departments.service";
import { serviceErrorToResponse } from "@/lib/services/service-error";
import { logError } from "@/lib/logger";

type Ctx = { params: Promise<{ id: string }> };

export async function GET(req: Request, ctx: Ctx) {
  const v = verifyJwt(req);
  if (!v.ok) return v.error;

  const { id } = await ctx.params;

  try {
    const department = await departmentsService.getDepartmentDetail(id);
    return NextResponse.json({ department });
  } catch (e: unknown) {
    return serviceErrorToResponse(e);
  }
}

export async function PATCH(req: Request, ctx: Ctx) {
  // Modification d'un département : CEO ou admin DSI.
  const v = await requireRoleOrDsiAdmin(req, ["CEO"]);
  if (!v.ok) return v.error;

  const { id } = await ctx.params;

  try {
    const body = await req.json().catch(() => ({}));
    const updated = await departmentsService.updateDepartment(id, {
      name: body?.name,
      description: body?.description,
    });
    return NextResponse.json({ department: updated });
  } catch (e: unknown) {
    logError("departments/:id:PATCH", e, "modification département : erreur");
    return serviceErrorToResponse(e);
  }
}

export async function DELETE(req: Request, ctx: Ctx) {
  // Suppression d'un département : CEO ou admin DSI.
  const v = await requireRoleOrDsiAdmin(req, ["CEO"]);
  if (!v.ok) return v.error;

  const { id } = await ctx.params;

  try {
    const result = await departmentsService.deleteDepartment(id);
    return NextResponse.json(result);
  } catch (e: unknown) {
    logError("departments/:id:DELETE", e, "suppression département : erreur");
    return serviceErrorToResponse(e);
  }
}
