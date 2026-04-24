export const runtime = "nodejs";

import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { jsonError } from "@/lib/auth";
import { parseDate, requireAuth } from "@/lib/leave-requests";
import { norm } from "@/lib/validators";
import {
  expandRecurringAnchorToYear,
  normalizeUtcDateOnly,
  toRecurringAnchorDate,
  utcYearRange,
} from "@/lib/holidays";

function parseYearParam(value: string | null) {
  if (!value) return null;
  const year = Number(value);
  if (!Number.isInteger(year) || year < 2000 || year > 3000) return null;
  return year;
}

export async function GET(req: Request) {
  const authRes = requireAuth(req);
  if (!authRes.ok) return authRes.error;

  const url = new URL(req.url);
  const year = parseYearParam(url.searchParams.get("year"));
  if (url.searchParams.get("year") && year == null) {
    return jsonError("Année invalide", 400);
  }

  const all = url.searchParams.get("all") === "1";
  const resolvedYear = year ?? new Date().getUTCFullYear();
  const { start, endExclusive } = utcYearRange(resolvedYear);

  const [oneOff, recurring] = await Promise.all([
    prisma.holiday.findMany({
      where: all ? { isRecurring: { not: true } } : { isRecurring: { not: true }, date: { gte: start, lt: endExclusive } },
      orderBy: { date: "asc" },
      select: { id: true, date: true, label: true, createdAt: true, isRecurring: true },
    }),
    prisma.holiday.findMany({
      where: { isRecurring: true },
      orderBy: { date: "asc" },
      select: { id: true, date: true, label: true, createdAt: true, isRecurring: true },
    }),
  ]);

  const recurringExpanded = recurring
    .map((h) => {
      const expanded = expandRecurringAnchorToYear(h.date, resolvedYear);
      if (!expanded) return null;
      return { ...h, date: expanded };
    })
    .filter(Boolean) as Array<(typeof recurring)[number] & { date: Date }>;

  const holidays = [...oneOff, ...recurringExpanded].sort((a, b) => a.date.getTime() - b.date.getTime());

  return NextResponse.json({ holidays });
}

export async function POST(req: Request) {
  const authRes = requireAuth(req);
  if (!authRes.ok) return authRes.error;

  const { id: actorId, role, isDsiAdmin } = authRes.auth;
  if (role !== "ACCOUNTANT" && !isDsiAdmin) return jsonError("Accès refusé", 403);

  const body = await req.json().catch(() => ({}));
  const rawDate = parseDate(norm(body?.date));
  if (!rawDate) return jsonError("date requise (YYYY-MM-DD)", 400);
  const recurring = Boolean(body?.recurring ?? body?.isRecurring ?? false);
  const normalized = normalizeUtcDateOnly(rawDate);
  const date = recurring ? toRecurringAnchorDate(normalized) : normalized;
  const label = norm(body?.label) || null;

  try {
    const created = await prisma.holiday.create({
      data: {
        date,
        label,
        isRecurring: recurring,
        createdById: actorId,
      },
      select: { id: true, date: true, label: true, createdAt: true, isRecurring: true },
    });

    // Pour une holiday récurrente, on renvoie une date "expansée" sur l'année courante (UX).
    const nowYear = new Date().getUTCFullYear();
    const holiday =
      created.isRecurring && created.date
        ? { ...created, date: expandRecurringAnchorToYear(created.date, nowYear) ?? created.date }
        : created;
    return NextResponse.json({ holiday }, { status: 201 });
  } catch (err: any) {
    const msg = String(err?.message ?? "");
    if (msg.toLowerCase().includes("unique")) {
      return jsonError("Ce jour férié existe déjà", 409);
    }
    return jsonError("Erreur lors de la création", 500);
  }
}
