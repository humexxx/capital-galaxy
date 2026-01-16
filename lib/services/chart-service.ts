import { db } from "@/db";
import { portfolioSnapshots, transactions } from "@/db/schema";
import { eq, and, gte, asc } from "drizzle-orm";
import { subDays, subMonths } from "date-fns";

export type TimeRange = "24h" | "7d" | "30d" | "90d" | "All";

export interface ChartDataPoint {
  date: string;
  value: number;
}

/**
 * Get portfolio performance data for charts
 * Filters by time range and returns snapshots ordered by date
 * Adds a dummy point 1 month before first transaction with value 0
 */
export async function getPortfolioPerformanceData(
  portfolioId: string,
  timeRange: TimeRange = "All"
): Promise<ChartDataPoint[]> {
  const now = new Date();
  let startDate: Date | null = null;

  // Calculate start date based on time range
  switch (timeRange) {
    case "24h":
      startDate = subDays(now, 1);
      break;
    case "7d":
      startDate = subDays(now, 7);
      break;
    case "30d":
      startDate = subDays(now, 30);
      break;
    case "90d":
      startDate = subDays(now, 90);
      break;
    case "All":
      startDate = null; // Get all data
      break;
  }

  // Build query
  const query = startDate
    ? db
        .select({
          date: portfolioSnapshots.date,
          totalValue: portfolioSnapshots.totalValue,
        })
        .from(portfolioSnapshots)
        .where(
          and(
            eq(portfolioSnapshots.portfolioId, portfolioId),
            gte(portfolioSnapshots.date, startDate)
          )
        )
        .orderBy(portfolioSnapshots.date)
    : db
        .select({
          date: portfolioSnapshots.date,
          totalValue: portfolioSnapshots.totalValue,
        })
        .from(portfolioSnapshots)
        .where(eq(portfolioSnapshots.portfolioId, portfolioId))
        .orderBy(portfolioSnapshots.date);

  const snapshots = await query;

  // Transform to chart format
  const chartData = snapshots.map((snapshot) => ({
    date: snapshot.date.toISOString(),
    value: parseFloat(snapshot.totalValue),
  }));

  // If we have snapshots, add a dummy point 1 month before first transaction
  if (chartData.length > 0) {
    // Get first approved transaction date for this portfolio
    const firstTransaction = await db.query.transactions.findFirst({
      where: eq(transactions.portfolioId, portfolioId),
      orderBy: [asc(transactions.date)],
    });

    if (firstTransaction) {
      // Add a point 1 month before the first transaction with value 0
      const oneMonthBefore = subMonths(new Date(firstTransaction.date), 1);
      
      // Insert at the beginning
      chartData.unshift({
        date: oneMonthBefore.toISOString(),
        value: 0,
      });
    }
  }

  return chartData;
}
