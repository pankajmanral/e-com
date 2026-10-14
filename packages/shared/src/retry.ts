export function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export interface RetryOptions {
  /** Additional attempts after the first one. */
  retries?: number;
  baseDelayMs?: number;
  maxDelayMs?: number;
  /** Decide whether an error is retryable (default: 5xx / network errors). */
  retryOn?: (error: unknown) => boolean;
  onRetry?: (error: unknown, attempt: number, delayMs: number) => void;
}

export function isRetryableError(error: unknown): boolean {
  const status = (error as { statusCode?: number })?.statusCode;
  if (typeof status === 'number') {
    return status === 429 || status >= 500;
  }
  // network level failures (fetch aborted / ECONNREFUSED / DNS)
  return true;
}

/**
 * Retry with exponential backoff + jitter. Idempotent operations only
 * (GETs and our stock-deduction calls which are guarded by order ids).
 */
export async function withRetry<T>(fn: (attempt: number) => Promise<T>, options: RetryOptions = {}): Promise<T> {
  const retries = options.retries ?? 2;
  const baseDelayMs = options.baseDelayMs ?? 200;
  const maxDelayMs = options.maxDelayMs ?? 2_000;
  const retryOn = options.retryOn ?? isRetryableError;

  let lastError: unknown;
  for (let attempt = 0; attempt <= retries; attempt += 1) {
    try {
      return await fn(attempt);
    } catch (error) {
      lastError = error;
      if (attempt === retries || !retryOn(error)) break;
      const delay = Math.min(maxDelayMs, baseDelayMs * 2 ** attempt) * (0.5 + Math.random() * 0.5);
      options.onRetry?.(error, attempt + 1, Math.round(delay));
      await sleep(delay);
    }
  }
  throw lastError;
}
