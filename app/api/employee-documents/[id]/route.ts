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
const SPOUSE_TYPE = "SPOUSE_BIRTH_CERTIFICATE";
const CHILD_TYPE = "CHILD_BIRTH_CERTIFICATE";

type Ctx = { params: Promise<{ id: string }> };

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

function canManage(actorRole: string, actorId: string, docOwnerId: string, docOwnerRole?: string | null) {
  if (actorRole === "CEO") return false;
  if (actorRole === "ACCOUNTANT") return docOwnerRole !== "CEO";
  return actorId === docOwnerId;
}

export async function PUT(req: Request, ctx: Ctx) {
  const authRes = authFromRequest(req);
  if (!authRes.ok) return authRes.error;

  const { id: actorId, role: actorRole } = authRes.auth;
  const { id } = await ctx.params;
  if (!id) return jsonError("ID document requis", 400);

  const existing = await prisma.employeeDocument.findUnique({
    where: { id },
    select: {
      id: true,
      employeeId: true,
      type: true,
      relatedPersonName: true,
      childOrder: true,
      contractDocumentTypeId: true,
      validUntil: true,
      contractDocumentType: {
        select: {
          id: true,
          name: true,
        },
      },
      fileName: true,
      employee: { select: { role: true, childrenCount: true } },
    },
  });
  if (!existing) return jsonError("Document introuvable", 404);

  if (!canManage(actorRole, actorId, existing.employeeId, existing.employee?.role)) {
    return jsonError("Accès refusé", 403);
  }

  const body = await req.json().catch(() => ({}));
  const nextType = norm(body?.type) || existing.type;
  const hasContractDocumentTypeParam = Object.prototype.hasOwnProperty.call(body, "contractDocumentTypeId");
  const providedContractDocumentTypeId = hasContractDocumentTypeParam ? norm(body?.contractDocumentTypeId) || null : null;
  let nextContractDocumentTypeId = hasContractDocumentTypeParam
    ? providedContractDocumentTypeId
    : existing.contractDocumentTypeId ?? null;
  if (!DOCUMENT_TYPES.has(nextType)) return jsonError("Type de document invalide", 400);
  const nextIsContractType = nextType === "CONTRACT";
  if (actorRole === "CEO" && !nextIsContractType) {
    return jsonError("Le PDG ne peut pas modifier de documents RH autres que les contrats", 403);
  }
  if (nextIsContractType && actorRole !== "ACCOUNTANT" && actorRole !== "CEO") {
    return jsonError("Seule la comptable (ou le PDG) peut gérer les documents de contrats", 403);
  }

  const needsRelated = nextType === SPOUSE_TYPE || nextType === CHILD_TYPE;
  const nextRelatedNameRaw = Object.prototype.hasOwnProperty.call(body, "relatedPersonName")
    ? norm(body?.relatedPersonName) || null
    : existing.relatedPersonName ?? null;

  const nextNeedsValidityDate = documentRequiresValidityDate(nextType);
  const hasValidUntilParam = Object.prototype.hasOwnProperty.call(body, "validUntil");
  let nextValidUntil: Date | null = null;
  if (hasValidUntilParam) {
    const normalized = norm(body?.validUntil);
    if (normalized) {
      const parsed = parseDateValue(normalized);
      if (!parsed) {
        return jsonError("Date de validité invalide", 400);
      }
      nextValidUntil = parsed;
    } else {
      nextValidUntil = null;
    }
  } else if (existing.validUntil) {
    nextValidUntil = existing.validUntil;
  }
  if (nextNeedsValidityDate && !nextValidUntil) {
    return jsonError("Date de validité requise pour ce document", 400);
  }

  if (needsRelated && !nextRelatedNameRaw) {
    return jsonError("Le nom du conjoint/enfant est requis pour ce type", 400);
  }

  const childOrderParsed = Object.prototype.hasOwnProperty.call(body, "childOrder")
    ? parsePositiveIntResult(body?.childOrder)
    : { provided: false as const, value: existing.childOrder ?? null };

  if (childOrderParsed.provided && childOrderParsed.value == null) {
    return jsonError("childOrder doit être un entier positif", 400);
  }
  if (nextType !== CHILD_TYPE && childOrderParsed.provided && childOrderParsed.value != null) {
    return jsonError("childOrder est autorisé uniquement pour un document enfant", 400);
  }

  const ownerChildrenCount =
    typeof existing.employee?.childrenCount === "number" ? existing.employee.childrenCount : null;
  if (nextType === CHILD_TYPE && childOrderParsed.value != null && ownerChildrenCount != null) {
    if (childOrderParsed.value > ownerChildrenCount) {
      return jsonError("Le rang de l'enfant ne peut pas dépasser le nombre d'enfants", 400);
    }
  }

  if (nextType !== "CONTRACT") {
    nextContractDocumentTypeId = null;
  } else if (nextContractDocumentTypeId) {
    const contractType = await prisma.contractDocumentType.findUnique({
      where: { id: nextContractDocumentTypeId },
      select: { id: true },
    });
    if (!contractType) {
      return jsonError("Type de contrat introuvable", 404);
    }
  }

  const nextChildOrder = nextType === CHILD_TYPE ? childOrderParsed.value : null;

  let nextFileName = existing.fileName;
  let nextMimeType: string | null = null;
  let nextFileDataUrl: string | null = null;

  const incomingFileDataUrl = norm(body?.fileDataUrl);
  if (incomingFileDataUrl) {
    if (incomingFileDataUrl.length > MAX_DATA_URL_LENGTH) {
      return jsonError("Fichier trop volumineux", 400);
    }
    const match = incomingFileDataUrl.match(DATA_URL_RE);
    if (!match) {
      return jsonError("Format de fichier invalide (data URL requis)", 400);
    }
    const mimeType = match[1].toLowerCase();
    if (!ALLOWED_MIME_TYPES.has(mimeType)) {
      return jsonError("Format non supporté (PDF, JPG, PNG, WEBP)", 400);
    }
    const incomingFileName = norm(body?.fileName);
    if (!incomingFileName) {
      return jsonError("fileName requis pour remplacer le fichier", 400);
    }
    nextFileName = incomingFileName;
    nextMimeType = mimeType;
    nextFileDataUrl = incomingFileDataUrl;
  }

    const updated = await prisma.employeeDocument.update({
      where: { id },
      data: {
        type: nextType as
          | "ID_CARD"
          | "DRIVING_LICENSE"
          | "BIRTH_CERTIFICATE"
          | "SPOUSE_BIRTH_CERTIFICATE"
          | "CHILD_BIRTH_CERTIFICATE"
          | "CURRICULUM_VITAE"
          | "COVER_LETTER"
          | "GEOGRAPHIC_LOCATION"
          | "CONTRACT",
        relatedPersonName: needsRelated ? nextRelatedNameRaw : null,
        childOrder: nextChildOrder,
        fileName: nextFileName,
        ...(nextMimeType && nextFileDataUrl ? { mimeType: nextMimeType, fileDataUrl: nextFileDataUrl } : {}),
        contractDocumentTypeId: nextContractDocumentTypeId,
        validUntil: nextValidUntil,
      },
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
        createdAt: true,
        updatedAt: true,
      },
  });

  return NextResponse.json({ document: updated });
}

export async function DELETE(req: Request, ctx: Ctx) {
  const authRes = authFromRequest(req);
  if (!authRes.ok) return authRes.error;

  const { id: actorId, role: actorRole } = authRes.auth;
  const { id } = await ctx.params;
  if (!id) return jsonError("ID document requis", 400);

  const existing = await prisma.employeeDocument.findUnique({
    where: { id },
    select: {
      id: true,
      employeeId: true,
      employee: { select: { role: true } },
    },
  });
  if (!existing) return jsonError("Document introuvable", 404);

  if (!canManage(actorRole, actorId, existing.employeeId, existing.employee?.role)) {
    return jsonError("Accès refusé", 403);
  }

  await prisma.employeeDocument.delete({ where: { id } });
  return NextResponse.json({ ok: true });
}
