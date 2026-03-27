export const runtime = "nodejs";

import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { jsonError, verifyJwt } from "@/lib/auth";
import { readFile } from "fs/promises";
import { extname, join } from "path";

const DEFAULT_SIGNATURE_FILE_PATH = join(process.cwd(), "public", "SIGNATURE.jpeg");
const EXTENSION_TO_MIME: Record<string, string> = {
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
};

type DefaultSignature = {
  dataUrl: string;
  mimeType: string;
};

let cachedDefaultSignature: DefaultSignature | null = null;

async function loadDefaultSignature(): Promise<DefaultSignature | null> {
  if (cachedDefaultSignature) return cachedDefaultSignature;
  try {
    const buffer = await readFile(DEFAULT_SIGNATURE_FILE_PATH);
    const mimeType = EXTENSION_TO_MIME[extname(DEFAULT_SIGNATURE_FILE_PATH).toLowerCase()];
    if (!mimeType) return null;
    const dataUrl = `data:${mimeType};base64,${buffer.toString("base64")}`;
    cachedDefaultSignature = { dataUrl, mimeType };
    return cachedDefaultSignature;
  } catch {
    return null;
  }
}

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

  const defaultSignature = await loadDefaultSignature();
  return NextResponse.json({
    signatureImageDataUrl: employee.ceoSignatureImageDataUrl ?? defaultSignature?.dataUrl ?? null,
    signatureImageMimeType: employee.ceoSignatureImageMimeType ?? defaultSignature?.mimeType ?? null,
  });
}

export async function PUT() {
  return jsonError("Modification de la signature interdite", 405);
}
