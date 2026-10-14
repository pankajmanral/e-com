import type { Logger } from 'pino';

/**
 * OpenTelemetry bootstrap.
 *
 * MUST be executed before express / fetch are required so the
 * auto-instrumentations can patch them. Services therefore import this module
 * through its own entry point (`@ecommerce/shared/tracing`) as the very first
 * import in `src/instrumentation.ts`.
 *
 * Export modes (env `OTEL_TRACES_EXPORTER`):
 *   - none    : SDK active with a no-export exporter — real trace ids and
 *               cross-service propagation without needing a collector
 *               (default when OTEL_EXPORTER_OTLP_ENDPOINT is unset)
 *   - otlp    : send traces to the OTLP collector (uses OTEL_EXPORTER_OTLP_ENDPOINT)
 *   - console : debug spans on stdout
 *   - disabled: no tracing SDK at all (tests / benchmarks)
 */
export function initTracing(service: string, log?: Logger): void {
  const endpoint = process.env.OTEL_EXPORTER_OTLP_ENDPOINT?.trim();
  const mode = (process.env.OTEL_TRACES_EXPORTER ?? (endpoint ? 'otlp' : 'none')).toLowerCase();

  if (mode === 'disabled' || mode === 'off' || mode === 'false') {
    log?.info({ mode }, 'OpenTelemetry tracing disabled');
    return;
  }

  // Synchronous require keeps instrumentations ahead of express/fetch loads.
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const { startTracingSdk } = require('./tracing-impl') as typeof import('./tracing-impl');
  startTracingSdk(service, mode as 'otlp' | 'console' | 'none', endpoint, log);
}

export { currentTraceId, currentSpanId, traceparentHeader, withSpan } from './trace-context';
