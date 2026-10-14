import { context, trace, isSpanContextValid, SpanKind, SpanStatusCode } from '@opentelemetry/api';

/** Active span context (works whether or not a tracer provider is installed). */
export function currentSpanContext() {
  const span = trace.getSpan(context.active());
  const ctx = span?.spanContext();
  return ctx && isSpanContextValid(ctx) ? ctx : undefined;
}

export function currentTraceId(): string | undefined {
  return currentSpanContext()?.traceId;
}

export function currentSpanId(): string | undefined {
  return currentSpanContext()?.spanId;
}

/** W3C `traceparent` header value for the active span, if any. */
export function traceparentHeader(): string | undefined {
  const ctx = currentSpanContext();
  if (!ctx) return undefined;
  return `00-${ctx.traceId}-${ctx.spanId}-01`;
}

/** Start a span for a unit of work; sets status on error automatically. */
export async function withSpan<T>(
  name: string,
  fn: () => Promise<T>,
  options: { kind?: SpanKind; attributes?: Record<string, string | number | boolean> } = {},
): Promise<T> {
  const tracer = trace.getTracer('resilience-lab');
  return tracer.startActiveSpan(
    name,
    { kind: options.kind ?? SpanKind.INTERNAL, attributes: options.attributes },
    async (span) => {
      try {
        const result = await fn();
        span.setStatus({ code: SpanStatusCode.OK });
        return result;
      } catch (error) {
        span.setStatus({ code: SpanStatusCode.ERROR, message: (error as Error)?.message });
        span.recordException(error as Error);
        throw error;
      } finally {
        span.end();
      }
    },
  );
}
