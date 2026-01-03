import { NextResponse } from "next/server";
import { db } from "@/lib/prisma";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function isWorkerAuthorized(req: Request) {
  const auth = req.headers.get("authorization") || "";
  return auth === `Bearer ${process.env.WORKER_TOKEN}`;
}

export async function POST(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  if (!isWorkerAuthorized(_req)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await ctx.params;

  // Atomické claimnutí: pouze pokud je QUEUED
  const res = await db.analysisJob.updateMany({
    where: { id, status: "QUEUED" },
    data: { status: "RUNNING", startedAt: new Date() },
  });

  if (res.count === 0) {
    const existing = await db.analysisJob.findUnique({
      where: { id },
      select: { id: true, status: true },
    });

    return NextResponse.json(
      { error: "Job not claimable", job: existing ?? null },
      { status: 409 }
    );
  }

  const job = await db.analysisJob.findUnique({
    where: { id },
    select: {
      id: true,
      status: true,
      requested: true,
      startedAt: true,
      videoAsset: {
        select: {
          id: true,
          storageBucket: true,
          storageKey: true,
          contentType: true,
          fileSizeBytes: true, // BigInt -> převedeme níže
          originalFileName: true,
        },
      },
    },
  });

  if (!job) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  // ✅ BigInt safe
  const safeJob = {
    ...job,
    videoAsset: job.videoAsset
      ? {
          ...job.videoAsset,
          fileSizeBytes:
            job.videoAsset.fileSizeBytes == null
              ? null
              : job.videoAsset.fileSizeBytes.toString(),
        }
      : null,
  };

  return NextResponse.json({ ok: true, job: safeJob });
}
