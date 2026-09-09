import { Skeleton } from "@/components/ui/skeleton"
import { PageHeaderSkeleton } from "@/components/skeletons/page-header-skeleton"
import { PortalPageContainer } from "@/components/portal/page-container"

/**
 * Mirrors the real Portfolio silhouette: title + two header actions, the tab
 * strip, then the KPI row and the chart card in that order.
 *
 * The old version promised a three-card grid and two loose blocks, which is
 * neither the layout nor the order the page renders. Keep the tab count and
 * the KPI count in sync with `components/portal/portfolio-client.tsx`.
 */
export default function PortfolioLoading() {
  return (
    <PortalPageContainer>
      <section className="space-y-6" aria-hidden="true">
        {/* Header: name + description left, Export / Add transaction right */}
        <PageHeaderSkeleton actions={2} descriptionWidth="w-80" />

        {/* Tab strip */}
        <Skeleton className="h-10 w-72 rounded-lg" />

        {/* Four KPI cards — the headline row */}
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-28 w-full rounded-xl" />
          ))}
        </div>

        {/* Chart card */}
        <div className="space-y-3 rounded-xl border bg-card p-6 shadow-sm">
          <div className="flex flex-wrap items-end justify-between gap-3">
            <div className="space-y-2">
              <Skeleton className="h-3 w-24" />
              <Skeleton className="h-8 w-44" />
            </div>
            <Skeleton className="h-7 w-56 rounded-full" />
          </div>
          <Skeleton className="h-64 w-full" />
        </div>
      </section>
    </PortalPageContainer>
  )
}
