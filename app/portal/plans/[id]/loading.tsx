import { Skeleton } from "@/components/ui/skeleton";

/**
 * Skeleton that mirrors the PlanEditor silhouette: a lightweight header (title +
 * Overview tab + More) and the Polymarket-style Overview hero — a 3/4 main panel
 * (view-switcher toolbar + the default Graph view) beside the 1/4 gauge / cycle
 * / strategy sidebar. Matching spacing + breakpoints keeps the swap to the real
 * editor a content fill-in, not a layout shift.
 */
export default function PlanDetailLoading() {
  return (
    <section className="space-y-4" aria-hidden="true">
      <div className="space-y-6">
        {/* Header: title + subtitle on the left, Overview tab + More on the
            right (the back arrow lives in the title's left gutter). */}
        <div className="flex flex-wrap items-start justify-between gap-x-4 gap-y-3">
          <div className="min-w-0 space-y-1">
            <Skeleton className="h-7 w-48" />
            <Skeleton className="h-4 w-96 max-w-full" />
            {/* "Current period · …" line (period-mode plans) */}
            <Skeleton className="h-3 w-40" />
          </div>
          <div className="flex flex-wrap items-center gap-2">
            {/* TabsList: a single Overview trigger */}
            <div className="bg-muted/60 inline-flex h-9 items-center gap-1 rounded-md p-1">
              <Skeleton className="h-7 w-20" />
            </div>
            {/* "More" dropdown trigger */}
            <Skeleton className="h-10 w-20" />
          </div>
        </div>

        {/* Overview hero: 3/4 main panel + 1/4 sidebar (stacked on mobile). */}
        <div className="grid gap-4 lg:grid-cols-4 lg:items-start">
          <div className="min-w-0 space-y-3 lg:col-span-3">
            {/* Default Graph view card — fixed panel height on lg (matches
                ProjectionPanel's lg:h-[640px] view box) */}
            <div className="flex flex-col rounded-xl border bg-card text-card-foreground shadow-sm lg:h-[640px]">
              <div className="flex flex-col gap-3 p-6 pb-3">
                {/* KPIs (Today / Next / End) + horizon presets share the top row */}
                <div className="flex flex-wrap items-end justify-between gap-x-4 gap-y-2">
                  <div className="flex items-end gap-6">
                    <div className="space-y-1.5">
                      <Skeleton className="h-3 w-16" />
                      <Skeleton className="h-7 w-28" />
                    </div>
                    <div className="space-y-1.5">
                      <Skeleton className="h-3 w-14" />
                      <Skeleton className="h-5 w-20" />
                    </div>
                    <div className="space-y-1.5">
                      <Skeleton className="h-3 w-14" />
                      <Skeleton className="h-5 w-20" />
                    </div>
                  </div>
                  <div className="flex items-center gap-1">
                    <Skeleton className="h-8 w-14" />
                    <Skeleton className="h-8 w-12" />
                    <Skeleton className="h-8 w-12" />
                    <Skeleton className="h-8 w-14" />
                  </div>
                </div>
              </div>
              <div className="p-6 pt-0 lg:min-h-0 lg:flex-1">
                {/* Chart canvas — fills the fixed-height card on lg */}
                <Skeleton className="h-72 w-full sm:h-80 lg:h-full" />
              </div>
            </div>

            {/* View-switcher (Graph / Table / Calendar) pinned at the bottom */}
            <div className="flex justify-center pt-1">
              <div className="bg-muted/30 inline-flex items-center gap-1 rounded-md border p-1">
                <Skeleton className="h-7 w-20" />
                <Skeleton className="h-7 w-20" />
                <Skeleton className="h-7 w-24" />
              </div>
            </div>
          </div>

          {/* Sidebar: condensed figures card (gauge + rows, stretches) + debt
              strategy card — column min-height matches the main panel box */}
          <div className="flex min-w-0 flex-col gap-3 lg:h-[640px] lg:gap-4">
            <div className="rounded-xl border bg-card text-card-foreground shadow-sm lg:flex-1">
              <div className="space-y-4 px-6 pt-4 pb-6">
                <div className="flex flex-col items-center gap-1.5">
                  <Skeleton className="size-30 rounded-full" />
                  <Skeleton className="h-3 w-24" />
                </div>
                <div>
                  {Array.from({ length: 4 }).map((_, i) => (
                    <div
                      key={i}
                      className="flex items-center justify-between gap-3 border-t py-2.5"
                    >
                      <Skeleton className="h-3 w-20" />
                      <Skeleton className="h-4 w-16" />
                    </div>
                  ))}
                </div>
              </div>
            </div>
            <div className="rounded-xl border bg-card text-card-foreground shadow-sm">
              <div className="space-y-3 px-6 pt-6 pb-6">
                <Skeleton className="h-3 w-28" />
                <div className="grid gap-1.5">
                  {Array.from({ length: 3 }).map((_, i) => (
                    <Skeleton key={i} className="h-13 w-full rounded-md" />
                  ))}
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
