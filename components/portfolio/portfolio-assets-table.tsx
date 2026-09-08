"use client";

import { MoreHorizontal, TrendingDown, TrendingUp } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { Mono, Text } from "@/components/ui/typography";
import { cn } from "@/lib/utils";
import {
  formatCurrency,
  formatSignedCurrency,
  formatSignedPercent,
} from "@/lib/utils/format";
import type { PortfolioAsset } from "@/types/portfolio";

type PortfolioAssetsTableProps = {
  assets: PortfolioAsset[];
};

export function PortfolioAssetsTable({ assets }: PortfolioAssetsTableProps) {
  if (assets.length === 0) {
    return (
      <EmptyState
        title="No assets yet"
        description="Add your first transaction to get started."
      />
    );
  }

  return (
    <div className="divide-y rounded-lg border bg-card">
      {assets.map((asset) => (
        <AssetRow key={asset.investmentMethod.id} asset={asset} />
      ))}
    </div>
  );
}

function AssetRow({ asset }: { asset: PortfolioAsset }) {
  const positive = asset.profitLoss >= 0;
  const profitTone = positive
    ? "text-success"
    : "text-destructive";
  const Trend = positive ? TrendingUp : TrendingDown;

  const holdingAmountVisible = asset.holdingAmount > 0;
  const pendingOnly = !holdingAmountVisible && asset.pendingAmount > 0;

  return (
    <div className="flex flex-col gap-3 px-4 py-3 sm:flex-row sm:items-center">
      {/* Identity — avatar + name + sub-meta */}
      <div className="flex items-center gap-3 sm:flex-1 sm:min-w-0">
        <span
          aria-hidden
          className="grid size-10 shrink-0 place-items-center rounded-full bg-primary/10 text-sm font-semibold text-primary"
        >
          {asset.investmentMethod.name.substring(0, 2).toUpperCase()}
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <Text className="truncate font-medium">
              {asset.investmentMethod.name}
            </Text>
            {asset.hasPendingTransactions && (
              <Badge variant="outline" className="h-4 px-1.5 text-2xs">
                Pending
              </Badge>
            )}
          </div>
          <Mono className="text-xs text-muted-foreground tabular-nums">
            {asset.investmentMethod.name}
            {asset.investmentMethod.monthlyRoi !== undefined &&
              ` · ${asset.investmentMethod.monthlyRoi}% ROI/mo`}
          </Mono>
        </div>
      </div>

      {/* Holdings — primary metric */}
      <div className="flex items-baseline gap-2 sm:w-40 sm:justify-end">
        {holdingAmountVisible && (
          <>
            <Mono className="text-base font-semibold tabular-nums sm:text-lg">
              {formatCurrency(asset.holdingAmount)}
            </Mono>
            {asset.pendingAmount > 0 && (
              <Mono className="text-xs text-muted-foreground tabular-nums">
                +{formatCurrency(asset.pendingAmount)}
              </Mono>
            )}
          </>
        )}
        {pendingOnly && (
          <Mono className="text-base font-medium tabular-nums text-muted-foreground sm:text-lg">
            {formatCurrency(asset.pendingAmount)}
          </Mono>
        )}
      </div>

      {/* Profit/Loss — delta indicator §7 */}
      <div className="flex items-baseline gap-2 sm:w-44 sm:justify-end">
        <Mono className={cn("text-base font-semibold tabular-nums sm:text-lg", profitTone)}>
          {formatSignedCurrency(asset.profitLoss)}
        </Mono>
        <span className={cn("inline-flex items-center gap-0.5 text-xs font-medium", profitTone)}>
          <Trend className="size-3" />
          <Mono className="tabular-nums">
            {formatSignedPercent(asset.profitLossPercentage).replace(/^[+-]/, "")}
          </Mono>
        </span>
      </div>

      {/* Action */}
      <div className="flex justify-end sm:w-auto sm:shrink-0">
        <Button
          variant="ghost"
          size="icon"
          className="size-8"
          aria-label={`Actions for ${asset.investmentMethod.name}`}
        >
          <MoreHorizontal className="h-4 w-4" />
        </Button>
      </div>
    </div>
  );
}
