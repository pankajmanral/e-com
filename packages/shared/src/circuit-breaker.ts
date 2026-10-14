import { AppError } from './errors';

export type CircuitState = 'closed' | 'open' | 'half-open';

export interface CircuitBreakerOptions {
  name: string;
  /** Consecutive failures that trip the circuit. */
  failureThreshold?: number;
  /** How long the circuit stays open before probing again. */
  resetTimeoutMs?: number;
  /** Successful probes required to close the circuit again. */
  halfOpenMaxSuccesses?: number;
}

/**
 * Minimal circuit breaker (no dependencies) used for every inter-service call.
 *
 *   closed    -> requests flow, failures counted
 *   open      -> calls fail fast with 503 CIRCUIT_OPEN
 *   half-open -> a limited number of trial calls decide the next state
 */
export class CircuitBreaker {
  readonly name: string;
  private readonly failureThreshold: number;
  private readonly resetTimeoutMs: number;
  private readonly halfOpenMaxSuccesses: number;

  private state: CircuitState = 'closed';
  private failures = 0;
  private successes = 0;
  private openedAt = 0;
  private lastError?: Error;

  constructor(options: CircuitBreakerOptions) {
    this.name = options.name;
    this.failureThreshold = options.failureThreshold ?? Number(process.env.CB_FAILURE_THRESHOLD ?? 5);
    this.resetTimeoutMs = options.resetTimeoutMs ?? Number(process.env.CB_RESET_TIMEOUT_MS ?? 10_000);
    this.halfOpenMaxSuccesses = options.halfOpenMaxSuccesses ?? 2;
  }

  getState(): CircuitState {
    this.maybeHalfOpen();
    return this.state;
  }

  snapshot() {
    return { name: this.name, state: this.getState(), failures: this.failures, lastError: this.lastError?.message };
  }

  reset(): void {
    this.state = 'closed';
    this.failures = 0;
    this.successes = 0;
  }

  async exec<T>(fn: () => Promise<T>): Promise<T> {
    this.maybeHalfOpen();
    if (this.state === 'open') {
      throw new AppError(
        503,
        'CIRCUIT_OPEN',
        `Circuit for '${this.name}' is open after ${this.failures} consecutive failures`,
      );
    }

    try {
      const result = await fn();
      this.onSuccess();
      return result;
    } catch (error) {
      this.onFailure(error as Error);
      throw error;
    }
  }

  private maybeHalfOpen(): void {
    if (this.state === 'open' && Date.now() - this.openedAt >= this.resetTimeoutMs) {
      this.state = 'half-open';
      this.successes = 0;
    }
  }

  private onSuccess(): void {
    if (this.state === 'half-open') {
      this.successes += 1;
      if (this.successes >= this.halfOpenMaxSuccesses) {
        this.state = 'closed';
        this.failures = 0;
        this.successes = 0;
      }
      return;
    }
    this.failures = 0;
  }

  private onFailure(error: Error): void {
    this.failures += 1;
    this.lastError = error;
    if (this.state === 'half-open' || this.failures >= this.failureThreshold) {
      this.state = 'open';
      this.openedAt = Date.now();
    }
  }
}
