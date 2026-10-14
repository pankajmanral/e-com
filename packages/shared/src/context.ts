import { AsyncLocalStorage } from 'node:async_hooks';
import { randomUUID } from 'node:crypto';

export interface RequestContext {
  requestId: string;
}

const als = new AsyncLocalStorage<RequestContext>();

/** Run `fn` inside a request scope so logs/traces can correlate on request id. */
export function runWithRequestContext<T>(ctx: RequestContext, fn: () => T): T {
  return als.run(ctx, fn);
}

/** Request id of the active scope (if any). */
export function currentRequestId(): string | undefined {
  return als.getStore()?.requestId;
}

export function newRequestId(): string {
  return randomUUID();
}
