export const runtime = "nodejs";

import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { verifyJwt, jsonError } from "@/lib/auth";
import { isDsiAdmin } from "@/lib/dsiAdmin";

export async function GET(req: Request) {
  const v = verifyJwt(req);
  if (!v.ok) return v.error;

  const adminId = String(v.payload?.sub ?? "");
  if (!adminId) return jsonError("Token invalide", 401);

  const ok = await isDsiAdmin(adminId);
  if (!ok) return jsonError("Accès refusé (admin DSI requis)", 403);

  // Pagination : ?take=50 (max 200), ?skip=0
  const url = new URL(req.url);
  const DEFAULT_TAKE = 50;
  const MAX_TAKE = 200;
  const takeRaw = Number(url.searchParams.get("take") ?? DEFAULT_TAKE);
  const skipRaw = Number(url.searchParams.get("skip") ?? 0);
  const take = Math.min(MAX_TAKE, Math.max(1, Number.isFinite(takeRaw) ? takeRaw : DEFAULT_TAKE));
  const skip = Math.max(0, Number.isFinite(skipRaw) ? skipRaw : 0);

  const where = { status: "PENDING" as const };
  const [employees, total] = await Promise.all([
    prisma.employee.findMany({
      where,
      select: {
        id: true,
        firstName: true,
        lastName: true,
        profilePhotoUrl: true,
        email: true,
        matricule: true,
        role: true,
        status: true,
        departmentId: true,
        serviceId: true,
        createdAt: true,
      },
      orderBy: { createdAt: "desc" },
      take,
      skip,
    }),
    prisma.employee.count({ where }),
  ]);

  return NextResponse.json({ employees, total, take, skip });
}
