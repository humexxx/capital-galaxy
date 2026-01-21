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
 * Create a manual snapshot for all portfolios
 * Optionally applies monthly interest before taking the snapshot
 * When applyInterest is true, creates snapshots for ALL users since interest affects everyone
 * Admin only
 */
export async function createManualSnapshotAction(data: ManualSnapshotFormData) {
  await requireAdmin();

  // Validate input
  const validated = manualSnapshotFormSchema.parse(data);

  try {
    if (validated.applyInterest) {
      await applyMonthlyInterest(validated.date);
    }

    // Get all portfolios to create snapshots for each
    const allPortfolios = await db.select().from(portfolios);

    if (allPortfolios.length === 0) {
      throw new Error("No portfolios found");
    }

    let totalValue = 0;
    let snapshotsCreated = 0;

    // Create snapshot for each portfolio
    for (const portfolio of allPortfolios) {
      const result = await createManualSnapshot(portfolio.id, validated.date, validated.source);
      if (result.created) {
        totalValue += result.totalValue;
        snapshotsCreated++;
      }
    }

    revalidatePath("/portal/portfolio");

    return {
      success: true,
      totalValue,
      snapshotsCreated,
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
