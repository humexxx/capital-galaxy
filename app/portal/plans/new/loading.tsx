import { Skeleton } from "@/components/ui/skeleton"
import { PageHeaderSkeleton } from "@/components/skeletons/page-header-skeleton"

/**
 * Mirrors `PlanForm`: three cards, not one flat form.
 *
 * The old version rendered `FormSkeleton rows={4}` — a single stack of four
 * inputs — while the real page is a 9-field two-column card plus Debt
 * acceleration and Auto-invest. The placeholder was about a third of the
 * final height, so the page lurched downwards on hydration.
 *
 * Keep the card count and the first card's field count in sync with
 * `components/finance/plan-form.tsx`.
 */
function FieldPair() {
  return (
    <div className="space-y-2">
      <Skeleton className="h-3 w-24" />
      <Skeleton className="h-10 w-full" />
    </div>
  )
}

function FormCard({
  children,
  titleWidth,
}: {
  children: React.ReactNode
  titleWidth: string
}) {
  return (
    <div className="space-y-4 rounded-xl border bg-card p-6 shadow-sm">
      <Skeleton className={`h-5 ${titleWidth}`} />
      {children}
    </div>
  )
}

export default function NewPlanLoading() {
  return (
    <section className="space-y-6" aria-hidden="true">
      <PageHeaderSkeleton descriptionWidth="w-96" />

      {/* Plan basics — two-column grid of name, description, dates, savings… */}
      <FormCard titleWidth="w-28">
        <div className="grid gap-4 sm:grid-cols-2">
          {Array.from({ length: 8 }).map((_, i) => (
            <FieldPair key={i} />
          ))}
        </div>
      </FormCard>

      {/* Debt acceleration — toggle, aggressiveness slider, payoff method */}
      <FormCard titleWidth="w-40">
        <Skeleton className="h-6 w-56" />
        <Skeleton className="h-2 w-full rounded-full" />
        <div className="grid gap-2 sm:grid-cols-3">
          {Array.from({ length: 3 }).map((_, i) => (
            <Skeleton key={i} className="h-16 w-full rounded-lg" />
          ))}
        </div>
      </FormCard>

      {/* Auto-invest — toggle, share slider, method picker, initial balance */}
      <FormCard titleWidth="w-32">
        <Skeleton className="h-6 w-48" />
        <Skeleton className="h-2 w-full rounded-full" />
        <div className="grid gap-4 sm:grid-cols-2">
          <FieldPair />
          <FieldPair />
        </div>
      </FormCard>

      <div className="flex justify-end gap-2">
        <Skeleton className="h-10 w-24" />
        <Skeleton className="h-10 w-28" />
      </div>
    </section>
  )
}
