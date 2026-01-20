import { db } from "@/db";
import { transactions } from "@/db/schema";
import { eq, and, gt, lte } from "drizzle-orm";

/**
 * Apply monthly compound interest to all active transactions
 * Updates currentValue = currentValue * (1 + monthlyRoi)
 * Marks transactions with currentValue <= 0 as 'closed'
 * @param beforeDate - Optional date to only apply interest to transactions created before this date
 */
export async function applyMonthlyInterest(beforeDate?: Date) {
  // Build where conditions
  const conditions = [
    eq(transactions.status, "approved"),
    eq(transactions.type, "buy"),
    gt(transactions.currentValue, "0"),
  ];

  // Only include transactions created before the specified date
  if (beforeDate) {
    conditions.push(lte(transactions.date, beforeDate));
  }

  // Get all active buy transactions with their investment method's monthlyRoi
  const activeTransactions = await db.query.transactions.findMany({
    where: and(...conditions),
    with: {
      investmentMethod: true,
    },
  });

  if (activeTransactions.length === 0) {
    return { processed: 0, closed: 0 };
  }

  // Calculate new values and prepare updates
  const updates = activeTransactions.map((transaction) => {
    const currentValue = parseFloat(transaction.currentValue || "0");
    const monthlyRoi = (transaction.investmentMethod?.monthlyRoi || 0) / 100; // Convert percentage to decimal
    const newValue = currentValue * (1 + monthlyRoi);

    return {
      id: transaction.id,
      newValue,
      shouldClose: newValue <= 0,
    };
  });

  // Execute updates in transaction
  await db.transaction(async (tx) => {
    for (const update of updates) {
      await tx
        .update(transactions)
        .set({
          currentValue: update.newValue.toFixed(2),
          status: update.shouldClose ? "closed" : "approved",
          updatedAt: new Date(),
        })
        .where(eq(transactions.id, update.id));
    }
  });

  const closedCount = updates.filter((u) => u.shouldClose).length;

  return {
    processed: activeTransactions.length,
    closed: closedCount,
  };
}
