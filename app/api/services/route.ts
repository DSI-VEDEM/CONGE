export const runtime = "nodejs";

import { NextResponse } from "next/server";
import { verifyJwt } from "@/lib/auth";
import { requireRoleOrDsiAdmin } from "@/lib/dsiAdmin";
import * as svc from "@/lib/services/services.service";
import { serviceErrorToResponse } from "@/lib/services/service-error";
import { logError } from "@/lib/logger";

export async function GET(req: Request) {
  const v = verifyJwt(req);
  if (!v.ok) return v.error;

  const services = await svc.listServices();
  return NextResponse.json({ services });
}

export async function POST(req: Request) {
  const v = await requireRoleOrDsiAdmin(req, ["CEO"]);
  if (!v.ok) return v.error;

  try {
    const body = await req.json().catch(() => ({}));
    const created = await svc.createService({
      departmentId: String(body?.departmentId ?? "").trim(),
      type: String(body?.type ?? "").trim(),
      name: String(body?.name ?? "").trim(),
      description: body?.description ?? null,
    });
    return NextResponse.json({ service: created }, { status: 201 });
  } catch (e: unknown) {
    logError("services:POST", e, "création service : erreur");
    return serviceErrorToResponse(e);
  }
}
