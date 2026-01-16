import { db } from "@/db";
import { investmentMethods } from "@/db/schema";
import {
  getUserPortfolio,
  getPortfolioStats,
  getPortfolioTransactions,
} from "@/lib/services/portfolio-service";
import { getPortfolioPerformanceData } from "@/lib/services/chart-service";
import { requireAuth } from "@/lib/services/auth-server";
import type { PortfolioTransaction } from "@/types/portfolio";
import PortfolioClientPage from "./portfolio-client";

export default async function PortfolioPage() {
  const user = await requireAuth();

  const portfolio = await getUserPortfolio(user.id);
  const methods = await db.select().from(investmentMethods);

  let stats = null;
  let transactions: PortfolioTransaction[] = [];
  let chartData: { date: string; value: number }[] = [];

  if (portfolio) {
    stats = await getPortfolioStats(portfolio.id);
    transactions = await getPortfolioTransactions(portfolio.id);

    // Get real snapshot data for chart
    chartData = await getPortfolioPerformanceData(portfolio.id, "All");
    
    // Fallback: Generate chart data from approved transactions if no snapshots exist
    if (chartData.length === 0) {
      const approvedTransactions = transactions.filter(
        (t) => t.status === "approved"
      );
      if (approvedTransactions.length > 0) {
        let runningTotal = 0;
        chartData = approvedTransactions.map((t) => {
          if (t.type === "buy") {
            runningTotal += parseFloat(t.total);
          } else {
            runningTotal -= parseFloat(t.total);
          }
          return {
            date: new Date(t.date).toISOString(),
            value: runningTotal,
          };
        });
      }
    }
  }

  const data = {
    portfolio,
    stats,
    transactions,
    chartData,
    methods,
  };

  return <PortfolioClientPage data={data} />;
}
