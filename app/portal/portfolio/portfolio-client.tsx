"use client";

import { useState, useMemo } from "react";
import { Button } from "@/components/ui/button";
import { EmptyPortfolio } from "@/components/portfolio/empty-portfolio";
import { AddTransactionDialog } from "@/components/portfolio/add-transaction-dialog";
import { TransactionsTable } from "@/components/portfolio/transactions-table";
import { PerformanceChart } from "@/components/portfolio/performance-chart";
import { PortfolioHeader } from "@/components/portfolio/portfolio-header";
import { StatsCards } from "@/components/portfolio/stats-cards";
import { AllocationChart } from "@/components/portfolio/allocation-chart";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Card, CardContent } from "@/components/ui/card";

type Portfolio = {
  id: string;
  name: string;
};

type InvestmentMethod = {
  id: string;
  name: string;
  author: string;
  riskLevel: string;
  monthlyRoi: number;
};

type Transaction = {
  id: string;
  type: "buy" | "withdrawal";
  amount: string;
  fee: string;
  total: string;
  date: Date;
  status: "pending" | "approved" | "rejected" | "closed";
  notes?: string | null;
  investmentMethod: InvestmentMethod;
  asset_symbol?: string; // Assuming we might have this, or use name
};

type PortfolioStats = {
  totalValue: number;
  costBasis: number;
  allTimeProfit: number;
  allTimeProfitPercentage: number;
  totalInvestmentMethods: number;
  activeTransactions: number;
};

type ChartDataPoint = {
  date: string;
  value: number;
};

type User = {
  id: string;
  fullName: string | null;
  email: string | null;
};

type PortfolioData = {
  portfolio: Portfolio | null;
  stats: PortfolioStats | null;
  transactions: Transaction[];
  chartData: ChartDataPoint[];
  methods: InvestmentMethod[];
  isAdmin: boolean;
  users?: User[];
};

export default function PortfolioClientPage({ data }: { data: PortfolioData }) {
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [showCharts, setShowCharts] = useState(true);
  const [hideValues, setHideValues] = useState(false);

  // Calculate Allocation Data
  const allocationData = useMemo(() => {
    const map = new Map<string, number>();
    const approved = data.transactions.filter(t => t.status === "approved");

    approved.forEach(t => {
      const value = parseFloat(t.total);
      // Use investment method name as asset identifier for now
      const key = t.investmentMethod?.name || "Unknown";
      if (t.type === "buy") {
        map.set(key, (map.get(key) || 0) + value);
      } else {
        map.set(key, (map.get(key) || 0) - value);
      }
    });

    return Array.from(map.entries()).map(([name, value], index) => ({
      name,
      value: Math.max(0, value), // No negative allocation visualization
      fill: `var(--chart-${(index % 5) + 1})`,
    })).filter(item => item.value > 0);
  }, [data.transactions]);

  const handleAddTransaction = async (transactionData: {
    investmentMethodId: string;
    amount: string;
    date: Date;
    notes?: string;
    userId?: string;
  }) => {
    try {
      const response = await fetch("/api/transactions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(transactionData),
      });

      if (response.ok) {
        window.location.reload();
      }
    } catch (error) {
      console.error("Failed to create transaction:", error);
    }
  };

  if (!data.portfolio) {
    return (
      <>
        <div className="flex min-h-screen flex-col">
          <EmptyPortfolio onAddTransaction={() => setIsDialogOpen(true)} />
        </div>
        <AddTransactionDialog
          open={isDialogOpen}
          onClose={() => setIsDialogOpen(false)}
          methods={data.methods}
          onSubmit={handleAddTransaction}
          isAdmin={data.isAdmin}
          users={data.users}
        />
      </>
    );
  }

  // Calculate daily change (mocked for now as we don't have historical snapshot in stats)
  // For now, assuming daily change is 0 or part of allTimeProfit if implied.
  // The image shows specific 24h change. We'll pass 0 if not available.
  const dailyChange = 0;
  const dailyChangePercentage = 0;

  return (
    <>
      <div className="flex flex-1 flex-col gap-8 p-8 max-w-400 mx-auto">

        {/* Top Header Section */}
        <PortfolioHeader
          portfolioName={data.portfolio.name}
          totalValue={data.stats?.totalValue || 0}
          dailyChange={dailyChange}
          dailyChangePercentage={dailyChangePercentage}
          onAddTransaction={() => setIsDialogOpen(true)}
          showCharts={showCharts}
          onToggleCharts={() => setShowCharts(!showCharts)}
          hideValues={hideValues}
          onToggleHideValues={() => setHideValues(!hideValues)}
          isAdmin={data.isAdmin}
        />

        {/* Tabs and Content */}
        <Tabs defaultValue="overview" className="w-full">
          <div>
            <TabsList>
              <TabsTrigger value="overview">Overview</TabsTrigger>
              <TabsTrigger value="transactions">Transactions</TabsTrigger>
            </TabsList>
          </div>

          <TabsContent value="overview" className="space-y-6 mt-6">
            {/* KPI Cards */}
            {data.stats && (
              <StatsCards
                allTimeProfit={data.stats.allTimeProfit}
                allTimeProfitPercentage={data.stats.allTimeProfitPercentage}
                costBasis={data.stats.costBasis}
                totalInvestmentMethods={data.stats.totalInvestmentMethods}
                activeTransactions={data.stats.activeTransactions}
                hideValues={hideValues}
              />
            )}

            {/* Charts Grid */}
            {showCharts && (
              <div className="grid gap-6 md:grid-cols-1 lg:grid-cols-3">
                {/* History Chart - Takes up 2 columns */}
                <div className="lg:col-span-2">
                  {data.chartData.length > 0 ? (
                    <PerformanceChart data={data.chartData} />
                  ) : (
                    <Card className="h-100 flex items-center justify-center bg-card">
                      <div className="text-center text-muted-foreground">
                        <p>Not enough data for chart</p>
                        <p className="text-sm">Approve transactions to see history</p>
                      </div>
                    </Card>
                  )}
                </div>

                {/* Allocation Chart - Takes up 1 column */}
                <div className="lg:col-span-1">
                  <AllocationChart data={allocationData} />
                </div>
              </div>
            )}

            {/* Future: Performance (Cumulative) Chart could go here or in the grid above */}

          </TabsContent>

          <TabsContent value="transactions" className="mt-6">
            <Card className="bg-card">
              <CardContent>
                <TransactionsTable transactions={data.transactions} />
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </div>

      <AddTransactionDialog
        open={isDialogOpen}
        onClose={() => setIsDialogOpen(false)}
        methods={data.methods}
        onSubmit={handleAddTransaction}
        isAdmin={data.isAdmin}
        users={data.users}
      />
    </>
  );
}

