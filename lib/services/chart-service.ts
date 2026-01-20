import { db } from "@/db";
import { portfolioSnapshots, transactions } from "@/db/schema";
import { eq, and, gte, asc } from "drizzle-orm";
import { subDays, subMonths, startOfMonth, getDate } from "date-fns";

export type TimeRange = "30d" | "90d" | "120d" | "1yr" | "All";

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
    case "30d":
      startDate = subDays(now, 30);
      break;
    case "90d":
      startDate = subDays(now, 90);
      break;
    case "120d":
      startDate = subDays(now, 120);
      break;
    case "1yr":
      startDate = subDays(now, 365);
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

  // If we have snapshots, add a dummy point at the start of current month (or previous month if today is day 1)
  if (chartData.length > 0) {
    const now = new Date();
    const isFirstDayOfMonth = getDate(now) === 1;
    
    // If today is the first day of the month, use first day of previous month
    // Otherwise use first day of current month
    const dummyPointDate = isFirstDayOfMonth 
      ? startOfMonth(subMonths(now, 1))
      : startOfMonth(now);
    
    // Insert at the beginning
    chartData.unshift({
      date: dummyPointDate.toISOString(),
      value: 0,
    });
  }

  return chartData;
}
