"use server";

import { db } from "@/db";
import { requireAdmin } from "@/lib/services/auth-server";
import { createManualSnapshot, deleteManualSnapshots } from "@/lib/services/snapshot-service";
import { applyMonthlyInterest } from "@/lib/services/interest-service";
import { revalidatePath } from "next/cache";
import { portfolios } from "@/db/schema";
import { eq } from "drizzle-orm";

/**
 * Create a manual snapshot for the user's portfolio
 * Optionally applies monthly interest before taking the snapshot
 * Admin only
 */
export async function createManualSnapshotAction(applyInterest: boolean) {
  const admin = await requireAdmin();

  // Get user's portfolio
  const portfolio = await db.query.portfolios.findFirst({
    where: eq(portfolios.userId, admin.id),
  });

  if (!portfolio) {
    throw new Error("Portfolio not found");
  }

  try {
    // Apply interest if requested
    if (applyInterest) {
      await applyMonthlyInterest();
    }

    // Create manual snapshot
    const result = await createManualSnapshot(portfolio.id);

    if (!result.created) {
      throw new Error("Snapshot not created - portfolio has no value and no previous snapshots");
    }

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
