import { describe, expect, it } from 'vitest';
import {
  deltaBuckets,
  isServerErrorLabel,
  parsePrometheusText,
  splitSeriesKey,
  sumCounter,
  sumCounterMatching,
} from '../src/metrics/parser';

const FIXTURE = `# HELP http_requests_total Total number of HTTP requests handled by the service
# TYPE http_requests_total counter
http_requests_total{service="user-service",method="GET",route="/api/users",status="200"} 120
http_requests_total{service="user-service",method="POST",route="/api/users",status="201"} 12
http_requests_total{service="user-service",method="GET",route="/api/users",status="500"} 3
http_requests_total{service="user-service",method="GET",route="/api/orders",status="503"} 1
# HELP http_request_duration_seconds HTTP request duration in seconds
# TYPE http_request_duration_seconds histogram
http_request_duration_seconds_bucket{service="user-service",method="GET",route="/api/users",status="200",le="0.005"} 40
http_request_duration_seconds_bucket{service="user-service",method="GET",route="/api/users",status="200",le="0.01"} 70
http_request_duration_seconds_bucket{service="user-service",method="GET",route="/api/users",status="200",le="0.025"} 100
http_request_duration_seconds_bucket{service="user-service",method="GET",route="/api/users",status="200",le="0.05"} 110
http_request_duration_seconds_bucket{service="user-service",method="GET",route="/api/users",status="200",le="0.1"} 118
http_request_duration_seconds_bucket{service="user-service",method="GET",route="/api/users",status="200",le="0.25"} 120
http_request_duration_seconds_bucket{service="user-service",method="GET",route="/api/users",status="200",le="0.5"} 120
http_request_duration_seconds_bucket{service="user-service",method="GET",route="/api/users",status="200",le="1"} 120
http_request_duration_seconds_bucket{service="user-service",method="GET",route="/api/users",status="200",le="2"} 120
http_request_duration_seconds_bucket{service="user-service",method="GET",route="/api/users",status="200",le="5"} 120
http_request_duration_seconds_bucket{service="user-service",method="GET",route="/api/users",status="200",le="+Inf"} 120
http_request_duration_seconds_sum{service="user-service",method="GET",route="/api/users",status="200"} 6.5
http_request_duration_seconds_count{service="user-service",method="GET",route="/api/users",status="200"} 120
# HELP process_resident_memory_bytes Resident memory size in bytes
# TYPE process_resident_memory_bytes gauge
process_resident_memory_bytes 1.234e+07
up 1
`;

describe('parsePrometheusText', () => {
  it('parses counters with labels into canonical keys', () => {
    const parsed = parsePrometheusText(FIXTURE);
    // label names are sorted alphabetically in the canonical key
    expect(parsed.counters['http_requests_total{method="GET",route="/api/users",service="user-service",status="200"}']).toBe(120);
    expect(parsed.counters['http_requests_total{method="POST",route="/api/users",service="user-service",status="201"}']).toBe(12);
    expect(parsed.counters['http_requests_total{method="GET",route="/api/orders",service="user-service",status="503"}']).toBe(1);
    expect(parsed.counters.up).toBe(1);
    expect(parsed.counters.process_resident_memory_bytes).toBe(12_340_000);
  });

  it('records TYPE declarations', () => {
    const parsed = parsePrometheusText(FIXTURE);
    expect(parsed.types.http_requests_total).toBe('counter');
    expect(parsed.types.http_request_duration_seconds).toBe('histogram');
    expect(parsed.types.process_resident_memory_bytes).toBe('gauge');
  });

  it('merges histogram label sets into cumulative buckets + sum/count', () => {
    const parsed = parsePrometheusText(FIXTURE);
    const histogram = parsed.histograms.http_request_duration_seconds;
    expect(histogram).toBeDefined();
    expect(histogram.count).toBe(120);
    expect(histogram.sum).toBeCloseTo(6.5, 10);
    expect(histogram.buckets['0.005']).toBe(40);
    expect(histogram.buckets['0.1']).toBe(118);
    expect(histogram.buckets['+Inf']).toBe(120);
  });

  it('sums counters across label sets and filters 5xx statuses', () => {
    const parsed = parsePrometheusText(FIXTURE);
    expect(sumCounter(parsed.counters, 'http_requests_total')).toBe(136);
    expect(sumCounterMatching(parsed.counters, 'http_requests_total', isServerErrorLabel)).toBe(4);
    expect(sumCounter(parsed.counters, 'does_not_exist')).toBe(0);
  });

  it('normalizes Inf bucket spellings and ignores garbage lines', () => {
    const parsed = parsePrometheusText(['weird_metric_bucket{le="Inf"} 3', 'not a metric line', ''].join('\n'));
    expect(parsed.histograms.weird_metric.buckets['+Inf']).toBe(3);
  });

  it('handles escaped label values and empty label sets', () => {
    const parsed = parsePrometheusText('escaped{msg="a\\"b\\\\c\\nd"} 2\nempty{} 7\n');
    expect(splitSeriesKey('escaped{msg="a\\"b\\\\c\\nd"}').labels.msg).toBe('a"b\\c\nd');
    expect(sumCounter(parsed.counters, 'escaped')).toBe(2);
    expect(parsed.counters.empty).toBe(7);
  });

  it('computes counter-reset safe bucket deltas', () => {
    const delta = deltaBuckets({ '0.1': 5, '+Inf': 10 }, { '0.1': 7, '+Inf': 9, '0.5': 2 });
    expect(delta['0.1']).toBe(2);
    expect(delta['+Inf']).toBe(9); // reset → current value
    expect(delta['0.5']).toBe(2); // new bucket → treat whole value as delta
  });
});
