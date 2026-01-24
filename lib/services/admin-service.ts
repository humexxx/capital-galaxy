import { db } from "@/db";
import { transactions, users, investmentMethods, portfolios } from "@/db/schema";
import { desc, eq, and, type SQL } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";
import type { AdminTransactionRow } from "@/types";

export type TransactionFilter = {
  userId?: string;
  status?: "pending" | "approved" | "rejected";
  type?: "buy" | "withdrawal";
};

export async function getAdminTransactions(filters?: TransactionFilter): Promise<AdminTransactionRow[]> {
  const conditions: SQL[] = [];

  // Create aliases for approved/rejected by users
  const approvedByUser = alias(users, "approvedByUser");
  const rejectedByUser = alias(users, "rejectedByUser");

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
      approvedAt: transactions.approvedAt,
      approvedBy: {
        id: approvedByUser.id,
        email: approvedByUser.email,
        fullName: approvedByUser.fullName,
      },
      rejectedAt: transactions.rejectedAt,
      rejectedBy: {
        id: rejectedByUser.id,
        email: rejectedByUser.email,
        fullName: rejectedByUser.fullName,
      },
    })
    .from(transactions)
    .leftJoin(portfolios, eq(transactions.portfolioId, portfolios.id))
    .leftJoin(users, eq(portfolios.userId, users.id))
    .leftJoin(
      investmentMethods,
      eq(transactions.investmentMethodId, investmentMethods.id)
    )
    .leftJoin(approvedByUser, eq(transactions.approvedBy, approvedByUser.id))
    .leftJoin(rejectedByUser, eq(transactions.rejectedBy, rejectedByUser.id))
    .$dynamic();

  const query = conditions.length > 0 
    ? baseQuery.where(and(...conditions))
    : baseQuery;

  return await query.orderBy(desc(transactions.date));
}
