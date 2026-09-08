"use client";

import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { EmptyState } from "@/components/ui/empty-state";
import { Mono, Text } from "@/components/ui/typography";
import { maskValue, statToneClass } from "@/components/ui/stat-card";
import { formatCurrency } from "@/lib/utils/format";
import { cn } from "@/lib/utils";

export type InvestorSummaryRow = {
  investorId: string;
  name: string;
  movements: number;
  contributed: number;
  owed: number;
  positionValue: number;
  profitLoss: number;
};

/**
 * One row per investor: the relationship, not its transactions.
 *
 * Listing every movement made this a wall of rows in which the interesting
 * question — how is each person doing, and what does their promise cost — had
 * to be reconstructed by eye.
 *
 * The columns deliberately mirror the tail of `TransactionsTable`: Total,
 * Worth now, P/L, Owed, same order and same alignment. They measure the same
 * quantities, and naming them differently made two tables that belong together
 * look unrelated.
 */
export function InvestorSummaryTable({
  rows,
  hideValues = false,
}: {
  rows: InvestorSummaryRow[];
  hideValues?: boolean;
}) {
  if (rows.length === 0) {
    return (
      <EmptyState
        title="No outside investors yet"
        description="People who invest in your methods will appear here."
      />
    );
  }

  const money = (v: number) => {
    const formatted = formatCurrency(v);
    return hideValues ? maskValue(formatted) : formatted;
  };

  return (
    <div className="relative overflow-x-auto">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Investor</TableHead>
            <TableHead>Movements</TableHead>
            <TableHead className="text-right">Total</TableHead>
            <TableHead className="text-right">Worth now</TableHead>
            <TableHead className="text-right">P/L</TableHead>
            <TableHead className="text-right">Owed</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows.map((r) => (
            <TableRow key={r.investorId}>
              <TableCell>
                <Text className="text-xs font-medium">{r.name}</Text>
              </TableCell>
              <TableCell>
                <Mono className="text-xs tabular-nums">{r.movements}</Mono>
              </TableCell>
              <TableCell className="text-right">
                <Mono className="text-xs font-semibold tabular-nums">
                  {money(r.contributed)}
                </Mono>
              </TableCell>
              <TableCell className="text-right">
                <Mono className="text-xs tabular-nums">{money(r.positionValue)}</Mono>
                {r.contributed > 0 && (
                  <Mono
                    className={cn(
                      "block text-2xs tabular-nums",
                      statToneClass(
                        r.positionValue >= r.contributed ? "positive" : "negative"
                      )
                    )}
                  >
                    {(
                      ((r.positionValue - r.contributed) / r.contributed) *
                      100
                    ).toFixed(1)}
                    %
                  </Mono>
                )}
              </TableCell>
              <TableCell className="text-right">
                <Mono
                  className={cn(
                    "text-xs tabular-nums",
                    statToneClass(r.profitLoss >= 0 ? "positive" : "negative")
                  )}
                >
                  {money(r.profitLoss)}
                </Mono>
                {r.contributed > 0 && (
                  <Mono
                    className={cn(
                      "block text-2xs tabular-nums",
                      statToneClass(r.profitLoss >= 0 ? "positive" : "negative")
                    )}
                  >
                    {r.profitLoss >= 0 ? "+" : ""}
                    {((r.profitLoss / r.contributed) * 100).toFixed(1)}%
                  </Mono>
                )}
              </TableCell>
              <TableCell className="text-right">
                <Mono className="text-xs font-medium tabular-nums">{money(r.owed)}</Mono>
                {r.contributed > 0 && (
                  <Mono className="block text-2xs tabular-nums text-success">
                    +{(((r.owed - r.contributed) / r.contributed) * 100).toFixed(2)}%
                  </Mono>
                )}
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}
