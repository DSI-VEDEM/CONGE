import type { ZodSchema, ZodError } from "zod";
import { jsonError } from "@/lib/auth";

/**
 * Parse + valide un body JSON contre un schéma Zod.
 * Retourne soit { ok: true, data } soit { ok: false, error } prêt à renvoyer.
 */
export async function parseBody<T>(req: Request, schema: ZodSchema<T>) {
  let raw: unknown;
  try {
    raw = await req.json();
  } catch {
    return {
      ok: false as const,
      error: jsonError("Corps de requête JSON invalide", 400),
    };
  }
  const parsed = schema.safeParse(raw);
  if (!parsed.success) {
    return {
      ok: false as const,
      error: jsonError("Données invalides", 400, {
        fields: formatZodIssues(parsed.error),
      }),
    };
  }
  return { ok: true as const, data: parsed.data };
}

/// Convertit les issues Zod en map { path: message } facile à consommer côté front.
function formatZodIssues(err: ZodError): Record<string, string> {
  const out: Record<string, string> = {};
  for (const issue of err.issues) {
    const key = issue.path.join(".") || "_root";
    if (!out[key]) out[key] = issue.message;
  }
  return out;
}
