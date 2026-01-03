import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { db } from "@/lib/prisma";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(
  _req: Request,
  ctx: { params: Promise<{ id: string }> } // 👈 params je Promise
) {
  const { id } = await ctx.params; // 👈 tady to unwrapneš

  const session = await auth();
  const userId = session?.user?.id;
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const job = await db.analysisJob.findFirst({
    where: { id, userId },
    select: {
      id: true,
      status: true,
      requested: true,
      resultJson: true,
      errorMessage: true,
      createdAt: true,
      startedAt: true,
      finishedAt: true,
      videoAssetId: true,
      videoAsset: {
        select: {
          id: true,
          originalFileName: true,
          status: true,
          uploadedAt: true,
        },
      },
    },
  });

  if (!job) return NextResponse.json({ error: "Not found" }, { status: 404 });

  return NextResponse.json({ ok: true, job });
}
