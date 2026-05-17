export const runtime = "nodejs";

import { NextResponse } from "next/server";
import { clearAuthCookie } from "@/lib/auth";

/// Clôt la session côté serveur en effaçant le cookie httpOnly.
/// Le client doit également vider tout token résiduel en localStorage (legacy).
export async function POST() {
  const response = NextResponse.json({ ok: true });
  return clearAuthCookie(response);
}

// Permet aussi la déconnexion par GET (lien direct) si besoin
export async function GET() {
  const response = NextResponse.json({ ok: true });
  return clearAuthCookie(response);
}
