import { Skeleton } from "@/components/ui/skeleton"

type PageHeaderSkeletonProps = {
  /** How many action buttons sit on the right of the real header. */
  actions?: number
  /** Width class for the description line; pages differ in how long theirs runs. */
  descriptionWidth?: string
}

/**
 * The placeholder for `PageHeader`. Every route's `loading.tsx` used to draw
 * its own title + description pair with slightly different widths, so the
 * header jumped between routes while the body was still loading. One
 * silhouette here, the body stays bespoke per route.
 */
export function PageHeaderSkeleton({
  actions = 0,
  descriptionWidth = "w-72",
}: PageHeaderSkeletonProps) {
  return (
    <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
      <div className="space-y-2">
        <Skeleton className="h-7 w-48" />
        <Skeleton className={`h-4 max-w-full ${descriptionWidth}`} />
      </div>
      {actions > 0 && (
        <div className="flex shrink-0 items-center gap-2">
          {Array.from({ length: actions }).map((_, i) => (
            <Skeleton key={i} className="h-10 w-28" />
          ))}
        </div>
      )}
    </div>
  )
}
