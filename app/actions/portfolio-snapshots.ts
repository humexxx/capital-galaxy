"use server";

import { db } from "@/db";
import { requireAdmin } from "@/lib/services/auth-server";
import { createManualSnapshot, deleteManualSnapshots } from "@/lib/services/snapshot-service";
import { applyMonthlyInterest } from "@/lib/services/interest-service";
import { revalidatePath } from "next/cache";
import { portfolios } from "@/db/schema";
import { eq } from "drizzle-orm";
import { manualSnapshotFormSchema, type ManualSnapshotFormData } from "@/schemas/snapshot";

/**
 * Create a manual snapshot for the user's portfolio
 * Optionally applies monthly interest before taking the snapshot
 * Admin only
 */
export async function createManualSnapshotAction(data: ManualSnapshotFormData) {
  const admin = await requireAdmin();

  // Validate input
  const validated = manualSnapshotFormSchema.parse(data);

  // Get user's portfolio
  const portfolio = await db.query.portfolios.findFirst({
    where: eq(portfolios.userId, admin.id),
  });

  if (!portfolio) {
    throw new Error("Portfolio not found");
  }

  try {
    if (validated.applyInterest) {
      await applyMonthlyInterest(validated.date);
    }

    const result = await createManualSnapshot(portfolio.id, validated.date, validated.source);

    revalidatePath("/portal/portfolio");

    return {
      success: true,
      totalValue: result.totalValue,
    };
  } catch (error) {
    console.error("Error creating manual snapshot:", error);
    throw error;
  }
}

/**
 * Delete all manual snapshots for the user's portfolio
 * Admin only
 */
export async function deleteManualSnapshotsAction() {
  const admin = await requireAdmin();

  // Get user's portfolio
  const portfolio = await db.query.portfolios.findFirst({
    where: eq(portfolios.userId, admin.id),
  });

  if (!portfolio) {
    throw new Error("Portfolio not found");
  }

  try {
    await deleteManualSnapshots(portfolio.id);
    revalidatePath("/portal/portfolio");

    return { success: true };
  } catch (error) {
    console.error("Error deleting manual snapshots:", error);
    throw error;
  }
}
