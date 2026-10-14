/**
 * Pure rate/quantile arithmetic used by the metrics store. Prometheus does the
 * same interpolation server-side; a small re-implementation keeps the ops
 * service self-contained when no Prometheus server is available.
 */

interface NumericBucket {
  le: number;
  count: number;
}

function parseLe(le: string): number {
  const trimmed = le.trim();
  if (trimmed === '+Inf' || trimmed === 'Inf' || trimmed === '+inf') return Number.POSITIVE_INFINITY;
  if (trimmed === '-Inf' || trimmed === '-inf') return Number.NEGATIVE_INFINITY;
  const value = Number(trimmed);
  return Number.isFinite(value) ? value : Number.POSITIVE_INFINITY;
}

/**
 * Prometheus-style `histogram_quantile(q, buckets)`.
 *
 * `buckets` is a map of `le` → **cumulative** observation count. The routine
 * sorts the bounds, forces the cumulative counts to be monotonic, locates the
 * bucket containing the q-quantile rank and linearly interpolates inside it.
 * When the located bucket is `+Inf` the upper bound of the previous bucket is
 * returned (no information exists above it); with only a `+Inf` bucket the
 * result is 0. Returns `null` when no observations exist (division by zero).
 *
 * @param q quantile in [0, 1] (values outside the range are clamped)
 */
export function histogramQuantile(q: number, buckets: Record<string, number>): number | null {
  const entries: NumericBucket[] = Object.entries(buckets)
    .map(([le, count]) => ({ le: parseLe(le), count }))
    .filter((b) => Number.isFinite(b.count) && b.count >= 0 && !Number.isNaN(b.le))
    .sort((a, b) => a.le - b.le);

  if (entries.length === 0) return null;

  // ensure monotonic cumulative counts (mirrors Prometheus' ensureMonotonic)
  for (let i = 1; i < entries.length; i += 1) {
    const prev = entries[i - 1];
    const curr = entries[i];
    if (prev && curr && curr.count < prev.count) curr.count = prev.count;
  }

  const total = entries[entries.length - 1]?.count ?? 0;
  if (total <= 0) return null;

  const quantile = Number.isNaN(q) ? 0 : Math.min(1, Math.max(0, q));
  const rank = quantile * total;

  let index = entries.findIndex((b) => b.count >= rank);
  if (index === -1) index = entries.length - 1;
  const target = entries[index];
  if (!target) return null;

  const isUpperInfinite = !Number.isFinite(target.le);
  if (isUpperInfinite) {
    const previous = entries[index - 1];
    return previous ? previous.le : 0;
  }
  if (index === 0) return target.le;

  const lower = entries[index - 1];
  if (!lower) return target.le;
  const width = target.count - lower.count;
  if (width <= 0) return lower.le;
  const position = (rank - lower.count) / width;
  return lower.le + position * (target.le - lower.le);
}

/**
 * Counter rate per second between two scrapes.
 * `dtSec <= 0` (duplicate/backwards clock) yields 0; a counter reset
 * (`curr < prev`) is treated as `curr / dtSec` since the process restarted.
 */
export function ratePerSec(prev: number, curr: number, dtSec: number): number {
  if (!Number.isFinite(dtSec) || dtSec <= 0) return 0;
  const safePrev = Number.isFinite(prev) ? prev : 0;
  const safeCurr = Number.isFinite(curr) ? curr : 0;
  const delta = safeCurr >= safePrev ? safeCurr - safePrev : safeCurr;
  return delta / dtSec;
}

/**
 * Fraction of requests that errored over one interval, clamped to [0, 1].
 *
 * @param prev      previous value of the error counter
 * @param curr      current value of the error counter
 * @param dtErrors  observed error delta for the interval (reset-aware); when
 *                  negative/undefined the delta derived from prev/curr is used
 * @param dtTotal   observed total-request delta for the interval; `<= 0`
 *                  (no traffic) yields 0 instead of a division by zero
 */
export function errorRate(prev: number, curr: number, dtErrors: number, dtTotal: number): number {
  const fallback = Number.isFinite(curr) && Number.isFinite(prev) ? (curr >= prev ? curr - prev : curr) : 0;
  const errors = Number.isFinite(dtErrors) && dtErrors >= 0 ? dtErrors : fallback;
  if (!Number.isFinite(dtTotal) || dtTotal <= 0) return 0;
  const rate = errors / dtTotal;
  if (!Number.isFinite(rate)) return 0;
  return Math.min(1, Math.max(0, rate));
}

/** Rounds to `digits` decimals for stable wire payloads (keeps -0 out). */
export function round(value: number, digits = 4): number {
  if (!Number.isFinite(value)) return 0;
  const factor = 10 ** digits;
  const rounded = Math.round(value * factor) / factor;
  return rounded === 0 ? 0 : rounded;
}
