import "server-only";

import { cache } from "react";

import { db } from "@/db";
import { portfolios, transactions, investmentMethods, users, portfolioSnapshots } from "@/db/schema";
import { eq, and, inArray, ne, desc } from "drizzle-orm";
import type { Portfolio, PortfolioTransaction, PortfolioStats, PortfolioAsset, MethodInvestors, TransactionStatus, TransactionType } from "@/types/portfolio";
import type { ManagedContribution } from "@/lib/finance/managed-capital";

/**
 * Request-cached: the plans pages and the projection helpers each look the
 * portfolio up on their own, several times per render.
 */
export const getUserPortfolio = cache(async function getUserPortfolio(
  userId: string
): Promise<Portfolio | null> {
  const portfolio = await db.query.portfolios.findFirst({
    where: eq(portfolios.userId, userId),
  });
  return portfolio || null;
});

export async function createPortfolio(userId: string, name?: string): Promise<Portfolio> {
  const [portfolio] = await db
    .insert(portfolios)
    .values({
      userId,
      name: name || "My Main Portfolio",
    })
    .returning();
  return portfolio;
}

export const getPortfolioStats = cache(async function getPortfolioStats(
  portfolioId: string
): Promise<PortfolioStats> {
  // Every approved row: buys carry the holding and the cost basis, withdrawals
  // the money already taken out.
  const approvedTransactions = await db
    .select()
    .from(transactions)
    .where(
      and(eq(transactions.portfolioId, portfolioId), eq(transactions.status, "approved"))
    );
  const buyTransactions = approvedTransactions.filter((t) => t.type === "buy");
  const totalWithdrawn = approvedTransactions
    .filter((t) => t.type === "withdrawal")
    .reduce((sum, t) => sum + parseFloat(t.total || "0"), 0);

  // Calculate totalValue (sum of currentValue)
  const totalValue = buyTransactions.reduce(
    (sum, t) => sum + parseFloat(t.currentValue || "0"),
    0
  );

  // Calculate costBasis (sum of initialValue)
  const costBasis = buyTransactions.reduce(
    (sum, t) => sum + parseFloat(t.initialValue || "0"),
    0
  );

  // A withdrawal lowers the holding but not what was put in; without adding
  // it back a buy that grew and was partly cashed out read as a loss.
  const allTimeProfit = totalValue + totalWithdrawn - costBasis;
  const allTimeProfitPercentage = costBasis > 0 ? (allTimeProfit / costBasis) * 100 : 0;

  // Get unique investment methods count
  const uniqueInvestmentMethods = new Set(
    buyTransactions
      .filter(t => t.status !== "closed")
      .map(t => t.investmentMethodId)
  ).size;

  // Count active transactions (approved buys that are not closed)
  const activeTransactionsCount = buyTransactions.filter(t => t.status !== "closed").length;

  return {
    totalValue,
    costBasis,
    totalWithdrawn,
    allTimeProfit,
    allTimeProfitPercentage,
    totalInvestmentMethods: uniqueInvestmentMethods,
    activeTransactions: activeTransactionsCount,
  };
});

export async function getPortfolioTransactions(portfolioId: string): Promise<PortfolioTransaction[]> {
  const allTransactions = await db
    .select({
      id: transactions.id,
      type: transactions.type,
      amount: transactions.amount,
      fee: transactions.fee,
      total: transactions.total,
      initialValue: transactions.initialValue,
      currentValue: transactions.currentValue,
      date: transactions.date,
      status: transactions.status,
      notes: transactions.notes,
      investmentMethod: investmentMethods,
    })
    .from(transactions)
    .leftJoin(
      investmentMethods,
      eq(transactions.investmentMethodId, investmentMethods.id)
    )
    .where(eq(transactions.portfolioId, portfolioId))
    .orderBy(transactions.date);

  return allTransactions.filter(
    (t): t is PortfolioTransaction => t.investmentMethod !== null
  );
}

export const getPortfolioAssets = cache(async function getPortfolioAssets(
  portfolioId: string
): Promise<PortfolioAsset[]> {
  const allTransactions = await db
    .select({
      investmentMethodId: transactions.investmentMethodId,
      type: transactions.type,
      amount: transactions.amount,
      total: transactions.total,
      initialValue: transactions.initialValue,
      currentValue: transactions.currentValue,
      status: transactions.status,
      investmentMethod: investmentMethods,
    })
    .from(transactions)
    .leftJoin(
      investmentMethods,
      eq(transactions.investmentMethodId, investmentMethods.id)
    )
    .where(eq(transactions.portfolioId, portfolioId));

  const groupedAssets = allTransactions.reduce<Record<string, PortfolioAsset>>((acc, transaction) => {
    if (!transaction.investmentMethod) return acc;

    const methodId = transaction.investmentMethodId;
    if (!acc[methodId]) {
      acc[methodId] = {
        investmentMethod: transaction.investmentMethod,
        totalInvested: 0,
        totalWithdrawn: 0,
        holdingAmount: 0,
        approvedAmount: 0,
        pendingAmount: 0,
        hasPendingTransactions: false,
        profitLoss: 0,
        profitLossPercentage: 0,
      };
    }

    const amount = parseFloat(transaction.total);
    
    if (transaction.status === "approved") {
      if (transaction.type === "buy") {
        const initialValue = parseFloat(transaction.initialValue || "0");
        const currentValue = parseFloat(transaction.currentValue || "0");
        
        acc[methodId].totalInvested += initialValue;
        acc[methodId].holdingAmount += currentValue;
        acc[methodId].approvedAmount += currentValue;
      } else if (transaction.type === "withdrawal") {
        acc[methodId].totalWithdrawn += amount;
      }
    } else if (transaction.status === "pending") {
      acc[methodId].hasPendingTransactions = true;
      if (transaction.type === "buy") {
        acc[methodId].pendingAmount += amount;
      } else if (transaction.type === "withdrawal") {
        acc[methodId].pendingAmount -= amount;
      }
    }

    return acc;
  }, {} as Record<string, PortfolioAsset>);

  // Calculate profit/loss for each asset
  const assets = Object.values(groupedAssets).map((asset) => {
      const profitLoss = asset.holdingAmount + asset.totalWithdrawn - asset.totalInvested;
    const profitLossPercentage = asset.totalInvested > 0 
      ? (profitLoss / asset.totalInvested) * 100 
      : 0;
    
    return {
      ...asset,
      profitLoss,
      profitLossPercentage,
    };
  });

  return assets.filter((asset) => asset.holdingAmount > 0 || asset.pendingAmount > 0);
});

/**
 * Get current value and growth for a specific transaction
 */
export async function getTransactionCurrentValue(transactionId: string) {
  const transaction = await db.query.transactions.findFirst({
    where: eq(transactions.id, transactionId),
  });

  if (!transaction || transaction.type !== "buy") {
    return null;
  }

  const initialValue = parseFloat(transaction.initialValue || "0");
  const currentValue = parseFloat(transaction.currentValue || "0");
  const growth = currentValue - initialValue;
  const growthPercentage = initialValue > 0 ? (growth / initialValue) * 100 : 0;

  return {
    initialValue,
    currentValue,
    growth,
    growthPercentage,
  };
}

/**
 * Who is invested in the methods a given admin owns, and how much.
 *
 * The per-investor maths mirrors `getPortfolioAssets` exactly — approved buys
 * contribute `initialValue` to invested and `currentValue` to holdings,
 * approved withdrawals accumulate separately. Diverging here would show the
 * admin a different number than the investor sees in their own portfolio,
 * which is worse than showing nothing.
 *
 * This is a READ-ONLY aggregate. It never feeds net worth: third-party capital
 * is not the admin's patrimony.
 */
export async function getMethodInvestors(
  ownerUserId: string
): Promise<MethodInvestors[]> {
  const rows = await db
    .select({
      methodId: investmentMethods.id,
      methodName: investmentMethods.name,
      methodEnabled: investmentMethods.enabled,
      investorId: users.id,
      investorEmail: users.email,
      investorName: users.fullName,
      type: transactions.type,
      status: transactions.status,
      total: transactions.total,
      initialValue: transactions.initialValue,
      currentValue: transactions.currentValue,
    })
    .from(investmentMethods)
    .leftJoin(
      transactions,
      eq(transactions.investmentMethodId, investmentMethods.id)
    )
    .leftJoin(portfolios, eq(transactions.portfolioId, portfolios.id))
    .leftJoin(users, eq(portfolios.userId, users.id))
    .where(eq(investmentMethods.ownerUserId, ownerUserId));

  const byMethod = new Map<string, MethodInvestors>();

  for (const r of rows) {
    if (!byMethod.has(r.methodId)) {
      byMethod.set(r.methodId, {
        methodId: r.methodId,
        methodName: r.methodName,
        enabled: r.methodEnabled,
        investors: [],
        totalInvested: 0,
        totalHolding: 0,
      });
    }
    // A method with no transactions still belongs in the list — "nobody has
    // invested yet" is information the owner wants.
    if (!r.investorId || r.status !== "approved") continue;

    const method = byMethod.get(r.methodId)!;
    let investor = method.investors.find((i) => i.userId === r.investorId);
    if (!investor) {
      investor = {
        userId: r.investorId,
        email: r.investorEmail,
        fullName: r.investorName,
        invested: 0,
        holding: 0,
        withdrawn: 0,
      };
      method.investors.push(investor);
    }

    if (r.type === "buy") {
      investor.invested += parseFloat(r.initialValue || "0");
      investor.holding += parseFloat(r.currentValue || "0");
    } else if (r.type === "withdrawal") {
      investor.withdrawn += parseFloat(r.total || "0");
    }
  }

  for (const method of byMethod.values()) {
    method.investors.sort((a, b) => b.holding - a.holding);
    method.totalInvested = method.investors.reduce((s, i) => s + i.invested, 0);
    method.totalHolding = method.investors.reduce((s, i) => s + i.holding, 0);
  }

  return [...byMethod.values()].sort((a, b) => b.totalHolding - a.totalHolding);
}

/**
 * Flat list of approved buys across the methods an admin runs, ready for the
 * pure aggregator in `lib/finance/managed-capital`.
 *
 * Rows rather than a finished series: the card filters by method and investor
 * in the browser, so it needs the detail. The aggregation itself lives in one
 * pure function used by both sides.
 *
 * Note this is CONTRIBUTED capital plus a present-day holding per row — there
 * is no per-investor historical valuation in the schema, so nothing here can
 * honestly be drawn as a value curve over time.
 */
export async function getManagedContributions(
  ownerUserId: string
): Promise<ManagedContribution[]> {
  const rows = await db
    .select({
      date: transactions.date,
      initialValue: transactions.initialValue,
      currentValue: transactions.currentValue,
      methodId: investmentMethods.id,
      methodName: investmentMethods.name,
      investorId: portfolios.userId,
      investorName: users.fullName,
      investorEmail: users.email,
    })
    .from(investmentMethods)
    .innerJoin(
      transactions,
      eq(transactions.investmentMethodId, investmentMethods.id)
    )
    .innerJoin(portfolios, eq(transactions.portfolioId, portfolios.id))
    .innerJoin(users, eq(portfolios.userId, users.id))
    .where(
      and(
        eq(investmentMethods.ownerUserId, ownerUserId),
        eq(transactions.status, "approved"),
        eq(transactions.type, "buy")
      )
    );

  return rows.map((r) => ({
    date: r.date.toISOString().slice(0, 10),
    methodId: r.methodId,
    methodName: r.methodName,
    investorId: r.investorId,
    investorName: r.investorName || r.investorEmail || "Unknown user",
    isOwn: r.investorId === ownerUserId,
    contributed: parseFloat(r.initialValue || "0"),
    holding: parseFloat(r.currentValue || "0"),
  }));
}

/**
 * Total value over time across every portfolio that holds one of this admin's
 * methods — the owner's own included.
 *
 * Built from real `portfolio_snapshots`, not re-simulated, so the curve is
 * what was actually recorded.
 *
 * CAVEAT, and it matters: a snapshot is a whole portfolio's value, not the
 * slice held in this admin's methods. An investor who also holds something
 * else would be over-counted here. That is exact today (every investor holds
 * only these methods) but stops being exact the moment it isn't — the fix is
 * per-method snapshots, which the schema does not have.
 */
export async function getManagedPerformanceSeries(
  ownerUserId: string
): Promise<{ date: string; value: number }[]> {
  const holders = await db
    .selectDistinct({ portfolioId: transactions.portfolioId })
    .from(transactions)
    .innerJoin(
      investmentMethods,
      eq(transactions.investmentMethodId, investmentMethods.id)
    )
    .where(
      and(
        eq(investmentMethods.ownerUserId, ownerUserId),
        eq(transactions.status, "approved")
      )
    );

  if (holders.length === 0) return [];

  const ids = holders.map((h) => h.portfolioId);
  const snaps = await db
    .select({
      date: portfolioSnapshots.date,
      value: portfolioSnapshots.totalValue,
      portfolioId: portfolioSnapshots.portfolioId,
    })
    .from(portfolioSnapshots)
    .where(inArray(portfolioSnapshots.portfolioId, ids));

  // Portfolios are snapshotted independently, so a given day may only have
  // rows for some of them. Carry each portfolio's last known value forward
  // rather than letting the total dip on days a portfolio didn't report.
  const byDay = new Map<string, Map<string, number>>();
  for (const s of snaps) {
    const day = s.date.toISOString().slice(0, 10);
    if (!byDay.has(day)) byDay.set(day, new Map());
    byDay.get(day)!.set(s.portfolioId, parseFloat(s.value));
  }

  const latest = new Map<string, number>();
  return [...byDay.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([day, values]) => {
      for (const [pid, v] of values) latest.set(pid, v);
      let total = 0;
      for (const v of latest.values()) total += v;
      return { date: day, value: total };
    });
}

export type InvestorTransaction = {
  id: string;
  date: Date;
  methodName: string;
  investorId: string;
  investorName: string;
  investorEmail: string | null;
  type: TransactionType;
  status: TransactionStatus;
  total: string;
  initialValue: string | null;
  currentValue: string | null;
};

/**
 * Every transaction other people made in the methods this user runs.
 *
 * Unlike `getManagedContributions` this keeps pending and rejected rows: the
 * owner needs to see what is waiting on them, not only what already settled.
 * The owner's OWN transactions are excluded because they already appear in
 * their personal history — listing them twice would double the totals a reader
 * adds up by eye.
 */
export async function getInvestorTransactions(
  ownerUserId: string
): Promise<InvestorTransaction[]> {
  const rows = await db
    .select({
      id: transactions.id,
      date: transactions.date,
      methodName: investmentMethods.name,
      investorId: users.id,
      investorName: users.fullName,
      investorEmail: users.email,
      type: transactions.type,
      status: transactions.status,
      total: transactions.total,
      initialValue: transactions.initialValue,
      currentValue: transactions.currentValue,
    })
    .from(investmentMethods)
    .innerJoin(transactions, eq(transactions.investmentMethodId, investmentMethods.id))
    .innerJoin(portfolios, eq(transactions.portfolioId, portfolios.id))
    .innerJoin(users, eq(portfolios.userId, users.id))
    .where(
      and(
        eq(investmentMethods.ownerUserId, ownerUserId),
        ne(portfolios.userId, ownerUserId)
      )
    )
    .orderBy(desc(transactions.date));

  return rows.map((r) => ({
    ...r,
    date: new Date(r.date),
    investorName: r.investorName || r.investorEmail?.split("@")[0] || "Unknown",
  }));
}
