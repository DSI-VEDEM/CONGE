export const runtime = "nodejs";

import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { jsonError, verifyJwt } from "@/lib/auth";
import { findActiveEmployeeByRole } from "@/lib/leave-requests";
import type { NotificationCategory } from "@/generated/prisma/client";
const MAX_FILES = 400;
const MAX_DATA_URL_LENGTH = 14 * 1024 * 1024;

function authFromRequest(req: Request) {
  const v = verifyJwt(req);
  if (!v.ok) return { ok: false as const, error: v.error };

  const id = String(v.payload?.sub ?? "");
  const role = String(v.payload?.role ?? "");
  if (!id || !role) return { ok: false as const, error: jsonError("Token invalide", 401) };

  return { ok: true as const, auth: { id, role } };
}

function toPdfDataUrl(bytes: ArrayBuffer) {
  const base64 = Buffer.from(bytes).toString("base64");
  return `data:application/pdf;base64,${base64}`;
}

function normalizeMatriculeKey(value: string) {
  return value
    .toUpperCase()
    .replace(/\s+/g, "")
    .trim();
}

function buildMatriculeLookup(rows: { id: string; matricule: string }[]) {
  const byKey = new Map<string, { employeeId: string; matricule: string }>();
  for (const row of rows) {
    const base = normalizeMatriculeKey(row.matricule);
    if (!base) continue;
    const noDash = base.replace(/-/g, "");
    byKey.set(base, { employeeId: row.id, matricule: row.matricule });
    byKey.set(noDash, { employeeId: row.id, matricule: row.matricule });
  }
  return byKey;
}

function extractMatriculeCandidate(value: string, lookup: Map<string, { employeeId: string; matricule: string }>) {
  const up = value.toUpperCase();
  const candidates = new Set<string>();

  const re1 = /[A-Z]{1,6}[- ]?\d{1,6}[A-Z]?/g;
  for (const match of up.matchAll(re1)) {
    const raw = String(match[0] ?? "");
    const key = normalizeMatriculeKey(raw).replace(/ /g, "");
    if (key) candidates.add(key);
    if (key) candidates.add(key.replace(/-/g, ""));
  }

  const re2 = /\b\d{3,6}[A-Z]\b/g; // ex: 001A
  for (const match of up.matchAll(re2)) {
    const key = normalizeMatriculeKey(String(match[0] ?? ""));
    if (key) candidates.add(key);
  }

  const re3 = /\b\d{1,6}\b/g; // ex: 001, 013
  for (const match of up.matchAll(re3)) {
    const key = normalizeMatriculeKey(String(match[0] ?? ""));
    if (key) candidates.add(key);
  }

  const matching = Array.from(candidates).find((candidate) => {
    const normalized = normalizeMatriculeKey(candidate);
    return lookup.has(normalized) || lookup.has(normalized.replace(/-/g, ""));
  });
  if (matching) return matching;

  let best: string | null = null;
  let bestLen = 0;
  for (const cand of candidates) {
    if (cand.length > bestLen) {
      best = cand;
      bestLen = cand.length;
    }
  }
  return best;
}

function parseYearMonthFromFileName(fileName: string) {
  const base = String(fileName).replace(/\.pdf$/i, "");
  const up = base.toUpperCase();
  const currentYear = new Date().getFullYear();

  // Prefer explicit patterns: YYYY-MM or YYYY_MM
  const m1 = up.match(/\b(20\d{2})[-_ ](0?[1-9]|1[0-2])\b/);
  if (m1) {
    const year = Number(m1[1]);
    const month = Number(m1[2]);
    if (year >= 2000 && year <= currentYear && month >= 1 && month <= 12) return { year, month };
  }

  // Also accept MM-YYYY
  const m2 = up.match(/\b(0?[1-9]|1[0-2])[-_ ](20\d{2})\b/);
  if (m2) {
    const month = Number(m2[1]);
    const year = Number(m2[2]);
    if (year >= 2000 && year <= currentYear && month >= 1 && month <= 12) return { year, month };
  }

  // Fallback: find any year then nearest month-like token around it
  const yearMatch = up.match(/\b20\d{2}\b/);
  if (!yearMatch) return null;
  const year = Number(yearMatch[0]);
  if (!(year >= 2000 && year <= currentYear)) return null;

  const tokens = up.split(/[^A-Z0-9]+/).filter(Boolean);
  const yearIdx = tokens.findIndex((t) => t === yearMatch[0]);
  const neighbors = [
    tokens[yearIdx - 1],
    tokens[yearIdx + 1],
    tokens[yearIdx - 2],
    tokens[yearIdx + 2],
  ].filter(Boolean);
  for (const t of neighbors) {
    const month = Number(t);
    if (Number.isInteger(month) && month >= 1 && month <= 12) return { year, month };
  }
  return null;
}

export async function POST(req: Request) {
  const authRes = authFromRequest(req);
  if (!authRes.ok) return authRes.error;

  const { id: actorId, role } = authRes.auth;
  if (role !== "ACCOUNTANT") return jsonError("Accès refusé", 403);

  const form = await req.formData().catch(() => null);
  if (!form) return jsonError("FormData invalide", 400);

  const files = [
    ...form.getAll("pdfs"),
    ...form.getAll("files"),
    ...form.getAll("pdf"),
  ].flatMap((x) => (x instanceof File ? [x] : []));

  const pdfs = files.filter(
    (f) => f.type === "application/pdf" || String(f.name).toLowerCase().endsWith(".pdf")
  );
  if (pdfs.length === 0) return jsonError("Ajoutez au moins un PDF", 400);
  if (pdfs.length > MAX_FILES) return jsonError(`Trop de PDFs (max ${MAX_FILES})`, 400);

  const employees = await prisma.employee.findMany({
    where: { matricule: { not: null } },
    select: { id: true, matricule: true },
  });
  const lookup = buildMatriculeLookup(
    employees.flatMap((e) => (e.matricule ? [{ id: e.id, matricule: String(e.matricule) }] : []))
  );
  if (lookup.size === 0) return jsonError("Aucun matricule trouvé en base", 400);

  // 1) Extract + validate everything before creating anything.
  const extracted: {
    fileName: string;
    employeeId: string | null;
    matricule: string | null;
    year: number | null;
    month: number | null;
    bytes: ArrayBuffer;
  }[] = [];

  const errors: { fileName: string; error: string }[] = [];

  for (const f of pdfs) {
    const fileName = String(f.name || "bulletin.pdf");
    const bytes = await f.arrayBuffer();
    const dataUrl = toPdfDataUrl(bytes);
    if (dataUrl.length > MAX_DATA_URL_LENGTH) {
      errors.push({ fileName, error: "PDF trop volumineux" });
      continue;
    }

    const matCandidate = extractMatriculeCandidate(fileName, lookup);
    const ym = parseYearMonthFromFileName(fileName);

    if (!matCandidate) {
      errors.push({ fileName, error: "Matricule introuvable dans le nom du fichier" });
      continue;
    }
    if (!ym?.year || !ym?.month) {
      errors.push({ fileName, error: "Date (YYYY-MM) introuvable dans le nom du fichier" });
      continue;
    }

    const normalized = normalizeMatriculeKey(matCandidate);
    const hit = lookup.get(normalized) ?? lookup.get(normalized.replace(/-/g, ""));
    if (!hit) {
      errors.push({ fileName, error: `Matricule détecté (${matCandidate}) mais introuvable en base` });
      continue;
    }

    extracted.push({
      fileName,
      employeeId: hit.employeeId,
      matricule: hit.matricule,
      year: ym.year,
      month: ym.month,
      bytes,
    });
  }

  if (errors.length) {
    return jsonError("Import bloqué: certains PDFs sont invalides", 400, { errors: errors.slice(0, 50) });
  }

  const seen = new Set<string>();
  const conflicts: { matricule: string; year: number; month: number; fileName: string }[] = [];
  for (const x of extracted) {
    const key = `${x.employeeId}__${x.year}__${x.month}`;
    if (seen.has(key)) {
      return jsonError("Import bloqué: doublon de période pour un matricule (dans la sélection)", 400, {
        error: `${x.matricule} ${x.month}/${x.year}`,
      });
    }
    seen.add(key);

    const existing = await prisma.salarySlip.findFirst({
      where: { employeeId: x.employeeId as string, year: x.year as number, month: x.month as number },
      select: { id: true },
    });
    if (existing) conflicts.push({ matricule: x.matricule as string, year: x.year as number, month: x.month as number, fileName: x.fileName });
  }

  if (conflicts.length) {
    return jsonError("Import bloqué: certains bulletins existent déjà", 409, { conflicts: conflicts.slice(0, 50) });
  }

  // 2) Create in DB.
  let createdCount = 0;
  try {
    const created = await prisma.$transaction(
      extracted.map((x) =>
        prisma.salarySlip.create({
          data: {
            employeeId: x.employeeId as string,
            year: x.year as number,
            month: x.month as number,
            fileName: x.fileName,
            mimeType: "application/pdf",
            fileDataUrl: toPdfDataUrl(x.bytes),
            uploadedById: actorId,
            signedById: null,
            signedAt: null,
          },
          select: { id: true },
        })
      )
    );
    createdCount = created.length;
  } catch (e: unknown) {
    const err = e as { message?: string };
    return jsonError("Import impossible", 500, { details: err?.message });
  }

  // Non signé => notification PDG.
  if (createdCount > 0) {
    const ceo = await findActiveEmployeeByRole("CEO");
    if (ceo) {
      await prisma.notification.create({
        data: {
          title: "Bulletins prêts à signer",
          body: `La comptable a importé ${createdCount} bulletin(s). Merci de les signer.`,
          category: "ACTION" as NotificationCategory,
          employeeId: ceo.id,
          targetRole: "CEO",
          metadata: {
            actionPath: "/dashboard/ceo/payslips/sign",
            createdCount,
          },
        },
      });
    }
  }

  return NextResponse.json({
    createdCount,
    mode: "multiple-pdfs",
    detected: extracted.map((x) => ({
      fileName: x.fileName,
      matricule: x.matricule,
      year: x.year,
      month: x.month,
    })),
  });
}
