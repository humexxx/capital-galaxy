"use client";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

type PortfolioOverviewProps = {
  portfolioName: string;
  totalValue: number;
  allTimeProfit: number;
  allTimeProfitPercentage: number;
  costBasis: number;
};

export function PortfolioOverview({
  portfolioName,
  totalValue,
  allTimeProfit,
  allTimeProfitPercentage,
  costBasis,
}: PortfolioOverviewProps) {
  const isProfit = allTimeProfit >= 0;

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center gap-2">
        <h2 className="text-3xl font-bold">{portfolioName}</h2>
        <Badge variant="secondary">Default</Badge>
      </div>
      
      <div className="flex items-baseline gap-2">
        <span className="text-4xl font-bold">${totalValue.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
        {allTimeProfit !== 0 && (
          <span className={`text-lg font-semibold ${isProfit ? 'text-green-500' : 'text-red-500'}`}>
            {isProfit ? '+' : '-'}${Math.abs(allTimeProfit).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ({isProfit ? '+' : ''}{allTimeProfitPercentage.toFixed(2)}%)
          </span>
        )}
      </div>

      <div className="grid gap-4 md:grid-cols-3">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">All-time profit</CardTitle>
          </CardHeader>
          <CardContent>
            <div className={`text-2xl font-bold ${isProfit ? 'text-green-500' : 'text-red-500'}`}>
              ${Math.abs(allTimeProfit).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
            </div>
            <p className={`text-xs ${isProfit ? 'text-green-500' : 'text-red-500'}`}>
              {isProfit ? '+' : ''}{allTimeProfitPercentage.toFixed(2)}%
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Cost Basis</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              ${costBasis.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Best Performer</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">N/A</div>
            <p className="text-xs text-muted-foreground">No data yet</p>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
