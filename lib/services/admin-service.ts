import { db } from "@/db";
import { transactions, users, investmentMethods, portfolios } from "@/db/schema";
import { desc, eq, and, type SQL } from "drizzle-orm";

export type TransactionFilter = {
  userId?: string;
  status?: "pending" | "approved" | "rejected";
  type?: "buy" | "withdrawal";
};

export async function getAdminTransactions(filters?: TransactionFilter) {
  const conditions: SQL[] = [];

  if (filters?.userId) {
    conditions.push(eq(users.id, filters.userId));
  }
  if (filters?.status) {
    conditions.push(eq(transactions.status, filters.status));
  }
  if (filters?.type) {
    conditions.push(eq(transactions.type, filters.type));
  }

  const baseQuery = db
    .select({
      id: transactions.id,
      amount: transactions.amount,
      fee: transactions.fee,
      total: transactions.total,
      date: transactions.date,
      status: transactions.status,
      type: transactions.type,
      notes: transactions.notes,
      user: {
        id: users.id,
        email: users.email,
        fullName: users.fullName,
        avatarUrl: users.avatarUrl,
      },
      method: {
        id: investmentMethods.id,
        name: investmentMethods.name,
      },
      portfolioName: portfolios.name,
    })
    .from(transactions)
    .leftJoin(portfolios, eq(transactions.portfolioId, portfolios.id))
    .leftJoin(users, eq(portfolios.userId, users.id))
    .leftJoin(
      investmentMethods,
      eq(transactions.investmentMethodId, investmentMethods.id)
    )
    .$dynamic();

  const query = conditions.length > 0 
    ? baseQuery.where(and(...conditions))
    : baseQuery;

  return await query.orderBy(desc(transactions.date));
}
