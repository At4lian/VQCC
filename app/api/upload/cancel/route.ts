import { NextResponse } from "next/server";
import { z } from "zod";
import { DeleteObjectCommand, HeadObjectCommand } from "@aws-sdk/client-s3";

import { db } from "@/lib/prisma";
import { auth } from "@/auth";
import { s3 } from "@/lib/s3";

const Schema = z.object({
  videoId: z.string().min(1),
});

export async function POST(req: Request) {
  const session = await auth();
  const userId = session?.user?.id;
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { videoId } = Schema.parse(await req.json());

  const video = await db.videoAsset.findFirst({
    where: { id: videoId, userId },
  });
  if (!video) return NextResponse.json({ error: "Not found" }, { status: 404 });

  // zrušení dává smysl jen dokud není UPLOADED/DELETED
  if (video.status === "UPLOADED" || video.status === "DELETED") {
    return NextResponse.json({ error: `Cannot cancel in status ${video.status}` }, { status: 409 });
  }

  // pokusit se smazat objekt (pokud existuje)
  try {
    // Head je volitelný; když nechceš 2 requesty, můžeš rovnou Delete a ignorovat chyby
    await s3.send(new HeadObjectCommand({ Bucket: video.storageBucket, Key: video.storageKey }));
    await s3.send(new DeleteObjectCommand({ Bucket: video.storageBucket, Key: video.storageKey }));
  } catch {
    // ignore – objekt možná neexistuje nebo je nedostupný; stejně zrušíme DB stav
  }

  await db.videoAsset.update({
    where: { id: video.id },
    data: {
      status: "FAILED",
      failedAt: new Date(),
      lastError: "Canceled by user",
    },
  });

  return NextResponse.json({ ok: true });
}
