import { NodeSDK } from '@opentelemetry/sdk-node';
import { OTLPTraceExporter } from '@opentelemetry/exporter-trace-otlp-http';
import { getNodeAutoInstrumentations } from '@opentelemetry/auto-instrumentations-node';
import { resourceFromAttributes } from '@opentelemetry/resources';
import { ATTR_SERVICE_NAME, ATTR_SERVICE_VERSION } from '@opentelemetry/semantic-conventions';
import type { Logger } from 'pino';

let sdk: NodeSDK | undefined;

/** Exports nothing, but keeps real W3C trace ids + context propagation alive. */
class NoopSpanExporter {
  export(_spans: unknown[], resultCallback: (result: { code: 0 }) => void): void {
    resultCallback({ code: 0 }); // ExportResultCode.SUCCESS
  }
  shutdown(): Promise<void> {
    return Promise.resolve();
  }
  forceFlush(): Promise<void> {
    return Promise.resolve();
  }
}

export function startTracingSdk(
  service: string,
  mode: 'otlp' | 'console' | 'none',
  endpoint: string | undefined,
  log?: Logger,
): void {
  if (sdk) return;

  // 'none' keeps the SDK running with a no-export exporter: every request gets
  // a real W3C trace id (returned to the UI on orders, propagated across
  // services via traceparent) without requiring a collector.
  let traceExporter: OTLPTraceExporter | undefined;
  if (mode === 'otlp') {
    traceExporter = new OTLPTraceExporter({ url: `${endpoint?.replace(/\/$/, '')}/v1/traces` });
  }

  const sdkConfig: ConstructorParameters<typeof NodeSDK>[0] = {
    resource: resourceFromAttributes({
      [ATTR_SERVICE_NAME]: service,
      [ATTR_SERVICE_VERSION]: process.env.SERVICE_VERSION ?? '1.0.0',
      'deployment.environment.name': process.env.DEPLOYMENT_ENV ?? 'local',
    }),
    instrumentations: [
      getNodeAutoInstrumentations({
        '@opentelemetry/instrumentation-fs': { enabled: false },
      }),
    ],
  };
  if (mode === 'otlp' && traceExporter) {
    sdkConfig.traceExporter = traceExporter;
  } else if (mode === 'none') {
    (sdkConfig as { traceExporter?: unknown }).traceExporter = new NoopSpanExporter();
  }
  // mode === 'console' -> SDK default console exporter

  sdk = new NodeSDK(sdkConfig);
  sdk.start();
  log?.info({ mode, endpoint }, 'OpenTelemetry tracing started');

  const shutdown = async () => {
    try {
      await sdk?.shutdown();
    } finally {
      sdk = undefined;
    }
  };
  process.once('SIGTERM', () => void shutdown());
  process.once('SIGINT', () => void shutdown());
}
