import { Skeleton } from "@/components/ui/skeleton"
import { PageHeaderSkeleton } from "@/components/skeletons/page-header-skeleton"

/**
 * Mirrors the real Compare screen: back link, header, then the two cards
 * `CompareView` renders — the plan selector (a row of wrapping chips) and the
 * projection chart.
 *
 * The old version was a single `h-96` block, which is neither the shape nor
 * the count: the selector card sits above the chart and pushes it down.
 */
export default function ComparePlansLoading() {
  return (
    <section className="space-y-6" aria-hidden="true">
      <Skeleton className="h-8 w-32" />

      <PageHeaderSkeleton descriptionWidth="w-80" />

      {/* Selector card — one chip per plan */}
      <div className="space-y-3 rounded-xl border bg-card p-6 shadow-sm">
        <Skeleton className="h-4 w-32" />
        <div className="flex flex-wrap gap-3">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-9 w-36 rounded-full" />
          ))}
        </div>
      </div>

      {/* Chart card — title left, metric switcher right */}
      <div className="space-y-4 rounded-xl border bg-card p-6 shadow-sm">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <Skeleton className="h-5 w-44" />
          <Skeleton className="h-10 w-56 rounded-lg" />
        </div>
        <Skeleton className="h-80 w-full" />
      </div>
    </section>
  )
}
