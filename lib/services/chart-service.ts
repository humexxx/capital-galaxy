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
        .orderBy(asc(portfolioSnapshots.date))
    : db
        .select({
          date: portfolioSnapshots.date,
          totalValue: portfolioSnapshots.totalValue,
        })
        .from(portfolioSnapshots)
        .where(eq(portfolioSnapshots.portfolioId, portfolioId))
        .orderBy(asc(portfolioSnapshots.date));

  const snapshots = await query;

  // Transform to chart format
  const chartData = snapshots.map((snapshot) => ({
    date: snapshot.date.toISOString(),
    value: parseFloat(snapshot.totalValue),
  }));

  if (chartData.length > 0) {
    // If there are snapshots, add dummy point at day 1 of the first snapshot's month
    const firstSnapshotDate = new Date(chartData[0].date);
    const dummyStartDate = startOfMonth(firstSnapshotDate);
    
    // Insert the dummy point at the beginning with value 0
    chartData.unshift({
      date: dummyStartDate.toISOString(),
      value: 0,
    });

    // Check if the last snapshot is not from today
    const lastSnapshot = chartData[chartData.length - 1];
    const lastSnapshotDate = new Date(lastSnapshot.date);
    const today = new Date(now);
    
    // Compare only the date part (ignore time)
    const isSameDay = 
      lastSnapshotDate.getFullYear() === today.getFullYear() &&
      lastSnapshotDate.getMonth() === today.getMonth() &&
      lastSnapshotDate.getDate() === today.getDate();

    // If last snapshot is not from today, add a point with today's date and last value
    if (!isSameDay) {
      chartData.push({
        date: now.toISOString(),
        value: lastSnapshot.value,
      });
    }
  } else {
    // No snapshots, add two dummy points with value 0
    // First day of current month (or previous month if today is day 1)
    const isFirstDayOfMonth = getDate(now) === 1;
    const dummyStartDate = isFirstDayOfMonth 
      ? startOfMonth(subMonths(now, 1))
      : startOfMonth(now);

    chartData.push({
      date: dummyStartDate.toISOString(),
      value: 0,
    });
    chartData.push({
      date: now.toISOString(),
      value: 0,
    });
  }

  return chartData;
}
