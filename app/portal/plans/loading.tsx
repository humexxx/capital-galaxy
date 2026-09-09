import { Skeleton } from "@/components/ui/skeleton"
import { PageHeaderSkeleton } from "@/components/skeletons/page-header-skeleton"

/**
 * Mirrors the PlansWorkspace silhouette: page header with its action, then the
 * hero grid — the projection-comparison card across 2/3 and the plan rail on
 * the right third. The generic PageSkeleton promised a four-card grid, so the
 * swap to the real layout read as a jump rather than content filling in.
 *
 * Keep the grid, the chart height and the rail row height in sync with
 * `components/finance/plans-workspace.tsx`.
 */
export default function PlansLoading() {
  return (
    <section className="space-y-6" aria-hidden="true">
      {/* PageHeader: title + description on the left, "New plan" on the right */}
      <PageHeaderSkeleton actions={1} descriptionWidth="w-80" />

      <div className="grid gap-4 lg:grid-cols-3">
        {/* Projection comparison */}
        <div className="min-w-0 rounded-xl border bg-card shadow-sm lg:col-span-2">
          <div className="flex flex-wrap items-center justify-between gap-2 px-6 pt-6 pb-2">
            <Skeleton className="h-5 w-44" />
            <div className="flex flex-wrap items-center gap-2">
              {/* horizon select + metric tabs */}
              <Skeleton className="h-8 w-38" />
              <Skeleton className="h-10 w-52" />
            </div>
          </div>
          <div className="px-3 pb-6 sm:px-6">
            <Skeleton className="h-64 w-full sm:h-80 lg:h-[460px]" />
          </div>
        </div>

        {/* Your plans rail */}
        <div className="min-w-0 rounded-xl border bg-card shadow-sm">
          <div className="space-y-2 px-6 pt-6 pb-2">
            <Skeleton className="h-3 w-24" />
            <Skeleton className="h-3 w-full" />
          </div>
          <div className="space-y-2 px-6 pb-6">
            {Array.from({ length: 3 }).map((_, i) => (
              <Skeleton key={i} className="h-18 w-full rounded-lg" />
            ))}
          </div>
        </div>
      </div>
    </section>
  )
}
