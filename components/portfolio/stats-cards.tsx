"use client";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Info } from "lucide-react";

type StatsCardsProps = {
  allTimeProfit: number;
  allTimeProfitPercentage: number;
  costBasis: number;
  totalInvestmentMethods?: number;
  activeTransactions?: number;
  hideValues: boolean;
};

export function StatsCards({
  allTimeProfit,
  allTimeProfitPercentage,
  costBasis,
  totalInvestmentMethods = 0,
  activeTransactions = 0,
  hideValues
}: StatsCardsProps) {
  const isProfit = allTimeProfit >= 0;

  return (
    <div className="grid gap-4 xl:grid-cols-8 lg:grid-cols-6 md:grid-cols-4 sm:grid-cols-2">
      {/* All-time Profit */}
      <Card className="bg-card py-2 gap-2">
        <CardHeader className="flex flex-row items-center justify-between space-y-0 p-3 pb-1">
           <div className="flex items-center gap-1 text-muted-foreground">
            <CardTitle className="text-xs font-medium">All-time profit</CardTitle>
            <Info className="w-3 h-3" />
           </div>
        </CardHeader>
        <CardContent className="p-3 pt-1">
          <div className={`text-lg font-bold ${isProfit ? 'text-green-500' : 'text-red-500'}`}>
            {hideValues ? '****' : `${isProfit ? '+' : '-'}$${Math.abs(allTimeProfit).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`}
          </div>
          <p className={`text-xs font-medium ${isProfit ? 'text-green-500' : 'text-red-500'}`}>
             {isProfit ? '▲' : '▼'} {Math.abs(allTimeProfitPercentage).toFixed(2)}%
          </p>
        </CardContent>
      </Card>

      {/* Cost Basis */}
      <Card className="bg-card py-2 gap-2">
        <CardHeader className="flex flex-row items-center justify-between space-y-0 p-3 pb-1">
           <div className="flex items-center gap-1 text-muted-foreground">
            <CardTitle className="text-xs font-medium">Cost Basis</CardTitle>
            <Info className="w-3 h-3" />
           </div>
        </CardHeader>
        <CardContent className="p-3 pt-1">
          <div className="text-lg font-bold text-foreground">
            {hideValues ? '****' : `$${costBasis.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`}
          </div>
        </CardContent>
      </Card>

      {/* Investment Methods */}
      <Card className="bg-card py-2 gap-2">
         <CardHeader className="flex flex-row items-center justify-between space-y-0 p-3 pb-1">
           <div className="flex items-center gap-1 text-muted-foreground">
            <CardTitle className="text-xs font-medium">Investment Methods</CardTitle>
            <Info className="w-3 h-3" />
           </div>
        </CardHeader>
        <CardContent className="p-3 pt-1">
          <div className="text-lg font-bold text-foreground">
            {totalInvestmentMethods}
          </div>
          <p className="text-xs text-muted-foreground">
            Active methods
          </p>
        </CardContent>
      </Card>

      {/* Active Transactions */}
      <Card className="bg-card py-2 gap-2">
         <CardHeader className="flex flex-row items-center justify-between space-y-0 p-3 pb-1">
           <div className="flex items-center gap-1 text-muted-foreground">
            <CardTitle className="text-xs font-medium">Active Transactions</CardTitle>
            <Info className="w-3 h-3" />
           </div>
        </CardHeader>
        <CardContent className="p-3 pt-1">
          <div className="text-lg font-bold text-foreground">
            {activeTransactions}
          </div>
          <p className="text-xs text-muted-foreground">
            Open positions
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
