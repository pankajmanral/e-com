import express, { type Express, type Router, type RequestHandler, type ErrorRequestHandler } from 'express';
import helmet from 'helmet';
import cors from 'cors';
import pinoHttp from 'pino-http';
import type { Logger } from 'pino';
import { AppError } from './errors';
import { createLogger } from './logger';
import { createMetrics, httpMetricsMiddleware, type ServiceMetrics } from './metrics';
import { createFaultInjector, type FaultInjector } from './fault';
import { currentRequestId, newRequestId, runWithRequestContext } from './context';

export interface ServiceAppOptions {
  /** Service name used for logs, metrics and trace resource attributes. */
  name: string;
  version?: string;
  /** Mount point of the business router (default `/api`). */
  basePath?: string;
  router: Router;
  /** Enable the local fault-injection endpoints (default from env). */
  enableFaultInjection?: boolean;
  corsOrigins?: string[];
  /**
   * Extra fields merged into the GET /health payload (e.g. datastore mode,
   * dependency states). Evaluated per request.
   */
  healthDetails?: () => Record<string, unknown> | Promise<Record<string, unknown>>;
}

export interface ServiceApp {
  app: Express;
  logger: Logger;
  metrics: ServiceMetrics;
  fault: FaultInjector;
}

/**
 * Builds the standard express application shared by every microservice:
 * security headers, CORS, JSON parsing, request-id + trace context, pino HTTP
 * logging, Prometheus metrics, health/metrics endpoints, fault injection and
 * a single error rendering middleware.
 */
export function createServiceApp(options: ServiceAppOptions): ServiceApp {
  const version = options.version ?? process.env.SERVICE_VERSION ?? '1.0.0';
  const logger = createLogger(options.name);
  const metrics = createMetrics(options.name);
  const fault = createFaultInjector({
    serviceName: options.name,
    enabled:
      options.enableFaultInjection ?? process.env.FAULT_INJECTION_ENABLED?.toLowerCase() === 'true',
  });

  const app = express();
  app.disable('x-powered-by');

  app.use(helmet({ contentSecurityPolicy: false, crossOriginResourcePolicy: { policy: 'cross-origin' } }));
  app.use(
    cors({
      origin: options.corsOrigins ?? (process.env.CORS_ORIGIN ? process.env.CORS_ORIGIN.split(',') : true),
      exposedHeaders: ['x-request-id', 'x-trace-id'],
    }),
  );
  app.use(express.json({ limit: '256kb' }));

  // 1. request context (request id + async local storage)
  app.use((req, res, next) => {
    const incoming = req.headers['x-request-id'];
    const requestId = (typeof incoming === 'string' && incoming.trim()) || newRequestId();
    res.locals.requestId = requestId;
    res.setHeader('x-request-id', requestId);
    runWithRequestContext({ requestId }, next);
  });

  // 2. access logs
  app.use(
    pinoHttp({
      logger,
      genReqId: (req, res) => (res as unknown as { locals?: { requestId?: string } }).locals?.requestId ?? newRequestId(),
      autoLogging: {
        ignore: (req) => {
          const url = req.url ?? '';
          return url.startsWith('/health') || url.startsWith('/metrics');
        },
      },
      customProps: (req, res) => ({
        requestId: (res as unknown as { locals?: { requestId?: string } }).locals?.requestId,
        path: req.url,
      }),
      serializers: {
        req: (req) => ({ method: req.method, url: req.url, remoteAddress: req.ip }),
        res: (res) => ({ statusCode: res.statusCode }),
      },
    }) as RequestHandler,
  );

  // 3. chaos fault injection (local lab mode) — degrades everything but /metrics
  app.use(fault.middleware);

  // 4. prometheus metrics
  app.use(httpMetricsMiddleware(metrics));

  // 5. platform endpoints
  app.get('/health', async (_req, res, next) => {
    try {
      const details = options.healthDetails ? await options.healthDetails() : {};
      res.json({
        status: fault.getState() ? 'degraded' : 'ok',
        service: options.name,
        version,
        uptimeSec: Math.round(process.uptime()),
        timestamp: new Date().toISOString(),
        ...details,
      });
    } catch (error) {
      next(error);
    }
  });

  app.get('/metrics', async (_req, res, next) => {
    try {
      res.setHeader('Content-Type', metrics.registry.contentType);
      res.end(await metrics.registry.metrics());
    } catch (error) {
      next(error);
    }
  });

  // 6. business routes
  app.use(options.basePath ?? '/api', options.router);
  app.use('/internal/fault', fault.router);

  // 7. 404 + error rendering
  app.use((req, res) => {
    res.status(404).json({
      error: {
        code: 'NOT_FOUND',
        message: `Cannot ${req.method} ${req.path}`,
        requestId: res.locals.requestId,
      },
    });
  });

  app.use(errorHandler(logger));

  return { app, logger, metrics, fault };
}

function errorHandler(logger: Logger): ErrorRequestHandler {
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  return (error, req, res, _next) => {
    if (res.headersSent) {
      res.end();
      return;
    }
    const requestId = res.locals?.requestId;
    let status = 500;
    let code = 'INTERNAL_ERROR';
    let message = 'Internal server error';
    let details: unknown;

    if (error instanceof AppError) {
      status = error.statusCode;
      code = error.code;
      message = error.message;
      details = error.details;
    } else if (error && typeof error === 'object' && 'issues' in error) {
      // zod errors thrown outside validate* middleware
      status = 400;
      code = 'VALIDATION_ERROR';
      message = 'Request validation failed';
      details = (error as { issues: unknown }).issues;
    } else if (error && typeof error === 'object' && 'type' in error) {
      const type = (error as { type?: string }).type;
      if (type === 'entity.parse.failed') {
        status = 400;
        code = 'INVALID_JSON';
        message = 'Request body is not valid JSON';
      } else if (type === 'entity.too.large') {
        status = 413;
        code = 'PAYLOAD_TOO_LARGE';
        message = 'Request body is too large';
      }
    }

    logger.error({ err: error, requestId, status, code }, 'request failed');
    res.status(status).json({
      error: { code, message, ...(details !== undefined ? { details } : {}), requestId },
    });
  };
}

/** Wrap an async express handler so rejected promises hit the error handler. */
export function asyncHandler(
  handler: (req: express.Request, res: express.Response, next: express.NextFunction) => Promise<unknown>,
): RequestHandler {
  return (req, res, next) => {
    void Promise.resolve(handler(req, res, next)).catch(next);
  };
}
