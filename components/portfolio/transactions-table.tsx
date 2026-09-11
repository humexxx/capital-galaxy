"use client";

import { format } from "date-fns";

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
import { formatCurrency, formatSignedPercent } from "@/lib/utils/format";
import { StatusBadge, TypeBadge } from "./transaction-badges";
import type { TransactionStatus, TransactionType } from "@/types/portfolio";
import { cn } from "@/lib/utils";

export type TransactionAllocationView = {
  symbol: string;
  quantity: number;
  invested: number;
  priceAtPurchase: number;
  /** Latest price, null when the asset has never been quoted. */
  price: number | null;
};

/**
 * One normalised row shape for every transaction table.
 *
 * The owner's own history and their investors' movements used to be two
 * components with different columns, which made the same fact look like two
 * different things depending on whose row it was.
 */
export type TransactionRow = {
  id: string;
  date: string;
  methodName: string;
  /** Only set on rows belonging to somebody else. */
  investorId?: string;
  investorName?: string | null;
  type: TransactionType;
  status: TransactionStatus;
  total: string;
  initialValue: string | null;
  currentValue: string | null;
  allocations: TransactionAllocationView[];
};

export function TransactionsTable({
  rows,
  showInvestor = false,
  showStatus = false,
  hideValues = false,
  emptyTitle = "No transactions yet",
  emptyDescription = "Add your first transaction to get started.",
}: {
  rows: TransactionRow[];
  /** Adds the Investor column — only meaningful for other people's rows. */
  showInvestor?: boolean;
  /** Off by default: the list is filtered to approved rows, so a column
   *  reading "approved" on every line is a column of noise. It comes back
   *  with the detailed view, where the other statuses do too. */
  showStatus?: boolean;
  hideValues?: boolean;
  emptyTitle?: string;
  emptyDescription?: string;
}) {
  if (rows.length === 0) {
    return <EmptyState title={emptyTitle} description={emptyDescription} />;
  }

  const money = (v: number | string | null | undefined) => {
    if (v === null || v === undefined) return "—";
    const n = typeof v === "string" ? parseFloat(v) : v;
    if (!Number.isFinite(n)) return "—";
    const formatted = formatCurrency(n);
    return hideValues ? maskValue(formatted) : formatted;
  };

  return (
    // No border here: this table always sits inside a Card, and its own frame
    // produced a second box around the first.
    <div className="relative overflow-x-auto">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Date</TableHead>
            {showInvestor && <TableHead>Investor</TableHead>}
            <TableHead>Method</TableHead>
            <TableHead>Type</TableHead>
            <TableHead className="text-right">Total</TableHead>
            <TableHead>Bought</TableHead>
            <TableHead className="text-right">Worth now</TableHead>
            <TableHead className="text-right">P/L</TableHead>
            <TableHead className="text-right">Owed</TableHead>
            {showStatus && <TableHead>Status</TableHead>}
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows.map((r) => {
            const owed = r.currentValue === null ? null : parseFloat(r.currentValue);
            const initial = r.initialValue === null ? null : parseFloat(r.initialValue);
            const growth =
              owed !== null && initial !== null && initial > 0
                ? ((owed - initial) / initial) * 100
                : null;

            // What the position this transaction created is worth today.
            const priced = r.allocations.filter((a) => a.price !== null);
            const value = priced.reduce((s, a) => s + a.quantity * (a.price ?? 0), 0);
            const invested = r.allocations.reduce((s, a) => s + a.invested, 0);
            const pl =
              r.allocations.length > 0 && priced.length === r.allocations.length
                ? value - invested
                : null;

            return (
              <TableRow key={r.id}>
                <TableCell>
                  <Mono className="text-xs">{format(new Date(r.date), "MMM d, yyyy")}</Mono>
                </TableCell>

                {showInvestor && (
                  <TableCell>
                    <Text className="text-xs font-medium">{r.investorName ?? "—"}</Text>
                  </TableCell>
                )}

                <TableCell>
                  <Text as="span" className="block max-w-40 truncate text-xs font-medium">
                    {r.methodName}
                  </Text>
                </TableCell>

                <TableCell>
                  <TypeBadge type={r.type} />
                </TableCell>

                <TableCell className="text-right">
                  <Mono className="text-xs font-semibold tabular-nums">{money(r.total)}</Mono>
                </TableCell>

                {/* The allocation as it stood that day: units at that day's price. */}
                <TableCell>
                  {r.allocations.length === 0 ? (
                    <Text className="text-2xs text-muted-foreground">not priced</Text>
                  ) : (
                    r.allocations.map((a) => (
                      <div key={a.symbol} className="whitespace-nowrap">
                        <Mono className="text-xs tabular-nums">
                          {a.quantity.toLocaleString(undefined, {
                            maximumFractionDigits: 2,
                          })}{" "}
                          {a.symbol}
                        </Mono>
                        <Mono className="block text-2xs text-muted-foreground tabular-nums">
                          @ {formatCurrency(a.priceAtPurchase)}
                        </Mono>
                      </div>
                    ))
                  )}
                </TableCell>

                <TableCell className="text-right">
                  <Mono className="text-xs tabular-nums">
                    {r.allocations.length === 0 || priced.length === 0 ? "—" : money(value)}
                  </Mono>
                </TableCell>

                <TableCell className="text-right">
                  <Mono
                    className={cn(
                      "text-xs tabular-nums",
                      statToneClass(pl === null ? "neutral" : pl >= 0 ? "positive" : "negative")
                    )}
                  >
                    {pl === null ? "—" : money(pl)}
                  </Mono>
                  {pl !== null && invested > 0 && (
                    <Mono
                      className={cn(
                        "block text-2xs tabular-nums",
                        statToneClass(pl >= 0 ? "positive" : "negative")
                      )}
                    >
                      {pl >= 0 ? "+" : ""}
                      {((pl / invested) * 100).toFixed(1)}%
                    </Mono>
                  )}
                </TableCell>

                {/* What the investor is promised — fixed, and unrelated to P/L. */}
                <TableCell className="text-right">
                  {owed === null ? (
                    <Text className="text-2xs text-muted-foreground">—</Text>
                  ) : (
                    <>
                      <Mono className="text-xs font-medium tabular-nums">{money(owed)}</Mono>
                      {growth !== null && (
                        <Mono
                          className={cn(
                            "block text-2xs tabular-nums",
                            statToneClass(growth >= 0 ? "positive" : "negative")
                          )}
                        >
                          {formatSignedPercent(growth)}
                        </Mono>
                      )}
                    </>
                  )}
                </TableCell>

                {showStatus && (
                  <TableCell>
                    <StatusBadge status={r.status} />
                  </TableCell>
                )}
              </TableRow>
            );
          })}
        </TableBody>
      </Table>
    </div>
  );
}
