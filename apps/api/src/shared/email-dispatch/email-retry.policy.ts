/**
 * Pure retry policy helper per ADR-EMAIL-RETRY-POLICY.
 *
 * Exponential backoff with delays 1s, 4s, 16s (geometric ×4). Worst-case
 * total latency: ~21s. The policy is independent of provider; adapters
 * throw `EmailAdapterError` with `retryable: boolean` and the policy
 * inspects that flag via the caller-supplied `shouldRetry` predicate.
 *
 * Default predicate retries on:
 *   - `EmailAdapterError` with `retryable: true`
 *   - generic `Error` whose `code` indicates network failure
 *     (ECONNREFUSED, ETIMEDOUT, EAI_AGAIN, ENOTFOUND)
 *
 * Default predicate does NOT retry on:
 *   - `EmailAdapterError` with `retryable: false` (4xx, sender rejected)
 *   - any other thrown value
 */

import { EmailAdapterError } from './errors';

export interface RetryOptions {
  /** Max attempts including the first. Default: 3 (1 attempt + 2 retries). */
  maxAttempts?: number;
  /**
   * Delay in milliseconds AFTER each failed attempt before the next.
   * Length should equal `maxAttempts - 1`. Default: [1000, 4000, 16000].
   *
   * Note: with default `maxAttempts=3` the third delay (16000) is unused;
   * we keep it in the array so tests can override `maxAttempts=4` and have
   * the delay table ready without re-specifying it.
   */
  delays?: number[];
  /**
   * Override the predicate. Default: see module-level doc.
   */
  shouldRetry?: (err: unknown) => boolean;
  /**
   * Injectable sleep — tests pass a no-op to skip real timers.
   */
  sleep?: (ms: number) => Promise<void>;
}

export const DEFAULT_RETRY_DELAYS_MS = [1000, 4000, 16000];
export const DEFAULT_MAX_ATTEMPTS = 3;

const NETWORK_ERROR_CODES = new Set([
  'ECONNREFUSED',
  'ETIMEDOUT',
  'EAI_AGAIN',
  'ENOTFOUND',
  'ECONNRESET',
  'EPIPE',
]);

export function defaultShouldRetry(err: unknown): boolean {
  if (err instanceof EmailAdapterError) return err.retryable;
  if (err && typeof err === 'object' && 'code' in err) {
    const code = (err as { code?: unknown }).code;
    if (typeof code === 'string' && NETWORK_ERROR_CODES.has(code)) return true;
  }
  return false;
}

const defaultSleep = (ms: number): Promise<void> =>
  new Promise((resolve) => setTimeout(resolve, ms));

export interface WithRetryResult<T> {
  value: T;
  attempts: number;
}

/**
 * Execute `attempt()` up to `maxAttempts` times. On each failure, consult
 * `shouldRetry`; if it returns `true` AND attempts remain, wait
 * `delays[attemptIndex]` ms and retry. Otherwise re-throw the LAST error.
 *
 * Returns `{ value, attempts }` on success so the caller can populate
 * `EmailDispatchResult.success.attempts` without instrumenting the policy.
 */
export async function withRetry<T>(
  attempt: () => Promise<T>,
  options: RetryOptions = {},
): Promise<WithRetryResult<T>> {
  const maxAttempts = options.maxAttempts ?? DEFAULT_MAX_ATTEMPTS;
  const delays = options.delays ?? DEFAULT_RETRY_DELAYS_MS;
  const shouldRetry = options.shouldRetry ?? defaultShouldRetry;
  const sleep = options.sleep ?? defaultSleep;

  let lastError: unknown;
  for (let i = 0; i < maxAttempts; i++) {
    try {
      const value = await attempt();
      return { value, attempts: i + 1 };
    } catch (err) {
      lastError = err;
      const isLastAttempt = i === maxAttempts - 1;
      if (isLastAttempt || !shouldRetry(err)) {
        throw err;
      }
      const delayMs = delays[i] ?? delays[delays.length - 1] ?? 0;
      if (delayMs > 0) await sleep(delayMs);
    }
  }
  // Unreachable — loop either returns or throws — but TS needs the assertion.
  throw lastError as Error;
}
