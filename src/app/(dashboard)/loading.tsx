function SkeletonRow() {
  return (
    <div className="flex items-center gap-4 px-4 py-3">
      <div className="h-5 w-16 animate-pulse rounded-full bg-slate-200 dark:bg-slate-700" />
      <div className="h-4 flex-1 animate-pulse rounded bg-slate-200 dark:bg-slate-700" />
      <div className="h-4 w-24 animate-pulse rounded bg-slate-200 dark:bg-slate-700" />
      <div className="h-4 w-20 animate-pulse rounded bg-slate-200 dark:bg-slate-700" />
      <div className="h-5 w-20 animate-pulse rounded-full bg-slate-200 dark:bg-slate-700" />
    </div>
  )
}

export default function DashboardLoading() {
  return (
    <div>
      {/* Title skeleton */}
      <div className="mb-4 flex items-center justify-between">
        <div className="h-8 w-32 animate-pulse rounded bg-slate-200 dark:bg-slate-700" />
        <div className="h-9 w-24 animate-pulse rounded-md bg-slate-200 dark:bg-slate-700" />
      </div>

      {/* Table skeleton */}
      <div className="overflow-hidden rounded-lg border border-slate-200 dark:border-slate-700">
        {/* Header */}
        <div className="flex items-center gap-4 border-b border-slate-200 bg-slate-50 px-4 py-3 dark:border-slate-700 dark:bg-slate-800">
          <div className="h-3 w-16 animate-pulse rounded bg-slate-300 dark:bg-slate-600" />
          <div className="h-3 flex-1 animate-pulse rounded bg-slate-300 dark:bg-slate-600" />
          <div className="h-3 w-24 animate-pulse rounded bg-slate-300 dark:bg-slate-600" />
          <div className="h-3 w-20 animate-pulse rounded bg-slate-300 dark:bg-slate-600" />
          <div className="h-3 w-20 animate-pulse rounded bg-slate-300 dark:bg-slate-600" />
        </div>
        {/* Rows */}
        <div className="divide-y divide-slate-100 bg-white dark:divide-slate-800 dark:bg-slate-900">
          <SkeletonRow />
          <SkeletonRow />
          <SkeletonRow />
          <SkeletonRow />
          <SkeletonRow />
        </div>
      </div>
    </div>
  )
}
