import { createClient } from "@/lib/supabase-server";
import { redirect } from "next/navigation";
import { db } from "@/db";
import { investmentMethods } from "@/db/schema";
import { getUserPortfolio, getPortfolioStats, getPortfolioTransactions } from "@/lib/services/portfolio-service";
import PortfolioClientPage from "./portfolio-client";

export default async function PortfolioPage() {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  const portfolio = await getUserPortfolio(user.id);
  const methods = await db.select().from(investmentMethods);

  let stats = null;
  let transactions: any[] = [];
  let chartData: { date: string; value: number }[] = [];

  if (portfolio) {
    stats = await getPortfolioStats(portfolio.id);
    transactions = await getPortfolioTransactions(portfolio.id);
    
    // Generate chart data from approved transactions
    const approvedTransactions = transactions.filter((t: any) => t.status === "approved");
    if (approvedTransactions.length > 0) {
      let runningTotal = 0;
      chartData = approvedTransactions.map((t: any) => {
        if (t.type === "buy") {
          runningTotal += parseFloat(t.total);
        } else {
          runningTotal -= parseFloat(t.total);
        }
        return {
          date: new Date(t.date).toLocaleDateString(),
          value: runningTotal,
        };
      });
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
