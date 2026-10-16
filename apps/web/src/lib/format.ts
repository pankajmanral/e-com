/**
 * Formatting helpers. Money is rendered in Indian rupees with Indian number grouping.
 */

const currencyFormatters = new Map<string, Intl.NumberFormat>();

function getFormatter(currency: string): Intl.NumberFormat {
  let formatter = currencyFormatters.get(currency);
  if (!formatter) {
    formatter = new Intl.NumberFormat('en-IN', {
      style: 'currency',
      currency,
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    });
    currencyFormatters.set(currency, formatter);
  }
  return formatter;
}

/** Format a monetary amount, e.g. formatPrice(1234.5) → "₹1,234.50". */
export function formatPrice(amount: number, currency = 'INR'): string {
  if (!Number.isFinite(amount)) return '—';
  return getFormatter(currency).format(amount);
}

/** Format a 0..1 ratio as a percentage, e.g. formatPercent(0.0421) → "4.2%". */
export function formatPercent(ratio: number, fractionDigits = 1): string {
  if (!Number.isFinite(ratio)) return '—';
  return `${(ratio * 100).toFixed(fractionDigits)}%`;
}

/** Format a plain number with grouping, e.g. formatNumber(1234.56, 1) → "1,234.6". */
export function formatNumber(value: number, fractionDigits = 0): string {
  if (!Number.isFinite(value)) return '—';
  return new Intl.NumberFormat('en-IN', {
    minimumFractionDigits: fractionDigits,
    maximumFractionDigits: fractionDigits,
  }).format(value);
}

/** Relative time such as "3 minutes ago" / "in 2 hours" from an ISO timestamp. */
export function formatRelativeTime(iso: string, now: Date = new Date()): string {
  const then = new Date(iso);
  if (Number.isNaN(then.getTime())) return '—';
  const diffMs = then.getTime() - now.getTime();
  const absMs = Math.abs(diffMs);
  const rtf = new Intl.RelativeTimeFormat('en-IN', { numeric: 'auto' });

  const minute = 60_000;
  const hour = 60 * minute;
  const day = 24 * hour;

  if (absMs < minute) return rtf.format(Math.round(diffMs / 1000), 'second');
  if (absMs < hour) return rtf.format(Math.round(diffMs / minute), 'minute');
  if (absMs < day) return rtf.format(Math.round(diffMs / hour), 'hour');
  if (absMs < 30 * day) return rtf.format(Math.round(diffMs / day), 'day');
  return rtf.format(Math.round(diffMs / (30 * day)), 'month');
}

/** Short alias used by the admin dashboard for chart axes and lists. */
export function timeAgo(iso: string): string {
  return formatRelativeTime(iso);
}

/** Clock time (HH:MM:SS) for dense admin lists. */
export function formatClockTime(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return '—';
  return date.toLocaleTimeString('en-IN', {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  });
}

/** Human-readable label for a product category slug. */
export function categoryLabel(slug: string): string {
  return slug
    .split('-')
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ');
}
