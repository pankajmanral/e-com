/**
 * Minimal Prometheus text-exposition-format parser.
 *
 * The ops-service polls every downstream service's own `/metrics` endpoint
 * (served by the shared `createServiceApp`) and parses the body with this
 * module so it can compute rates and quantiles without a Prometheus server.
 *
 * Output shape:
 *   counters   — `name{labels}` → value (key is the metric name plus a
 *                canonical `k="v",k2="v2"` label suffix, empty for bare series)
 *   histograms — metric name (without `_bucket`/`_sum`/`_count` suffixes and
 *                without labels) → cumulative buckets keyed by `le` ('+Inf' for
 *                infinity), plus summed `sum`/`count` across label sets.
 */

export interface HistogramData {
  /** Cumulative observations per upper bound, keyed by the `le` label. */
  buckets: Record<string, number>;
  sum: number;
  count: number;
}

export interface ParsedMetrics {
  counters: Record<string, number>;
  histograms: Record<string, HistogramData>;
  /** `# TYPE <name> <type>` declarations (counter/gauge/histogram/…). */
  types: Record<string, string>;
}

/** Canonical label key: `a="1",b="2"` with names sorted. */
export function labelsKey(labels: Record<string, string>): string {
  const keys = Object.keys(labels).sort();
  if (keys.length === 0) return '';
  return keys.map((k) => `${k}="${escapeLabelValue(labels[k] ?? '')}"`).join(',');
}

function escapeLabelValue(value: string): string {
  return value.replace(/\\/g, '\\\\').replace(/"/g, '\\"').replace(/\n/g, '\\n');
}

/** Parses `a="1",b="2"` (quotes optional) back into an object. */
export function parseLabelBody(body: string): Record<string, string> {
  const labels: Record<string, string> = {};
  let i = 0;
  while (i < body.length) {
    while (i < body.length && (body[i] === ',' || /\s/.test(body[i] ?? ''))) i += 1;
    let nameStart = i;
    while (i < body.length && body[i] !== '=' && body[i] !== ',' && !/\s/.test(body[i] ?? '')) i += 1;
    const name = body.slice(nameStart, i).trim();
    while (i < body.length && /\s/.test(body[i] ?? '')) i += 1;
    if (body[i] !== '=') {
      // malformed fragment — skip it rather than failing the whole scrape
      while (i < body.length && body[i] !== ',') i += 1;
      continue;
    }
    i += 1; // '='
    while (i < body.length && /\s/.test(body[i] ?? '')) i += 1;
    let value = '';
    if (body[i] === '"') {
      i += 1;
      let raw = '';
      while (i < body.length && body[i] !== '"') {
        if (body[i] === '\\' && i + 1 < body.length) {
          raw += body[i] + body[i + 1];
          i += 2;
          continue;
        }
        raw += body[i];
        i += 1;
      }
      i += 1; // closing quote
      value = unescapeLabelValue(raw);
    } else {
      const valueStart = i;
      while (i < body.length && body[i] !== ',') i += 1;
      value = body.slice(valueStart).trim();
    }
    if (name) labels[name] = value;
    while (i < body.length && body[i] !== ',') i += 1;
  }
  return labels;
}

function unescapeLabelValue(raw: string): string {
  return raw
    .replace(/\\n/g, '\n')
    .replace(/\\"/g, '"')
    .replace(/\\\\/g, '\\');
}

/** Splits `http_requests_total{status="200"}` into name + label body. */
export function splitSeriesKey(key: string): { name: string; labels: Record<string, string> } {
  const brace = key.indexOf('{');
  if (brace === -1) return { name: key, labels: {} };
  const name = key.slice(0, brace);
  const body = key.slice(brace + 1, key.endsWith('}') ? key.length - 1 : key.length);
  return { name, labels: parseLabelBody(body) };
}

function normalizeLe(raw: string): string {
  const trimmed = raw.trim();
  if (trimmed === 'Inf' || trimmed === '+inf' || trimmed === '+Inf') return '+Inf';
  if (trimmed === '-Inf' || trimmed === '-inf') return '-Inf';
  return trimmed;
}

/**
 * Parses a full exposition document. Unknown/garbage lines are ignored so a
 * half-written scrape never crashes the poller.
 */
export function parsePrometheusText(text: string): ParsedMetrics {
  const counters: Record<string, number> = {};
  const histograms: Record<string, HistogramData> = {};
  const types: Record<string, string> = {};

  for (const rawLine of text.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line) continue;

    if (line.startsWith('#')) {
      const parts = line.replace(/^#\s*/, '').split(/\s+/);
      if (parts[0] === 'TYPE' && parts.length >= 3 && parts[1] && parts[2]) {
        types[parts[1]] = parts[2];
      }
      continue; // HELP / comments
    }

    // `name{labels} value [timestamp]` or `name value [timestamp]`
    const brace = line.indexOf('{');
    let name: string;
    let labels: Record<string, string> = {};
    let rest: string;
    if (brace !== -1 && (line.indexOf('}') > brace || brace > 0)) {
      const close = findClosingBrace(line, brace);
      name = line.slice(0, brace);
      labels = parseLabelBody(line.slice(brace + 1, close));
      rest = line.slice(close + 1);
    } else {
      const space = line.search(/\s/);
      if (space === -1) continue;
      name = line.slice(0, space);
      rest = line.slice(space);
    }

    const tokens = rest.trim().split(/\s+/);
    const value = Number(tokens[0]);
    if (!name || tokens.length === 0 || !Number.isFinite(value)) continue;

    if (name.endsWith('_bucket')) {
      const base = name.slice(0, -'_bucket'.length);
      const le = labels.le;
      if (le === undefined) continue;
      const histogram = (histograms[base] ??= { buckets: {}, sum: 0, count: 0 });
      const normalized = normalizeLe(le);
      histogram.buckets[normalized] = (histogram.buckets[normalized] ?? 0) + value;
    } else if (name.endsWith('_sum')) {
      const base = name.slice(0, -'_sum'.length);
      const histogram = (histograms[base] ??= { buckets: {}, sum: 0, count: 0 });
      histogram.sum += value;
    } else if (name.endsWith('_count')) {
      const base = name.slice(0, -'_count'.length);
      const histogram = (histograms[base] ??= { buckets: {}, sum: 0, count: 0 });
      histogram.count += value;
    } else {
      const key = labels.le === undefined && Object.keys(labels).length === 0 ? name : `${name}{${labelsKey(labels)}}`;
      counters[key] = value;
    }
  }

  return { counters, histograms, types };
}

function findClosingBrace(line: string, open: number): number {
  let inQuotes = false;
  for (let i = open + 1; i < line.length; i += 1) {
    const ch = line[i];
    if (ch === '\\') {
      i += 1;
      continue;
    }
    if (ch === '"') inQuotes = !inQuotes;
    else if (ch === '}' && !inQuotes) return i;
  }
  return line.length;
}

/** Sums every series of `name` (all label combinations). */
export function sumCounter(counters: Record<string, number>, name: string): number {
  let total = 0;
  for (const [key, value] of Object.entries(counters)) {
    const series = splitSeriesKey(key);
    if (series.name === name) total += value;
  }
  return total;
}

/** Sums every series of `name` whose labels match the predicate. */
export function sumCounterMatching(
  counters: Record<string, number>,
  name: string,
  predicate: (labels: Record<string, string>) => boolean,
): number {
  let total = 0;
  for (const [key, value] of Object.entries(counters)) {
    const series = splitSeriesKey(key);
    if (series.name === name && predicate(series.labels)) total += value;
  }
  return total;
}

/** True when the labels look like an HTTP 5xx status. */
export function isServerErrorLabel(labels: Record<string, string>): boolean {
  const status = labels.status ?? labels.code ?? labels.http_status;
  return typeof status === 'string' && /^5\d\d$/.test(status);
}

/**
 * Bucket-wise difference `curr - prev` with counter-reset protection: if a
 * bucket went backwards (service restarted mid-interval) the current value is
 * used as the delta instead of a negative number.
 */
export function deltaBuckets(prev: Record<string, number>, curr: Record<string, number>): Record<string, number> {
  const delta: Record<string, number> = {};
  for (const [le, value] of Object.entries(curr)) {
    const before = prev[le];
    delta[le] = before === undefined ? value : value >= before ? value - before : value;
  }
  return delta;
}
