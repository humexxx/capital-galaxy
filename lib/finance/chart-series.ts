import type { Projection } from "@/types/finance";

import { periodIndexForDate, periodStartFor } from "./period";

/** One real recorded monthly snapshot point (from `getRecentMonthlySnapshots`),
 *  used to draw the chart's past from actuals rather than a re-simulation. */
export type PlanHistoryPoint = {
  date: Date;
  savings: number;
  investments: number;
  totalDebt: number;
  netWorth: number;
};

/** One net-worth point on the chart timeline. `totalDebt` / `investments` ride
 *  along for the hover tooltip only — they are NOT plotted as lines. */
export type ChartPoint = {
  date: Date;
  netWorth: number;
  totalDebt?: number;
  investments?: number;
};

/**
 * Pure-projection window: ~25% past + ~75% future, anchored on today's period.
 * Used for the forecast KPIs and the monthly-breakdown table, and as the chart
 * fallback when there are no real snapshots yet.
 *
 * "today" is resolved against the plan's accounting periods via
 * `periodIndexForDate` (not a raw `year*12+month` bucket), so a non-1
 * `anchorDay` lands on the period that actually contains today instead of
 * mis-counting by a period for the part of the month before the anchor. Pass
 * the plan's `confirmationDayOfMonth` as `anchorDay`; the default of 1 keeps
 * calendar-month behaviour for callers that don't care.
 */
export function computeProjectionWindow(
  projection: Projection,
  totalMonths: number,
  today: Date = new Date(),
  anchorDay: number = 1,
  /**
   * Fixed number of past periods to include. Omit for the default ~25% of the
   * range — the plans comparison chart pins it (3 months) so the past stays a
   * constant sliver no matter how long a horizon the user selects.
   */
  pastMonths?: number
): {
  startIndex: number;
  count: number;
  pastCount: number;
  todayIndex: number;
} {
  const targetPast = Math.max(
    1,
    pastMonths ?? Math.round(totalMonths * 0.25)
  );
  const base = projection.months[0]?.date;
  let projIdx = base ? periodIndexForDate(base, anchorDay, today) : 0;
  // Clamp into range: today before the projection → first period; past the
  // end → last period (so the window never points outside the data).
  if (projIdx < 0) projIdx = 0;
  else if (projIdx > projection.months.length - 1) {
    projIdx = Math.max(0, projection.months.length - 1);
  }
  const pastCount = Math.min(targetPast, projIdx);
  const startIndex = Math.max(0, projIdx - pastCount);
  const count = Math.min(totalMonths, projection.months.length - startIndex);
  return { startIndex, count, pastCount, todayIndex: pastCount };
}

/**
 * Build the chart's net-worth series: periods that have CLOSED before today's
 * period come from REAL recorded snapshots (solid line); today's period and
 * forward come from the (confirmation-calibrated) projection (dashed).
 * `pastCount` is the solid/dashed boundary.
 *
 * Both sides are bucketed by accounting PERIOD (`periodIndexForDate`), not raw
 * calendar month, so a non-1 `anchorDay` keeps the boundary on the period that
 * truly contains today — and a snapshot dated day-30 still aligns with the
 * day-15 projection period it belongs to. Pass the plan's
 * `confirmationDayOfMonth` as `anchorDay`; default 1 = calendar months.
 *
 * Falls back to a pure-projection window (the re-simulated past) when there are
 * no usable snapshots yet — fresh plans before the cron has run a few times —
 * so the chart is never empty.
 *
 * `pastProjection` (optional) is the RAW, un-calibrated projection. The main
 * `projection` is calibrated to the latest confirmation, so after the user
 * confirms the CURRENT period it begins at today — leaving no past months to
 * re-simulate and erasing the chart's history. When there are no real snapshots
 * for the past, we synthesize the past line from `pastProjection` instead (it
 * still spans back to the plan's start), so confirming today never blanks the
 * chart. Real snapshots always take precedence when present.
 */
/**
 * Aligns a base plan's projection ("ghost") to an already-built chart series.
 * Matching is by accounting PERIOD, never by array index — the base plan can
 * have a different startMonth, so index i of one projection is not index i of
 * the other. Points whose period the ghost projection doesn't cover map to
 * null (the chart skips them).
 */
export function mapGhostValues(
  points: readonly ChartPoint[],
  ghost: Projection,
  anchorDay: number = 1
): (number | null)[] {
  const effAnchor = anchorDay > 0 ? anchorDay : 1;
  return points.map((p) => {
    const m = ghost.months.find(
      (gm) => periodIndexForDate(gm.date, effAnchor, p.date) === 0
    );
    return m ? m.netWorth : null;
  });
}

/**
 * Portfolio series aligned to a chart series: past points (indexes before
 * `pastCount`) read the latest recorded portfolio snapshot inside the point's
 * period; today and forward read the projection's (growing) portfolioValue,
 * matched by period. Nulls where neither side has data — the chart connects
 * across gaps.
 */
export function mapPortfolioValues(
  points: readonly ChartPoint[],
  history: readonly { date: Date; value: number }[],
  projection: Projection,
  pastCount: number,
  anchorDay: number = 1
): (number | null)[] {
  const effAnchor = anchorDay > 0 ? anchorDay : 1;
  return points.map((p, i) => {
    if (i < pastCount) {
      let latest: number | null = null;
      for (const h of history) {
        if (periodIndexForDate(h.date, effAnchor, p.date) === 0) latest = h.value;
      }
      return latest;
    }
    const m = projection.months.find(
      (pm) => periodIndexForDate(pm.date, effAnchor, p.date) === 0
    );
    return m ? m.portfolioValue : null;
  });
}

export function buildChartSeries(
  history: PlanHistoryPoint[],
  projection: Projection,
  horizonMonths: number,
  today: Date = new Date(),
  anchorDay: number = 1,
  pastProjection?: Projection
): { points: ChartPoint[]; pastCount: number } {
  const pastBudget = Math.max(1, Math.round(horizonMonths * 0.25));
  const base = projection.months[0]?.date;

  // Period index of today relative to the projection's first period. Periods
  // before this one have closed (real/past); this one and later are forecast.
  const todayIdx = base ? periodIndexForDate(base, anchorDay, today) : 0;

  // Real past: snapshots whose period closed before today's period, latest
  // `pastBudget` of them. Each point is dated at its PERIOD start, like the
  // projection's own rows — a snapshot taken on Sep 4 inside the Aug-5 period
  // used to print as "Sep", right next to today's "Sep" period, so the axis
  // read the same month twice for two different periods.
  const effAnchor = anchorDay > 0 ? anchorDay : 1;
  const past = base
    ? history
        .filter((h) => periodIndexForDate(base, anchorDay, h.date) < todayIdx)
        .slice(-pastBudget)
        .map((h) => ({
          date: periodStartFor(h.date, effAnchor),
          netWorth: h.netWorth,
          totalDebt: h.totalDebt,
          investments: h.investments,
        }))
    : [];

  // Re-simulated past from the RAW projection — used only when there are no real
  // snapshots for the closed periods (e.g. right after confirming the current
  // period, which calibrates `projection` to start at today). Bucketed by the
  // same `base`/`anchorDay`, so periods strictly before today.
  const simPast =
    past.length === 0 && pastProjection && base
      ? pastProjection.months
          .filter((m) => periodIndexForDate(base, anchorDay, m.date) < todayIdx)
          .slice(-pastBudget)
          .map((m) => ({
            date: m.date,
            netWorth: m.netWorth,
            totalDebt: m.totalDebt,
            investments: m.investments,
          }))
      : [];

  const effectivePast = past.length > 0 ? past : simPast;

  // Future: the projection from today's period forward.
  const futureStart = base
    ? projection.months.findIndex(
        (m) => periodIndexForDate(base, anchorDay, m.date) >= todayIdx
      )
    : -1;

  if (effectivePast.length === 0 || futureStart === -1) {
    // No real history nor a re-simulable past (or today sits outside the
    // projection) → pure-projection window, identical to the original behaviour.
    const w = computeProjectionWindow(projection, horizonMonths, today, anchorDay);
    const slice = projection.months
      .slice(w.startIndex, w.startIndex + w.count)
      .map((m) => ({
        date: m.date,
        netWorth: m.netWorth,
        totalDebt: m.totalDebt,
        investments: m.investments,
      }));
    return { points: slice, pastCount: w.pastCount };
  }

  const future = projection.months
    .slice(
      futureStart,
      futureStart + Math.max(1, horizonMonths - effectivePast.length)
    )
    .map((m) => ({
      date: m.date,
      netWorth: m.netWorth,
      totalDebt: m.totalDebt,
      investments: m.investments,
    }));

  return {
    points: [...effectivePast, ...future],
    pastCount: effectivePast.length,
  };
}
