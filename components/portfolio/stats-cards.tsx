"use client";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Info } from "lucide-react";

type StatsCardsProps = {
  allTimeProfit: number;
  allTimeProfitPercentage: number;
  costBasis: number;
  bestPerformer?: {
    symbol: string;
    profit: number;
    profitPercentage: number;
  };
  worstPerformer?: {
    symbol: string;
    profit: number;
    profitPercentage: number;
  };
  hideValues: boolean;
};

export function StatsCards({
  allTimeProfit,
  allTimeProfitPercentage,
  costBasis,
  bestPerformer,
  worstPerformer,
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

      {/* Best Performer */}
      <Card className="bg-card py-2 gap-2">
         <CardHeader className="flex flex-row items-center justify-between space-y-0 p-3 pb-1">
           <div className="flex items-center gap-1 text-muted-foreground">
            <CardTitle className="text-xs font-medium">Best Performer</CardTitle>
           </div>
        </CardHeader>
        <CardContent className="p-3 pt-1">
          {bestPerformer ? (
             <div className="flex flex-col">
                <div className="flex items-center gap-1.5 mb-1">
                   <div className="w-5 h-5 rounded-full bg-orange-500 flex items-center justify-center text-white text-[10px] font-bold shrink-0">
                      {bestPerformer.symbol.substring(0, 1)}
                   </div>
                   <span className="text-sm font-bold truncate">{bestPerformer.symbol}</span>
                </div>
                <div className="text-xs text-green-500 font-medium whitespace-nowrap">
                   {hideValues ? '****' : `+$${bestPerformer.profit.toLocaleString()}`} <span className="opacity-80">+{bestPerformer.profitPercentage.toFixed(2)}%</span>
                </div>
             </div>
          ) : (
            <div className="flex flex-col justify-center h-full">
               <span className="text-sm font-semibold text-muted-foreground">N/A</span>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Worst Performer */}
      <Card className="bg-card py-2 gap-2">
         <CardHeader className="flex flex-row items-center justify-between space-y-0 p-3 pb-1">
           <div className="flex items-center gap-1 text-muted-foreground">
            <CardTitle className="text-xs font-medium">Worst Performer</CardTitle>
           </div>
        </CardHeader>
        <CardContent className="p-3 pt-1">
           {worstPerformer ? (
             <div className="flex flex-col">
                <div className="flex items-center gap-1.5 mb-1">
                    <div className="w-5 h-5 rounded-full bg-blue-500 flex items-center justify-center text-white text-[10px] font-bold shrink-0">
                      {worstPerformer.symbol.substring(0, 1)}
                   </div>
                   <span className="text-sm font-bold truncate">{worstPerformer.symbol}</span>
                </div>
                <div className="text-xs text-red-500 font-medium whitespace-nowrap">
                   {hideValues ? '****' : `-$${Math.abs(worstPerformer.profit).toLocaleString()}`} <span className="opacity-80">-{Math.abs(worstPerformer.profitPercentage).toFixed(2)}%</span>
                </div>
             </div>
          ) : (
            <div className="flex flex-col justify-center h-full">
               <span className="text-sm font-semibold text-muted-foreground">N/A</span>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
