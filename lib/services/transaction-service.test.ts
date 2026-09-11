import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// transaction-service mixes raw Drizzle chains (insert/update/select), the
// query builder (`db.query.transactions.findFirst`), and a transactional
// callback. We mock all three shapes plus the two sibling services it pulls
// in (auth, portfolio) so the unit under test can run without a real DB.

// Typed as (...args: unknown[]) => unknown so the inline mock wrappers below
// can forward arbitrary arguments without TS complaining about spread types.
const findFirst = vi.fn<(...args: unknown[]) => unknown>();
const insertReturning = vi.fn<(...args: unknown[]) => unknown>();
const insertValues = vi.fn<(...args: unknown[]) => unknown>(() => ({
  returning: insertReturning,
}));
const insertMock = vi.fn<(...args: unknown[]) => unknown>(() => ({
  values: insertValues,
}));

const selectWhere = vi.fn<(...args: unknown[]) => unknown>();
const selectFrom = vi.fn<(...args: unknown[]) => unknown>(() => ({
  where: selectWhere,
}));
const selectMock = vi.fn<(...args: unknown[]) => unknown>(() => ({
  from: selectFrom,
}));

const updateWhere = vi.fn<(...args: unknown[]) => unknown>();
const updateSet = vi.fn<(...args: unknown[]) => unknown>(() => ({
  where: updateWhere,
}));
const updateMock = vi.fn<(...args: unknown[]) => unknown>(() => ({
  set: updateSet,
}));

// tx (transaction callback) gets its own update + findFirst captures. The
// pending-scoped updates end in `.returning()`, which resolves to one row so
// the "somebody else settled it first" guard stays quiet by default.
const txUpdateReturning = vi.fn<(...args: unknown[]) => unknown>(() =>
  Promise.resolve([{ id: "tx-1" }])
);
const txUpdateWhere = vi.fn<(...args: unknown[]) => unknown>(() => ({
  returning: txUpdateReturning,
}));
const txUpdateSet = vi.fn<(...args: unknown[]) => unknown>(() => ({
  where: txUpdateWhere,
}));
const txUpdate = vi.fn<(...args: unknown[]) => unknown>(() => ({
  set: txUpdateSet,
}));
const txFindFirst = vi.fn<(...args: unknown[]) => unknown>();
const transactionMock = vi.fn(
  (cb: (tx: unknown) => Promise<unknown>) =>
    cb({
      update: txUpdate,
      query: { transactions: { findFirst: txFindFirst } },
    })
);

vi.mock("@/db", () => ({
  db: {
    insert: (...args: unknown[]) => insertMock(...args),
    select: (...args: unknown[]) => selectMock(...args),
    update: (...args: unknown[]) => updateMock(...args),
    transaction: (cb: (tx: unknown) => Promise<unknown>) => transactionMock(cb),
    query: {
      transactions: {
        findFirst: (...args: unknown[]) => findFirst(...args),
      },
    },
  },
}));

const getUserRoleMock = vi.fn<(...args: unknown[]) => unknown>();
vi.mock("./auth-server", () => ({
  getUserRole: (...args: unknown[]) => getUserRoleMock(...args),
}));

const getUserPortfolioMock = vi.fn<(...args: unknown[]) => unknown>();
const createPortfolioMock = vi.fn<(...args: unknown[]) => unknown>();
vi.mock("./portfolio-service", () => ({
  getUserPortfolio: (...args: unknown[]) => getUserPortfolioMock(...args),
  createPortfolio: (...args: unknown[]) => createPortfolioMock(...args),
}));

import {
  approveTransactionById,
  calculateTotal,
  createTransaction,
  getPortfolioTransactions,
  rejectTransactionById,
} from "./transaction-service";
import type { Transaction } from "@/types";
import type { Portfolio } from "@/types/portfolio";

const USER_ID = "00000000-0000-0000-0000-000000000001";
const ADMIN_ID = "00000000-0000-0000-0000-0000000000aa";
const PORTFOLIO_ID = "00000000-0000-0000-0000-0000000000b1";
const INVESTMENT_METHOD_ID = "00000000-0000-0000-0000-0000000000c1";
const TX_ID = "00000000-0000-0000-0000-0000000000d1";
const SOURCE_TX_ID = "00000000-0000-0000-0000-0000000000d2";

function makePortfolio(overrides: Partial<Portfolio> = {}): Portfolio {
  return {
    id: PORTFOLIO_ID,
    userId: USER_ID,
    name: "Default",
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  } as unknown as Portfolio;
}

function makeTransaction(overrides: Partial<Transaction> & Record<string, unknown> = {}): Transaction {
  return {
    id: TX_ID,
    portfolioId: PORTFOLIO_ID,
    investmentMethodId: INVESTMENT_METHOD_ID,
    type: "buy",
    amount: "1000.00",
    fee: "0",
    total: "1000.00",
    initialValue: null,
    currentValue: null,
    sourceTransactionId: null,
    withdrawalTransactionIds: null,
    date: new Date("2026-01-15T00:00:00Z"),
    notes: null,
    status: "pending",
    approvedAt: null,
    approvedBy: null,
    rejectedAt: null,
    rejectedBy: null,
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  } as unknown as Transaction;
}

beforeEach(() => {
  // Default chain resolutions so each test can override only what it needs.
  insertReturning.mockResolvedValue([makeTransaction()]);
  insertValues.mockReturnValue({ returning: insertReturning });
  insertMock.mockReturnValue({ values: insertValues });

  selectWhere.mockResolvedValue([]);
  selectFrom.mockReturnValue({ where: selectWhere });
  selectMock.mockReturnValue({ from: selectFrom });

  updateWhere.mockResolvedValue(undefined);
  updateSet.mockReturnValue({ where: updateWhere });
  updateMock.mockReturnValue({ set: updateSet });

  txUpdateReturning.mockResolvedValue([{ id: TX_ID }]);
  txUpdateWhere.mockReturnValue({ returning: txUpdateReturning });
  txUpdateSet.mockReturnValue({ where: txUpdateWhere });
  txUpdate.mockReturnValue({ set: txUpdateSet });
});

afterEach(() => {
  vi.clearAllMocks();
});

// ---------- calculateTotal ----------

describe("calculateTotal", () => {
  it("sums amount + fee for buy-style positive amounts", () => {
    expect(calculateTotal("1000", "5")).toBe("1005.00");
    expect(calculateTotal("250.50", "0")).toBe("250.50");
  });

  it("handles negative amounts (withdrawals) by simple addition", () => {
    // Withdrawals are stored as negative amounts. Service does not flip signs.
    expect(calculateTotal("-200", "0")).toBe("-200.00");
    expect(calculateTotal("-200", "5")).toBe("-195.00");
  });

  it("always returns a 2-decimal string", () => {
    expect(calculateTotal("100", "0.1")).toBe("100.10");
    expect(calculateTotal("0", "0")).toBe("0.00");
  });
});

// ---------- createTransaction ----------

describe("createTransaction", () => {
  it("creates a pending buy transaction for the caller's own portfolio", async () => {
    getUserRoleMock.mockResolvedValueOnce("user");
    getUserPortfolioMock.mockResolvedValueOnce(makePortfolio());
    insertReturning.mockResolvedValueOnce([
      makeTransaction({ status: "pending" }),
    ]);

    const result = await createTransaction(USER_ID, USER_ID, {
      investmentMethodId: INVESTMENT_METHOD_ID,
      type: "buy",
      amount: "1000",
      date: new Date("2026-01-15T00:00:00Z"),
    });

    expect(getUserRoleMock).toHaveBeenCalledWith(USER_ID);
    expect(getUserPortfolioMock).toHaveBeenCalledWith(USER_ID);
    expect(createPortfolioMock).not.toHaveBeenCalled();
    expect(insertMock).toHaveBeenCalledOnce();

    const payload = insertValues.mock.calls[0][0] as Record<string, unknown>;
    expect(payload.portfolioId).toBe(PORTFOLIO_ID);
    expect(payload.investmentMethodId).toBe(INVESTMENT_METHOD_ID);
    expect(payload.type).toBe("buy");
    expect(payload.amount).toBe("1000");
    expect(payload.fee).toBe("0");
    expect(payload.total).toBe("1000.00");
    expect(payload.status).toBe("pending");
    // Non-admin path does not auto-set value fields or approvedAt.
    expect(payload.initialValue).toBeUndefined();
    expect(payload.currentValue).toBeUndefined();
    expect(payload.approvedAt).toBeUndefined();

    expect(result.portfolio.id).toBe(PORTFOLIO_ID);
    expect(result.transaction).toBeTruthy();
  });

  it("lazily creates a portfolio when the user does not have one yet", async () => {
    getUserRoleMock.mockResolvedValueOnce("user");
    getUserPortfolioMock.mockResolvedValueOnce(null);
    createPortfolioMock.mockResolvedValueOnce(makePortfolio());
    insertReturning.mockResolvedValueOnce([makeTransaction()]);

    await createTransaction(USER_ID, USER_ID, {
      investmentMethodId: INVESTMENT_METHOD_ID,
      type: "buy",
      amount: "500",
      date: new Date(),
    });

    expect(createPortfolioMock).toHaveBeenCalledWith(USER_ID);
    expect(insertMock).toHaveBeenCalledOnce();
  });

  it("auto-approves and sets value fields when an admin creates a buy on behalf of a user", async () => {
    getUserRoleMock.mockResolvedValueOnce("admin");
    getUserPortfolioMock.mockResolvedValueOnce(makePortfolio());
    insertReturning.mockResolvedValueOnce([
      makeTransaction({ status: "approved" }),
    ]);

    await createTransaction(USER_ID, ADMIN_ID, {
      investmentMethodId: INVESTMENT_METHOD_ID,
      type: "buy",
      amount: "750",
      date: new Date(),
    });

    const payload = insertValues.mock.calls[0][0] as Record<string, unknown>;
    expect(payload.status).toBe("approved");
    expect(payload.initialValue).toBe("750.00");
    expect(payload.currentValue).toBe("750.00");
    expect(payload.approvedAt).toBeInstanceOf(Date);
  });

  it("throws Forbidden when a non-admin tries to create for another user", async () => {
    getUserRoleMock.mockResolvedValueOnce("user");

    await expect(
      createTransaction(USER_ID, ADMIN_ID, {
        investmentMethodId: INVESTMENT_METHOD_ID,
        type: "buy",
        amount: "100",
        date: new Date(),
      })
    ).rejects.toThrow(/Forbidden/);

    expect(getUserPortfolioMock).not.toHaveBeenCalled();
    expect(insertMock).not.toHaveBeenCalled();
  });
});

// ---------- getPortfolioTransactions ----------

describe("getPortfolioTransactions", () => {
  it("selects all transactions belonging to the given portfolio", async () => {
    const rows = [makeTransaction(), makeTransaction({ id: "tx-2" })];
    selectWhere.mockResolvedValueOnce(rows);

    const result = await getPortfolioTransactions(PORTFOLIO_ID);

    expect(result).toEqual(rows);
    expect(selectMock).toHaveBeenCalledOnce();
    expect(selectFrom).toHaveBeenCalledOnce();
    expect(selectWhere).toHaveBeenCalledOnce();
  });

  it("returns an empty array when the portfolio has no transactions", async () => {
    selectWhere.mockResolvedValueOnce([]);
    await expect(getPortfolioTransactions(PORTFOLIO_ID)).resolves.toEqual([]);
  });
});

// ---------- approveTransactionById ----------

describe("approveTransactionById", () => {
  it("throws 'Transaction not found' when the id does not exist", async () => {
    findFirst.mockResolvedValueOnce(undefined);

    await expect(approveTransactionById(ADMIN_ID, TX_ID)).rejects.toThrow(
      /Transaction not found/
    );

    expect(transactionMock).not.toHaveBeenCalled();
  });

  it("refuses to approve a transaction that is no longer pending", async () => {
    // Re-approving a settled buy used to reset currentValue to the original
    // total, erasing every month of accrued interest.
    findFirst.mockResolvedValueOnce(
      makeTransaction({ type: "buy", total: "1000.00", status: "approved" })
    );

    await expect(approveTransactionById(ADMIN_ID, TX_ID)).rejects.toThrow(
      /no longer pending/
    );
    expect(transactionMock).not.toHaveBeenCalled();
  });

  it("approves a buy and seeds initial/current value from total", async () => {
    const buyTx = makeTransaction({
      type: "buy",
      total: "1000.00",
      status: "pending",
    });
    findFirst.mockResolvedValueOnce(buyTx);

    const result = await approveTransactionById(ADMIN_ID, TX_ID);

    expect(transactionMock).toHaveBeenCalledOnce();
    expect(txUpdate).toHaveBeenCalledOnce();

    const payload = txUpdateSet.mock.calls[0][0] as Record<string, unknown>;
    expect(payload.status).toBe("approved");
    expect(payload.approvedBy).toBe(ADMIN_ID);
    expect(payload.initialValue).toBe("1000.00");
    expect(payload.currentValue).toBe("1000.00");
    expect(payload.approvedAt).toBeInstanceOf(Date);

    expect(result).toEqual({
      portfolioId: PORTFOLIO_ID,
      transactionDate: buyTx.date,
    });
  });

  it("links a withdrawal to its source and decrements the source currentValue", async () => {
    // The service stores withdrawal totals as positive numbers and subtracts
    // them from the source's currentValue (see approveTransactionById).
    const withdrawalTx = makeTransaction({
      id: TX_ID,
      type: "withdrawal",
      total: "200.00",
      status: "pending",
      sourceTransactionId: SOURCE_TX_ID,
    });
    const sourceTx = makeTransaction({
      id: SOURCE_TX_ID,
      type: "buy",
      total: "1000.00",
      initialValue: "1000.00",
      currentValue: "1000.00",
      status: "approved",
    });

    findFirst.mockResolvedValueOnce(withdrawalTx);
    txFindFirst.mockResolvedValueOnce(sourceTx);

    await approveTransactionById(ADMIN_ID, TX_ID);

    // Two update() calls: one against the source, one against the withdrawal.
    expect(txUpdate).toHaveBeenCalledTimes(2);

    const sourcePayload = txUpdateSet.mock.calls[0][0] as Record<string, unknown>;
    // 1000 - 200 = 800
    expect(sourcePayload.currentValue).toBe("800.00");
    // 800 > 0 → stays approved (not closed).
    expect(sourcePayload.status).toBe("approved");
    expect(sourcePayload.withdrawalTransactionIds).toBeTruthy();

    const withdrawalPayload = txUpdateSet.mock.calls[1][0] as Record<string, unknown>;
    expect(withdrawalPayload.status).toBe("approved");
    expect(withdrawalPayload.approvedBy).toBe(ADMIN_ID);
    expect(withdrawalPayload.approvedAt).toBeInstanceOf(Date);
  });

  it("marks the source as 'closed' when the withdrawal drains it to zero", async () => {
    const withdrawalTx = makeTransaction({
      id: TX_ID,
      type: "withdrawal",
      total: "1000.00",
      sourceTransactionId: SOURCE_TX_ID,
    });
    const sourceTx = makeTransaction({
      id: SOURCE_TX_ID,
      type: "buy",
      total: "1000.00",
      initialValue: "1000.00",
      currentValue: "1000.00",
    });

    findFirst.mockResolvedValueOnce(withdrawalTx);
    txFindFirst.mockResolvedValueOnce(sourceTx);

    await approveTransactionById(ADMIN_ID, TX_ID);

    const sourcePayload = txUpdateSet.mock.calls[0][0] as Record<string, unknown>;
    expect(sourcePayload.currentValue).toBe("0.00");
    expect(sourcePayload.status).toBe("closed");
  });

  it("throws when a withdrawal has no sourceTransactionId", async () => {
    findFirst.mockResolvedValueOnce(
      makeTransaction({ type: "withdrawal", total: "100.00", sourceTransactionId: null })
    );

    await expect(approveTransactionById(ADMIN_ID, TX_ID)).rejects.toThrow(
      /source transaction/i
    );
  });

  it("throws when the source transaction lacks sufficient funds", async () => {
    findFirst.mockResolvedValueOnce(
      makeTransaction({
        type: "withdrawal",
        total: "500.00",
        sourceTransactionId: SOURCE_TX_ID,
      })
    );
    txFindFirst.mockResolvedValueOnce(
      makeTransaction({
        id: SOURCE_TX_ID,
        type: "buy",
        total: "100.00",
        currentValue: "100.00",
      })
    );

    await expect(approveTransactionById(ADMIN_ID, TX_ID)).rejects.toThrow(
      /Insufficient funds/
    );
  });
});

// ---------- rejectTransactionById ----------

describe("rejectTransactionById", () => {
  it("throws 'Transaction not found' when the id does not exist", async () => {
    findFirst.mockResolvedValueOnce(undefined);

    await expect(rejectTransactionById(ADMIN_ID, TX_ID)).rejects.toThrow(
      /Transaction not found/
    );

    expect(updateMock).not.toHaveBeenCalled();
  });

  it("refuses to reject a transaction that is already approved", async () => {
    findFirst.mockResolvedValueOnce({
      id: TX_ID,
      portfolioId: PORTFOLIO_ID,
      status: "approved",
    });

    await expect(rejectTransactionById(ADMIN_ID, TX_ID)).rejects.toThrow(
      /no longer pending/
    );
    expect(updateMock).not.toHaveBeenCalled();
  });

  it("marks the transaction rejected and returns its portfolioId", async () => {
    findFirst.mockResolvedValueOnce({
      id: TX_ID,
      portfolioId: PORTFOLIO_ID,
      status: "pending",
    });

    const result = await rejectTransactionById(ADMIN_ID, TX_ID);

    expect(updateMock).toHaveBeenCalledOnce();
    const payload = updateSet.mock.calls[0][0] as Record<string, unknown>;
    expect(payload.status).toBe("rejected");
    expect(payload.rejectedBy).toBe(ADMIN_ID);
    expect(payload.rejectedAt).toBeInstanceOf(Date);
    expect(payload.updatedAt).toBeInstanceOf(Date);

    expect(result).toEqual({ portfolioId: PORTFOLIO_ID });
  });
});
