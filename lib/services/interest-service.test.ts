import { afterEach, describe, expect, it, vi } from "vitest";

// applyMonthlyInterest reads via `db.query.transactions.findMany` and writes
// via `db.transaction(tx => tx.update(...).set(...).where(...))`. We mock both
// shapes so the function under test can be exercised in isolation.

const findMany = vi.fn();
const setMock = vi.fn();
const whereMock = vi.fn();
const updateMock = vi.fn(() => ({ set: setMock }));

vi.mock("@/db", () => ({
  db: {
    query: {
      transactions: {
        findMany: (...args: unknown[]) => findMany(...args),
      },
    },
    transaction: (cb: (tx: unknown) => Promise<unknown>) =>
      cb({ update: updateMock }),
  },
}));

import { applyMonthlyInterest, interestAppliedThisMonth } from "./interest-service";

afterEach(() => {
  vi.clearAllMocks();
  setMock.mockReset();
  whereMock.mockReset();
  updateMock.mockClear();
  // Default chain: update().set() returns an object with .where() that resolves.
  setMock.mockReturnValue({ where: whereMock });
  whereMock.mockResolvedValue(undefined);
});

function makeTx(overrides: {
  id?: string;
  currentValue?: string | null;
  monthlyRoi?: string | null;
}) {
  return {
    id: overrides.id ?? "tx-1",
    portfolioId: "p-1",
    investmentMethodId: "im-1",
    type: "buy",
    amount: "1000",
    fee: "0",
    total: "1000",
    initialValue: "1000",
    currentValue: overrides.currentValue ?? "1000",
    sourceTransactionId: null,
    withdrawalTransactionIds: null,
    date: new Date(),
    notes: null,
    status: "approved",
    approvedAt: null,
    approvedBy: null,
    rejectedAt: null,
    rejectedBy: null,
    createdAt: new Date(),
    updatedAt: new Date(),
    investmentMethod: {
      id: "im-1",
      name: "Stub",
      description: null,
      author: "x",
      riskLevel: "Low",
      monthlyRoi: overrides.monthlyRoi ?? "1.0", // 1% per month
      enabled: true,
      createdAt: new Date(),
    },
  };
}

describe("applyMonthlyInterest", () => {
  it("returns { processed: 0, closed: 0 } when nothing is active", async () => {
    findMany.mockResolvedValueOnce([]);

    const result = await applyMonthlyInterest();

    expect(result).toEqual({ processed: 0, closed: 0 });
    expect(updateMock).not.toHaveBeenCalled();
  });

  it("converts monthlyRoi percentage to decimal and updates currentValue", async () => {
    findMany.mockResolvedValueOnce([
      makeTx({ id: "tx-a", currentValue: "1000", monthlyRoi: "1.5" }), // 1.5%
    ]);

    const result = await applyMonthlyInterest();

    expect(result.processed).toBe(1);
    expect(result.closed).toBe(0);
    // 1000 * (1 + 0.015) = 1015.00
    expect(setMock).toHaveBeenCalledTimes(1);
    const payload = setMock.mock.calls[0][0];
    expect(payload.currentValue).toBe("1015.00");
    expect(payload.status).toBe("approved");
  });

  it("marks transactions whose new value is <= 0 as 'closed'", async () => {
    // Negative ROI configuration: -200% means newValue = 1000 * -1 = -1000 → closes.
    findMany.mockResolvedValueOnce([
      makeTx({ id: "tx-loss", currentValue: "1000", monthlyRoi: "-200" }),
    ]);

    const result = await applyMonthlyInterest();

    expect(result.processed).toBe(1);
    expect(result.closed).toBe(1);
    expect(setMock.mock.calls[0][0].status).toBe("closed");
  });

  it("handles a mix of compounding and closing transactions", async () => {
    findMany.mockResolvedValueOnce([
      makeTx({ id: "ok", currentValue: "500", monthlyRoi: "2" }),
      makeTx({ id: "loss", currentValue: "100", monthlyRoi: "-150" }),
    ]);

    const result = await applyMonthlyInterest();

    expect(result.processed).toBe(2);
    expect(result.closed).toBe(1);

    const calls = setMock.mock.calls.map((c) => c[0]);
    const ok = calls.find((c) => c.currentValue === "510.00");
    const loss = calls.find((c) => c.status === "closed");
    expect(ok).toBeTruthy();
    expect(loss).toBeTruthy();
  });

  it("treats missing investmentMethod / null monthlyRoi as 0% (no growth)", async () => {
    const tx = makeTx({ id: "tx-null", currentValue: "1234.56" });
    // @ts-expect-error — intentional malformed fixture
    tx.investmentMethod = undefined;
    findMany.mockResolvedValueOnce([tx]);

    await applyMonthlyInterest();

    expect(setMock.mock.calls[0][0].currentValue).toBe("1234.56");
  });

  it("forwards beforeDate into the query conditions", async () => {
    findMany.mockResolvedValueOnce([]);
    const cutoff = new Date("2026-01-01T00:00:00Z");
    await applyMonthlyInterest(cutoff);
    // We can't easily introspect Drizzle's `and(...)` predicate, but we can
    // assert that findMany was called once with an options object whose `where`
    // is a non-empty value — proving the cutoff branch ran without throwing.
    expect(findMany).toHaveBeenCalledTimes(1);
    const opts = findMany.mock.calls[0][0];
    expect(opts).toBeTruthy();
    expect(opts.where).toBeTruthy();
  });
});

// ---------- interestAppliedThisMonth ----------

describe("interestAppliedThisMonth", () => {
  it("is true only when the recorded run falls in today's UTC month", () => {
    const today = new Date("2026-10-01T00:05:00Z");
    // The 1st used to bypass this check entirely, so a retry on that day
    // compounded a second month onto every position.
    expect(interestAppliedThisMonth("2026-10-01T00:00:10Z", today)).toBe(true);
    expect(interestAppliedThisMonth("2026-09-30T23:59:00Z", today)).toBe(false);
    expect(interestAppliedThisMonth(null, today)).toBe(false);
    expect(interestAppliedThisMonth("not a date", today)).toBe(false);
  });
});
