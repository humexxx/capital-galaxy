import { db } from "@/db";
import { portfolioSnapshots, transactions } from "@/db/schema";
import { eq, and, sql } from "drizzle-orm";
import type { SnapshotSource } from "@/schemas/snapshot";

/**
 * Create daily snapshots for all portfolios with approved transactions
 * Sums currentValue of all active buy transactions per portfolio
 */
export async function createDailySnapshots() {
  // Get all portfolios
  const allPortfolios = await db.query.portfolios.findMany();

  const snapshotsCreated: string[] = [];
  const errors: string[] = [];

  for (const portfolio of allPortfolios) {
    try {
      const result = await createSnapshotForPortfolio(
        portfolio.id,
        "system_cron"
      );
      if (result.created) {
        snapshotsCreated.push(portfolio.id);
      }
    } catch (error) {
      console.error(
        `Error creating snapshot for portfolio ${portfolio.id}:`,
        error
      );
      errors.push(`${portfolio.id}: ${error}`);
    }
  }

  return {
    date: new Date(),
    snapshotsCreated: snapshotsCreated.length,
    totalPortfolios: allPortfolios.length,
    errors,
  };
}

/**
 * Create snapshot when approving a transaction
 * Does NOT delete existing snapshots - allows multiple snapshots per day
 */
export async function createApprovalSnapshot(portfolioId: string) {
  await createSnapshotForPortfolio(portfolioId, "admin_approval");
}

/**
 * Create a manual snapshot for a portfolio
 * Used by users to take a manual snapshot
 */
export async function createManualSnapshot(
  portfolioId: string,
  date: Date = new Date(),
  source: SnapshotSource = "manual"
) {
  return await createSnapshotForPortfolio(portfolioId, source, date);
}

/**
 * Delete all manual snapshots for a portfolio
 */
export async function deleteManualSnapshots(portfolioId: string) {
  const result = await db
    .delete(portfolioSnapshots)
    .where(
      and(
        eq(portfolioSnapshots.portfolioId, portfolioId),
        eq(portfolioSnapshots.source, "manual")
      )
    );

  return result;
}

/**
 * Internal function to create a snapshot for a portfolio
 */
async function createSnapshotForPortfolio(
  portfolioId: string,
  source: SnapshotSource,
  date: Date = new Date()
): Promise<{ created: boolean; totalValue: number }> {
  // Sum currentValue of all approved buy transactions
  const result = await db
    .select({
      totalValue: sql<string>`COALESCE(SUM(${transactions.currentValue}), 0)`,
    })
    .from(transactions)
    .where(
      and(
        eq(transactions.portfolioId, portfolioId),
        eq(transactions.status, "approved"),
        eq(transactions.type, "buy")
      )
    );

  const totalValue = parseFloat(result[0]?.totalValue || "0");

  let shouldCreate = totalValue > 0;

  if (totalValue === 0) {
    const lastSnapshot = await db.query.portfolioSnapshots.findFirst({
      where: eq(portfolioSnapshots.portfolioId, portfolioId),
      orderBy: (snapshots, { desc }) => [desc(snapshots.date)],
    });

    const lastValue = lastSnapshot ? parseFloat(lastSnapshot.totalValue) : null;

    if (lastValue !== null && lastValue > 0) {
      shouldCreate = true;
    } else if ((source === "manual" || source === "admin_enforce") && lastValue !== 0) {
      shouldCreate = true;
    }
  }

  if (shouldCreate) {
    await db.insert(portfolioSnapshots).values({
      portfolioId,
      date,
      totalValue: totalValue.toFixed(2),
      source,
    });

    console.log(
      `Created snapshot for portfolio ${portfolioId} with value ${totalValue} from source ${source}`
    );

    return { created: true, totalValue };
  }

  console.log(
    `Skipped snapshot for portfolio ${portfolioId} - totalValue is 0 and no previous value`
  );

  return { created: false, totalValue };
}
