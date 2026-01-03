import { NextResponse } from "next/server";
import { z } from "zod";
import { createPresignedPost } from "@aws-sdk/s3-presigned-post";
import { s3 } from "@/lib/s3";
import { db } from "@/lib/prisma";
import { auth } from "@/auth";
import { rateLimitOrThrow } from "@/lib/uploadRateLimit";


const InitSchema = z.object({
  filename: z.string().min(1),
  contentType: z.string().min(1),
  size: z.number().int().positive(),
});

const MAX_SIZE = 2 * 1024 * 1024 * 1024; // 2GB pro MVP (změň dle potřeby)

function safeFilename(name: string) {
  return name.replace(/[^\w.\-()+\s]/g, "_");
}

export async function POST(req: Request) {
  const session = await auth();
  const userId = session?.user?.id;
if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

// 10 initů za minutu na uživatele (uprav dle potřeby)
const rl = await rateLimitOrThrow({
  key: `upload:init:user:${userId}`,
  limit: 10,
  windowMs: 60_000,
});

// třeba 1% šance
if (Math.random() < 0.01) {
  await db.rateLimitWindow.deleteMany({
    where: { windowStart: { lt: new Date(Date.now() - 2 * 24 * 60 * 60 * 1000) } },
  });
}

if (!rl.ok) {
  return new NextResponse(
    JSON.stringify({ error: "Rate limit exceeded" }),
    {
      status: 429,
      headers: {
        "Content-Type": "application/json",
        "Retry-After": String(rl.retryAfterSeconds),
      },
    }
  );
}

const maxConcurrent = 3;
const uploadingCount = await db.videoAsset.count({
  where: { userId, status: "UPLOADING" },
});

if (uploadingCount >= maxConcurrent) {
  return NextResponse.json(
    { error: `Too many concurrent uploads (max ${maxConcurrent})` },
    { status: 429 }
  );
}

  const body = InitSchema.parse(await req.json());

  if (!body.contentType.startsWith("video/")) {
    return NextResponse.json({ error: "Only video uploads are allowed." }, { status: 400 });
  }
  if (body.size > MAX_SIZE) {
    return NextResponse.json({ error: `File too large (max ${MAX_SIZE} bytes).` }, { status: 400 });
  }

  const bucket = process.env.S3_BUCKET_NAME!;
  const video = await db.videoAsset.create({
    data: {
      userId,
      originalFileName: body.filename,
      contentType: body.contentType,
      fileSizeBytes: BigInt(body.size),
      storageBucket: bucket,
      status: "UPLOADING",
      storageKey: "", // doplníme hned po create
    },
  });

  const key = `videos/${userId}/${video.id}/${safeFilename(body.filename)}`;

  await db.videoAsset.update({
    where: { id: video.id },
    data: { storageKey: key },
  });

  const presigned = await createPresignedPost(s3, {
    Bucket: bucket,
    Key: key,
    Expires: 60,
    Fields: {
      key,
      success_action_status: "201",
    },
    Conditions: [["content-length-range", 1, MAX_SIZE]],
  });


  return NextResponse.json({
    videoId: video.id,
    bucket,
    key,
    upload: presigned, // { url, fields }
  });
}
