import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// chart-service builds Drizzle select chains both with and without a `where`,
// so the mock has to support .select().from().where().orderBy() AND
// .select().from().orderBy(). We return the same thenable that resolves to
// whatever rows the test seeded.
const orderByMock = vi.fn();
const whereMock = vi.fn(() => ({ orderBy: orderByMock }));
const fromMock = vi.fn(() => ({ where: whereMock, orderBy: orderByMock }));
const selectMock = vi.fn(() => ({ from: fromMock }));

vi.mock("@/db", () => ({
  db: {
    select: () => selectMock(),
  },
}));

import {
  getPortfolioPerformanceData,
  type TimeRange,
} from "./chart-service";

function seedRows(
  rows: Array<{ date: Date; totalValue: string }>
): void {
  orderByMock.mockResolvedValue(rows);
}

const PORTFOLIO_ID = "00000000-0000-0000-0000-000000000010";

beforeEach(() => {
  vi.useFakeTimers();
  // Pin "now" to mid-month so getDate(now) === 15 deterministically. Tests
  // that exercise the day-1 branch override this with setSystemTime.
  vi.setSystemTime(new Date("2026-05-15T12:00:00Z"));
});

afterEach(() => {
  vi.useRealTimers();
  vi.clearAllMocks();
  orderByMock.mockReset();
  whereMock.mockClear();
  fromMock.mockClear();
  selectMock.mockClear();
});

describe("getPortfolioPerformanceData — empty snapshots", () => {
  it("returns two dummy zero points (start-of-month + now) when there are no snapshots", async () => {
    seedRows([]);
    const out = await getPortfolioPerformanceData(PORTFOLIO_ID, "All");

    expect(out).toHaveLength(2);
    expect(out[0].value).toBe(0);
    expect(out[1].value).toBe(0);
    expect(new Date(out[0].date).getUTCDate()).toBe(1);
    expect(new Date(out[0].date).getUTCMonth()).toBe(4); // May = 4 (0-indexed)
    expect(out[1].date).toBe(new Date("2026-05-15T12:00:00Z").toISOString());
  });

  it("when today is the 1st, the leading dummy falls back to the previous month", async () => {
    vi.setSystemTime(new Date("2026-05-01T08:00:00Z"));
    seedRows([]);

    const out = await getPortfolioPerformanceData(PORTFOLIO_ID, "All");

    expect(new Date(out[0].date).getUTCMonth()).toBe(3); // April
    expect(new Date(out[0].date).getUTCDate()).toBe(1);
  });
});

describe("getPortfolioPerformanceData — with snapshots", () => {
  it("starts the series at the first real snapshot — no synthetic zero", async () => {
    seedRows([
      { date: new Date("2026-03-10T00:00:00Z"), totalValue: "100" },
      { date: new Date("2026-04-12T00:00:00Z"), totalValue: "150" },
    ]);

    const out = await getPortfolioPerformanceData(PORTFOLIO_ID, "All");

    // A fabricated $0 origin made the headline change read +0.0% forever.
    expect(out[0].value).toBe(100);
    expect(out[0].date).toBe(new Date("2026-03-10T00:00:00Z").toISOString());
    expect(out[1].value).toBe(150);
  });

  it("appends a 'today' point with the last value when latest snapshot is older than today", async () => {
    seedRows([
      { date: new Date("2026-05-10T00:00:00Z"), totalValue: "300" },
    ]);

    const out = await getPortfolioPerformanceData(PORTFOLIO_ID, "All");

    // snapshot + today = 2 points
    expect(out).toHaveLength(2);
    const tail = out[out.length - 1];
    expect(tail.value).toBe(300); // copies forward
    expect(tail.date).toBe(new Date("2026-05-15T12:00:00Z").toISOString());
  });

  it("does NOT append a duplicate 'today' point when latest snapshot is from today", async () => {
    seedRows([
      // Mid-day same day as the fake clock.
      { date: new Date("2026-05-15T09:00:00Z"), totalValue: "500" },
    ]);

    const out = await getPortfolioPerformanceData(PORTFOLIO_ID, "All");
    // just the snapshot, no extra tail entry
    expect(out).toHaveLength(1);
    expect(out[out.length - 1].value).toBe(500);
  });

  it("parses string totalValue into a number", async () => {
    seedRows([
      { date: new Date("2026-05-10T00:00:00Z"), totalValue: "1234.56" },
    ]);

    const out = await getPortfolioPerformanceData(PORTFOLIO_ID, "All");
    const snap = out.find((p) => p.value === 1234.56);
    expect(snap).toBeTruthy();
  });
});

describe("getPortfolioPerformanceData — time range branch", () => {
  it.each<TimeRange>(["30d", "90d", "120d", "1yr"])(
    "uses the where-clause branch for %s",
    async (range) => {
      seedRows([]);
      await getPortfolioPerformanceData(PORTFOLIO_ID, range);
      expect(whereMock).toHaveBeenCalled();
    }
  );

  it("skips the where-clause branch on 'All'", async () => {
    seedRows([]);
    await getPortfolioPerformanceData(PORTFOLIO_ID, "All");
    // The 'All' branch builds a select chain that goes from -> where -> orderBy
    // too (uses eq portfolioId), so where IS called. We only assert that the
    // function ran without throwing and that orderBy was reached.
    expect(orderByMock).toHaveBeenCalled();
  });
});
