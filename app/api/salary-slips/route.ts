export const runtime = "nodejs";

import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { jsonError, verifyJwt } from "@/lib/auth";
import { norm } from "@/lib/validators";

const PDF_DATA_URL_RE = /^data:application\/pdf;base64,[A-Za-z0-9+/=]+$/;
const MAX_DATA_URL_LENGTH = 14 * 1024 * 1024;

function parsePositiveInt(value: unknown) {
  const num = Number(value);
  if (!Number.isInteger(num) || num <= 0) return null;
  return num;
}

function parseOptionalMonth(value: string | null) {
  if (!value) return null;
  const month = Number(value);
  if (!Number.isInteger(month) || month < 1 || month > 12) return null;
  return month;
}

function parsePositivePage(value: string | null) {
  if (!value) return null;
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed <= 0) return null;
  return parsed;
}

function parsePositiveTake(value: string | null) {
  if (!value) return null;
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed <= 0) return null;
  return Math.min(parsed, 300);
}

function authFromRequest(req: Request) {
  const v = verifyJwt(req);
  if (!v.ok) return { ok: false as const, error: v.error };

  const id = String(v.payload?.sub ?? "");
  const role = String(v.payload?.role ?? "");
  if (!id || !role) return { ok: false as const, error: jsonError("Token invalide", 401) };

  return { ok: true as const, auth: { id, role } };
}

export async function GET(req: Request) {
  const authRes = authFromRequest(req);
  if (!authRes.ok) return authRes.error;

  const { id: actorId, role } = authRes.auth;
  const isAccountant = role === "ACCOUNTANT";
  const isCeo = role === "CEO";

  const url = new URL(req.url);
  const year = parsePositiveInt(url.searchParams.get("year"));
  const month = parseOptionalMonth(url.searchParams.get("month"));
  const employeeId = norm(url.searchParams.get("employeeId"));
  const mineOnly = url.searchParams.get("mine") === "1";
  const unsignedOnly = url.searchParams.get("unsigned") === "1";
  const signedOnly = url.searchParams.get("signed") === "1";
  const page = parsePositivePage(url.searchParams.get("page"));
  const take = parsePositiveTake(url.searchParams.get("take"));

  if (url.searchParams.get("year") && !year) return jsonError("Année invalide", 400);
  if (url.searchParams.get("month") && month == null) return jsonError("Mois invalide", 400);
  if (url.searchParams.get("page") && !page) return jsonError("Page invalide", 400);
  if (url.searchParams.get("take") && !take) return jsonError("Taille de page invalide", 400);

  if (!isAccountant && !isCeo && employeeId && employeeId !== actorId) {
    return jsonError("Accès refusé", 403);
  }

  const where: Record<string, unknown> = {};

  if (!isAccountant && !isCeo) {
    where.employeeId = actorId;
    where.signedAt = { not: null };
  }

  if (year) where.year = year;
  if (month != null) where.month = month;
  if (mineOnly) {
    where.employeeId = actorId;
  } else if (employeeId && (isAccountant || isCeo)) {
    where.employeeId = employeeId;
  }
  if (unsignedOnly && isCeo) {
    where.OR = [{ signedAt: null }, { signedAt: { isSet: false } }];
  }
  if (signedOnly && (isAccountant || isCeo)) {
    where.signedAt = { not: null };
  }

  const signedOrder = [{ signedAt: "desc" as const }, { createdAt: "desc" as const }];
  const defaultOrder = [{ year: "desc" as const }, { month: "desc" as const }, { createdAt: "desc" as const }];
  const orderBy = signedOnly || (!isAccountant && !isCeo) ? signedOrder : defaultOrder;

  const slips = await prisma.salarySlip.findMany({
    where,
    select: {
      id: true,
      employeeId: true,
      year: true,
      month: true,
      fileName: true,
      mimeType: true,
      signedAt: true,
      createdAt: true,
      employee: { select: { firstName: true, lastName: true, matricule: true, email: true } },
      signedBy: { select: { firstName: true, lastName: true, role: true } },
    },
    orderBy,
    ...(page && take ? { skip: (page - 1) * take, take } : {}),
  });

  return NextResponse.json({
    slips,
    ...(page && take ? { page, take } : {}),
  });
}

export async function POST(req: Request) {
  const authRes = authFromRequest(req);
  if (!authRes.ok) return authRes.error;

  const { id: actorId, role } = authRes.auth;
  if (role !== "ACCOUNTANT") return jsonError("Accès refusé", 403);

  const body = await req.json().catch(() => ({}));

  const employeeId = norm(body?.employeeId);
  const year = parsePositiveInt(body?.year);
  const month = Number(body?.month);
  const fileName = norm(body?.fileName);
  const fileDataUrl = norm(body?.fileDataUrl);

  if (!employeeId || !year || !Number.isInteger(month) || month < 1 || month > 12 || !fileName || !fileDataUrl) {
    return jsonError("Champs requis: employeeId, year, month, fileName, fileDataUrl", 400);
  }
  const currentYear = new Date().getFullYear();
  if (year > currentYear) {
    return jsonError(`Année invalide: ${year}. L'année ne doit pas dépasser ${currentYear}`, 400);
  }

  if (fileDataUrl.length > MAX_DATA_URL_LENGTH) {
    return jsonError("Fichier trop volumineux", 400);
  }

  if (!PDF_DATA_URL_RE.test(fileDataUrl)) {
    return jsonError("Le bulletin doit être un PDF (data URL)", 400);
  }

  const employee = await prisma.employee.findUnique({
    where: { id: employeeId },
    select: { id: true },
  });
  if (!employee) return jsonError("Employé introuvable", 404);

  try {
    const created = await prisma.salarySlip.create({
      data: {
        employeeId,
        year,
        month,
        fileName,
        mimeType: "application/pdf",
        fileDataUrl,
        uploadedById: actorId,
        signedById: null,
        signedAt: null,
      },
      select: {
        id: true,
        employeeId: true,
        year: true,
        month: true,
        fileName: true,
        mimeType: true,
        signedAt: true,
        createdAt: true,
      },
    });

    return NextResponse.json({ slip: created }, { status: 201 });
  } catch (e: unknown) {
    const err = e as { code?: string; message?: string };
    if (err?.code === "P2002") {
      return jsonError("Un bulletin existe déjà pour cet employé, ce mois et cette année", 409);
    }
    return jsonError("Erreur serveur", 500, { code: err?.code, details: err?.message });
  }
}
