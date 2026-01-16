import { db } from "@/db";
import { portfolioSnapshots, transactions } from "@/db/schema";
import { eq, and, sql } from "drizzle-orm";

/**
 * Create daily snapshots for all portfolios with approved transactions
 * Sums currentValue of all active buy transactions per portfolio
 */
export async function createDailySnapshots() {
  const today = new Date();
  today.setUTCHours(0, 0, 0, 0); // Normalize to midnight UTC

  // Get all portfolios
  const allPortfolios = await db.query.portfolios.findMany();

  const snapshotsCreated: string[] = [];

  for (const portfolio of allPortfolios) {
    try {
      await createSnapshotForPortfolio(portfolio.id, today);
      snapshotsCreated.push(portfolio.id);
    } catch (error) {
      console.error(`Error creating snapshot for portfolio ${portfolio.id}:`, error);
    }
  }

  return {
    date: today,
    snapshotsCreated: snapshotsCreated.length,
    totalPortfolios: allPortfolios.length,
  };
}

/**
 * Create or update snapshot for a specific portfolio
 * Used when approving transactions to update today's snapshot
 */
export async function updateTodaySnapshot(portfolioId: string) {
  const today = new Date();
  today.setUTCHours(0, 0, 0, 0); // Normalize to midnight UTC

  // Delete today's snapshot if it exists
  await db
    .delete(portfolioSnapshots)
    .where(
      and(
        eq(portfolioSnapshots.portfolioId, portfolioId),
        eq(portfolioSnapshots.date, today)
      )
    );

  // Create new snapshot
  await createSnapshotForPortfolio(portfolioId, today);
}

/**
 * Internal function to create a snapshot for a portfolio
 */
async function createSnapshotForPortfolio(portfolioId: string, date: Date) {
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

  // Only create snapshot if there are approved transactions
  if (totalValue > 0) {
    await db.insert(portfolioSnapshots).values({
      portfolioId,
      date,
      totalValue: totalValue.toFixed(2),
    });
  }
}
