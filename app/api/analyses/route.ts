/* eslint-disable @typescript-eslint/no-explicit-any */
import { NextResponse } from "next/server";
import { z } from "zod";

import { auth } from "@/auth";
import { db } from "@/lib/prisma";

import { enqueueAnalysisJob } from "@/lib/sqs";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const CreateSchema = z.object({
  videoId: z.string().min(1),
  checks: z.array(
    z.enum(["RESOLUTION", "AVG_LOUDNESS", "BITRATE", "FPS"])
  ).min(1),
});

export async function POST(req: Request) {
  const session = await auth();
  const userId = session?.user?.id;
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = CreateSchema.parse(await req.json());

  // 1) ověř, že video patří userovi a je UPLOADED
  const video = await db.videoAsset.findFirst({
    where: { id: body.videoId, userId },
    select: { id: true, status: true },
  });

  if (!video) {
    return NextResponse.json({ error: "Video not found" }, { status: 404 });
  }

  if (video.status !== "UPLOADED") {
    return NextResponse.json(
      { error: `Video is not ready (status: ${video.status})` },
      { status: 409 }
    );
  }

  // 2) vytvoř job
  const job = await db.analysisJob.create({
    data: {
      userId,
      videoAssetId: video.id,
      status: "QUEUED",
      requested: body.checks,
    },
    select: {
      id: true,
      status: true,
      requested: true,
      createdAt: true,
      videoAssetId: true,
    },
  });

  // FÁZE 2: tady bude enqueue do SQS (SendMessage(job.id))
    try {
    await enqueueAnalysisJob(job.id);
  } catch (e: any) {
    await db.analysisJob.update({
      where: { id: job.id },
      data: {
        status: "FAILED",
        errorMessage: `Enqueue to SQS failed: ${e?.name ?? ""} ${e?.message ?? ""}`.trim(),
        finishedAt: new Date(),
      },
    });

    return NextResponse.json(
      { error: "Failed to enqueue job" },
      { status: 500 }
    );
  }
  return NextResponse.json({ ok: true, job });
}
