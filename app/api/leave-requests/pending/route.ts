export const runtime = "nodejs";

import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuth, autoApproveOverdueForActor } from "@/lib/leave-requests";

function parseTakeParam(value: string | null) {
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed <= 0) return 100;
  return Math.min(parsed, 300);
}

function parsePageParam(value: string | null) {
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed <= 0) return 1;
  return parsed;
}

export async function GET(req: Request) {
  const authRes = requireAuth(req);
  if (!authRes.ok) return authRes.error;

  const { id: actorId, role } = authRes.auth;
  const url = new URL(req.url);
  const take = parseTakeParam(url.searchParams.get("take"));
  const page = parsePageParam(url.searchParams.get("page"));
  const skip = (page - 1) * take;

  await autoApproveOverdueForActor(actorId, role);

  const where =
    role === "CEO"
      ? {
          status: { in: ["SUBMITTED", "PENDING"] as any },
          OR: [{ currentAssigneeId: actorId }, { reachedCeoAt: { not: null } }],
        }
      : {
          currentAssigneeId: actorId,
          status: { in: ["SUBMITTED", "PENDING"] as any },
        };

  const leaves = await prisma.leaveRequest.findMany({
    where,
    skip,
    take,
    select: {
      id: true,
      type: true,
      startDate: true,
      endDate: true,
      reason: true,
      justificationFileName: true,
      justificationMimeType: true,
      status: true,
      employee: {
        select: {
          id: true,
          firstName: true,
          lastName: true,
          profilePhotoUrl: true,
          role: true,
          departmentId: true,
          department: { select: { type: true, name: true } },
        },
      },
      currentAssigneeId: true,
      createdAt: true,
    },
    orderBy: { createdAt: "desc" },
  });

  return NextResponse.json({ leaves, page, take });
}
