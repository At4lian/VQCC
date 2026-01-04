import { db } from "@/lib/prisma";

export const dynamic = "force-dynamic";

export default async function UnsubscribePage({
  searchParams,
}: {
  searchParams: Promise<{ token?: string }>;
}) {
  const { token } = await searchParams;

  if (!token) {
    return (
      <div className="min-h-screen flex items-center justify-center p-6">
        <div className="max-w-md w-full rounded-lg border p-6">
          <h1 className="text-xl font-semibold">Chybí token</h1>
          <p className="text-muted-foreground mt-2">Odkaz je neplatný.</p>
        </div>
      </div>
    );
  }

  const res = await db.waitlistSubscriber.updateMany({
    where: { token, status: "ACTIVE" },
    data: { status: "UNSUBSCRIBED", unsubscribedAt: new Date() },
  });

  return (
    <div className="min-h-screen flex items-center justify-center p-6">
      <div className="max-w-md w-full rounded-lg border p-6">
        <h1 className="text-xl font-semibold">
          {res.count ? "Odhlášeno ✅" : "Už jsi odhlášený / neplatný token"}
        </h1>
        <p className="text-muted-foreground mt-2">
          Pokud budeš chtít, můžeš se kdykoliv znovu přihlásit na landing page.
        </p>
      </div>
    </div>
  );
}
