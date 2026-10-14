import pino, { Logger } from 'pino';

export type { Logger } from 'pino';

/**
 * Structured logger (pino). The service name is attached to every line so
 * logs can be joined with traces/metrics in Grafana and Jaeger.
 */
export function createLogger(service: string): Logger {
  return pino({
    name: service,
    level: process.env.LOG_LEVEL ?? 'info',
    base: { service },
    timestamp: pino.stdTimeFunctions.isoTime,
    redact: {
      paths: ['req.headers.authorization', 'req.headers.cookie', 'body.password', 'body.cardNumber'],
      censor: '[redacted]',
    },
  });
}
