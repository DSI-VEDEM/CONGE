export const runtime = "nodejs";

import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { verifyJwt, jsonError } from "@/lib/auth";

function parseYearParam(value: string | null) {
  if (!value) return null;
  const year = Number(value);
  if (!Number.isInteger(year) || year < 2000 || year > 3000) return null;
  return year;
}

function parseTakeParam(value: string | null, fallback: number) {
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed <= 0) return fallback;
  return Math.min(parsed, 500);
}

function parsePageParam(value: string | null) {
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed <= 0) return 1;
  return parsed;
}

export async function GET(req: Request) {
  const v = verifyJwt(req);
  if (!v.ok) return v.error;

  const employeeId = String(v.payload?.sub ?? "");
  if (!employeeId) return jsonError("Token invalide", 401);

  const url = new URL(req.url);
  const mine = url.searchParams.get("mine") === "1";
  const scope = url.searchParams.get("scope");
  const pastOnly = url.searchParams.get("past") === "1";
  const year = parseYearParam(url.searchParams.get("year"));
  const page = parsePageParam(url.searchParams.get("page"));
  const take = parseTakeParam(url.searchParams.get("take"), scope === "actor" ? 120 : 150);
  const skip = (page - 1) * take;
  const currentYear = new Date().getUTCFullYear();
  const yearRange =
    year == null
      ? undefined
      : {
          gte: new Date(Date.UTC(year, 0, 1)),
          lt: new Date(Date.UTC(year + 1, 0, 1)),
        };

  if (url.searchParams.get("year") && year == null) {
    return jsonError("Année invalide", 400);
  }

  if (mine) {
    const leaves = await prisma.leaveRequest.findMany({
      where: {
        employeeId,
        status: { in: ["APPROVED", "REJECTED", "CANCELLED"] },
        ...(pastOnly ? { startDate: { lt: new Date(Date.UTC(currentYear, 0, 1)) } } : {}),
        ...(yearRange ? { startDate: yearRange } : {}),
      },
      skip,
      take,
      select: {
        id: true,
        type: true,
        startDate: true,
        endDate: true,
        status: true,
        createdAt: true,
        decisions: {
          where: { type: { in: ["APPROVE", "REJECT", "CANCEL"] } },
          orderBy: { createdAt: "desc" },
          take: 1,
          select: { createdAt: true, type: true },
        },
      },
      orderBy: { createdAt: "desc" },
    });

    return NextResponse.json({ leaves, page, take });
  }

  if (scope === "actor") {
    const decisions = await prisma.leaveDecision.findMany({
      where: {
        actorId: employeeId,
        type: { in: ["APPROVE", "REJECT", "ESCALATE", "CANCEL"] },
      },
      skip,
      take,
      select: {
        id: true,
        type: true,
        createdAt: true,
        toEmployeeId: true,
        toEmployee: { select: { id: true, firstName: true, lastName: true, role: true } },
        leaveRequest: {
          select: {
            id: true,
            type: true,
            startDate: true,
            endDate: true,
            employee: { select: { id: true, firstName: true, lastName: true } },
          },
        },
      },
      orderBy: { createdAt: "desc" },
    });

    return NextResponse.json({ decisions, page, take });
  }

  return NextResponse.json({ leaves: [] });
}
