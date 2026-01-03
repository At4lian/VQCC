import { NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/lib/prisma";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const Schema = z.object({
  errorMessage: z.string().min(1).max(4000),
});

function isWorkerAuthorized(req: Request) {
  const auth = req.headers.get("authorization") || "";
  return auth === `Bearer ${process.env.WORKER_TOKEN}`;
}

export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  if (!isWorkerAuthorized(req)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await ctx.params;
  const body = Schema.parse(await req.json());

  const current = await db.analysisJob.findUnique({
    where: { id },
    select: { status: true },
  });
  if (!current) return NextResponse.json({ error: "Not found" }, { status: 404 });
  if (current.status === "COMPLETED") {
    return NextResponse.json({ ok: true, ignored: true });
  }

  const updated = await db.analysisJob.update({
    where: { id },
    data: {
      status: "FAILED",
      finishedAt: new Date(),
      errorMessage: body.errorMessage,
    },
    select: { id: true, status: true, finishedAt: true },
  });

  return NextResponse.json({ ok: true, job: updated });
}
