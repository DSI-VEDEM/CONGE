export const runtime = "nodejs";

import { NextResponse } from "next/server";
import { verifyJwt } from "@/lib/auth";
import { requireRoleOrDsiAdmin } from "@/lib/dsiAdmin";
import * as svc from "@/lib/services/services.service";
import { serviceErrorToResponse } from "@/lib/services/service-error";
import { logError } from "@/lib/logger";

type Ctx = { params: Promise<{ id: string }> };

export async function GET(req: Request, ctx: Ctx) {
  const v = verifyJwt(req);
  if (!v.ok) return v.error;

  const { id } = await ctx.params;
  try {
    const service = await svc.getService(id);
    return NextResponse.json({ service });
  } catch (e: unknown) {
    return serviceErrorToResponse(e);
  }
}

export async function PATCH(req: Request, ctx: Ctx) {
  const v = await requireRoleOrDsiAdmin(req, ["CEO"]);
  if (!v.ok) return v.error;

  const { id } = await ctx.params;
  try {
    const body = await req.json().catch(() => ({}));
    const updated = await svc.updateService(id, {
      name: body?.name,
      description: body?.description,
    });
    return NextResponse.json({ service: updated });
  } catch (e: unknown) {
    logError("services/:id:PATCH", e, "modification service : erreur");
    return serviceErrorToResponse(e);
  }
}

export async function DELETE(req: Request, ctx: Ctx) {
  const v = await requireRoleOrDsiAdmin(req, ["CEO"]);
  if (!v.ok) return v.error;

  const { id } = await ctx.params;
  try {
    const result = await svc.deleteService(id);
    return NextResponse.json(result);
  } catch (e: unknown) {
    logError("services/:id:DELETE", e, "suppression service : erreur");
    return serviceErrorToResponse(e);
  }
}
