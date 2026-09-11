import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// portfolio-service mixes three DB shapes:
//   - db.query.portfolios.findFirst / db.query.transactions.findFirst
//   - db.select().from().where()                       (getPortfolioStats)
//   - db.select({...}).from().leftJoin().where().orderBy()
//                                                       (getPortfolioTransactions)
//   - db.select({...}).from().leftJoin().where()       (getPortfolioAssets)
//   - db.insert().values().returning()                 (createPortfolio)
//
// We mock the terminal call (the awaited one) per test by reassigning the
// resolved value on the leaf mock — this avoids hand-rolling a thenable for
// every variant.

const portfolioFindFirst = vi.fn();
const transactionFindFirst = vi.fn();

// Chainable select mock. The leaf can be one of: where, orderBy. We expose
// both by always returning the same chain object from each builder method;
// tests assign `selectResult` to the rows the terminal call should resolve to.
let selectResult: unknown = [];

const selectChain: {
  from: ReturnType<typeof vi.fn>;
  leftJoin: ReturnType<typeof vi.fn>;
  where: ReturnType<typeof vi.fn>;
  orderBy: ReturnType<typeof vi.fn>;
  then: (resolve: (v: unknown) => unknown) => unknown;
} = {
  from: vi.fn(),
  leftJoin: vi.fn(),
  where: vi.fn(),
  orderBy: vi.fn(),
  // The chain object itself is awaitable so that any path that stops at
  // `.where(...)` (e.g. getPortfolioStats / getPortfolioAssets) resolves to
  // selectResult without us having to know which builder method is last.
  then(resolve) {
    return Promise.resolve(selectResult).then(resolve);
  },
};
selectChain.from.mockReturnValue(selectChain);
selectChain.leftJoin.mockReturnValue(selectChain);
selectChain.where.mockReturnValue(selectChain);
selectChain.orderBy.mockReturnValue(selectChain);

// Single-arg shims keep the `db.select(args)` and `db.insert(args)` call
// signatures honest; the args aren't introspected so they're prefixed `_`.
// eslint-disable-next-line @typescript-eslint/no-unused-vars
const selectMock = vi.fn((_arg?: unknown) => selectChain);

const insertReturning = vi.fn();
const insertValues = vi.fn(() => ({ returning: insertReturning }));
// eslint-disable-next-line @typescript-eslint/no-unused-vars
const insertMock = vi.fn((_arg?: unknown) => ({ values: insertValues }));

vi.mock("@/db", () => ({
  db: {
    query: {
      portfolios: {
        findFirst: (...args: unknown[]) => portfolioFindFirst(...args),
      },
      transactions: {
        findFirst: (...args: unknown[]) => transactionFindFirst(...args),
      },
    },
    select: (arg?: unknown) => selectMock(arg),
    insert: (arg?: unknown) => insertMock(arg),
  },
}));

import {
  createPortfolio,
  getPortfolioAssets,
  getPortfolioStats,
  getPortfolioTransactions,
  getTransactionCurrentValue,
  getUserPortfolio,
} from "./portfolio-service";
import type {
  InvestmentMethod,
  PortfolioAsset,
} from "@/types/portfolio";

const USER_ID = "00000000-0000-0000-0000-000000000001";
const PORTFOLIO_ID = "00000000-0000-0000-0000-000000000010";
const METHOD_A = "00000000-0000-0000-0000-0000000000aa";
const METHOD_B = "00000000-0000-0000-0000-0000000000bb";

function makeMethod(id: string, name: string): InvestmentMethod {
  return {
    id,
    name,
    description: null,
    author: "system",
    riskLevel: "Low",
    monthlyRoi: "1.0",
    enabled: true,
    createdAt: new Date(),
  } as unknown as InvestmentMethod;
}

beforeEach(() => {
  selectResult = [];
});

afterEach(() => {
  vi.clearAllMocks();
  // Restore the chain wiring after clearAllMocks reset implementations.
  selectChain.from.mockReturnValue(selectChain);
  selectChain.leftJoin.mockReturnValue(selectChain);
  selectChain.where.mockReturnValue(selectChain);
  selectChain.orderBy.mockReturnValue(selectChain);
  selectMock.mockImplementation(() => selectChain);
  insertValues.mockImplementation(() => ({ returning: insertReturning }));
  insertMock.mockImplementation(() => ({ values: insertValues }));
});

// ---------- getUserPortfolio ----------

describe("getUserPortfolio", () => {
  it("returns the portfolio row when one exists", async () => {
    const row = {
      id: PORTFOLIO_ID,
      userId: USER_ID,
      name: "My Main Portfolio",
      createdAt: new Date(),
    };
    portfolioFindFirst.mockResolvedValueOnce(row);

    const result = await getUserPortfolio(USER_ID);

    expect(result).toEqual(row);
    expect(portfolioFindFirst).toHaveBeenCalledOnce();
  });

  it("returns null when no portfolio is found", async () => {
    portfolioFindFirst.mockResolvedValueOnce(undefined);

    const result = await getUserPortfolio(USER_ID);

    expect(result).toBeNull();
  });
});

// ---------- createPortfolio ----------

describe("createPortfolio", () => {
  it("inserts with the supplied name", async () => {
    const row = {
      id: PORTFOLIO_ID,
      userId: USER_ID,
      name: "Crypto Stash",
      createdAt: new Date(),
    };
    insertReturning.mockResolvedValueOnce([row]);

    const result = await createPortfolio(USER_ID, "Crypto Stash");

    expect(result).toEqual(row);
    expect(insertMock).toHaveBeenCalledOnce();
    expect(insertValues).toHaveBeenCalledWith({
      userId: USER_ID,
      name: "Crypto Stash",
    });
  });

  it("falls back to 'My Main Portfolio' when no name is provided", async () => {
    insertReturning.mockResolvedValueOnce([
      {
        id: PORTFOLIO_ID,
        userId: USER_ID,
        name: "My Main Portfolio",
        createdAt: new Date(),
      },
    ]);

    await createPortfolio(USER_ID);

    expect(insertValues).toHaveBeenCalledWith({
      userId: USER_ID,
      name: "My Main Portfolio",
    });
  });
});

// ---------- getPortfolioStats ----------

describe("getPortfolioStats", () => {
  it("returns all zeros when there are no approved buy transactions", async () => {
    selectResult = [];

    const stats = await getPortfolioStats(PORTFOLIO_ID);

    expect(stats).toEqual({
      totalValue: 0,
      costBasis: 0,
      totalWithdrawn: 0,
      allTimeProfit: 0,
      allTimeProfitPercentage: 0,
      totalInvestmentMethods: 0,
      activeTransactions: 0,
    });
  });

  it("sums initial + current value across approved buys", async () => {
    selectResult = [
      {
        initialValue: "1000.00",
        currentValue: "1100.00",
        investmentMethodId: METHOD_A,
        status: "approved",
        type: "buy",
      },
      {
        initialValue: "500.00",
        currentValue: "600.00",
        investmentMethodId: METHOD_B,
        status: "approved",
        type: "buy",
      },
    ];

    const stats = await getPortfolioStats(PORTFOLIO_ID);

    expect(stats.totalValue).toBe(1700);
    expect(stats.costBasis).toBe(1500);
    expect(stats.allTimeProfit).toBe(200);
    // 200 / 1500 * 100 ≈ 13.333
    expect(stats.allTimeProfitPercentage).toBeCloseTo((200 / 1500) * 100, 5);
    expect(stats.totalInvestmentMethods).toBe(2);
    expect(stats.activeTransactions).toBe(2);
  });

  it("excludes closed transactions from method count + active count", async () => {
    selectResult = [
      {
        initialValue: "1000.00",
        currentValue: "1100.00",
        investmentMethodId: METHOD_A,
        status: "approved",
        type: "buy",
      },
      {
        initialValue: "200.00",
        currentValue: "0.00",
        investmentMethodId: METHOD_B,
        status: "closed",
        type: "buy",
      },
    ];

    const stats = await getPortfolioStats(PORTFOLIO_ID);

    // costBasis/totalValue still include the closed row (matches implementation:
    // only the uniqueMethods + activeTransactions filters drop "closed").
    expect(stats.costBasis).toBe(1200);
    expect(stats.totalValue).toBe(1100);
    expect(stats.totalInvestmentMethods).toBe(1);
    expect(stats.activeTransactions).toBe(1);
  });

  it("treats null initialValue / currentValue as 0", async () => {
    selectResult = [
      {
        initialValue: null,
        currentValue: null,
        investmentMethodId: METHOD_A,
        status: "approved",
        type: "buy",
      },
    ];

    const stats = await getPortfolioStats(PORTFOLIO_ID);

    expect(stats.totalValue).toBe(0);
    expect(stats.costBasis).toBe(0);
    expect(stats.allTimeProfitPercentage).toBe(0);
  });
});

// ---------- getPortfolioTransactions ----------

describe("getPortfolioTransactions", () => {
  it("filters out rows where the join did not match an investment method", async () => {
    const method = makeMethod(METHOD_A, "Stocks");
    selectResult = [
      {
        id: "tx-1",
        type: "buy",
        amount: "100",
        fee: "0",
        total: "100",
        initialValue: "100",
        currentValue: "110",
        date: new Date("2026-01-01"),
        status: "approved",
        notes: null,
        investmentMethod: method,
      },
      {
        id: "tx-2",
        type: "buy",
        amount: "50",
        fee: "0",
        total: "50",
        initialValue: "50",
        currentValue: "50",
        date: new Date("2026-02-01"),
        status: "approved",
        notes: null,
        // No matching investment method (orphan / disabled method).
        investmentMethod: null,
      },
    ];

    const result = await getPortfolioTransactions(PORTFOLIO_ID);

    expect(result).toHaveLength(1);
    expect(result[0].id).toBe("tx-1");
    expect(result[0].investmentMethod).toEqual(method);
  });

  it("returns an empty array when there are no transactions", async () => {
    selectResult = [];
    await expect(getPortfolioTransactions(PORTFOLIO_ID)).resolves.toEqual([]);
  });
});

// ---------- getPortfolioAssets ----------

describe("getPortfolioAssets", () => {
  it("returns an empty array when there are no transactions", async () => {
    selectResult = [];
    await expect(getPortfolioAssets(PORTFOLIO_ID)).resolves.toEqual([]);
  });

  it("groups by investment method and accumulates totals across approved buys", async () => {
    const methodA = makeMethod(METHOD_A, "Stocks");
    selectResult = [
      {
        investmentMethodId: METHOD_A,
        type: "buy",
        amount: "1000",
        total: "1000",
        initialValue: "1000",
        currentValue: "1100",
        status: "approved",
        investmentMethod: methodA,
      },
      {
        investmentMethodId: METHOD_A,
        type: "buy",
        amount: "500",
        total: "500",
        initialValue: "500",
        currentValue: "600",
        status: "approved",
        investmentMethod: methodA,
      },
    ];

    const assets = await getPortfolioAssets(PORTFOLIO_ID);

    expect(assets).toHaveLength(1);
    const asset = assets[0];
    expect(asset.investmentMethod.id).toBe(METHOD_A);
    expect(asset.totalInvested).toBe(1500);
    expect(asset.holdingAmount).toBe(1700);
    expect(asset.approvedAmount).toBe(1700);
    expect(asset.profitLoss).toBe(200);
    expect(asset.profitLossPercentage).toBeCloseTo((200 / 1500) * 100, 5);
    expect(asset.hasPendingTransactions).toBe(false);
    expect(asset.pendingAmount).toBe(0);
    expect(asset.totalWithdrawn).toBe(0);
  });

  it("tracks withdrawals separately from holdings", async () => {
    const methodA = makeMethod(METHOD_A, "Stocks");
    selectResult = [
      {
        investmentMethodId: METHOD_A,
        type: "buy",
        amount: "1000",
        total: "1000",
        initialValue: "1000",
        currentValue: "1500",
        status: "approved",
        investmentMethod: methodA,
      },
      {
        investmentMethodId: METHOD_A,
        type: "withdrawal",
        amount: "200",
        total: "200",
        initialValue: null,
        currentValue: null,
        status: "approved",
        investmentMethod: methodA,
      },
    ];

    const [asset] = await getPortfolioAssets(PORTFOLIO_ID);

    expect(asset.totalWithdrawn).toBe(200);
    expect(asset.holdingAmount).toBe(1500); // withdrawals do not subtract here
    expect(asset.totalInvested).toBe(1000);
  });

  it("flags pending buys with hasPendingTransactions and accumulates pendingAmount", async () => {
    const methodA = makeMethod(METHOD_A, "Stocks");
    selectResult = [
      {
        investmentMethodId: METHOD_A,
        type: "buy",
        amount: "1000",
        total: "1000",
        initialValue: "1000",
        currentValue: "1000",
        status: "approved",
        investmentMethod: methodA,
      },
      {
        investmentMethodId: METHOD_A,
        type: "buy",
        amount: "300",
        total: "300",
        initialValue: "300",
        currentValue: "300",
        status: "pending",
        investmentMethod: methodA,
      },
      {
        investmentMethodId: METHOD_A,
        type: "withdrawal",
        amount: "50",
        total: "50",
        initialValue: null,
        currentValue: null,
        status: "pending",
        investmentMethod: methodA,
      },
    ];

    const [asset] = await getPortfolioAssets(PORTFOLIO_ID);

    expect(asset.hasPendingTransactions).toBe(true);
    // pending buy adds 300, pending withdrawal subtracts 50.
    expect(asset.pendingAmount).toBe(250);
  });

  it("creates one bucket per investment method", async () => {
    const methodA = makeMethod(METHOD_A, "Stocks");
    const methodB = makeMethod(METHOD_B, "Bonds");
    selectResult = [
      {
        investmentMethodId: METHOD_A,
        type: "buy",
        amount: "100",
        total: "100",
        initialValue: "100",
        currentValue: "100",
        status: "approved",
        investmentMethod: methodA,
      },
      {
        investmentMethodId: METHOD_B,
        type: "buy",
        amount: "200",
        total: "200",
        initialValue: "200",
        currentValue: "250",
        status: "approved",
        investmentMethod: methodB,
      },
    ];

    const assets = await getPortfolioAssets(PORTFOLIO_ID);

    expect(assets).toHaveLength(2);
    const byId: Record<string, PortfolioAsset> = Object.fromEntries(
      assets.map((a) => [a.investmentMethod.id, a])
    );
    expect(byId[METHOD_A].holdingAmount).toBe(100);
    expect(byId[METHOD_B].holdingAmount).toBe(250);
  });

  it("filters out methods with zero holding AND zero pending", async () => {
    const methodA = makeMethod(METHOD_A, "Stocks");
    selectResult = [
      // Approved withdrawal only — no holding, no pending → should be dropped.
      {
        investmentMethodId: METHOD_A,
        type: "withdrawal",
        amount: "100",
        total: "100",
        initialValue: null,
        currentValue: null,
        status: "approved",
        investmentMethod: methodA,
      },
    ];

    const assets = await getPortfolioAssets(PORTFOLIO_ID);

    expect(assets).toEqual([]);
  });

  it("skips rows where the joined investment method is null", async () => {
    selectResult = [
      {
        investmentMethodId: METHOD_A,
        type: "buy",
        amount: "100",
        total: "100",
        initialValue: "100",
        currentValue: "100",
        status: "approved",
        investmentMethod: null,
      },
    ];

    const assets = await getPortfolioAssets(PORTFOLIO_ID);
    expect(assets).toEqual([]);
  });
});

// ---------- getTransactionCurrentValue ----------

describe("getTransactionCurrentValue", () => {
  it("returns null when no transaction is found", async () => {
    transactionFindFirst.mockResolvedValueOnce(undefined);
    const result = await getTransactionCurrentValue("missing");
    expect(result).toBeNull();
  });

  it("returns null when the transaction is not a buy", async () => {
    transactionFindFirst.mockResolvedValueOnce({
      id: "tx-1",
      type: "withdrawal",
      initialValue: "100",
      currentValue: "100",
    });

    const result = await getTransactionCurrentValue("tx-1");
    expect(result).toBeNull();
  });

  it("computes growth and growthPercentage from initial vs current value", async () => {
    transactionFindFirst.mockResolvedValueOnce({
      id: "tx-1",
      type: "buy",
      initialValue: "1000",
      currentValue: "1250",
    });

    const result = await getTransactionCurrentValue("tx-1");

    expect(result).toEqual({
      initialValue: 1000,
      currentValue: 1250,
      growth: 250,
      growthPercentage: 25,
    });
  });

  it("treats null initial/current as 0 and avoids div-by-zero", async () => {
    transactionFindFirst.mockResolvedValueOnce({
      id: "tx-1",
      type: "buy",
      initialValue: null,
      currentValue: null,
    });

    const result = await getTransactionCurrentValue("tx-1");

    expect(result).toEqual({
      initialValue: 0,
      currentValue: 0,
      growth: 0,
      growthPercentage: 0,
    });
  });
});
