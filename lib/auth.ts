import jwt from "jsonwebtoken";
import { NextResponse } from "next/server";

export function jsonError(message: string, status: number, extra?: Record<string, unknown>) {
  return NextResponse.json({ error: message, ...extra }, { status });
}

export function getBearerToken(req: Request) {
  const h = req.headers.get("authorization") || "";
  const [type, token] = h.split(" ");
  if (type?.toLowerCase() !== "bearer" || !token) return null;
  return token.trim();
}

export function verifyJwt(req: Request) {
  const token = getBearerToken(req);
  if (!token) return { ok: false as const, error: jsonError("Non authentifié", 401) };

  const secret = process.env.JWT_SECRET;
  if (!secret) return { ok: false as const, error: jsonError("JWT_SECRET manquant côté serveur", 500) };

  try {
    const payload = jwt.verify(token, secret) as any;
    return { ok: true as const, payload };
  } catch {
    return { ok: false as const, error: jsonError("Token invalide", 401) };
  }
}