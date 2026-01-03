import { NextResponse } from "next/server";
import { z } from "zod";
import { DeleteObjectCommand } from "@aws-sdk/client-s3";
import { db } from "@/lib/prisma";
import { auth } from "@/auth";
import { s3 } from "@/lib/s3";

const Schema = z.object({
  videoId: z.string().min(1),
  reason: z.string().max(500).optional(),
});

export async function POST(req: Request) {
  const session = await auth();
  const userId = session?.user?.id;
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { videoId, reason } = Schema.parse(await req.json());

  const video = await db.videoAsset.findFirst({
    where: { id: videoId, userId },
  });
  if (!video) return NextResponse.json({ error: "Not found" }, { status: 404 });

  // Když už je nahráno nebo smazáno, fail už nedává smysl
  if (video.status === "UPLOADED" || video.status === "DELETED") {
    return NextResponse.json({ ok: true, ignored: true });
  }

  // Best-effort mazání objektu (kdyby náhodou existoval)
  try {
    await s3.send(new DeleteObjectCommand({ Bucket: video.storageBucket, Key: video.storageKey }));
  } catch {
    // ignore
  }

  await db.videoAsset.update({
    where: { id: video.id },
    data: {
      status: "FAILED",
      failedAt: new Date(),
      lastError: reason ?? "Upload failed on client",
    },
  });

  return NextResponse.json({ ok: true });
}
