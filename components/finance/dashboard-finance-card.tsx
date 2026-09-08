import Link from "next/link";
import { ArrowRight, PlusCircle, TrendingUp, Wallet } from "lucide-react";

import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Heading, Mono, Text } from "@/components/ui/typography";
import { cn } from "@/lib/utils";

import { DashboardFinanceMiniChart } from "./dashboard-finance-mini-chart";
import { formatCurrency } from "@/lib/utils/format";
import {
  getAutoInvestRate,
  getMainPlan,
  getPlanWithLines,
  getPortfolioValueForUser,
  listUserPlans,
  projectPlan,
} from "@/lib/services/finance-plan-service";
import { buildCalibratedPlan } from "@/lib/services/finance-snapshot-service";
import { periodIndexForDate } from "@/lib/finance/period";

// UTC-anchored — projection.months[i].date is generated at UTC midnight; local
// formatting would shift a month for users in negative-offset timezones.
const MONTH_FMT = new Intl.DateTimeFormat("en-US", {
  month: "short",
  timeZone: "UTC",
});

type DashboardFinanceCardProps = {
  userId: string;
};

export async function DashboardFinanceCard({ userId }: DashboardFinanceCardProps) {
  const plans = await listUserPlans(userId);

  if (plans.length === 0) {
    return (
      <Card className="col-span-full">
        <CardHeader>
          <Heading level="h5" as="h2" className="flex items-center gap-2">
            <Wallet className="h-5 w-5" />
            Finance plan
          </Heading>
        </CardHeader>
        <CardContent className="flex flex-col items-start gap-3 sm:flex-row sm:items-center sm:justify-between">
          <Text variant="muted">
            Build a plan to project your savings, debts and net worth month by month.
          </Text>
          <Button asChild>
            <Link href="/portal/plans/new">
              <PlusCircle className="mr-1 h-4 w-4" /> Create plan
            </Link>
          </Button>
        </CardContent>
      </Card>
    );
  }

  const featured =
    (await getMainPlan(userId)) ??
    plans.slice().sort(
      (a, b) => b.updatedAt.getTime() - a.updatedAt.getTime()
    )[0];
  const full = await getPlanWithLines(featured.id, userId);
  if (!full) return null;

  // Calibrate from the latest confirmation so the card reflects the user's real
  // numbers (the [id] page does the same). Raw plan would ignore confirmations.
  const baseline = await buildCalibratedPlan(full);

  const [portfolioValue, autoInvestRate] = await Promise.all([
    baseline.includePortfolio
      ? getPortfolioValueForUser(userId)
      : Promise.resolve(0),
    getAutoInvestRate(baseline),
  ]);
  const projection = projectPlan(
    baseline,
    baseline.incomes,
    baseline.expenses,
    baseline.debts,
    { portfolioValue, autoInvestRate, overrides: baseline.overrides }
  );

  // Locate the accounting period that contains today (not months[0], the plan
  // START period) so the "now" figures and the 12-period preview track reality.
  const lastIdx = Math.max(0, projection.months.length - 1);
  const todayIdx = Math.min(
    Math.max(
      0,
      periodIndexForDate(baseline.startMonth, baseline.confirmationDayOfMonth, new Date())
    ),
    lastIdx
  );
  const todayMonth = projection.months[todayIdx];

  const points = projection.months.slice(todayIdx, todayIdx + 12).map((m) => ({
    month: MONTH_FMT.format(m.date),
    netWorth: Math.round(m.netWorth),
  }));

  const currentNetWorth = todayMonth?.netWorth ?? 0;
  const endNetWorth =
    projection.months[Math.min(todayIdx + 12, lastIdx)]?.netWorth ??
    currentNetWorth;
  const delta = endNetWorth - currentNetWorth;
  const totalDebt = todayMonth?.totalDebt ?? 0;

  const kpis: Array<{ label: string; value: string; tone?: "neutral" | "positive" | "negative" | "primary" }> = [
    { label: "Savings now", value: formatCurrency(todayMonth?.savings ?? 0) },
    { label: "Investments", value: formatCurrency(todayMonth?.investments ?? 0), tone: "primary" },
    { label: "Debt now", value: formatCurrency(totalDebt) },
    {
      label: "Debt-free in",
      value:
        projection.monthsToDebtFree !== null
          ? `${projection.monthsToDebtFree} mo`
          : full.debts.length === 0
          ? "—"
          : ">range",
    },
    {
      label: "Net worth",
      value: formatCurrency(currentNetWorth),
      tone: currentNetWorth >= 0 ? "positive" : "negative",
    },
  ];

  return (
    <Card className="col-span-full">
      <CardHeader>
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0 flex-1 space-y-1">
            <Heading level="h5" as="h2" className="flex items-center gap-2">
              <Wallet className="h-5 w-5 shrink-0" />
              <span className="truncate">{featured.name}</span>
            </Heading>
            <Text variant="muted" className="font-mono tabular-nums">
              12-month projection · updated {featured.updatedAt.toLocaleDateString()}
            </Text>
          </div>
          <div className="flex items-center gap-2">
            <Badge
              variant="outline"
              className={cn(
                "gap-1 font-mono tabular-nums",
                delta >= 0
                  ? "border-success/30 bg-success/10 text-success"
                  : "border-destructive/30 bg-destructive/10 text-destructive"
              )}
            >
              <TrendingUp className="h-3 w-3" />
              {delta >= 0 ? "+" : ""}
              {formatCurrency(delta)} · 12 mo
            </Badge>
            <Button variant="outline" size="sm" asChild>
              <Link href={`/portal/plans/${featured.id}`}>
                Open <ArrowRight className="ml-1 h-3 w-3" />
              </Link>
            </Button>
          </div>
        </div>
      </CardHeader>
      <CardContent>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-5">
          {kpis.map((k) => (
            <KpiTile key={k.label} {...k} />
          ))}
        </div>

        <div className="mt-4">
          <DashboardFinanceMiniChart data={points} />
        </div>
      </CardContent>
    </Card>
  );
}

function KpiTile({
  label,
  value,
  tone = "neutral",
}: {
  label: string;
  value: string;
  tone?: "neutral" | "positive" | "negative" | "primary";
}) {
  return (
    <div className="rounded-md border bg-card/50 p-3">
      <Text variant="small" className="uppercase tracking-wide">
        {label}
      </Text>
      <Mono
        className={cn(
          "mt-1 block text-lg font-semibold tabular-nums sm:text-xl",
          tone === "positive" && "text-success",
          tone === "negative" && "text-destructive",
          tone === "primary" && "text-primary"
        )}
      >
        {value}
      </Mono>
    </div>
  );
}
