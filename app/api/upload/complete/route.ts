/* eslint-disable @typescript-eslint/no-explicit-any */
import { NextResponse } from "next/server";
import { z } from "zod";
import { HeadObjectCommand } from "@aws-sdk/client-s3";

import { db } from "@/lib/prisma";
import { auth } from "@/auth";
import { s3 } from "@/lib/s3";

const CompleteSchema = z.object({
  videoId: z.string().min(1),
});

function normalizeEtag(etag?: string) {
  if (!etag) return null;
  // AWS často vrací ETag s uvozovkami
  return etag.replaceAll('"', "");
}

export async function POST(req: Request) {
  const session = await auth();
  const userId = session?.user?.id;
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { videoId } = CompleteSchema.parse(await req.json());

  // 1) Najdi video a ověř ownership
  const video = await db.videoAsset.findFirst({
    where: { id: videoId, userId },
  });

  if (!video) return NextResponse.json({ error: "Not found" }, { status: 404 });
  if (!video.storageBucket || !video.storageKey) {
    return NextResponse.json({ error: "Invalid storage info" }, { status: 400 });
  }

  // 2) HEAD na S3: existuje objekt? jakou má velikost? etag?
  let head;
  try {
    head = await s3.send(
      new HeadObjectCommand({
        Bucket: video.storageBucket,
        Key: video.storageKey,
      })
    );
  } catch (e: any) {
    // typicky NotFound (NoSuchKey) nebo AccessDenied (chybí s3:GetObject)
    await db.videoAsset.update({
      where: { id: video.id },
      data: { status: "FAILED" },
    });

    return NextResponse.json(
      {
        error: "S3 object not accessible",
        name: e?.name,
        message: e?.message,
      },
      { status: 400 }
    );
  }

  const contentLength = head.ContentLength; // number | undefined
  const etag = normalizeEtag(head.ETag ?? undefined);

  if (typeof contentLength !== "number" || contentLength <= 0) {
    await db.videoAsset.update({
      where: { id: video.id },
      data: { status: "FAILED" },
    });
    return NextResponse.json({ error: "S3 object has invalid ContentLength" }, { status: 400 });
  }

  // 3) (Doporučené) Ověření velikosti – chrání proti “complete” bez reálného uploadu
  // Init ukládá očekávanou velikost do fileSizeBytes
  if (video.fileSizeBytes !== null) {
    const expected = BigInt(video.fileSizeBytes);
    const actual = BigInt(contentLength);

    if (expected !== actual) {
      await db.videoAsset.update({
        where: { id: video.id },
        data: { status: "FAILED" },
      });
      return NextResponse.json(
        {
          error: "Uploaded file size mismatch",
          expected: expected.toString(),
          actual: actual.toString(),
        },
        { status: 400 }
      );
    }
  }

  // 4) Update DB: UPLOADED + uložit velikost a etag
  const updated = await db.videoAsset.update({
    where: { id: video.id },
    data: {
      status: "UPLOADED",
      uploadedAt: new Date(),
      fileSizeBytes: BigInt(contentLength),
      etag: etag ?? undefined,
    },
    select: { id: true, status: true, uploadedAt: true, fileSizeBytes: true, etag: true },
  });

  return NextResponse.json({
    ok: true,
    video: {
      ...updated,
      fileSizeBytes: updated.fileSizeBytes?.toString?.() ?? null,
    },
  });
}
