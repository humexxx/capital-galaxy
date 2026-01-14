import { db } from "@/db";
import { portfolios, transactions, investmentMethods } from "@/db/schema";
import { eq, and, sql } from "drizzle-orm";

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

export async function getPortfolioStats(portfolioId: string) {
  const approvedTransactions = await db
    .select()
    .from(transactions)
    .where(
      and(
        eq(transactions.portfolioId, portfolioId),
        eq(transactions.status, "approved")
      )
    );

  const totalInvested = approvedTransactions
    .filter((t) => t.type === "buy")
    .reduce((sum, t) => sum + parseFloat(t.total), 0);

  const totalWithdrawn = approvedTransactions
    .filter((t) => t.type === "withdrawal")
    .reduce((sum, t) => sum + parseFloat(t.total), 0);

  const costBasis = totalInvested - totalWithdrawn;

  return {
    totalValue: costBasis,
    costBasis,
    allTimeProfit: 0,
    allTimeProfitPercentage: 0,
  };
}

export async function getPortfolioTransactions(portfolioId: string) {
  const allTransactions = await db
    .select({
      id: transactions.id,
      type: transactions.type,
      amount: transactions.amount,
      fee: transactions.fee,
      total: transactions.total,
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

  return allTransactions.filter((t) => t.investmentMethod !== null);
}

export async function getPortfolioAssets(portfolioId: string) {
  const allTransactions = await db
    .select({
      investmentMethodId: transactions.investmentMethodId,
      type: transactions.type,
      amount: transactions.amount,
      total: transactions.total,
      status: transactions.status,
      investmentMethod: investmentMethods,
    })
    .from(transactions)
    .leftJoin(
      investmentMethods,
      eq(transactions.investmentMethodId, investmentMethods.id)
    )
    .where(eq(transactions.portfolioId, portfolioId));

  const groupedAssets = allTransactions.reduce((acc, transaction) => {
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
      };
    }

    const amount = parseFloat(transaction.total);
    
    if (transaction.status === "approved") {
      if (transaction.type === "buy") {
        acc[methodId].totalInvested += amount;
        acc[methodId].holdingAmount += amount;
        acc[methodId].approvedAmount += amount;
      } else if (transaction.type === "withdrawal") {
        acc[methodId].totalWithdrawn += amount;
        acc[methodId].holdingAmount -= amount;
        acc[methodId].approvedAmount -= amount;
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
  }, {} as Record<string, any>);

  return Object.values(groupedAssets).filter((asset: any) => asset.holdingAmount > 0 || asset.pendingAmount > 0);
}
