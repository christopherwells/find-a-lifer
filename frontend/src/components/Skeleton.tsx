/**
 * Reusable skeleton loading placeholders with shimmer effect.
 */

function SkeletonLine({ width = '100%', height = '0.75rem' }: { width?: string; height?: string }) {
  return (
    <div
      className="bg-gray-200 dark:bg-gray-700 rounded animate-pulse"
      style={{ width, height }}
    />
  )
}

/** Skeleton for a species list item (checkbox + name) */
export function SpeciesItemSkeleton() {
  return (
    <div className="flex items-center gap-2 px-2 py-1.5">
      <div className="w-3.5 h-3.5 bg-gray-200 dark:bg-gray-700 rounded animate-pulse flex-shrink-0" />
      <div className="flex-1 space-y-1">
        <SkeletonLine width="60%" />
      </div>
    </div>
  )
}

/** Skeleton for a family group header + items */
export function FamilyGroupSkeleton({ itemCount = 3 }: { itemCount?: number }) {
  return (
    <div>
      <div className="flex items-center gap-2 px-2 py-1 bg-gray-50 dark:bg-gray-800/50">
        <SkeletonLine width="40%" height="0.625rem" />
      </div>
      {Array.from({ length: itemCount }).map((_, i) => (
        <SpeciesItemSkeleton key={i} />
      ))}
    </div>
  )
}

/** Skeleton for a hotspot/location card */
export function LocationCardSkeleton() {
  return (
    <div className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg p-3 space-y-2 animate-pulse">
      <div className="flex items-center justify-between">
        <SkeletonLine width="30%" height="1rem" />
        <SkeletonLine width="20%" height="0.75rem" />
      </div>
      <SkeletonLine width="50%" height="0.625rem" />
    </div>
  )
}

/** Skeleton for a stats card */
export function StatsCardSkeleton() {
  return (
    <div className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg p-4 text-center animate-pulse">
      <div className="mx-auto mb-2">
        <SkeletonLine width="3rem" height="1.5rem" />
      </div>
      <SkeletonLine width="70%" height="0.625rem" />
    </div>
  )
}

/** Skeleton for a progress bar section */
export function ProgressSkeleton() {
  return (
    <div className="space-y-4 animate-pulse">
      <SkeletonLine width="40%" height="1.25rem" />
      <div className="grid grid-cols-2 gap-3">
        <StatsCardSkeleton />
        <StatsCardSkeleton />
      </div>
      <div className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg p-4 space-y-3">
        <SkeletonLine width="50%" height="0.875rem" />
        <SkeletonLine width="100%" height="0.75rem" />
        <SkeletonLine width="30%" height="0.75rem" />
      </div>
    </div>
  )
}

/** Generic list skeleton */
export function ListSkeleton({ count = 5 }: { count?: number }) {
  return (
    <div className="space-y-2">
      {Array.from({ length: count }).map((_, i) => (
        <LocationCardSkeleton key={i} />
      ))}
    </div>
  )
}
