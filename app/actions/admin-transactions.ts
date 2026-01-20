"use server";

import { revalidatePath } from "next/cache";
import { db } from "@/db";
import { transactions } from "@/db/schema";
import { eq, sql } from "drizzle-orm";
import { z } from "zod";
import { requireAdmin } from "@/lib/services/auth-server";
import { createApprovalSnapshot } from "@/lib/services/snapshot-service";

const transactionActionSchema = z.object({
  id: z.string().uuid(),
});

export async function approveTransaction(transactionId: string) {
  const admin = await requireAdmin();
  
  const parsed = transactionActionSchema.safeParse({ id: transactionId });
  if (!parsed.success) throw new Error("Invalid ID");

  // Get the transaction details
  const transaction = await db.query.transactions.findFirst({
    where: eq(transactions.id, transactionId),
  });

  if (!transaction) throw new Error("Transaction not found");

  await db.transaction(async (tx) => {
    if (transaction.type === "buy") {
      // For buy transactions, set initialValue and currentValue
      await tx
        .update(transactions)
        .set({ 
          status: "approved",
          approvedAt: new Date(),
          approvedBy: admin.id,
          initialValue: transaction.total,
          currentValue: transaction.total,
          updatedAt: new Date(),
        })
        .where(eq(transactions.id, transactionId));
    } else if (transaction.type === "withdrawal") {
      // For withdrawals, validate and reduce currentValue of source transaction
      const sourceTransactionId = transaction.sourceTransactionId;
      
      if (!sourceTransactionId) {
        throw new Error("Withdrawal must have a source transaction");
      }

      const sourceTransaction = await tx.query.transactions.findFirst({
        where: eq(transactions.id, sourceTransactionId),
      });

      if (!sourceTransaction) {
        throw new Error("Source transaction not found");
      }

      const currentValue = parseFloat(sourceTransaction.currentValue || "0");
      const withdrawalAmount = parseFloat(transaction.total);

      if (currentValue < withdrawalAmount) {
        throw new Error("Insufficient funds in source transaction");
      }

      const newValue = currentValue - withdrawalAmount;

      // Update source transaction
      await tx
        .update(transactions)
        .set({
          currentValue: newValue.toFixed(2),
          status: newValue <= 0 ? "closed" : "approved",
          withdrawalTransactionIds: sql`array_append(COALESCE(${transactions.withdrawalTransactionIds}, ARRAY[]::text[]), ${transactionId})`,
          updatedAt: new Date(),
        })
        .where(eq(transactions.id, sourceTransactionId));

      // Approve withdrawal transaction
      await tx
        .update(transactions)
        .set({
          status: "approved",
          approvedAt: new Date(),
          approvedBy: admin.id,
          updatedAt: new Date(),
        })
        .where(eq(transactions.id, transactionId));
    }
  });

  // Create snapshot after transaction is committed
  await createApprovalSnapshot(transaction.portfolioId);

  revalidatePath("/portal/admin/transactions");
  revalidatePath("/portal/portfolio");
}

export async function rejectTransaction(transactionId: string) {
  const admin = await requireAdmin();

  const parsed = transactionActionSchema.safeParse({ id: transactionId });
  if (!parsed.success) throw new Error("Invalid ID");

  await db
    .update(transactions)
    .set({ 
      status: "rejected",
      rejectedAt: new Date(),
      rejectedBy: admin.id,
    })
    .where(eq(transactions.id, transactionId));

  revalidatePath("/portal/admin/transactions");
}
