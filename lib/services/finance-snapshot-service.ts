import "server-only";

import { and, desc, eq, gte, lte } from "drizzle-orm";

import { db } from "@/db";
import {
  financePlans,
  financePlanSnapshots,
  financePlanSnapshotDebts,
} from "@/db/schema";
import type { FinanceSnapshotSource } from "@/schemas/finance-snapshot";

import {
  getAutoInvestRate,
  getPlanWithLines,
  getPortfolioValueForUser,
  getPortfolioWeightedMonthlyRoi,
  projectPlan,
} from "./finance-plan-service";
import {
  autoConfirmSkippedPeriods,
  getLatestConfirmation,
} from "./finance-confirmation-service";
import { ensureOwnedRow } from "./ownership";
import { periodStartFor } from "@/lib/finance/period";
import type {
  FinancePlanWithLines,
  ProjectionMonth,
} from "@/types/finance";

// ---------- helpers ----------

/** Whole months between `start` and `target`, signed. Both inputs are
 *  expected to be period-anchor dates (same day-of-month, possibly clamped),
 *  so the calendar-month diff equals the period offset. */
function monthsBetween(start: Date, target: Date): number {
  return (
    (target.getUTCFullYear() - start.getUTCFullYear()) * 12 +
    (target.getUTCMonth() - start.getUTCMonth())
  );
}

/**
 * Apply the latest confirmation (if any) as the new baseline so projections
 * recalibrate from the user's most recent real-world numbers instead of
 * always extrapolating from the original startMonth.
 */
export async function buildCalibratedPlan(
  plan: FinancePlanWithLines
): Promise<FinancePlanWithLines> {
  const latest = await getLatestConfirmation(plan.id);
  if (!latest) return plan;

  const debtBalanceById = new Map(
    latest.debtConfirmations.map((d) => [d.debtId, d.confirmedBalance])
  );

  return {
    ...plan,
    startMonth: new Date(latest.confirmationMonth),
    initialSavings: latest.confirmedSavings,
    initialInvestments: latest.confirmedInvestments,
    debts: plan.debts.map((d) => ({
      ...d,
      initialBalance: debtBalanceById.get(d.id) ?? d.initialBalance,
    })),
  };
}

/**
 * Snapshot of the projected position for the calendar date. Uses the
 * calibrated plan so confirmations are reflected immediately.
 *
 * `boundary` selects which edge of the resolved period to return:
 *   - `"close"` (default): the period's END state — what we project the user
 *     will have at period close. Forecast-only consumers.
 *   - `"open"`: the period's OPENING state (= previous period's close, or the
 *     calibrated initials for period 0). Used by BOTH the confirmation pre-fill
 *     AND every snapshot: the opening is the last confirmed baseline held flat,
 *     so neither surface ever records projected paydown/interest as if it were
 *     real. Pre-filling/snapshotting the close instead made a blind "Save" jump
 *     the baseline a whole period forward and wrote forecast numbers into the
 *     chart's "real past" line.
 */
async function computeStateAt(
  plan: FinancePlanWithLines,
  userId: string,
  targetDate: Date,
  boundary: "open" | "close" = "close"
): Promise<{ state: ProjectionMonth | null; calibrated: FinancePlanWithLines }> {
  const calibrated = await buildCalibratedPlan(plan);

  const [portfolioValue, portfolioMonthlyGrowthRate, autoInvestRate] = await Promise.all([
    calibrated.includePortfolio
      ? getPortfolioValueForUser(userId)
      : Promise.resolve(0),
    // Same growth the chart's forecast applies, so a snapshot and the dashed
    // line agree on what the portfolio is worth in a given period.
    calibrated.includePortfolio
      ? getPortfolioWeightedMonthlyRoi(userId)
      : Promise.resolve(0),
    getAutoInvestRate(calibrated),
  ]);

  const projection = projectPlan(
    calibrated,
    calibrated.incomes,
    calibrated.expenses,
    calibrated.debts,
    {
      portfolioValue,
      portfolioMonthlyGrowthRate,
      autoInvestRate,
      overrides: calibrated.overrides,
    }
  );

  if (projection.months.length === 0) {
    return { state: null, calibrated };
  }

  // The opening state of the very first period = the calibrated initials
  // (savings / investments / per-debt balances at start_month).
  const initialsState = (): ProjectionMonth => {
    const totalDebt = calibrated.debts.reduce(
      (s, d) => s + parseFloat(d.initialBalance),
      0
    );
    const savings = parseFloat(calibrated.initialSavings);
    const investments = parseFloat(calibrated.initialInvestments);
    return {
      monthOffset: -1,
      date: targetDate,
      income: 0,
      expenses: 0,
      scheduledDebtPayments: 0,
      extraDebtPayments: 0,
      debtPayments: 0,
      totalInterestAccrued: 0,
      cashFlow: 0,
      savings,
      savingsInterest: 0,
      investments,
      investmentsContribution: 0,
      investmentsInterest: 0,
      totalDebt,
      // The portfolio exists on day one too; leaving it out made the
      // confirmation-day snapshot drop a cliff the size of the portfolio.
      portfolioValue,
      netWorth: savings + investments + portfolioValue - totalDebt,
      debts: calibrated.debts.map((d) => ({
        debtId: d.id,
        name: d.name,
        balance: parseFloat(d.initialBalance),
        scheduledPayment: 0,
        extraPayment: 0,
        interestAccrued: 0,
      })),
    };
  };

  // Both ends normalised to their period anchors so the month diff is the
  // period diff. Day-1 anchors collapse to first-of-month, which is the
  // historical (calendar-month) behaviour.
  const anchorDay =
    calibrated.confirmationDayOfMonth > 0
      ? calibrated.confirmationDayOfMonth
      : 1;
  const startAnchor = periodStartFor(calibrated.startMonth, anchorDay);
  const targetAnchor = periodStartFor(targetDate, anchorDay);
  const offset = monthsBetween(startAnchor, targetAnchor);
  if (offset < 0) {
    return { calibrated, state: initialsState() };
  }
  const idx = Math.min(offset, projection.months.length - 1);
  if (boundary === "open") {
    // Opening of period `idx` = close of the previous period, or the initials
    // when `idx` is the first period.
    return {
      calibrated,
      state: idx > 0 ? projection.months[idx - 1] : initialsState(),
    };
  }
  return { state: projection.months[idx] ?? null, calibrated };
}

// ---------- public API (mirrors snapshot-service.ts) ----------

/**
 * Walk every finance plan and capture today's snapshot. Designed to be called
 * from the daily cron — analog of `createDailySnapshots()` in snapshot-service.ts.
 *
 * Skips a plan if its most recent snapshot is already on the same calendar day
 * AND came from the cron (idempotent re-runs are no-ops). Manual / confirmation
 * snapshots created earlier in the day stay intact.
 */
export async function createDailyFinanceSnapshots(today: Date = new Date()): Promise<{
  date: Date;
  snapshotsCreated: number;
  totalPlans: number;
  errors: string[];
}> {
  const plans = await db.select().from(financePlans);
  let snapshotsCreated = 0;
  const errors: string[] = [];

  for (const planRow of plans) {
    try {
      const result = await createSnapshotForPlan(
        planRow.id,
        planRow.userId,
        "system_cron",
        today
      );
      if (result.created) snapshotsCreated += 1;
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Unknown error";
      errors.push(`${planRow.id}: ${msg}`);
      console.error(`createDailyFinanceSnapshots plan=${planRow.id}:`, err);
    }
  }

  return { date: today, snapshotsCreated, totalPlans: plans.length, errors };
}

/**
 * Snapshot created when a user confirms their actuals. Analog of
 * `createApprovalSnapshot` in snapshot-service.ts.
 */
export async function createConfirmationSnapshot(
  planId: string,
  userId: string,
  confirmedAt: Date
): Promise<{ created: boolean }> {
  return createSnapshotForPlan(planId, userId, "confirmation", confirmedAt);
}

/**
 * Manual snapshot, requested by the user from the UI. Mirrors
 * `createManualSnapshot` in snapshot-service.ts.
 */
export async function createManualFinanceSnapshot(
  planId: string,
  userId: string,
  date: Date = new Date()
): Promise<{ created: boolean }> {
  return createSnapshotForPlan(planId, userId, "manual", date);
}

/**
 * Bulk delete of manual snapshots for a plan. Mirrors
 * `deleteManualSnapshots` in snapshot-service.ts.
 */
export async function deleteManualFinanceSnapshots(
  planId: string,
  userId: string
): Promise<void> {
  await ensurePlanOwnership(planId, userId);
  await db
    .delete(financePlanSnapshots)
    .where(
      and(
        eq(financePlanSnapshots.planId, planId),
        eq(financePlanSnapshots.source, "manual")
      )
    );
}

/**
 * Read-only access to a plan's snapshot history (newest first).
 */
export async function listSnapshots(
  planId: string,
  userId: string,
  options: { limit?: number } = {}
): Promise<
  Array<{
    date: Date;
    savings: string;
    investments: string;
    totalDebt: string;
    netWorth: string;
    source: FinanceSnapshotSource;
  }>
> {
  await ensurePlanOwnership(planId, userId);
  const limit = options.limit ?? 365;
  return db
    .select({
      date: financePlanSnapshots.date,
      savings: financePlanSnapshots.savings,
      investments: financePlanSnapshots.investments,
      totalDebt: financePlanSnapshots.totalDebt,
      netWorth: financePlanSnapshots.netWorth,
      source: financePlanSnapshots.source,
    })
    .from(financePlanSnapshots)
    .where(eq(financePlanSnapshots.planId, planId))
    .orderBy(desc(financePlanSnapshots.date))
    .limit(limit) as Promise<
    Array<{
      date: Date;
      savings: string;
      investments: string;
      totalDebt: string;
      netWorth: string;
      source: FinanceSnapshotSource;
    }>
  >;
}

// ---------- internal ----------

async function ensurePlanOwnership(planId: string, userId: string): Promise<void> {
  await ensureOwnedRow({
    table: financePlans,
    idColumn: financePlans.id,
    id: planId,
    userId,
    entity: "Plan",
  });
}

/**
 * Shared INSERT helper, structurally identical to `createSnapshotForPortfolio`
 * in snapshot-service.ts. Skips inserts on these conditions:
 *
 *   - The plan does not exist.
 *   - A `system_cron` snapshot already exists for the same calendar day (idempotent).
 *
 * Manual + confirmation snapshots are NEVER skipped on day collision — they're
 * intentional events the user wants in the history.
 */
async function createSnapshotForPlan(
  planId: string,
  userId: string,
  source: FinanceSnapshotSource,
  date: Date = new Date()
): Promise<{ created: boolean }> {
  const plan = await getPlanWithLines(planId, userId);
  if (!plan) return { created: false };

  // Idempotency: if the cron is re-run on a day where we already wrote a
  // system_cron snapshot, skip. Other sources always create a fresh row.
  if (source === "system_cron") {
    const dayStart = new Date(date);
    dayStart.setUTCHours(0, 0, 0, 0);
    const dayEnd = new Date(date);
    dayEnd.setUTCHours(23, 59, 59, 999);
    const [existing] = await db
      .select({ id: financePlanSnapshots.id })
      .from(financePlanSnapshots)
      .where(
        and(
          eq(financePlanSnapshots.planId, planId),
          eq(financePlanSnapshots.source, "system_cron"),
          gte(financePlanSnapshots.date, dayStart),
          lte(financePlanSnapshots.date, dayEnd)
        )
      )
      .limit(1);
    if (existing) return { created: false };

    // Before snapshotting, roll the baseline through any period the user left
    // unconfirmed so today's snapshot reflects the rolled opening (and the
    // skipped periods get an auditable auto-confirmation). Cron-only — manual /
    // confirmation snapshots must not trigger silent baseline rolls.
    await autoConfirmSkippedPeriods(plan, userId, date);
  }

  // "open" → the period's OPENING balances (last confirmed baseline held flat),
  // NOT the projected period close. A snapshot records where the user *actually*
  // is per their last confirmation; debt paydown / interest only enters the
  // historical record when the user confirms (or the cron auto-confirms a
  // skipped period). Pre-"open" this used the projected close, which silently
  // recorded forecast numbers as if they were real.
  const { state } = await computeStateAt(plan, userId, date, "open");
  if (!state) return { created: false };

  const [row] = await db
    .insert(financePlanSnapshots)
    .values({
      planId,
      date,
      savings: state.savings.toFixed(2),
      investments: state.investments.toFixed(2),
      totalDebt: state.totalDebt.toFixed(2),
      netWorth: state.netWorth.toFixed(2),
      source,
    })
    .returning({ id: financePlanSnapshots.id });

  if (state.debts.length > 0) {
    await db.insert(financePlanSnapshotDebts).values(
      state.debts.map((d) => ({
        snapshotId: row.id,
        debtId: d.debtId,
        balance: d.balance.toFixed(2),
      }))
    );
  }

  return { created: true };
}

/**
 * One snapshot per accounting PERIOD for the last `monthsBack` months, taking
 * the most recent snapshot of each period as the representative. Used by the
 * chart to plot the recent past alongside the projected future on the same
 * timeline.
 *
 * Buckets by PERIOD anchor (not raw calendar month) so it lines up with
 * `buildChartSeries`, which classifies past/future via `periodIndexForDate`.
 * With a non-1 `anchorDay` a period straddles two calendar months, so a
 * calendar-month dedup could drop two snapshots into different buckets than the
 * chart expects (one period getting two points, another none). Pass the plan's
 * `confirmationDayOfMonth`; the default 1 keeps calendar-month behaviour.
 *
 * Returns an empty array (without throwing) when no snapshots exist yet — that
 * is the common case for fresh plans before the cron has run a few times.
 */
export async function getRecentMonthlySnapshots(
  planId: string,
  userId: string,
  monthsBack: number = 3,
  today: Date = new Date(),
  anchorDay: number = 1
): Promise<
  Array<{
    date: Date;
    savings: number;
    investments: number;
    totalDebt: number;
    netWorth: number;
  }>
> {
  await ensurePlanOwnership(planId, userId);

  // First day (UTC) of the month that is `monthsBack` months before `today`.
  const cutoff = new Date(
    Date.UTC(today.getUTCFullYear(), today.getUTCMonth() - monthsBack, 1)
  );

  const rows = await db
    .select({
      date: financePlanSnapshots.date,
      savings: financePlanSnapshots.savings,
      investments: financePlanSnapshots.investments,
      totalDebt: financePlanSnapshots.totalDebt,
      netWorth: financePlanSnapshots.netWorth,
    })
    .from(financePlanSnapshots)
    .where(
      and(
        eq(financePlanSnapshots.planId, planId),
        gte(financePlanSnapshots.date, cutoff)
      )
    )
    .orderBy(desc(financePlanSnapshots.date));

  // Keep only the latest snapshot per accounting PERIOD (rows are date-desc, so
  // the first seen per bucket is the latest) so the chart gets one clean point
  // per period even if the cron wrote multiple rows per day. Bucket key = the
  // period's anchor date, which collapses to first-of-month when anchorDay = 1.
  const anchor = anchorDay > 0 ? anchorDay : 1;
  const latestPerPeriod = new Map<string, (typeof rows)[number]>();
  for (const r of rows) {
    const key = periodStartFor(r.date, anchor).toISOString().slice(0, 10);
    if (!latestPerPeriod.has(key)) latestPerPeriod.set(key, r);
  }

  return Array.from(latestPerPeriod.values())
    .sort((a, b) => a.date.getTime() - b.date.getTime())
    .map((r) => ({
      date: r.date,
      savings: parseFloat(r.savings),
      investments: parseFloat(r.investments),
      totalDebt: parseFloat(r.totalDebt),
      netWorth: parseFloat(r.netWorth),
    }));
}

// ---------- exposed for confirmation flow ----------

/**
 * Public view of the calibrated "current period" projection state for a
 * plan, used by the confirmation dialog to pre-fill the form. `targetDate`
 * is expected to be the period anchor — typically passed straight through
 * from `periodStartFor(today, confirmationDayOfMonth)`.
 */
export async function getProjectedStateForMonth(
  plan: FinancePlanWithLines,
  userId: string,
  targetDate: Date
): Promise<ProjectionMonth | null> {
  // "open" → the period's opening balances (what the user holds on the anchor
  // day they're confirming), which is exactly what the confirmation stores as
  // the new baseline. See `computeStateAt`'s `boundary` doc.
  const { state } = await computeStateAt(plan, userId, targetDate, "open");
  return state;
}
