export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

/**
 * Route santé : sonde technique pour Docker / Kubernetes / load balancer.
 * Pas d'authentification — volontairement minimale et rapide.
 *
 * GET /api/health
 * Réponse 200 : { status: "ok", uptime, dbOk }
 * Réponse 503 : { status: "degraded", dbOk: false }
 */
export async function GET() {
  let dbOk = false;
  try {
    // Ping léger : un findFirst sur un modèle peu coûteux.
    // On évite $runCommandRaw qui peut varier selon la version Prisma.
    await prisma.$runCommandRaw({ ping: 1 });
    dbOk = true;
  } catch (err) {
    console.error("[health] DB ping failed", err);
    dbOk = false;
  }

  const body = {
    status: dbOk ? "ok" : "degraded",
    uptime: process.uptime(),
    dbOk,
    timestamp: new Date().toISOString(),
  };

  return NextResponse.json(body, { status: dbOk ? 200 : 503 });
}
