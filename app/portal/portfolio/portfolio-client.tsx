"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { EmptyPortfolio } from "@/components/portfolio/empty-portfolio";
import { AddTransactionDialog } from "@/components/portfolio/add-transaction-dialog";
import { PortfolioOverview } from "@/components/portfolio/portfolio-overview";
import { TransactionsTable } from "@/components/portfolio/transactions-table";
import { PerformanceChart } from "@/components/portfolio/performance-chart";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

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
  status: "pending" | "approved" | "rejected";
  notes?: string | null;
  investmentMethod: InvestmentMethod;
};

type PortfolioStats = {
  totalValue: number;
  costBasis: number;
  allTimeProfit: number;
  allTimeProfitPercentage: number;
};

type ChartDataPoint = {
  date: string;
  value: number;
};

type PortfolioData = {
  portfolio: Portfolio | null;
  stats: PortfolioStats | null;
  transactions: Transaction[];
  chartData: ChartDataPoint[];
  methods: InvestmentMethod[];
};

export default function PortfolioClientPage({ data }: { data: PortfolioData }) {
  const [isDialogOpen, setIsDialogOpen] = useState(false);

  const handleAddTransaction = async (transactionData: {
    investmentMethodId: string;
    amount: string;
    date: Date;
    notes?: string;
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
        />
      </>
    );
  }

  return (
    <>
      <div className="flex flex-1 flex-col gap-6 p-8">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold">Portfolio</h1>
            <div className="flex items-baseline gap-4 mt-2">
              <span className="text-4xl font-bold">
                ${data.stats?.totalValue.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) || "0.00"}
              </span>
              {/* P/L Summary could go here if available */}
            </div>
          </div>
          <Button onClick={() => setIsDialogOpen(true)}>
            + Add Transaction
          </Button>
        </div>

        <Tabs defaultValue="overview" className="w-full">
          <TabsList>
            <TabsTrigger value="overview">Overview</TabsTrigger>
            <TabsTrigger value="transactions">Transactions</TabsTrigger>
          </TabsList>
          
          <TabsContent value="overview" className="space-y-6 mt-6">
            {data.stats && (
              <PortfolioOverview
                portfolioName={data.portfolio.name}
                totalValue={data.stats.totalValue}
                allTimeProfit={data.stats.allTimeProfit}
                allTimeProfitPercentage={data.stats.allTimeProfitPercentage}
                costBasis={data.stats.costBasis}
              />
            )}

            <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
              <div className="col-span-2">
                {data.chartData.length > 0 ? (
                  <PerformanceChart data={data.chartData} />
                ) : (
                   <Card className="h-[400px] flex items-center justify-center">
                     <div className="text-center text-muted-foreground">
                       <p>Not enough data for chart</p>
                       <p className="text-sm">Approve transactions to see history</p>
                     </div>
                   </Card>
                )}
              </div>
              <div className="col-span-1">
                 <Card className="h-[400px]">
                   <CardHeader>
                     <CardTitle>Allocation</CardTitle>
                   </CardHeader>
                   <CardContent className="flex items-center justify-center h-[320px]">
                     <div className="text-muted-foreground">Coming soon</div>
                   </CardContent>
                 </Card>
              </div>
            </div>
          </TabsContent>

          <TabsContent value="transactions" className="mt-6">
            <TransactionsTable transactions={data.transactions} />
          </TabsContent>
        </Tabs>
      </div>

      <AddTransactionDialog
        open={isDialogOpen}
        onClose={() => setIsDialogOpen(false)}
        methods={data.methods}
        onSubmit={handleAddTransaction}
      />
    </>
  );
}

