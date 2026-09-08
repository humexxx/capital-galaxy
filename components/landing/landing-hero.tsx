import Link from "next/link";
import { ArrowRight } from "lucide-react";

import { Heading, Mono, Text } from "@/components/ui/typography";

// Hero — radial spotlight + grid background + faux product card under the
// copy. Same visual structure as trim-success, adapted to Allstars Galaxy
// copy and KPIs.
export function LandingHero() {
  return (
    <section className="relative overflow-hidden border-b">
      {/* Soft radial spotlight */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 -z-0"
        style={{
          background:
            "radial-gradient(60% 50% at 50% 0%, color-mix(in oklch, var(--primary) 14%, transparent) 0%, transparent 70%)",
        }}
      />
      {/* Grid lines, masked to fade at the edges */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 -z-0 opacity-60"
        style={{
          backgroundImage:
            // Token-based so the grid is visible on the dark surface too; a
            // fixed black line at 5% disappeared there.
            "linear-gradient(to right, var(--border) 1px, transparent 1px), linear-gradient(to bottom, var(--border) 1px, transparent 1px)",
          backgroundSize: "56px 56px",
          maskImage:
            "radial-gradient(ellipse at center, black 40%, transparent 75%)",
        }}
      />

      <div className="relative mx-auto max-w-6xl px-6 pb-28 pt-24 text-center sm:pt-32">
        <Link
          href="#modules"
          className="mx-auto mb-8 inline-flex items-center gap-2 rounded-full border bg-background/70 px-3 py-1 text-xs text-muted-foreground backdrop-blur transition-colors hover:text-foreground"
        >
          <span className="inline-block h-1.5 w-1.5 rounded-full bg-warning" />
          Beta · six modules in one orbit
          <ArrowRight className="h-3 w-3" />
        </Link>

        <Heading level="display" className="mx-auto max-w-4xl">
          Money and time,
          <br />
          in one orbit.
        </Heading>

        <Text variant="lead" className="mx-auto mt-6 max-w-2xl text-balance">
          Allstars Galaxy is the calm command center for your portfolio, your
          plans, your week and the trips you take along the way — built for
          people who compound.
        </Text>

        <div className="mt-10 flex flex-col items-center justify-center gap-3 sm:flex-row">
          <Link
            href="/signup"
            className="inline-flex h-11 items-center justify-center rounded-full bg-foreground px-6 text-sm font-medium text-background transition hover:bg-foreground/90"
          >
            Get started
            <ArrowRight className="ml-1 h-4 w-4" />
          </Link>
          <a
            href="#modules"
            className="inline-flex h-11 items-center justify-center rounded-full border bg-background px-6 text-sm font-medium text-foreground transition hover:bg-muted"
          >
            See the modules
          </a>
        </div>

        <Text variant="small" className="mt-6">
          Free during beta · No credit card · Your data stays yours
        </Text>
      </div>

      {/* Faux product card — KPI tiles + a sparkline-ish bar chart, framed
          like a Mac window. Pure HTML/CSS, no image asset needed. */}
      <div className="relative mx-auto max-w-5xl px-6 pb-24">
        <div className="relative overflow-hidden rounded-xl border bg-card p-1 shadow-2xl shadow-primary/10">
          <div className="rounded-lg border bg-muted p-6 sm:p-8">
            <div className="mb-6 flex items-center justify-between border-b pb-4">
              <div className="flex items-center gap-2 text-xs text-muted-foreground">
                <span className="h-2 w-2 rounded-full bg-red-400" />
                <span className="h-2 w-2 rounded-full bg-yellow-400" />
                <span className="h-2 w-2 rounded-full bg-success" />
                <Mono className="ml-3 text-muted-foreground">
                  allstars-galaxy.app/portfolio
                </Mono>
              </div>
              <span className="hidden text-xs text-muted-foreground sm:inline">
                Net worth · YTD
              </span>
            </div>

            {/* KPIs mirror the real PortfolioStats fields surfaced on
                /portal/portfolio: totalValue, allTimeProfitPercentage,
                totalInvestmentMethods, activeTransactions. Numbers are
                illustrative; the labels match what the app actually shows. */}
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
              {[
                { label: "Portfolio value", value: "$284,150", delta: "+12.4% all-time" },
                { label: "Methods in use", value: "5", delta: "DCA · Value · Dividend" },
                { label: "Transactions", value: "318", delta: "+9 this month" },
              ].map((kpi) => (
                <div
                  key={kpi.label}
                  className="rounded-lg border bg-card p-4"
                >
                  <div className="text-xs text-muted-foreground">{kpi.label}</div>
                  <div className="mt-1 text-2xl font-semibold tracking-tight text-foreground">
                    {kpi.value}
                  </div>
                  <div className="mt-1 text-xs text-success">
                    {kpi.delta}
                  </div>
                </div>
              ))}
            </div>

            {/* Fake sparkline-ish bars */}
            <div className="mt-6 flex h-28 items-end gap-1.5">
              {[
                28, 36, 44, 40, 52, 48, 60, 56, 68, 64, 76, 72, 80, 76, 88, 84,
                96,
              ].map((h, i) => (
                <div
                  key={i}
                  className="flex-1 rounded-sm bg-gradient-to-t from-border to-foreground/70"
                  style={{ height: `${h}%` }}
                />
              ))}
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
