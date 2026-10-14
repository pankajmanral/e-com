import { Skeleton } from '@/components/ui/Skeleton';

/** Dashboard skeleton matching the live layout to avoid layout shift. */
export default function AdminLoading() {
  return (
    <div className="mx-auto max-w-7xl space-y-8 px-4 py-8 sm:px-6 lg:px-8">
      <div>
        <Skeleton className="h-4 w-48" />
        <Skeleton className="mt-3 h-9 w-80" />
        <Skeleton className="mt-3 h-4 w-96 max-w-full" />
      </div>

      {/* Status strip */}
      <div className="flex flex-wrap gap-3 rounded-xl border border-navy-100 bg-white p-4 shadow-soft">
        {Array.from({ length: 5 }, (_, index) => (
          <Skeleton key={index} className="h-7 w-36" />
        ))}
      </div>

      {/* Health cards */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {Array.from({ length: 3 }, (_, index) => (
          <div key={index} className="rounded-xl border border-navy-100 bg-white p-5 shadow-soft">
            <Skeleton className="h-4 w-32" />
            <Skeleton className="mt-4 h-6 w-24" />
            <Skeleton className="mt-3 h-3 w-44" />
          </div>
        ))}
      </div>

      {/* Charts */}
      <div className="rounded-xl border border-navy-100 bg-white p-5 shadow-soft">
        <div className="flex items-center justify-between">
          <Skeleton className="h-5 w-32" />
          <Skeleton className="h-10 w-40" />
        </div>
        <div className="mt-4 grid grid-cols-1 gap-4 lg:grid-cols-3">
          {Array.from({ length: 3 }, (_, index) => (
            <div key={index} className="rounded-xl border border-navy-100 p-5">
              <Skeleton className="h-4 w-32" />
              <Skeleton className="mt-2 h-3 w-44" />
              <Skeleton className="mt-4 h-56 w-full" />
            </div>
          ))}
        </div>
      </div>

      {/* Panels */}
      <div className="grid grid-cols-1 gap-8 xl:grid-cols-2">
        {Array.from({ length: 2 }, (_, index) => (
          <div key={index} className="space-y-6">
            <div className="rounded-xl border border-navy-100 bg-white p-5 shadow-soft">
              <Skeleton className="h-5 w-44" />
              <Skeleton className="mt-2 h-4 w-72 max-w-full" />
              <Skeleton className="mt-4 h-10 w-full" />
            </div>
            <div className="rounded-xl border border-navy-100 bg-white p-5 shadow-soft">
              <Skeleton className="h-4 w-40" />
              <div className="mt-3 space-y-2">
                {Array.from({ length: 3 }, (_, rowIndex) => (
                  <Skeleton key={rowIndex} className="h-9 w-full" />
                ))}
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
