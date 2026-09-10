import type { Metadata } from "next";
import { notFound } from "next/navigation";

import type { FinancePlanWithLines, Projection } from "@/types/finance";

import { PlanEditor } from "@/components/finance/plan-editor";
import { getPortfolioPerformanceData } from "@/lib/services/chart-service";
import { requireEffectiveContext } from "@/lib/services/impersonation";
import { getUserPreferences } from "@/lib/services/user-preferences-service";
import {
  compareDebtStrategies,
  getAutoInvestRate,
  getPlanWithLines,
  getPortfolioValueForUser,
  listInvestmentMethods,
  projectPlanWithPortfolio,
} from "@/lib/services/finance-plan-service";
import {
  buildCalibratedPlan,
  getRecentMonthlySnapshots,
} from "@/lib/services/finance-snapshot-service";
import { getUserPortfolio } from "@/lib/services/portfolio-service";

export const dynamic = "force-dynamic";

type PageProps = {
  params: Promise<{ id: string }>;
};

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { id } = await params;
  const ctx = await requireEffectiveContext();
  const plan = await getPlanWithLines(id, ctx.effectiveUserId);
  return {
    title: plan ? plan.name : "Plan",
  };
}

export default async function PlanDetailPage({ params }: PageProps) {
  const { id } = await params;
  const ctx = await requireEffectiveContext();
  const plan = await getPlanWithLines(id, ctx.effectiveUserId);
  if (!plan) notFound();

  // Calibrate from the latest confirmation so the projection (and the chart's
  // forward line) starts from the user's most recent real numbers instead of
  // the original plan baseline. Returns the plan unchanged when there are no
  // confirmations. The raw `plan` is still what the editor mutates.
  //
  // Milestones are a global user preference, not plan data — edited in
  // Settings. Independent of the calibration, so the two resolve together.
  const [baseline, preferences] = await Promise.all([
    buildCalibratedPlan(plan),
    getUserPreferences(ctx.effectiveUserId),
  ]);

  const [portfolioValue, autoInvestRate, investmentMethods, history] =
    await Promise.all([
      baseline.includePortfolio
        ? getPortfolioValueForUser(ctx.effectiveUserId)
        : Promise.resolve(0),
      getAutoInvestRate(baseline),
      listInvestmentMethods({ includeDisabled: true }),
      // Real recorded history for the chart's past (today → backwards). 36
      // months covers the largest horizon's ~25% past budget; empty for fresh
      // plans, which fall back to the projected past.
      getRecentMonthlySnapshots(
        plan.id,
        ctx.effectiveUserId,
        36,
        new Date(),
        plan.confirmationDayOfMonth
      ),
    ]);

  // Scenario plans overlay their base plan's projection as a ghost line so the
  // delta is visible directly on the chart. Calibrated the same way as the
  // scenario itself; null when the plan is standalone or the base was deleted.
  let ghost: {
    name: string;
    color: string;
    plan: FinancePlanWithLines;
    projection: Projection;
  } | null = null;
  if (plan.basedOnPlanId) {
    const basePlan = await getPlanWithLines(plan.basedOnPlanId, ctx.effectiveUserId);
    if (basePlan) {
      const baseBaseline = await buildCalibratedPlan(basePlan);
      ghost = {
        name: basePlan.name,
        color: basePlan.color,
        // The calibrated lines travel with the projection so the chart can
        // resolve the base plan's day-aware "today" the same way it does its own.
        plan: baseBaseline,
        projection: await projectPlanWithPortfolio(baseBaseline, ctx.effectiveUserId),
      };
    }
  }

  // Recorded portfolio history feeds the chart's past segment of the portfolio
  // series when the plan includes the portfolio.
  let portfolioHistory: { date: Date; value: number }[] = [];
  if (baseline.includePortfolio) {
    const portfolio = await getUserPortfolio(ctx.effectiveUserId);
    if (portfolio) {
      const points = await getPortfolioPerformanceData(portfolio.id, "All");
      portfolioHistory = points.map((p) => ({ date: new Date(p.date), value: p.value }));
    }
  }

  const projection = await projectPlanWithPortfolio(baseline, ctx.effectiveUserId);
  // Raw (un-calibrated) projection — spans back to the plan's start. The chart
  // uses it to re-simulate the past when there are no real snapshots yet, so
  // confirming the current period (which calibrates `projection` to start at
  // today) doesn't blank the chart's history. Same object when no confirmation.
  const pastProjection =
    baseline === plan
      ? projection
      : await projectPlanWithPortfolio(plan, ctx.effectiveUserId);
  // Strategy comparison only meaningful when there's something to compare.
  const comparison =
    baseline.debts.length > 0
      ? compareDebtStrategies(
          baseline,
          baseline.incomes,
          baseline.expenses,
          baseline.debts,
          { portfolioValue, autoInvestRate }
        )
      : null;

  return (
    <section className="space-y-4">
      <PlanEditor
        plan={plan}
        baseline={baseline}
        projection={projection}
        pastProjection={pastProjection}
        history={history}
        comparison={comparison}
        investmentMethods={investmentMethods}
        ghost={ghost}
        portfolioHistory={portfolioHistory}
        portfolioValue={portfolioValue}
        milestones={preferences.financeMilestones}
        title={plan.name}
        description={
          plan.description ?? "Add income, expenses and debts to refine the projection."
        }
        backHref="/portal/plans"
      />
    </section>
  );
}
