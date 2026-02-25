export const runtime = "nodejs";

import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { verifyJwt } from "@/lib/auth";
import { norm } from "@/lib/validators";

function parseTake(value: string | null) {
  const parsed = Number(value ?? "");
  if (!Number.isFinite(parsed) || parsed <= 0) return 150;
  return Math.min(150, Math.floor(parsed));
}

export async function GET(req: Request) {
  const v = verifyJwt(req);
  if (!v.ok) return v.error;

  const url = new URL(req.url);
  const q = norm(url.searchParams.get("q"));
  const take = parseTake(url.searchParams.get("take"));

  const employees = await prisma.employee.findMany({
    where: q
      ? {
          OR: [
            { email: { contains: q, mode: "insensitive" } },
            { firstName: { contains: q, mode: "insensitive" } },
            { lastName: { contains: q, mode: "insensitive" } },
            { matricule: { contains: q, mode: "insensitive" } },
          ],
        }
      : undefined,
    select: {
      id: true,
      email: true,
      matricule: true,
      firstName: true,
      lastName: true,
      role: true,
    },
    orderBy: [{ lastName: "asc" }, { firstName: "asc" }],
    take,
  });

  return NextResponse.json({ employees });
}
