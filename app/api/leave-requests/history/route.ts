// app/api/leave-requests/history/route.ts  (ou ton chemin exact)
// ✅ FICHIER COMPLET (identique à ce que tu as envoyé)

export const runtime = "nodejs";

import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuth } from "@/lib/leave-requests";

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
  const authRes = requireAuth(req);
  if (!authRes.ok) return authRes.error;

  const { id: actorId, role } = authRes.auth;

  const url = new URL(req.url);
  const mine = url.searchParams.get("mine") === "1";
  const scope = url.searchParams.get("scope");
  const pastOnly = url.searchParams.get("past") === "1";
  const year = parseYearParam(url.searchParams.get("year"));
  const page = parsePageParam(url.searchParams.get("page"));
  const isManager = role === "DEPT_HEAD" || role === "SERVICE_HEAD";
  const forceMineOnly = isManager;
  const isActorScope = scope === "actor";
  const isGlobalScope = scope === "all" || scope === "all-decisions";
  const take = parseTakeParam(url.searchParams.get("take"), isActorScope ? 120 : isGlobalScope ? 100 : 150);
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
    return NextResponse.json({ error: "Année invalide" }, { status: 400 });
  }

  if (mine || forceMineOnly) {
    const leaves = await prisma.leaveRequest.findMany({
      where: {
        employeeId: actorId,
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
        actorId,
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
            employee: { select: { id: true, firstName: true, lastName: true, profilePhotoUrl: true } },
          },
        },
      },
      orderBy: { createdAt: "desc" },
    });

    return NextResponse.json({ decisions, page, take });
  }

  if (scope === "all-decisions") {
    if (role !== "CEO") return NextResponse.json({ decisions: [] });

    const decisions = await prisma.leaveDecision.findMany({
      where: {
        type: { in: ["APPROVE", "REJECT", "ESCALATE", "CANCEL"] },
      },
      skip,
      take,
      select: {
        id: true,
        type: true,
        createdAt: true,
        actor: { select: { id: true, firstName: true, lastName: true, role: true } },
      },
      orderBy: { createdAt: "desc" },
    });

    return NextResponse.json({ decisions, page, take });
  }

  if (scope === "all") {
    if (role !== "CEO") return NextResponse.json({ leaves: [] });

    const leaves = await prisma.leaveRequest.findMany({
      where: {
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
        employee: { select: { id: true, firstName: true, lastName: true, profilePhotoUrl: true, role: true } },
        decisions: {
          where: { type: { in: ["APPROVE", "REJECT", "CANCEL"] } },
          orderBy: { createdAt: "desc" },
          take: 1,
          select: {
            createdAt: true,
            type: true,
            actorId: true,
            actor: { select: { id: true, firstName: true, lastName: true, role: true } },
          },
        },
      },
      orderBy: { createdAt: "desc" },
    });

    return NextResponse.json({ leaves, page, take });
  }

  return NextResponse.json({ leaves: [] });
}
