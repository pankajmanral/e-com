import { describe, expect, it } from 'vitest';
import { errorRate, histogramQuantile, ratePerSec, round } from '../src/metrics/histogram';

describe('histogramQuantile', () => {
  // Hand-computed from cumulative buckets: total=5
  //   q=0.5 → rank 2.5 → bucket [0.1, 0.5] (counts 2→4)
  //     0.1 + (2.5-2)/(4-2) * (0.5-0.1) = 0.1 + 0.25*0.4 = 0.2
  const buckets = { '0.1': 2, '0.5': 4, '1': 5, '+Inf': 5 };

  it('interpolates the median (q=0.5)', () => {
    expect(histogramQuantile(0.5, buckets)).toBeCloseTo(0.2, 10);
  });

  it('interpolates p95 (q=0.95)', () => {
    //   q=0.95 → rank 4.75 → bucket [0.5, 1] (counts 4→5)
    //   0.5 + (4.75-4)/(5-4) * (1-0.5) = 0.5 + 0.75*0.5 = 0.875
    expect(histogramQuantile(0.95, buckets)).toBeCloseTo(0.875, 10);
  });

  it('returns the previous bound when the quantile lands in +Inf', () => {
    // rank 4.75 of 10 → first bucket with count >= rank is +Inf → upper bound
    // of the previous bucket (1) is the best information available.
    expect(histogramQuantile(0.95, { '0.1': 5, '1': 5, '+Inf': 10 })).toBe(1);
  });

  it('handles a +Inf-only bucket (no finite information → 0)', () => {
    expect(histogramQuantile(0.5, { '+Inf': 10 })).toBe(0);
    expect(histogramQuantile(0.99, { '+Inf': 42 })).toBe(0);
  });

  it('returns null without observations', () => {
    expect(histogramQuantile(0.95, {})).toBeNull();
    expect(histogramQuantile(0.95, { '0.1': 0, '+Inf': 0 })).toBeNull();
  });

  it('forces monotonic cumulative counts', () => {
    // bucket 0.5 went backwards relative to 0.1 → clamped before searching
    expect(histogramQuantile(0.5, { '0.1': 10, '0.5': 4, '+Inf': 10 })).toBe(0.1);
  });

  it('returns the exact bound for the first bucket', () => {
    expect(histogramQuantile(0.1, { '0.25': 3, '+Inf': 10 })).toBe(0.25);
  });
});

describe('ratePerSec', () => {
  it('computes (curr-prev)/dt', () => {
    expect(ratePerSec(100, 200, 10)).toBe(10);
  });

  it('guards dt <= 0', () => {
    expect(ratePerSec(100, 200, 0)).toBe(0);
    expect(ratePerSec(100, 200, -5)).toBe(0);
    expect(ratePerSec(100, 200, Number.NaN)).toBe(0);
  });

  it('treats a counter reset as curr/dt', () => {
    expect(ratePerSec(200, 30, 10)).toBe(3);
  });
});

describe('errorRate', () => {
  it('is errors/total over the interval', () => {
    expect(errorRate(10, 20, 10, 100)).toBeCloseTo(0.1, 10);
  });

  it('guards a zero/negative total (no traffic)', () => {
    expect(errorRate(0, 0, 0, 0)).toBe(0);
    expect(errorRate(0, 1, 1, -3)).toBe(0);
  });

  it('clamps into [0, 1]', () => {
    expect(errorRate(0, 50, 50, 10)).toBe(1);
    expect(errorRate(0, 0, -4, 10)).toBe(0);
  });

  it('falls back to prev/curr when the supplied delta is negative', () => {
    expect(errorRate(10, 20, -1, 100)).toBeCloseTo(0.1, 10);
    // counter reset: curr < prev → use curr as the delta
    expect(errorRate(20, 5, -1, 100)).toBeCloseTo(0.05, 10);
  });
});

describe('round', () => {
  it('rounds to 4 decimals by default and normalizes -0', () => {
    expect(round(0.123456789)).toBe(0.1235);
    expect(round(-0.00001)).toBe(0);
    expect(round(Number.NaN)).toBe(0);
  });
});
