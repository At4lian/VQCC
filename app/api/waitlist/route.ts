import { NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/lib/prisma";
import { sendWelcomeEmail } from "@/lib/waitlist-email";
import crypto from "crypto";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const Schema = z.object({
  email: z.string().email(),
  source: z.string().optional(),
});

function getIp(req: Request) {
  const xf = req.headers.get("x-forwarded-for");
  return (xf?.split(",")[0] || "").trim() || "unknown";
}

// ultra-basic in-memory rate limit (MVP)
const bucket = new Map<string, { count: number; resetAt: number }>();
function rateLimit(ip: string, limit = 10, windowMs = 60_000) {
  const now = Date.now();
  const cur = bucket.get(ip);
  if (!cur || now > cur.resetAt) {
    bucket.set(ip, { count: 1, resetAt: now + windowMs });
    return true;
  }
  if (cur.count >= limit) return false;
  cur.count += 1;
  return true;
}

export async function POST(req: Request) {
  const ip = getIp(req);
  if (!rateLimit(ip)) {
    return NextResponse.json({ error: "Too many requests" }, { status: 429 });
  }

  const body = Schema.safeParse(await req.json().catch(() => null));
  if (!body.success) {
    return NextResponse.json({ error: "Invalid body" }, { status: 400 });
  }

  const email = body.data.email.toLowerCase().trim();
  const userAgent = req.headers.get("user-agent") || undefined;

  // existuje?
  const existing = await db.waitlistSubscriber.findUnique({
    where: { email },
    select: { id: true, status: true, token: true, welcomeSentAt: true },
  });

  // pokud byl odhlášený, necháme ho znovu přihlásit (aktivujeme)
  if (existing) {
    if (existing.status === "UNSUBSCRIBED") {
      const updated = await db.waitlistSubscriber.update({
        where: { email },
        data: {
          status: "ACTIVE",
          unsubscribedAt: null,
          source: body.data.source,
          ip,
          userAgent,
        },
        select: { token: true, welcomeSentAt: true },
      });

      // pošli welcome jen když ještě nebyl poslán
      if (!updated.welcomeSentAt) {
        await sendWelcomeEmail(email, updated.token);
        await db.waitlistSubscriber.update({
          where: { email },
          data: { welcomeSentAt: new Date() },
        });
      }

      return NextResponse.json({ ok: true, already: true });
    }

    // už je ACTIVE → nic neposílej znovu
    return NextResponse.json({ ok: true, already: true });
  }

  // nový subscriber
  const token = crypto.randomBytes(24).toString("hex");

  await db.waitlistSubscriber.create({
    data: {
      email,
      token,
      source: body.data.source,
      ip,
      userAgent,
      status: "ACTIVE",
    },
  });

  await sendWelcomeEmail(email, token);
  await db.waitlistSubscriber.update({
    where: { email },
    data: { welcomeSentAt: new Date() },
  });

  return NextResponse.json({ ok: true });
}
