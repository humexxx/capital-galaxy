"use server";

import { revalidatePath } from "next/cache";
import { db } from "@/db";
import { transactions } from "@/db/schema";
import { eq } from "drizzle-orm";
import { z } from "zod";
import { requireAdmin } from "@/lib/services/auth-server";

const transactionActionSchema = z.object({
  id: z.string().uuid(),
});

export async function approveTransaction(transactionId: string) {
  const admin = await requireAdmin();
  
  const parsed = transactionActionSchema.safeParse({ id: transactionId });
  if (!parsed.success) throw new Error("Invalid ID");

  await db
    .update(transactions)
    .set({ 
      status: "approved",
      approvedAt: new Date(),
      approvedBy: admin.id,
    })
    .where(eq(transactions.id, transactionId));

  revalidatePath("/portal/admin/transactions");
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
