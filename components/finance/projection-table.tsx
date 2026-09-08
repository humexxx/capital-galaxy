"use client";

import { useLayoutEffect, useMemo, useRef, useState } from "react";
import { Plus } from "lucide-react";

import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Mono } from "@/components/ui/typography";
import { formatCurrency } from "@/lib/utils/format";
import type { Projection, ProjectionMonth } from "@/types/finance";

// Anchor formatting in UTC because the projection generates dates at UTC
// midnight. Local-timezone formatting would shift a month for users in
// negative offsets (e.g. May 1 UTC renders as "Apr 30" in UTC-5/6).
const MONTH_FORMATTER = new Intl.DateTimeFormat("en-US", {
  month: "short",
  year: "2-digit",
  timeZone: "UTC",
});

type ProjectionTableProps = {
  projection: Projection;
  /** Limits the table to the first N months of the projection. When omitted
   *  the entire horizon is rendered. */
  monthsToShow?: number;
};

/** Keep months 1-12 + year-end milestones, identical to the chart densifier. */
function densify(months: ProjectionMonth[]): ProjectionMonth[] {
  if (months.length <= 24) return months;
  const kept: ProjectionMonth[] = [];
  for (let i = 0; i < months.length; i++) {
    if (i < 12 || (i + 1) % 12 === 0) kept.push(months[i]);
  }
  if (kept[kept.length - 1] !== months[months.length - 1]) {
    kept.push(months[months.length - 1]);
  }
  return kept;
}

// How many extra months a single "Load more" click reveals beyond the
// initial window. Kept at a clean year so the table grows in human-sized
// chunks rather than arbitrary numbers.
const LOAD_MORE_STEP = 12;

export function ProjectionTable({ projection, monthsToShow }: ProjectionTableProps) {
  const [showAll, setShowAll] = useState(false);
  // Extra months on top of the prop-supplied initial window. Reset whenever
  // the parent changes the horizon (e.g. user picks a different preset on
  // the projection card) so the extra doesn't carry over to a fresh range.
  // Uses the "track-previous-prop in state" pattern recommended by React 19
  // — see https://react.dev/learn/you-might-not-need-an-effect — instead of
  // a useEffect, which would cascade a render.
  const [extraMonths, setExtraMonths] = useState(0);
  const [resetKey, setResetKey] = useState<{
    monthsToShow?: number;
    total: number;
  }>({ monthsToShow, total: projection.months.length });
  if (
    resetKey.monthsToShow !== monthsToShow ||
    resetKey.total !== projection.months.length
  ) {
    setResetKey({ monthsToShow, total: projection.months.length });
    setExtraMonths(0);
  }

  const totalAvailable = projection.months.length;
  const baseCount =
    typeof monthsToShow === "number"
      ? Math.max(1, Math.min(monthsToShow, totalAvailable))
      : totalAvailable;
  const effectiveCount = Math.min(baseCount + extraMonths, totalAvailable);

  const visibleMonths = useMemo(
    () => projection.months.slice(0, effectiveCount),
    [projection.months, effectiveCount]
  );

  const hasInvestments = visibleMonths.some((m) => m.investments > 0.01);
  const isLongHorizon = visibleMonths.length > 24;
  const rows = useMemo(
    () => (showAll || !isLongHorizon ? visibleMonths : densify(visibleMonths)),
    [visibleMonths, showAll, isLongHorizon]
  );

  // Show the "Load 12 more months" button as long as we haven't exhausted the
  // projection's full horizon. The step is clamped against what's left so the
  // last click can be shorter than 12 (e.g. 7 remaining → "Load 7 more").
  const remaining = totalAvailable - effectiveCount;
  const nextStep = Math.min(LOAD_MORE_STEP, remaining);

  // Smooth-scroll to the first newly-revealed row after the user clicks
  // "Load more". The ref captures the row offset BEFORE the state update;
  // the layout effect runs after the new rows mount and animates the scroll
  // container to the first row whose monthOffset is >= that snapshot.
  // Falls back to the bottom of the container when no such row exists
  // (densified mode: new content lives only at the tail as year-ends).
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const pendingScrollOffsetRef = useRef<number | null>(null);
  useLayoutEffect(() => {
    const targetOffset = pendingScrollOffsetRef.current;
    if (targetOffset === null) return;
    pendingScrollOffsetRef.current = null;
    const container = scrollContainerRef.current;
    if (!container) return;
    const tbody = container.querySelector("tbody");
    if (!tbody) return;
    // Find the first <tr> whose data-month-offset matches the first row that
    // wasn't visible before the click.
    let targetRow: HTMLElement | null = null;
    for (const row of Array.from(tbody.children) as HTMLElement[]) {
      const v = row.dataset.monthOffset;
      if (v !== undefined && parseInt(v, 10) >= targetOffset) {
        targetRow = row;
        break;
      }
    }
    if (targetRow) {
      // Use getBoundingClientRect math so the calculation is independent of
      // the offsetParent chain — `offsetTop` could be relative to the table
      // or further up depending on intermediate positioning context.
      const containerRect = container.getBoundingClientRect();
      const rowRect = targetRow.getBoundingClientRect();
      const theadHeight =
        (container.querySelector("thead") as HTMLElement | null)?.offsetHeight ??
        0;
      const desired =
        container.scrollTop + (rowRect.top - containerRect.top) - theadHeight;
      container.scrollTo({
        top: Math.max(0, desired),
        behavior: "smooth",
      });
    } else {
      // Densified case: no row with monthOffset ≥ snapshot exists in the
      // visible array, so scroll to the bottom to reveal the new year-end
      // markers that were appended.
      container.scrollTo({
        top: container.scrollHeight,
        behavior: "smooth",
      });
    }
  }, [rows]);

  const handleLoadMore = () => {
    // Snapshot the first-new-row offset BEFORE bumping state — after the
    // re-render the layout effect uses this to decide where to scroll.
    pendingScrollOffsetRef.current = effectiveCount;
    setExtraMonths((v) => v + nextStep);
  };

  return (
    <div className="space-y-2">
      {isLongHorizon && (
        <div className="flex items-center justify-between rounded-md border bg-muted/30 px-3 py-2 text-xs text-muted-foreground">
          <span>
            {showAll
              ? `Showing all ${visibleMonths.length} months`
              : `Showing the first 12 months + each year-end (${rows.length} of ${visibleMonths.length})`}
          </span>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={() => setShowAll((v) => !v)}
          >
            {showAll ? "Compact view" : "Show every month"}
          </Button>
        </div>
      )}
      <div className="rounded-md border">
        <div
          ref={scrollContainerRef}
          className="max-h-120 overflow-auto scroll-smooth"
        >
          {/* One step down from the primitive's text-sm: this table is a dense
              wall of currency, and 14px numerals made every column shout. The
              header steps with it so the grid still reads as one block. */}
          <Table className="text-xs">
            <TableHeader className="sticky top-0 bg-card">
              <TableRow>
                <TableHead className="w-20">Month</TableHead>
                <TableHead className="text-right">Income</TableHead>
                <TableHead className="text-right">Expenses</TableHead>
                <TableHead className="text-right">Debt pmt</TableHead>
                <TableHead className="text-right" title="Investment + savings interest earned minus debt interest accrued">
                  Net interest
                </TableHead>
                {hasInvestments && <TableHead className="text-right">Investments</TableHead>}
                <TableHead className="text-right">Total debt</TableHead>
                <TableHead className="text-right">Net worth</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((m) => (
                <TableRow key={m.monthOffset} data-month-offset={m.monthOffset}>
                  <TableCell className="font-medium">
                    <Mono>{MONTH_FORMATTER.format(m.date)}</Mono>
                  </TableCell>
                  <TableCell className="text-right">
                    <Mono>{formatCurrency(m.income)}</Mono>
                  </TableCell>
                  <TableCell className="text-right text-muted-foreground">
                    <Mono>{formatCurrency(m.expenses)}</Mono>
                  </TableCell>
                  <TableCell className="text-right text-muted-foreground">
                    <Mono>{formatCurrency(m.scheduledDebtPayments)}</Mono>
                  </TableCell>
                  <TableCell className="text-right">
                    {(() => {
                      // Net interest = what compounded into your favour minus what
                      // accrued against you. Positive (green) once investments earn
                      // more than debts cost; negative (red) when debts dominate.
                      const net =
                        m.investmentsInterest + m.savingsInterest - m.totalInterestAccrued;
                      if (Math.abs(net) < 0.005) {
                        return <span className="text-muted-foreground">—</span>;
                      }
                      const isPositive = net > 0;
                      return (
                        <Mono
                          className={isPositive ? "text-success" : "text-destructive"}
                          title={`Earned ${formatCurrency(m.investmentsInterest + m.savingsInterest)} · Paid ${formatCurrency(m.totalInterestAccrued)}`}
                        >
                          {isPositive ? "+" : "−"}
                          {formatCurrency(Math.abs(net))}
                        </Mono>
                      );
                    })()}
                  </TableCell>
                  {hasInvestments && (
                    <TableCell className="text-right font-mono tabular-nums text-primary">
                      {formatCurrency(m.investments)}
                    </TableCell>
                  )}
                  <TableCell className="text-right font-mono tabular-nums">
                    {formatCurrency(m.totalDebt)}
                  </TableCell>
                  <TableCell
                    className={`text-right font-mono font-semibold tabular-nums ${
                      m.netWorth >= 0
                        ? "text-success"
                        : "text-destructive"
                    }`}
                  >
                    {formatCurrency(m.netWorth)}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      </div>
      {remaining > 0 && (
        // Footer button sits OUTSIDE the scroll container so it's always
        // visible at the bottom of the table, regardless of how far the
        // user has scrolled inside the table body.
        <div className="flex items-center justify-between rounded-md border bg-muted/30 px-3 py-2 text-xs text-muted-foreground">
          <span>
            Showing {effectiveCount} of {totalAvailable} months
          </span>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={handleLoadMore}
          >
            <Plus className="mr-1 h-3.5 w-3.5" />
            Load {nextStep} more {nextStep === 1 ? "month" : "months"}
          </Button>
        </div>
      )}
    </div>
  );
}
