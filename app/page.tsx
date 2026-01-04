/* eslint-disable @typescript-eslint/no-explicit-any */
"use client";

import { useMemo, useState } from "react";
import { toast } from "sonner";
import { z } from "zod";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger,  } from "@/components/ui/accordion";

import {
  CheckCircle2,
  Gauge,
  Film,
  AudioLines,
  ShieldCheck,
  Sparkles,
  ArrowRight,
} from "lucide-react";

const EmailSchema = z.string().email();

const FEATURES = [
  {
    icon: Film,
    title: "Rozlišení & FPS",
    desc: "Rychle ověříme, že video sedí na specifikaci – bez ručního hledání v metadatech.",
  },
  {
    icon: Gauge,
    title: "Bitrate & encoding sanity",
    desc: "Zachytíme podezřelé bitrate/encoding nastavení, které umí rozbít kvalitu i distribuci.",
  },
  {
    icon: AudioLines,
    title: "Průměrná hlasitost (EBU R128)",
    desc: "Automatická kontrola loudness přes ffmpeg – bez zdlouhavé ruční kontroly.",
  },
  {
    icon: ShieldCheck,
    title: "Audit trail",
    desc: "Každá analýza má svůj job, status, výsledek a historii – dohledatelné kdykoliv.",
  },
];

const USE_CASES = [
  "Tvůrci a studia (rychlá QC před odevzdáním)",
  "Agencie (hromadná kontrola assetů pro kampaně)",
  "E-learning týmy (konzistentní parametry napříč kurzy)",
  "Postprodukce (automatizace technických checklistů)",
];

const FAQ = [
  {
    q: "Co přesně VQCC dnes umí?",
    a: "V MVP ověřujeme parametry jako rozlišení, FPS, bitrate a průměrnou hlasitost (EBU R128). Postupně budeme přidávat další automatické QC kontroly.",
  },
  {
    q: "Kam se video nahrává a kdo ho uvidí?",
    a: "Video se nahrává do S3 pod tvým uživatelským prostorem. Přístup k datům je omezený a výsledky vidí jen vlastník.",
  },
  {
    q: "Jak rychlá je analýza?",
    a: "Záleží na délce videa a vybraných kontrolách. Většina technických metadat je hotová v sekundách až desítkách sekund, loudness může trvat déle.",
  },
  {
    q: "Bude export reportu?",
    a: "Ano. Další krok po MVP je čitelný report (UI) a export (PDF/HTML) + archivace.",
  },
];

export default function LandingPage() {
  const [email, setEmail] = useState("");
  const [loading, setLoading] = useState(false);
  const [done, setDone] = useState(false);

  const emailValid = useMemo(() => {
    const e = email.trim().toLowerCase();
    return EmailSchema.safeParse(e).success;
  }, [email]);

  const submit = async () => {
    const value = email.trim().toLowerCase();

    // nechceme poslat prázdný/invalid
    if (!EmailSchema.safeParse(value).success) {
      toast.error("Zadej prosím platný e-mail.");
      return;
    }

    setLoading(true);      // ✅ tlačítko přepne do loading
    setDone(false);

    try {
      const res = await fetch("/api/waitlist", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: value, source: "landing" }),
      });

      const j = await res.json().catch(() => null);

      if (!res.ok) {
        throw new Error(j?.error ?? `Request failed (${res.status})`);
      }

      toast.success("Díky! Jsi na waitlistu ✅");
      setEmail("");         // ✅ reset inputu
      setDone(true);        // ✅ UI success state
    } catch (e: any) {
      toast.error(e?.message ?? "Něco se pokazilo");
    } finally {
      setLoading(false);    // ✅ KLÍČ: tlačítko se vždy resetuje
    }
  };

  return (
    <div className="min-h-screen bg-background">
      {/* Background */}
      <div className="pointer-events-none fixed inset-0 overflow-hidden">
        <div className="absolute -top-40 left-1/2 h-[520px] w-[520px] -translate-x-1/2 rounded-full bg-primary/15 blur-3xl" />
        <div className="absolute top-[30%] -left-32 h-[420px] w-[420px] rounded-full bg-purple-500/10 blur-3xl" />
        <div className="absolute bottom-[-200px] right-[-200px] h-[520px] w-[520px] rounded-full bg-sky-500/10 blur-3xl" />
      </div>

      {/* Top bar */}
      <header className="relative z-10 mx-auto flex w-full max-w-6xl items-center justify-between px-6 py-6">
        <div className="flex items-center gap-2">
          <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-primary/10">
            <Sparkles className="h-5 w-5" />
          </div>
          <div className="font-semibold tracking-tight">VQCC</div>
          <Badge variant="secondary" className="ml-2">
            micro-MVP
          </Badge>
        </div>

        <div className="flex items-center gap-3">
          <a
            href="/auth/login"
            className="text-sm text-muted-foreground hover:text-foreground transition"
          >
            Mám přístup
          </a>
          <a
            href="#waitlist"
            className="text-sm font-medium hover:opacity-80 transition"
          >
            Waitlist
          </a>
        </div>
      </header>

      {/* Hero */}
      <main className="relative z-10 mx-auto w-full max-w-6xl px-6 pb-20">
        <section className="grid gap-10 md:grid-cols-2 md:items-center pt-10">
          <div className="space-y-6">
            <Badge className="w-fit" variant="outline">
              Automatická technická kontrola videí
            </Badge>

            <h1 className="text-4xl md:text-5xl font-bold tracking-tight leading-tight">
              QC videí během minut –{" "}
              <span className="text-primary">bez ručního klikání</span>.
            </h1>

            <p className="text-base md:text-lg text-muted-foreground leading-relaxed">
              Nahraj video, zaškrtni kontroly a dostaneš výsledek. VQCC hlídá technické
              parametry jako rozlišení, FPS, bitrate a hlasitost. Ideální před odevzdáním,
              publikací nebo hromadnou distribucí.
            </p>

            <div className="flex flex-wrap gap-2">
              <Badge variant="secondary">Resolution</Badge>
              <Badge variant="secondary">FPS</Badge>
              <Badge variant="secondary">Bitrate</Badge>
              <Badge variant="secondary">EBU R128</Badge>
            </div>

            <div className="flex items-center gap-3">
              <Button
                onClick={() => document.getElementById("waitlist")?.scrollIntoView({ behavior: "smooth" })}
                size="lg"
                className="gap-2"
              >
                Chci přístup <ArrowRight className="h-4 w-4" />
              </Button>
              <div className="text-sm text-muted-foreground">
                První verze pro early adopters.
              </div>
            </div>
          </div>

          {/* Right hero card */}
          <Card className="rounded-2xl shadow-sm border bg-card/80 backdrop-blur">
            <CardContent className="p-6 space-y-4">
              <div className="flex items-center justify-between">
                <div className="font-semibold">Jak to funguje</div>
                <Badge variant="outline">3 kroky</Badge>
              </div>

              <div className="space-y-3">
                <div className="flex gap-3">
                  <div className="mt-0.5 h-7 w-7 rounded-full bg-primary/10 flex items-center justify-center">
                    <CheckCircle2 className="h-4 w-4" />
                  </div>
                  <div>
                    <div className="font-medium">Nahraj video</div>
                    <div className="text-sm text-muted-foreground">
                      Přímý upload na S3, rychle a spolehlivě.
                    </div>
                  </div>
                </div>

                <div className="flex gap-3">
                  <div className="mt-0.5 h-7 w-7 rounded-full bg-primary/10 flex items-center justify-center">
                    <CheckCircle2 className="h-4 w-4" />
                  </div>
                  <div>
                    <div className="font-medium">Vyber kontroly</div>
                    <div className="text-sm text-muted-foreground">
                      Rozlišení, FPS, bitrate, hlasitost… jen co potřebuješ.
                    </div>
                  </div>
                </div>

                <div className="flex gap-3">
                  <div className="mt-0.5 h-7 w-7 rounded-full bg-primary/10 flex items-center justify-center">
                    <CheckCircle2 className="h-4 w-4" />
                  </div>
                  <div>
                    <div className="font-medium">Dostaneš výsledky</div>
                    <div className="text-sm text-muted-foreground">
                      Okamžitý přehled + později export reportu.
                    </div>
                  </div>
                </div>
              </div>

              <Separator />

              <div className="grid grid-cols-2 gap-3 text-sm">
                <div className="rounded-xl border p-3">
                  <div className="text-muted-foreground">Infrastruktura</div>
                  <div className="font-medium">S3 + SQS + EC2 worker</div>
                </div>
                <div className="rounded-xl border p-3">
                  <div className="text-muted-foreground">Výstup</div>
                  <div className="font-medium">JSON → UI report</div>
                </div>
              </div>
            </CardContent>
          </Card>
        </section>

        {/* Features */}
        <section className="mt-16 space-y-8">
          <div className="space-y-2">
            <h2 className="text-2xl md:text-3xl font-semibold tracking-tight">
              Kontroly, které ušetří čas
            </h2>
            <p className="text-muted-foreground">
              Technické QC bez zbytečného přepínání nástrojů. Jednotný pipeline, jasné výsledky.
            </p>
          </div>

          <div className="grid gap-4 md:grid-cols-2">
            {FEATURES.map((f) => (
              <Card key={f.title} className="rounded-2xl bg-card/80 backdrop-blur">
                <CardContent className="p-6">
                  <div className="flex items-start gap-3">
                    <div className="mt-0.5 h-10 w-10 rounded-xl bg-primary/10 flex items-center justify-center">
                      <f.icon className="h-5 w-5" />
                    </div>
                    <div className="space-y-1">
                      <div className="font-semibold">{f.title}</div>
                      <div className="text-sm text-muted-foreground leading-relaxed">
                        {f.desc}
                      </div>
                    </div>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        </section>

        {/* Use cases */}
        <section className="mt-16 grid gap-8 md:grid-cols-2 md:items-start">
          <div className="space-y-2">
            <h2 className="text-2xl md:text-3xl font-semibold tracking-tight">
              Pro koho to je
            </h2>
            <p className="text-muted-foreground">
              Když pracuješ s videem pravidelně, QC se opakuje pořád dokola.
              VQCC to automatizuje.
            </p>
          </div>

          <Card className="rounded-2xl bg-card/80 backdrop-blur">
            <CardContent className="p-6 space-y-3">
              {USE_CASES.map((x) => (
                <div key={x} className="flex items-start gap-3">
                  <CheckCircle2 className="h-5 w-5 text-primary mt-0.5" />
                  <div className="text-sm">{x}</div>
                </div>
              ))}
            </CardContent>
          </Card>
        </section>

        {/* Waitlist CTA */}
        <section id="waitlist" className="mt-16">
          <Card className="rounded-2xl bg-card/80 backdrop-blur border shadow-sm">
            <CardContent className="p-6 md:p-8 space-y-5">
              <div className="flex flex-col gap-2 md:flex-row md:items-end md:justify-between">
                <div className="space-y-1">
                  <h3 className="text-xl md:text-2xl font-semibold tracking-tight">
                    Zapiš se na waitlist
                  </h3>
                  <p className="text-sm text-muted-foreground">
                    Pošleme ti uvítací email a pak zprávu při launchi. Odhlášení jedním klikem.
                  </p>
                </div>
                <Badge variant="secondary" className="w-fit">
                  Early access
                </Badge>
              </div>

              <div className="flex flex-col sm:flex-row gap-3">
                <Input
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="tvuj@email.cz"
                  type="email"
                  disabled={loading}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") submit();
                  }}
                />
                <Button
                  onClick={submit}
                  disabled={loading || !emailValid}
                  className="min-w-[160px]"
                >
                  {loading ? "Odesílám…" : "Chci přístup"}
                </Button>
              </div>

              {done && (
                <div className="text-sm text-primary flex items-center gap-2">
                  <CheckCircle2 className="h-4 w-4" />
                  Díky! Jsi na waitlistu.
                </div>
              )}

              <div className="text-xs text-muted-foreground">
                Tip: Pokud email nedorazí, mrkni do spamu. Přidáme tě jen jednou.
              </div>
            </CardContent>
          </Card>
        </section>

        {/* FAQ */}
        <section className="mt-16">
          <div className="space-y-2 mb-6">
            <h2 className="text-2xl md:text-3xl font-semibold tracking-tight">FAQ</h2>
            <p className="text-muted-foreground">
              Nejčastější otázky k micro-MVP a tomu, co plánujeme dál.
            </p>
          </div>

          <Card className="rounded-2xl bg-card/80 backdrop-blur">
            <CardContent className="p-6">
              <Accordion type="single" collapsible>
                {FAQ.map((f, i) => (
                  <AccordionItem key={f.q} value={`item-${i}`}>
                    <AccordionTrigger>{f.q}</AccordionTrigger>
                    <AccordionContent>{f.a}</AccordionContent>
                  </AccordionItem>
                ))}
              </Accordion>
            </CardContent>
          </Card>
        </section>

        {/* Footer */}
        <footer className="mt-16 pb-10 text-sm text-muted-foreground flex flex-col md:flex-row gap-2 md:items-center md:justify-between">
          <div>© {new Date().getFullYear()} VQCC</div>
          <div className="flex gap-4">
            <a className="hover:text-foreground transition" href="/support">Kontakt</a>
            <a className="hover:text-foreground transition" href="/waitlist/unsubscribe">
              Odhlášení
            </a>
          </div>
        </footer>
      </main>
    </div>
  );
}
