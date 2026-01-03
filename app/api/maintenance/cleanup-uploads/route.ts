import { NextResponse } from "next/server";
import { DeleteObjectCommand } from "@aws-sdk/client-s3";
import { db } from "@/lib/prisma";
import { s3 } from "@/lib/s3";
import { env } from "@/lib/env";

export const dynamic = "force-dynamic"; // doporučeno pro cron logy/cache :contentReference[oaicite:2]{index=2}

export async function GET(req: Request) {
  const authHeader = req.headers.get("authorization") || "";
  if (authHeader !== `Bearer ${env.CRON_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const STUCK_MINUTES = 30;
  const cutoff = new Date(Date.now() - STUCK_MINUTES * 60_000);

  const stuck = await db.videoAsset.findMany({
    where: { status: "UPLOADING", createdAt: { lt: cutoff } },
    select: { id: true, storageBucket: true, storageKey: true },
    take: 200,
  });

  let deleteAttempts = 0;

  for (const v of stuck) {
    try {
      await s3.send(new DeleteObjectCommand({ Bucket: v.storageBucket, Key: v.storageKey }));
      deleteAttempts++;
    } catch {
      // ignore
    }

    await db.videoAsset.update({
      where: { id: v.id },
      data: {
        status: "FAILED",
        failedAt: new Date(),
        lastError: `Stuck UPLOADING > ${STUCK_MINUTES} minutes (auto-cleanup)`,
      },
    });
  }

  return NextResponse.json({
    ok: true,
    checked: stuck.length,
    deleteAttempts,
    cutoff,
  });
}
