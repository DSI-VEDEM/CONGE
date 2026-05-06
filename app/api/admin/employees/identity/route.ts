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

  const employees = await prisma.employee.findMany({
    select: {
      id: true,
      firstName: true,
      lastName: true,
      profilePhotoUrl: true,
      email: true,
      matricule: true,
      jobTitle: true,
      role: true,
      status: true,
      createdAt: true,
      department: { select: { id: true, name: true, type: true } },
      service: { select: { id: true, name: true, type: true } },
    },
    orderBy: [{ lastName: "asc" }, { firstName: "asc" }],
  });

  return NextResponse.json({ employees });
}
