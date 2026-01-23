import { db } from "@/db";
import { investmentMethods } from "@/db/schema";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Portfolio | Capital Galaxy",
  description: "View and manage your investment portfolio",
};
import {
  getUserPortfolio,
  getPortfolioStats,
  getPortfolioTransactions,
} from "@/lib/services/portfolio-service";
import { getPortfolioPerformanceData } from "@/lib/services/chart-service";
import { requireAuth, getUserRole } from "@/lib/services/auth-server";
import { getAllUsers } from "@/lib/services/user-service";
import type { PortfolioTransaction } from "@/types/portfolio";
import PortfolioClientPage from "@/components/portal/portfolio-client";

type PageProps = {
  searchParams: Promise<{ userId?: string }>;
};

export default async function PortfolioPage({ searchParams }: PageProps) {
  const params = await searchParams;
  const currentUser = await requireAuth();
  const role = await getUserRole(currentUser.id);
  const isAdmin = role === "admin";

  // Determine which user's portfolio to show
  // Admin can view any user via userId param, defaults to their own
  // Regular users always see their own
  const userId = isAdmin && params.userId ? params.userId : currentUser.id;

  const portfolio = await getUserPortfolio(userId);
  const methods = await db.select().from(investmentMethods);
  const users = isAdmin ? await getAllUsers() : [];

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
    isAdmin,
    users,
    currentUserId: userId,
  };

  return <PortfolioClientPage data={data} />;
}
