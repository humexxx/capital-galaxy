"use client";

import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Eye, EyeOff, Plus, Download, MoreHorizontal, TrendingUp } from "lucide-react";
import { Switch } from "@/components/ui/switch"; 

type PortfolioHeaderProps = {
  portfolioName: string;
  totalValue: number;
  dailyChange: number;
  dailyChangePercentage: number;
  onAddTransaction: () => void;
  showCharts: boolean;
  onToggleCharts: () => void;
  hideValues: boolean;
  onToggleHideValues: () => void;
};

export function PortfolioHeader({
  portfolioName,
  totalValue,
  dailyChange,
  dailyChangePercentage,
  onAddTransaction,
  showCharts,
  onToggleCharts,
  hideValues,
  onToggleHideValues
}: PortfolioHeaderProps) {
  const isProfit = dailyChange >= 0;

  return (
    <div className="flex flex-col gap-6 w-full">
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
        {/* Left Side: Title and Balance */}
        <div className="space-y-1">
          <div className="flex items-center gap-2">
            <h1 className="text-xl font-semibold text-foreground/90">{portfolioName}</h1>
            <Badge variant="secondary" className="bg-blue-600/20 text-blue-500 hover:bg-blue-600/30 border-0 rounded-md px-2 py-0.5 text-xs">Default</Badge>
          </div>
          
          <div className="flex flex-col gap-1">
            <div className="flex items-center gap-2">
              <span className="text-4xl font-bold tracking-tight">
                {hideValues ? '****' : `$${totalValue.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`}
              </span>
              <button onClick={onToggleHideValues} className="focus:outline-none">
                {hideValues ? (
                   <EyeOff className="w-5 h-5 text-muted-foreground cursor-pointer hover:text-foreground" />
                ) : (
                   <Eye className="w-5 h-5 text-muted-foreground cursor-pointer hover:text-foreground" />
                )}
              </button>
            </div>
            <div className={`flex items-center gap-2 text-sm font-medium ${isProfit ? 'text-green-500' : 'text-red-500'}`}>
              <span>
                {hideValues ? '****' : `${isProfit ? '+' : '-'}$${Math.abs(dailyChange).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`}
              </span>
              <div className="flex items-center">
                 <TrendingUp className={`w-3 h-3 mr-1 ${!isProfit && 'rotate-180'}`} />
                 {Math.abs(dailyChangePercentage).toFixed(2)}% (24h)
              </div>
            </div>
          </div>
        </div>

        {/* Right Side: Actions */}
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2 mr-2">
            <span className="text-sm text-muted-foreground">Show charts</span>
             <Switch checked={showCharts} onCheckedChange={onToggleCharts} />
          </div>

          <Button onClick={onAddTransaction} className="bg-blue-600 hover:bg-blue-700 text-white gap-2">
            <Plus className="w-4 h-4" />
            Add Transaction
          </Button>

          <Button variant="outline" className="gap-2 bg-background">
            <Download className="w-4 h-4" />
            Export
          </Button>
          
          <Button variant="outline" size="icon" className="bg-background">
            <MoreHorizontal className="w-4 h-4" />
          </Button>
        </div>
      </div>
    </div>
  );
}
