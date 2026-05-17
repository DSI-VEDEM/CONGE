import { NextResponse } from "next/server";

/// Bucket de rate-limit (sliding window simple par IP).
type Bucket = { count: number; resetAt: number };

const buckets = new Map<string, Bucket>();
const MAX_ENTRIES = 5_000;

function clientIp(req: Request): string {
  const xff = req.headers.get("x-forwarded-for") || "";
  const ip = xff.split(",")[0]?.trim();
  if (ip) return ip;
  const real = req.headers.get("x-real-ip");
  if (real) return real.trim();
  return "unknown";
}

/**
 * Rate-limit en mémoire, par IP. Adapté à une instance unique (dev / petit déploiement).
 * Pour du multi-instance, remplacer par Upstash Redis ou équivalent.
 */
export function rateLimit(
  req: Request,
  opts: { key: string; max: number; windowMs: number }
) {
  const ip = clientIp(req);
  const bucketKey = `${opts.key}:${ip}`;
  const now = Date.now();
  const bucket = buckets.get(bucketKey);

  if (!bucket || bucket.resetAt <= now) {
    buckets.set(bucketKey, { count: 1, resetAt: now + opts.windowMs });
    // Nettoyage opportuniste si la map enfle
    if (buckets.size > MAX_ENTRIES) {
      for (const [k, v] of buckets) {
        if (v.resetAt <= now) buckets.delete(k);
      }
    }
    return { ok: true as const, remaining: opts.max - 1, resetAt: now + opts.windowMs };
  }

  if (bucket.count >= opts.max) {
    return { ok: false as const, remaining: 0, resetAt: bucket.resetAt };
  }

  bucket.count += 1;
  return { ok: true as const, remaining: opts.max - bucket.count, resetAt: bucket.resetAt };
}

/// Réponse 429 standardisée avec en-tête Retry-After.
export function rateLimitResponse(resetAt: number) {
  const retryAfterSec = Math.max(1, Math.ceil((resetAt - Date.now()) / 1000));
  return NextResponse.json(
    { error: "Trop de tentatives. Réessayez plus tard." },
    {
      status: 429,
      headers: { "Retry-After": String(retryAfterSec) },
    }
  );
}
