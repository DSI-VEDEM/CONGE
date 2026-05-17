import jwt, { type Algorithm, type SignOptions } from "jsonwebtoken";
import { NextResponse } from "next/server";
import type { EmployeeRole, EmployeeStatus } from "@/generated/prisma/client";

/// Nom du cookie httpOnly portant le token JWT.
export const AUTH_COOKIE_NAME = "auth_token";

const DEFAULT_ALGORITHM: Algorithm = "HS256";
const DEFAULT_EXPIRES_IN: SignOptions["expiresIn"] = "7d";
const IS_PROD = process.env.NODE_ENV === "production";

/// Payload typé du JWT applicatif.
export type JwtPayload = {
  sub: string;
  email?: string;
  matricule?: string | null;
  role: EmployeeRole | string;
  status?: EmployeeStatus | string;
  departmentId?: string | null;
  serviceId?: string | null;
  isDsiAdmin?: boolean;
  departmentType?: string | null;
  iat?: number;
  exp?: number;
};

export function jsonError(message: string, status: number, extra?: Record<string, unknown>) {
  return NextResponse.json({ error: message, ...extra }, { status });
}

/// Réponse standardisée pour les 500 (ne fuite jamais les détails Prisma en prod).
export function jsonServerError(err: unknown, fallback = "Erreur serveur") {
  if (!IS_PROD) {
    const e = err as { code?: string; message?: string };
    return NextResponse.json(
      { error: fallback, code: e?.code, details: e?.message },
      { status: 500 }
    );
  }
  return NextResponse.json({ error: fallback }, { status: 500 });
}

/// Lit le token d'abord depuis le cookie httpOnly, sinon depuis le header Authorization (legacy).
export function getAuthToken(req: Request): string | null {
  // 1. Cookie (préféré, httpOnly)
  const cookieHeader = req.headers.get("cookie") || "";
  if (cookieHeader) {
    for (const part of cookieHeader.split(";")) {
      const [rawName, ...rest] = part.trim().split("=");
      if (rawName === AUTH_COOKIE_NAME && rest.length > 0) {
        const value = decodeURIComponent(rest.join("=")).trim();
        if (value) return value;
      }
    }
  }
  // 2. Header Authorization (clients legacy — à retirer après migration)
  const h = req.headers.get("authorization") || "";
  const [type, token] = h.split(" ");
  if (type?.toLowerCase() === "bearer" && token) {
    const trimmed = token.trim();
    if (trimmed) return trimmed;
  }
  return null;
}

/// @deprecated Utiliser getAuthToken. Conservé pour rétro-compatibilité.
export function getBearerToken(req: Request) {
  return getAuthToken(req);
}

export function verifyJwt(req: Request) {
  const token = getAuthToken(req);
  if (!token) return { ok: false as const, error: jsonError("Non authentifié", 401) };

  const secret = process.env.JWT_SECRET;
  if (!secret) {
    // Ne pas exposer la cause au client
    console.error("[auth] JWT_SECRET manquant côté serveur");
    return { ok: false as const, error: jsonError("Configuration serveur invalide", 500) };
  }

  try {
    const payload = jwt.verify(token, secret, { algorithms: [DEFAULT_ALGORITHM] }) as JwtPayload;
    return { ok: true as const, payload };
  } catch {
    return { ok: false as const, error: jsonError("Token invalide", 401) };
  }
}

/// Signe un JWT applicatif avec l'algorithme HS256 pinné.
export function signJwt(
  payload: Omit<JwtPayload, "iat" | "exp">,
  expiresIn: SignOptions["expiresIn"] = DEFAULT_EXPIRES_IN
) {
  const secret = process.env.JWT_SECRET;
  if (!secret) throw new Error("JWT_SECRET non configuré");
  return jwt.sign(payload, secret, { algorithm: DEFAULT_ALGORITHM, expiresIn });
}

/// Pose le cookie d'authentification httpOnly + SameSite=Lax (Secure en prod).
export function setAuthCookie(res: NextResponse, token: string, maxAgeSec = 60 * 60 * 24 * 7) {
  res.cookies.set({
    name: AUTH_COOKIE_NAME,
    value: token,
    httpOnly: true,
    secure: IS_PROD,
    sameSite: "lax",
    path: "/",
    maxAge: maxAgeSec,
  });
  return res;
}

/// Supprime le cookie d'authentification.
export function clearAuthCookie(res: NextResponse) {
  res.cookies.set({
    name: AUTH_COOKIE_NAME,
    value: "",
    httpOnly: true,
    secure: IS_PROD,
    sameSite: "lax",
    path: "/",
    maxAge: 0,
  });
  return res;
}

/// Contexte authentifié reconstruit depuis le payload JWT.
export type AuthContext = {
  id: string;
  role: string;
  email?: string;
  departmentId?: string | null;
  serviceId?: string | null;
  isDsiAdmin?: boolean;
  departmentType?: string | null;
};

export function requireAuthCtx(req: Request) {
  const v = verifyJwt(req);
  if (!v.ok) return { ok: false as const, error: v.error };

  const id = String(v.payload?.sub ?? "");
  if (!id) return { ok: false as const, error: jsonError("Token invalide", 401) };

  const ctx: AuthContext = {
    id,
    role: String(v.payload?.role ?? ""),
    email: v.payload?.email,
    departmentId: v.payload?.departmentId ?? null,
    serviceId: v.payload?.serviceId ?? null,
    isDsiAdmin: Boolean(v.payload?.isDsiAdmin),
    departmentType: v.payload?.departmentType ?? null,
  };
  return { ok: true as const, auth: ctx };
}

/// Exige que l'utilisateur authentifié possède l'un des rôles donnés.
export function requireRole(req: Request, roles: readonly string[]) {
  const v = requireAuthCtx(req);
  if (!v.ok) return v;
  if (!roles.includes(v.auth.role)) {
    return { ok: false as const, error: jsonError("Accès refusé (rôle insuffisant)", 403) };
  }
  return v;
}

export function isProduction() {
  return IS_PROD;
}
