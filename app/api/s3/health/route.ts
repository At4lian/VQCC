/* eslint-disable @typescript-eslint/no-explicit-any */
import { NextResponse } from "next/server";
import { HeadBucketCommand } from "@aws-sdk/client-s3";
import { s3 } from "@/lib/s3";

export async function GET() {
  const Bucket = process.env.S3_BUCKET_NAME!;
  try {
    await s3.send(new HeadBucketCommand({ Bucket }));
    return NextResponse.json({ ok: true, bucket: Bucket });
  } catch (e: any) {
    return NextResponse.json(
      { ok: false, name: e?.name, message: e?.message },
      { status: 500 }
    );
  }
}
