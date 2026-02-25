export const runtime = "nodejs";

import { NextResponse } from "next/server";
import { PDFDocument } from "pdf-lib";
import { prisma } from "@/lib/prisma";
import { jsonError, verifyJwt } from "@/lib/auth";

function authFromRequest(req: Request) {
  const v = verifyJwt(req);
  if (!v.ok) return { ok: false as const, error: v.error };

  const id = String(v.payload?.sub ?? "");
  const role = String(v.payload?.role ?? "");
  if (!id || !role) return { ok: false as const, error: jsonError("Token invalide", 401) };

  return { ok: true as const, auth: { id, role } };
}

function isPrismaSchemaOutdatedError(error: unknown) {
  const message = error instanceof Error ? error.message : String(error ?? "");
  return (
    message.includes("Unknown field") ||
    message.includes("Unknown argument") ||
    message.includes("PrismaClientValidationError")
  );
}

function decodeDataUrl(dataUrl: string) {
  const m = dataUrl.match(/^data:([^;]+);base64,(.+)$/);
  if (!m) return null;
  const mimeType = m[1];
  const base64 = m[2];
  return {
    mimeType,
    bytes: Uint8Array.from(Buffer.from(base64, "base64")),
  };
}

function toDataUrl(mimeType: string, bytes: Uint8Array) {
  return `data:${mimeType};base64,${Buffer.from(bytes).toString("base64")}`;
}

function parseNormalizedRatio(value: unknown) {
  const num = Number(value);
  if (!Number.isFinite(num)) return null;
  if (num < 0 || num > 1) return null;
  return num;
}

export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const authRes = authFromRequest(req);
  if (!authRes.ok) return authRes.error;

  const { id: actorId, role } = authRes.auth;
  if (role !== "CEO") return jsonError("Seul le PDG peut signer un bulletin", 403);

  const { id } = await ctx.params;
  const force = new URL(req.url).searchParams.get("force") === "1";
  const body = await req.json().catch(() => null);
  const placementX = parseNormalizedRatio((body as { placementX?: unknown } | null)?.placementX);
  const placementYTop = parseNormalizedRatio((body as { placementYTop?: unknown } | null)?.placementYTop);
  const hasPlacementPayload = Boolean(
    body &&
      typeof body === "object" &&
      ("placementX" in body || "placementYTop" in body)
  );

  if (hasPlacementPayload && (placementX == null || placementYTop == null)) {
    return jsonError("placementX et placementYTop doivent être entre 0 et 1", 400);
  }

  let ceo: {
    id: string;
    ceoSignatureImageDataUrl: string | null;
    ceoSignatureImageMimeType: string | null;
  } | null = null;

  try {
    ceo = await prisma.employee.findUnique({
      where: { id: actorId },
      select: {
        id: true,
        ceoSignatureImageDataUrl: true,
        ceoSignatureImageMimeType: true,
      },
    });
  } catch (error: unknown) {
    if (isPrismaSchemaOutdatedError(error)) {
      return jsonError("Mise à jour Prisma requise: exécutez `npx prisma db push` puis redémarrez le serveur", 503);
    }
    throw error;
  }
  if (!ceo) return jsonError("PDG introuvable", 404);
  if (!ceo.ceoSignatureImageDataUrl || !ceo.ceoSignatureImageMimeType) {
    return jsonError("Veuillez d'abord définir votre image de signature", 400);
  }

  const existing = await prisma.salarySlip.findUnique({
    where: { id },
    select: { id: true, signedAt: true, signedById: true, fileDataUrl: true, mimeType: true },
  });

  if (!existing) return jsonError("Bulletin introuvable", 404);

  if (existing.signedAt && !force) {
    return jsonError("Ce bulletin est déjà signé", 409);
  }

  const pdfDecoded = decodeDataUrl(existing.fileDataUrl);
  if (!pdfDecoded || pdfDecoded.mimeType !== "application/pdf") {
    return jsonError("Le bulletin source est invalide", 400);
  }

  const signatureDecoded = decodeDataUrl(ceo.ceoSignatureImageDataUrl);
  if (!signatureDecoded) {
    return jsonError("Image de signature invalide", 400);
  }

  let signedFileDataUrl = existing.fileDataUrl;
  try {
    const pdfDoc = await PDFDocument.load(pdfDecoded.bytes);
    const pages = pdfDoc.getPages();
    const targetPage = pages[pages.length - 1];
    if (!targetPage) return jsonError("PDF vide", 400);

    const { width, height } = targetPage.getSize();

    let embeddedImage: Awaited<ReturnType<typeof pdfDoc.embedJpg>>;
    if (signatureDecoded.mimeType === "image/png") {
      embeddedImage = await pdfDoc.embedPng(signatureDecoded.bytes);
    } else if (signatureDecoded.mimeType === "image/jpeg" || signatureDecoded.mimeType === "image/jpg") {
      embeddedImage = await pdfDoc.embedJpg(signatureDecoded.bytes);
    } else {
      return jsonError("Le format de signature doit être PNG ou JPEG", 400);
    }

    const maxWidth = Math.min(220, width * 0.35);
    const maxHeight = Math.min(90, height * 0.15);
    const scale = Math.min(maxWidth / embeddedImage.width, maxHeight / embeddedImage.height);
    const drawWidth = embeddedImage.width * scale;
    const drawHeight = embeddedImage.height * scale;

    let drawX = width - drawWidth - 24;
    let drawY = 18;

    // Position personnalisée depuis l'aperçu (ratios normalisés).
    if (placementX != null && placementYTop != null) {
      const maxX = Math.max(0, width - drawWidth);
      const maxY = Math.max(0, height - drawHeight);
      drawX = Math.min(Math.max(width * placementX, 0), maxX);
      drawY = Math.min(Math.max(height - height * placementYTop - drawHeight, 0), maxY);
    }

    targetPage.drawImage(embeddedImage, {
      x: drawX,
      y: drawY,
      width: drawWidth,
      height: drawHeight,
    });

    const signedPdfBytes = await pdfDoc.save();
    signedFileDataUrl = toDataUrl("application/pdf", signedPdfBytes);
  } catch {
    return jsonError("Impossible d'appliquer la signature sur le PDF", 500);
  }

  let signed: unknown;
  try {
    signed = await prisma.salarySlip.update({
      where: { id },
      data: {
        signedById: actorId,
        signedAt: new Date(),
        fileDataUrl: signedFileDataUrl,
        signatureImageDataUrl: ceo.ceoSignatureImageDataUrl,
        signatureImageMimeType: ceo.ceoSignatureImageMimeType,
      },
      select: {
        id: true,
        employeeId: true,
        year: true,
        month: true,
        fileName: true,
        signedAt: true,
        signedBy: { select: { firstName: true, lastName: true, role: true } },
      },
    });
  } catch (error: unknown) {
    if (isPrismaSchemaOutdatedError(error)) {
      return jsonError("Mise à jour Prisma requise: exécutez `npx prisma db push` puis redémarrez le serveur", 503);
    }
    throw error;
  }

  return NextResponse.json({ slip: signed }, { status: 200 });
}
