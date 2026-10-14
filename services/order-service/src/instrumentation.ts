/**
 * OpenTelemetry bootstrap — must stay the first import of the process so the
 * auto-instrumentations patch express/fetch before they are loaded.
 */
import { initTracing } from '@ecommerce/shared/tracing';

initTracing(process.env.SERVICE_NAME ?? 'order-service');
