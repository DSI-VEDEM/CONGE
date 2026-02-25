export const runtime = "nodejs";

import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { jsonError, verifyJwt } from "@/lib/auth";
import { norm } from "@/lib/validators";

const MAX_SIGNATURE_SIZE = 2 * 1024 * 1024;
const IMAGE_DATA_URL_RE = /^data:image\/(png|jpeg|jpg);base64,[A-Za-z0-9+/=]+$/i;

function authFromRequest(req: Request) {
  const v = verifyJwt(req);
  if (!v.ok) return { ok: false as const, error: v.error };

  const id = String(v.payload?.sub ?? "");
  const role = String(v.payload?.role ?? "");
  if (!id || !role) return { ok: false as const, error: jsonError("Token invalide", 401) };

  return { ok: true as const, auth: { id, role } };
}

function mimeFromDataUrl(dataUrl: string) {
  const m = dataUrl.match(/^data:(image\/[a-zA-Z0-9.+-]+);base64,/i);
  return m?.[1]?.toLowerCase() ?? null;
}

function isPrismaSchemaOutdatedError(error: unknown) {
  const message = error instanceof Error ? error.message : String(error ?? "");
  return (
    message.includes("Unknown field") ||
    message.includes("Unknown argument") ||
    message.includes("PrismaClientValidationError")
  );
}

export async function GET(req: Request) {
  const authRes = authFromRequest(req);
  if (!authRes.ok) return authRes.error;

  const { id: actorId, role } = authRes.auth;
  if (role !== "CEO") return jsonError("Accès refusé", 403);

  let employee: {
    id: string;
    ceoSignatureImageDataUrl: string | null;
    ceoSignatureImageMimeType: string | null;
  } | null = null;

  try {
    employee = await prisma.employee.findUnique({
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

  if (!employee) return jsonError("PDG introuvable", 404);

  return NextResponse.json({
    signatureImageDataUrl: employee.ceoSignatureImageDataUrl ?? null,
    signatureImageMimeType: employee.ceoSignatureImageMimeType ?? null,
  });
}

export async function PUT(req: Request) {
  const authRes = authFromRequest(req);
  if (!authRes.ok) return authRes.error;

  const { id: actorId, role } = authRes.auth;
  if (role !== "CEO") return jsonError("Accès refusé", 403);

  const body = await req.json().catch(() => ({}));
  const signatureImageDataUrl = norm(body?.signatureImageDataUrl);

  if (!signatureImageDataUrl) {
    return jsonError("Champs requis: signatureImageDataUrl", 400);
  }
  if (signatureImageDataUrl.length > MAX_SIGNATURE_SIZE) {
    return jsonError("Image de signature trop volumineuse", 400);
  }
  if (!IMAGE_DATA_URL_RE.test(signatureImageDataUrl)) {
    return jsonError("Format image invalide (PNG/JPEG)", 400);
  }

  const mimeType = mimeFromDataUrl(signatureImageDataUrl);
  if (!mimeType) return jsonError("Image invalide", 400);

  try {
    await prisma.employee.update({
      where: { id: actorId },
      data: {
        ceoSignatureImageDataUrl: signatureImageDataUrl,
        ceoSignatureImageMimeType: mimeType,
      },
      select: { id: true },
    });
  } catch (error: unknown) {
    if (isPrismaSchemaOutdatedError(error)) {
      return jsonError("Mise à jour Prisma requise: exécutez `npx prisma db push` puis redémarrez le serveur", 503);
    }
    throw error;
  }

  return NextResponse.json({ ok: true });
}
