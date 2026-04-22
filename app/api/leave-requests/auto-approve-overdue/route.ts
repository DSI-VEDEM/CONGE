export const runtime = "nodejs";

import { NextResponse } from "next/server";
import { jsonError } from "@/lib/auth";
import { autoApproveOverdueDirectorLeavesForCeo, findActiveEmployeeByRole } from "@/lib/leave-requests";

function getDelayDays() {
  const raw = process.env.CEO_DIRECTOR_VALIDATION_DAYS;
  const parsed = raw ? Number(raw) : 2;
  return Number.isFinite(parsed) ? parsed : 2;
}

function isAuthorized(req: Request) {
  const secret = process.env.LEAVE_AUTO_APPROVE_SECRET;
  if (!secret) return false;

  const auth = req.headers.get("authorization") ?? "";
  if (auth === `Bearer ${secret}`) return true;

  const header = req.headers.get("x-cron-secret") ?? "";
  return header === secret;
}

export async function GET(req: Request) {
  if (!isAuthorized(req)) return jsonError("Accès refusé", 403);

  const ceo = await findActiveEmployeeByRole("CEO");
  if (!ceo) return NextResponse.json({ approvedCount: 0 });

  const approvedCount = await autoApproveOverdueDirectorLeavesForCeo(ceo.id, getDelayDays());
  return NextResponse.json({ approvedCount });
}

