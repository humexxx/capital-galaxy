import { db } from "@/db";
import { portfolios, transactions, investmentMethods } from "@/db/schema";
import { eq, and, sql } from "drizzle-orm";
import type { PortfolioTransaction, PortfolioStats, PortfolioAsset } from "@/types/portfolio";

export async function getUserPortfolio(userId: string) {
  const portfolio = await db.query.portfolios.findFirst({
    where: eq(portfolios.userId, userId),
  });
  return portfolio || null;
}

export async function createPortfolio(userId: string, name?: string) {
  const [portfolio] = await db
    .insert(portfolios)
    .values({
      userId,
      name: name || "My Main Portfolio",
    })
    .returning();
  return portfolio;
}

export async function getPortfolioStats(portfolioId: string): Promise<PortfolioStats> {
  // Get all approved buy transactions to calculate currentValue (totalValue) and initialValue (costBasis)
  const buyTransactions = await db
    .select()
    .from(transactions)
    .where(
      and(
        eq(transactions.portfolioId, portfolioId),
        eq(transactions.status, "approved"),
        eq(transactions.type, "buy")
      )
    );

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

  const allTimeProfit = totalValue - costBasis;
  const allTimeProfitPercentage = costBasis > 0 ? (allTimeProfit / costBasis) * 100 : 0;

  return {
    totalValue,
    costBasis,
    allTimeProfit,
    allTimeProfitPercentage,
  };
}

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

export async function getPortfolioAssets(portfolioId: string): Promise<PortfolioAsset[]> {
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
    const profitLoss = asset.holdingAmount - asset.totalInvested;
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
}

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
