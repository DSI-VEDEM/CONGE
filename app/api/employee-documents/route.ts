export const runtime = "nodejs";

import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { jsonError, verifyJwt } from "@/lib/auth";
import { norm } from "@/lib/validators";
import { documentRequiresValidityDate } from "@/lib/document-validity";

const DOCUMENT_TYPES = new Set([
  "ID_CARD",
  "DRIVING_LICENSE",
  "BIRTH_CERTIFICATE",
  "SPOUSE_BIRTH_CERTIFICATE",
  "CHILD_BIRTH_CERTIFICATE",
  "CURRICULUM_VITAE",
  "COVER_LETTER",
  "GEOGRAPHIC_LOCATION",
  "CONTRACT",
]);
const ALLOWED_MIME_TYPES = new Set([
  "application/pdf",
  "image/jpeg",
  "image/png",
  "image/webp",
]);
const DATA_URL_RE = /^data:([a-zA-Z0-9.+-]+\/[a-zA-Z0-9.+-]+);base64,[A-Za-z0-9+/=]+$/;
const MAX_DATA_URL_LENGTH = 12 * 1024 * 1024;
const DEFAULT_PAGE_SIZE = 30;
const MAX_PAGE_SIZE = 90;
const SPOUSE_TYPE = "SPOUSE_BIRTH_CERTIFICATE";
const CHILD_TYPE = "CHILD_BIRTH_CERTIFICATE";

function parsePositiveIntResult(value: unknown) {
  if (value == null || String(value).trim() === "") return { provided: false as const, value: null as number | null };
  const n = Number(value);
  if (!Number.isInteger(n) || n <= 0) return { provided: true as const, value: null as number | null };
  return { provided: true as const, value: n };
}

function parseDateValue(value: string | null | undefined) {
  if (!value) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return date;
}

function authFromRequest(req: Request) {
  const v = verifyJwt(req);
  if (!v.ok) return { ok: false as const, error: v.error };

  const id = String(v.payload?.sub ?? "");
  const role = String(v.payload?.role ?? "");
  if (!id || !role) return { ok: false as const, error: jsonError("Token invalide", 401) };

  return { ok: true as const, auth: { id, role } };
}

function isGlobalReader(role: string) {
  return role === "CEO" || role === "ACCOUNTANT";
}

export async function GET(req: Request) {
  const authRes = authFromRequest(req);
  if (!authRes.ok) return authRes.error;

  const { id: actorId, role } = authRes.auth;
  const canReadAll = isGlobalReader(role);

  const url = new URL(req.url);
  const employeeId = norm(url.searchParams.get("employeeId"));
  const type = norm(url.searchParams.get("type"));
  const includeFileData = url.searchParams.get("includeFileData") === "1";
  const excludeEmployeeId = norm(url.searchParams.get("excludeEmployeeId"));
  const skipParam = url.searchParams.get("skip");
  const takeParam = url.searchParams.get("take");
  const requestedSkip = Number(skipParam);
  const requestedTake = Number(takeParam);
  const skip = Number.isInteger(requestedSkip) && requestedSkip >= 0 ? requestedSkip : 0;
  const normalizedTake =
    Number.isInteger(requestedTake) && requestedTake > 0 ? requestedTake : DEFAULT_PAGE_SIZE + 1;
  const take = Math.min(normalizedTake, MAX_PAGE_SIZE + 1);

  if (type && !DOCUMENT_TYPES.has(type)) {
    return jsonError("Type de document invalide", 400);
  }

  if (!canReadAll && employeeId && employeeId !== actorId) {
    return jsonError("Accès refusé", 403);
  }

  const where: Record<string, unknown> = {};

  if (!canReadAll) {
    where.employeeId = actorId;
  } else if (employeeId) {
    where.employeeId = employeeId;
  } else if (excludeEmployeeId) {
    where.employeeId = { not: excludeEmployeeId };
  }

  if (type) {
    where.type = type;
  }

  const documents = await prisma.employeeDocument.findMany({
    where: {
      ...where,
      employee: {
        role: { not: "CEO" },
      },
    },
    skip,
    take,
    select: {
      id: true,
      employeeId: true,
      type: true,
      relatedPersonName: true,
      childOrder: true,
      validUntil: true,
      contractDocumentTypeId: true,
      contractDocumentType: {
        select: {
          id: true,
          name: true,
        },
      },
      fileName: true,
      mimeType: true,
      ...(includeFileData ? { fileDataUrl: true } : {}),
      createdAt: true,
      employee: {
        select: {
          id: true,
          firstName: true,
          lastName: true,
          matricule: true,
          email: true,
          role: true,
          profilePhotoUrl: true,
        },
      },
      uploadedBy: {
        select: {
          id: true,
          firstName: true,
          lastName: true,
          role: true,
        },
      },
    },
    orderBy: { createdAt: "desc" },
  });

  return NextResponse.json({ documents });
}

export async function POST(req: Request) {
  const authRes = authFromRequest(req);
  if (!authRes.ok) return authRes.error;

  const { id: actorId, role } = authRes.auth;

  const body = await req.json().catch(() => ({}));

  const type = norm(body?.type);
  const fileName = norm(body?.fileName);
  const fileDataUrl = norm(body?.fileDataUrl);
  const relatedPersonName = norm(body?.relatedPersonName) || null;
  const childOrderParsed = parsePositiveIntResult(body?.childOrder);
  const contractDocumentTypeId = norm(body?.contractDocumentTypeId) || null;
  const validUntilRaw = norm(body?.validUntil);
  const validUntilDate = parseDateValue(validUntilRaw);
  const requestedEmployeeId = norm(body?.employeeId);
  let employeeId = actorId;
  if (requestedEmployeeId && requestedEmployeeId !== actorId) {
    if (role !== "ACCOUNTANT") {
      return jsonError("Vous ne pouvez ajouter que vos propres documents", 403);
    }
    employeeId = requestedEmployeeId;
  }

  const employee = await prisma.employee.findUnique({
    where: { id: employeeId },
    select: { id: true, childrenCount: true },
  });
  if (!employee) return jsonError("Employé introuvable", 404);

  if (!DOCUMENT_TYPES.has(type)) {
    return jsonError("Type de document invalide", 400);
  }

  const needsValidityDate = documentRequiresValidityDate(type);
  if (validUntilRaw && !validUntilDate) {
    return jsonError("Date de validité invalide", 400);
  }
  if (needsValidityDate && !validUntilDate) {
    return jsonError("Date de validité requise pour ce document", 400);
  }

  const isContractType = type === "CONTRACT";
  if (role === "CEO" && !isContractType) {
    return jsonError("Le PDG ne peut pas ajouter de documents RH autres que les contrats", 403);
  }
  if (isContractType && role !== "ACCOUNTANT" && role !== "CEO") {
    return jsonError("Seule la comptable (ou le PDG) peut ajouter des documents de contrats", 403);
  }

  if (!fileName || !fileDataUrl) {
    return jsonError("Champs requis: type, fileName, fileDataUrl", 400);
  }
  if ((type === SPOUSE_TYPE || type === CHILD_TYPE) && !relatedPersonName) {
    return jsonError("Le nom du conjoint/enfant est requis pour ce type", 400);
  }
  if (childOrderParsed.provided && childOrderParsed.value == null) {
    return jsonError("childOrder doit être un entier positif", 400);
  }
  if (type !== CHILD_TYPE && childOrderParsed.provided) {
    return jsonError("childOrder est autorisé uniquement pour un document enfant", 400);
  }

  const childrenTotal = typeof employee.childrenCount === "number" ? employee.childrenCount : null;
  if (type === CHILD_TYPE && childOrderParsed.value != null && childrenTotal != null) {
    if (childOrderParsed.value > childrenTotal) {
      return jsonError("Le rang de l'enfant ne peut pas dépasser le nombre d'enfants", 400);
    }
  }

  if (contractDocumentTypeId && type !== "CONTRACT") {
    return jsonError("contractDocumentTypeId est réservé aux contrats", 400);
  }

  if (contractDocumentTypeId && type === "CONTRACT") {
    const contractType = await prisma.contractDocumentType.findUnique({
      where: { id: contractDocumentTypeId },
      select: { id: true },
    });
    if (!contractType) return jsonError("Type de contrat introuvable", 404);
  }

  if (fileDataUrl.length > MAX_DATA_URL_LENGTH) {
    return jsonError("Fichier trop volumineux", 400);
  }

  const match = fileDataUrl.match(DATA_URL_RE);
  if (!match) {
    return jsonError("Format de fichier invalide (data URL requis)", 400);
  }

  const mimeType = match[1].toLowerCase();
  if (!ALLOWED_MIME_TYPES.has(mimeType)) {
    return jsonError("Format non supporté (PDF, JPG, PNG, WEBP)", 400);
  }

  const created = await prisma.employeeDocument.create({
    data: {
      employeeId,
      type: type as
        | "ID_CARD"
        | "DRIVING_LICENSE"
        | "BIRTH_CERTIFICATE"
        | "SPOUSE_BIRTH_CERTIFICATE"
        | "CHILD_BIRTH_CERTIFICATE"
        | "CURRICULUM_VITAE"
        | "COVER_LETTER"
        | "GEOGRAPHIC_LOCATION"
        | "CONTRACT",
      relatedPersonName,
      childOrder: childOrderParsed.value,
      fileName,
      mimeType,
      fileDataUrl,
      uploadedById: actorId,
      validUntil: validUntilDate,
      contractDocumentTypeId: type === "CONTRACT" ? contractDocumentTypeId : null,
    },
    select: {
      id: true,
      employeeId: true,
      type: true,
      relatedPersonName: true,
      childOrder: true,
      validUntil: true,
      contractDocumentTypeId: true,
      fileName: true,
      mimeType: true,
      createdAt: true,
    },
  });

  return NextResponse.json({ document: created }, { status: 201 });
}
