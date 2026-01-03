import { db } from "./prisma";

type RateLimitResult =
  | { ok: true; remaining: number; resetAt: Date }
  | { ok: false; retryAfterSeconds: number; resetAt: Date };

export async function rateLimitOrThrow(opts: {
  key: string;
  limit: number;
  windowMs: number;
}): Promise<RateLimitResult> {
  const now = Date.now();
  const windowStartMs = Math.floor(now / opts.windowMs) * opts.windowMs;
  const windowStart = new Date(windowStartMs);
  const resetAt = new Date(windowStartMs + opts.windowMs);

  // Atomic upsert + increment (bez race conditions)
  const row = await db.rateLimitWindow.upsert({
    where: {
      key_windowStart: {
        key: opts.key,
        windowStart,
      },
    },
    create: {
      key: opts.key,
      windowStart,
      count: 1,
    },
    update: {
      count: { increment: 1 },
    },
    select: { count: true },
  });

  if (row.count > opts.limit) {
    const retryAfterSeconds = Math.max(1, Math.ceil((resetAt.getTime() - now) / 1000));
    return { ok: false, retryAfterSeconds, resetAt };
  }

  return { ok: true, remaining: Math.max(0, opts.limit - row.count), resetAt };
}
