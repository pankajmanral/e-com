import { Skeleton } from '@/components/ui/Skeleton';

/**
 * Loading skeleton mirrors the shop layout (sidebar + 3-column grid) to
 * avoid layout shift while the catalogue is fetched.
 */
export default function ShopLoading() {
  return (
    <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
      <Skeleton className="h-4 w-40" />
      <Skeleton className="mt-6 h-9 w-64" />
      <Skeleton className="mt-3 h-4 w-80" />

      <div className="mt-8 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <Skeleton className="h-10 w-full sm:max-w-sm" />
        <div className="flex items-end gap-4">
          <Skeleton className="h-4 w-20" />
          <Skeleton className="h-10 w-48" />
        </div>
      </div>

      <div className="mt-8 grid grid-cols-1 gap-8 lg:grid-cols-[16rem_1fr] lg:gap-10">
        <aside className="hidden lg:block">
          <Skeleton className="h-6 w-32" />
          <div className="mt-4 space-y-2">
            {Array.from({ length: 6 }, (_, index) => (
              <Skeleton key={index} className="h-9 w-full" />
            ))}
          </div>
          <Skeleton className="mt-8 h-6 w-28" />
          <div className="mt-4 space-y-2.5">
            {Array.from({ length: 3 }, (_, index) => (
              <Skeleton key={index} className="h-4 w-full" />
            ))}
          </div>
        </aside>
        <div>
          <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 xl:grid-cols-3">
            {Array.from({ length: 9 }, (_, index) => (
              <div key={index} className="overflow-hidden rounded-xl border border-navy-100">
                <Skeleton className="aspect-[4/3] w-full rounded-none" />
                <div className="space-y-3 p-4">
                  <Skeleton className="h-3 w-20" />
                  <Skeleton className="h-4 w-4/5" />
                  <Skeleton className="h-3 w-28" />
                  <div className="flex items-center justify-between pt-2">
                    <Skeleton className="h-5 w-16" />
                    <Skeleton className="h-8 w-24" />
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
