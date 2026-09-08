import { Lock, ShieldCheck, Zap } from "lucide-react";

import { Eyebrow, Heading, Mono, Text } from "@/components/ui/typography";

// Feature bento — mirrors the "De Excel al cubo en 5 minutos" section in
// trim-success: 2/3 + 1/3 split with a primary feature on the left and a
// security pill on the right.
export function LandingSplit() {
  return (
    <section className="border-b bg-muted py-24">
      <div className="mx-auto max-w-6xl px-6">
        <div className="mx-auto max-w-2xl text-center">
          <Eyebrow>Speed</Eyebrow>
          <Heading level="h2" className="mt-3">
            From scattered to systematic — in minutes.
          </Heading>
          <Text variant="muted" className="mt-4">
            Connect your accounts, drop your goals, watch the orbit form. No
            setup ceremony, no consultants required.
          </Text>
        </div>

        <div className="mt-12 grid gap-4 lg:grid-cols-3">
          <div className="rounded-xl border bg-card p-8 lg:col-span-2">
            <Eyebrow as="div" className="mb-4 inline-flex items-center gap-2">
              <Zap className="h-3 w-3 text-success" />
              Compare
            </Eyebrow>
            <Heading level="h3">
              Build plans. Compare scenarios side by side.
            </Heading>
            <Text variant="muted" className="mt-3 max-w-lg">
              Stack income, expenses, debts and projected net worth into a
              plan. Duplicate it, change one assumption, and open both at once
              on <Mono className="text-foreground">/plans/compare</Mono>.
            </Text>
            <div className="mt-6 grid grid-cols-2 gap-3">
              <div className="rounded-lg border bg-muted p-4">
                <Eyebrow as="div" className="text-2xs">
                  Plan A
                </Eyebrow>
                <Mono className="mt-1 block text-sm text-foreground">
                  Save 25% · 7% return
                </Mono>
                <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-border">
                  <div className="h-full w-3/5 rounded-full bg-foreground" />
                </div>
              </div>
              <div className="rounded-lg border bg-muted p-4">
                <Eyebrow as="div" className="text-2xs">
                  Plan B
                </Eyebrow>
                <Mono className="mt-1 block text-sm text-foreground">
                  Save 35% · 6% return
                </Mono>
                <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-border">
                  <div className="h-full w-4/5 rounded-full bg-foreground" />
                </div>
              </div>
            </div>
          </div>

          <div className="rounded-xl border bg-card p-8">
            <Eyebrow as="div" className="mb-4 inline-flex items-center gap-2">
              <Lock className="h-3 w-3" />
              Yours
            </Eyebrow>
            <Heading level="h3">
              Your data, your workspace.
            </Heading>
            <Text variant="muted" className="mt-3">
              Built on Supabase Auth + PostgreSQL. Every row is scoped to your
              user — services filter by ownership before they return a single
              number.
            </Text>
            <div className="mt-6 flex items-center gap-2 text-xs text-muted-foreground">
              <ShieldCheck className="h-4 w-4 text-success" />
              Row-level ownership, enforced server-side
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
