import { db } from "@/db";
import { transactions } from "@/db/schema";
import { eq } from "drizzle-orm";
import { getUserPortfolio, createPortfolio } from "./portfolio-service";
import type { Portfolio } from "@/types/portfolio";
import type { Transaction } from "@/types";

import { TransactionInput } from "@/types/transaction"

export async function createTransaction(
  userId: string,
  data: TransactionInput,
  isAdmin: boolean = false
): Promise<{ transaction: Transaction; portfolio: Portfolio }> {
  let portfolio = await getUserPortfolio(userId);

  if (!portfolio) {
    portfolio = await createPortfolio(userId);
  }

  const fee = "0";
  const total = calculateTotal(data.amount, fee);
  const status = isAdmin ? ("approved" as const) : ("pending" as const);

  const transactionData = {
    portfolioId: portfolio.id,
    investmentMethodId: data.investmentMethodId,
    type: data.type,
    amount: data.amount,
    fee,
    total,
    date: data.date,
    notes: data.notes,
    status,
    ...(isAdmin && data.type === "buy" && {
      initialValue: total,
      currentValue: total,
      approvedAt: new Date(),
    }),
  };

  const [transaction] = await db
    .insert(transactions)
    .values(transactionData)
    .returning();

  return { transaction, portfolio };
}

export async function getPortfolioTransactions(portfolioId: string): Promise<Transaction[]> {
  return await db
    .select()
    .from(transactions)
    .where(eq(transactions.portfolioId, portfolioId));
}

export function calculateTotal(amount: string, fee: string): string {
  const amountNum = parseFloat(amount);
  const feeNum = parseFloat(fee);
  return (amountNum + feeNum).toFixed(2);
}
