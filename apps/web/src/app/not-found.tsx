import Link from 'next/link';

/** Branded 404 page. */
export default function NotFound() {
  return (
    <div className="mx-auto flex max-w-2xl flex-col items-center px-4 py-24 text-center sm:px-6 lg:px-8">
      <p className="flex items-baseline gap-0.5 text-6xl font-semibold tracking-tight text-navy-900 select-none">
        4<span className="text-teal-500">0</span>4
      </p>
      <h1 className="mt-6 text-2xl font-semibold tracking-tight text-navy-900">
        This page has drifted off the mesh
      </h1>
      <p className="mt-3 max-w-md text-navy-600">
        The route you requested does not exist — or it was decommissioned like a retired
        microservice. Let&apos;s route you back to somewhere useful.
      </p>
      <div className="mt-8 flex flex-wrap items-center justify-center gap-3">
        <Link
          href="/"
          className="inline-flex h-11 items-center rounded-lg bg-teal-600 px-5 text-sm font-medium text-white shadow-soft transition-colors hover:bg-teal-700"
        >
          Back to home
        </Link>
        <Link
          href="/products"
          className="inline-flex h-11 items-center rounded-lg bg-navy-900 px-5 text-sm font-medium text-white shadow-soft transition-colors hover:bg-navy-800"
        >
          Browse the shop
        </Link>
      </div>
    </div>
  );
}
