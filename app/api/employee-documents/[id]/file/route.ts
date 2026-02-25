export const runtime = "nodejs";

import { jsonError, verifyJwt } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

type Ctx = { params: Promise<{ id: string }> };

function authFromRequest(req: Request) {
  const v = verifyJwt(req);
  if (!v.ok) return { ok: false as const, error: v.error };

  const id = String(v.payload?.sub ?? "");
  const role = String(v.payload?.role ?? "");
  if (!id || !role) return { ok: false as const, error: jsonError("Token invalide", 401) };

  return { ok: true as const, auth: { id, role } };
}

function canReadDocument(actorRole: string, actorId: string, ownerId: string, ownerRole?: string | null) {
  if (ownerRole === "CEO") return false;
  if (actorRole === "CEO" || actorRole === "ACCOUNTANT") return true;
  return actorId === ownerId;
}

function decodeDataUrl(dataUrl: string) {
  const m = dataUrl.match(/^data:([^;]+);base64,(.+)$/);
  if (!m) return null;
  return {
    mimeType: m[1].toLowerCase(),
    bytes: Buffer.from(m[2], "base64"),
  };
}

function sanitizeFileName(fileName: string) {
  return fileName.replace(/[\\/:*?"<>|\r\n]+/g, "_");
}

export async function GET(req: Request, ctx: Ctx) {
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
      fileName: true,
      fileDataUrl: true,
      mimeType: true,
      employee: { select: { role: true } },
    },
  });
  if (!existing) return jsonError("Document introuvable", 404);

  if (!canReadDocument(actorRole, actorId, existing.employeeId, existing.employee?.role)) {
    return jsonError("Accès refusé", 403);
  }

  const decoded = decodeDataUrl(existing.fileDataUrl);
  if (!decoded) return jsonError("Fichier invalide", 500);

  const safeName = sanitizeFileName(existing.fileName || "document");
  return new Response(decoded.bytes, {
    status: 200,
    headers: {
      "Content-Type": existing.mimeType || decoded.mimeType || "application/octet-stream",
      "Content-Disposition": `inline; filename="${safeName}"`,
      "Cache-Control": "private, max-age=300",
    },
  });
}
