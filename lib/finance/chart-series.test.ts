import { describe, expect, it } from "vitest";

import {
  buildChartSeries,
  computeProjectionWindow,
  type PlanHistoryPoint,
} from "./chart-series";
import type { Projection, ProjectionMonth } from "@/types/finance";

function utc(year: number, monthZeroIdx: number, day: number): Date {
  return new Date(Date.UTC(year, monthZeroIdx, day));
}

// Minimal projection: buildChartSeries / computeProjectionWindow only read
// `months[].date` and `.netWorth`, so we cast a partial shape through unknown.
function projectionOf(
  months: { date: Date; netWorth: number }[]
): Projection {
  return {
    months: months.map((m) => ({ ...m }) as unknown as ProjectionMonth),
  } as unknown as Projection;
}

function snap(date: Date, netWorth: number): PlanHistoryPoint {
  return { date, netWorth, savings: 0, investments: 0, totalDebt: 0 };
}

describe("computeProjectionWindow", () => {
  it("anchors ~25% past on today's month", () => {
    // Projection Mar..Aug (6 months), today = Jun → index 3.
    const proj = projectionOf([
      { date: utc(2026, 2, 1), netWorth: 1 }, // Mar
      { date: utc(2026, 3, 1), netWorth: 2 }, // Apr
      { date: utc(2026, 4, 1), netWorth: 3 }, // May
      { date: utc(2026, 5, 1), netWorth: 4 }, // Jun (today)
      { date: utc(2026, 6, 1), netWorth: 5 }, // Jul
      { date: utc(2026, 7, 1), netWorth: 6 }, // Aug
    ]);
    const w = computeProjectionWindow(proj, 12, utc(2026, 5, 20));
    // targetPast = round(12*0.25)=3, today index 3 → pastCount 3, startIndex 0.
    expect(w.pastCount).toBe(3);
    expect(w.startIndex).toBe(0);
    expect(w.count).toBe(6);
  });

  it("locates today by PERIOD, not calendar month, when anchorDay > 1", () => {
    // Period-anchored (day-15) projection. "today" = Jun 6 falls BEFORE the
    // June anchor, so it belongs to the May-15 period (index 2), NOT the
    // Jun-15 period. A calendar-month bucket would wrongly pick June (index 3).
    const proj = projectionOf([
      { date: utc(2026, 2, 15), netWorth: 1 }, // Mar-15 period (idx 0)
      { date: utc(2026, 3, 15), netWorth: 2 }, // Apr-15 (idx 1)
      { date: utc(2026, 4, 15), netWorth: 3 }, // May-15 (idx 2) ← today's period
      { date: utc(2026, 5, 15), netWorth: 4 }, // Jun-15 (idx 3)
      { date: utc(2026, 6, 15), netWorth: 5 }, // Jul-15 (idx 4)
    ]);
    const w = computeProjectionWindow(proj, 12, utc(2026, 5, 6), 15);
    // today index 2 → pastCount min(3,2)=2, startIndex 0.
    expect(w.pastCount).toBe(2);
    expect(w.todayIndex).toBe(2);
    expect(w.startIndex).toBe(0);
  });
});

describe("buildChartSeries", () => {
  it("uses real snapshots for the past and the projection for current+future", () => {
    const history = [
      snap(utc(2026, 3, 30), 100), // Apr (real)
      snap(utc(2026, 4, 30), 200), // May (real)
      snap(utc(2026, 5, 10), 999), // Jun — same month as today, must be ignored
    ];
    const proj = projectionOf([
      { date: utc(2026, 5, 1), netWorth: 260 }, // Jun (boundary, projection)
      { date: utc(2026, 6, 1), netWorth: 300 }, // Jul
      { date: utc(2026, 7, 1), netWorth: 340 }, // Aug
    ]);

    const { points, pastCount } = buildChartSeries(history, proj, 12, utc(2026, 5, 15));

    expect(pastCount).toBe(2);
    expect(points.map((p) => p.netWorth)).toEqual([100, 200, 260, 300, 340]);
    // Boundary point is the projection's current month, not the Jun snapshot.
    expect(points[2].netWorth).toBe(260);
  });

  it("aligns a day-30 snapshot with a period-anchored (day-15) projection by calendar month", () => {
    const history = [snap(utc(2026, 4, 30), 200)]; // May 30 (real)
    const proj = projectionOf([
      { date: utc(2026, 4, 15), netWorth: 210 }, // May-15 period — same month as the snapshot
      { date: utc(2026, 5, 15), netWorth: 250 }, // Jun-15 period (boundary)
      { date: utc(2026, 6, 15), netWorth: 290 }, // Jul-15 period
    ]);

    const { points, pastCount } = buildChartSeries(history, proj, 12, utc(2026, 5, 20));

    // Past = the May snapshot; the projection's May-15 period is NOT duplicated.
    expect(pastCount).toBe(1);
    expect(points[0].netWorth).toBe(200);
    expect(points[1].date).toEqual(utc(2026, 5, 15)); // Jun-15 boundary
    expect(points.map((p) => p.netWorth)).toEqual([200, 250, 290]);
  });

  it("dates a past snapshot at its period start so the axis names each period once", () => {
    // Anchor day 5: the Aug-5 period runs Aug 5 – Sep 4. Its closing snapshot is
    // dated Sep 4 and used to label as "Sep" beside today's Sep-5 period.
    const history = [snap(utc(2026, 8, 4), 200)]; // Sep 4, inside the Aug-5 period
    const proj = projectionOf([
      { date: utc(2026, 7, 5), netWorth: 210 }, // Aug-5 period
      { date: utc(2026, 8, 5), netWorth: 250 }, // Sep-5 period (today)
      { date: utc(2026, 9, 5), netWorth: 290 }, // Oct-5 period
    ]);

    const { points, pastCount } = buildChartSeries(history, proj, 12, utc(2026, 8, 7), 5);

    expect(pastCount).toBe(1);
    expect(points[0].date).toEqual(utc(2026, 7, 5)); // Aug-5, not Sep 4
    expect(points[0].netWorth).toBe(200);
    expect(points[1].date).toEqual(utc(2026, 8, 5));
  });

  it("caps the past at pastBudget = round(horizon * 0.25)", () => {
    const history = [
      snap(utc(2026, 2, 28), 1), // Mar
      snap(utc(2026, 3, 28), 2), // Apr
      snap(utc(2026, 4, 28), 3), // May
    ];
    const proj = projectionOf([{ date: utc(2026, 5, 1), netWorth: 4 }]); // Jun
    // horizon 4 → pastBudget = round(1) = 1 → only the latest (May) snapshot.
    const { points, pastCount } = buildChartSeries(history, proj, 4, utc(2026, 5, 10));
    expect(pastCount).toBe(1);
    expect(points[0].netWorth).toBe(3); // May only
  });

  it("falls back to the projection window when there is no history", () => {
    const proj = projectionOf([
      { date: utc(2026, 2, 1), netWorth: 1 }, // Mar
      { date: utc(2026, 3, 1), netWorth: 2 }, // Apr
      { date: utc(2026, 4, 1), netWorth: 3 }, // May
      { date: utc(2026, 5, 1), netWorth: 4 }, // Jun (today)
      { date: utc(2026, 6, 1), netWorth: 5 }, // Jul
    ]);
    const { points, pastCount } = buildChartSeries([], proj, 12, utc(2026, 5, 15));
    // Mirrors computeProjectionWindow: past = re-simulated months before today.
    expect(pastCount).toBe(3);
    expect(points.map((p) => p.netWorth)).toEqual([1, 2, 3, 4, 5]);
  });

  it("keeps the solid/dashed boundary on the period containing today (anchorDay > 1)", () => {
    // Anchor day 15. today = Jun 6 → belongs to the May-15 period (the
    // in-progress one). The dashed forecast must therefore start at May-15, and
    // only periods that closed before it (the Apr snapshot) count as past. A
    // calendar-month split would wrongly push the boundary to Jun-15.
    const history = [
      snap(utc(2026, 3, 20), 100), // Apr-15 period (closed)
      snap(utc(2026, 4, 20), 200), // May-15 period (the current, in-progress one)
    ];
    const proj = projectionOf([
      { date: utc(2026, 4, 15), netWorth: 250 }, // May-15 (today's period → boundary)
      { date: utc(2026, 5, 15), netWorth: 300 }, // Jun-15
      { date: utc(2026, 6, 15), netWorth: 340 }, // Jul-15
    ]);

    const { points, pastCount } = buildChartSeries(history, proj, 12, utc(2026, 5, 6), 15);

    // Past = only the Apr snapshot; May's in-progress period comes from the
    // projection (its actual close isn't known yet).
    expect(pastCount).toBe(1);
    expect(points[0].netWorth).toBe(100);
    expect(points[1].date).toEqual(utc(2026, 4, 15)); // May-15 boundary
    expect(points.map((p) => p.netWorth)).toEqual([100, 250, 300, 340]);
  });

  it("re-simulates the past from the RAW projection when the calibrated one starts at today", () => {
    // Simulates confirming the CURRENT period: the calibrated projection begins
    // at today (Jun), so on its own it has no past to show. With no real
    // snapshots, the raw `pastProjection` (which still spans back to plan start)
    // supplies the past line so the chart history isn't blanked.
    const calibrated = projectionOf([
      { date: utc(2026, 5, 1), netWorth: 4 }, // Jun (today, boundary)
      { date: utc(2026, 6, 1), netWorth: 5 }, // Jul
      { date: utc(2026, 7, 1), netWorth: 6 }, // Aug
    ]);
    const raw = projectionOf([
      { date: utc(2026, 3, 1), netWorth: 2 }, // Apr
      { date: utc(2026, 4, 1), netWorth: 3 }, // May
      { date: utc(2026, 5, 1), netWorth: 4 }, // Jun
      { date: utc(2026, 6, 1), netWorth: 5 }, // Jul
      { date: utc(2026, 7, 1), netWorth: 6 }, // Aug
    ]);

    // Without pastProjection: no past at all (the regression the user hit).
    const bare = buildChartSeries([], calibrated, 12, utc(2026, 5, 15));
    expect(bare.pastCount).toBe(0);
    expect(bare.points.map((p) => p.netWorth)).toEqual([4, 5, 6]);

    // With pastProjection: Apr + May re-simulated as the past.
    const { points, pastCount } = buildChartSeries(
      [],
      calibrated,
      12,
      utc(2026, 5, 15),
      1,
      raw
    );
    expect(pastCount).toBe(2);
    expect(points.map((p) => p.netWorth)).toEqual([2, 3, 4, 5, 6]);
  });

  it("prefers real snapshots over the raw projection for the past", () => {
    const history = [snap(utc(2026, 4, 28), 200)]; // May (real)
    const calibrated = projectionOf([
      { date: utc(2026, 5, 1), netWorth: 4 }, // Jun (today)
      { date: utc(2026, 6, 1), netWorth: 5 }, // Jul
    ]);
    const raw = projectionOf([
      { date: utc(2026, 4, 1), netWorth: 999 }, // May (raw — must be ignored)
      { date: utc(2026, 5, 1), netWorth: 4 },
      { date: utc(2026, 6, 1), netWorth: 5 },
    ]);
    const { points, pastCount } = buildChartSeries(
      history,
      calibrated,
      12,
      utc(2026, 5, 15),
      1,
      raw
    );
    expect(pastCount).toBe(1);
    expect(points[0].netWorth).toBe(200); // real snapshot, not raw's 999
  });

  it("falls back when snapshots exist but none predate the current month", () => {
    const history = [snap(utc(2026, 5, 10), 999)]; // Jun, same month as today
    const proj = projectionOf([
      { date: utc(2026, 4, 1), netWorth: 3 }, // May
      { date: utc(2026, 5, 1), netWorth: 4 }, // Jun (today)
      { date: utc(2026, 6, 1), netWorth: 5 }, // Jul
    ]);
    const { points, pastCount } = buildChartSeries(history, proj, 12, utc(2026, 5, 15));
    // No snapshot strictly before Jun → fallback window.
    expect(pastCount).toBe(1);
    expect(points.map((p) => p.netWorth)).toEqual([3, 4, 5]);
  });
});
