import { EmailDispatchErrorCode } from './types';
import { EmailAdapterError } from './errors';
import {
  DEFAULT_RETRY_DELAYS_MS,
  defaultShouldRetry,
  withRetry,
} from './email-retry.policy';

describe('defaultShouldRetry', () => {
  it('retries on EmailAdapterError with retryable=true', () => {
    const err = new EmailAdapterError(
      EmailDispatchErrorCode.RETRYABLE_TRANSIENT,
      '5xx',
      { retryable: true },
    );
    expect(defaultShouldRetry(err)).toBe(true);
  });

  it('does NOT retry on EmailAdapterError with retryable=false', () => {
    const err = new EmailAdapterError(
      EmailDispatchErrorCode.PERMANENT_AUTH_OR_VALIDATION,
      '401',
      { retryable: false },
    );
    expect(defaultShouldRetry(err)).toBe(false);
  });

  it('retries on ECONNREFUSED system error', () => {
    const err = Object.assign(new Error('refused'), { code: 'ECONNREFUSED' });
    expect(defaultShouldRetry(err)).toBe(true);
  });

  it('does NOT retry on unrecognised throwables', () => {
    expect(defaultShouldRetry(new Error('boom'))).toBe(false);
    expect(defaultShouldRetry('string-error')).toBe(false);
    expect(defaultShouldRetry(null)).toBe(false);
  });
});

describe('withRetry', () => {
  const noSleep = async (): Promise<void> => undefined;

  it('returns immediately on first-attempt success', async () => {
    const fn = jest.fn().mockResolvedValueOnce('ok');
    const result = await withRetry(fn, { sleep: noSleep });
    expect(result).toEqual({ value: 'ok', attempts: 1 });
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it('retries once on retryable error, then succeeds', async () => {
    const fn = jest
      .fn()
      .mockRejectedValueOnce(
        new EmailAdapterError(
          EmailDispatchErrorCode.RETRYABLE_TRANSIENT,
          '5xx',
          { retryable: true },
        ),
      )
      .mockResolvedValueOnce('ok');
    const result = await withRetry(fn, { sleep: noSleep });
    expect(result).toEqual({ value: 'ok', attempts: 2 });
    expect(fn).toHaveBeenCalledTimes(2);
  });

  it('exhausts retries and re-throws after maxAttempts', async () => {
    const err = new EmailAdapterError(
      EmailDispatchErrorCode.RETRYABLE_TRANSIENT,
      '5xx',
      { retryable: true },
    );
    const fn = jest.fn().mockRejectedValue(err);
    await expect(withRetry(fn, { sleep: noSleep })).rejects.toBe(err);
    expect(fn).toHaveBeenCalledTimes(3);
  });

  it('fails-fast on non-retryable error (no retries)', async () => {
    const err = new EmailAdapterError(
      EmailDispatchErrorCode.PERMANENT_AUTH_OR_VALIDATION,
      '401',
      { retryable: false },
    );
    const fn = jest.fn().mockRejectedValue(err);
    await expect(withRetry(fn, { sleep: noSleep })).rejects.toBe(err);
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it('honours custom delays via injected sleep', async () => {
    const sleepCalls: number[] = [];
    const sleep = async (ms: number): Promise<void> => {
      sleepCalls.push(ms);
    };
    const err = new EmailAdapterError(
      EmailDispatchErrorCode.RETRYABLE_TRANSIENT,
      '5xx',
      { retryable: true },
    );
    const fn = jest
      .fn()
      .mockRejectedValueOnce(err)
      .mockRejectedValueOnce(err)
      .mockResolvedValueOnce('done');
    const result = await withRetry(fn, { sleep });
    expect(result.attempts).toBe(3);
    expect(sleepCalls).toEqual([
      DEFAULT_RETRY_DELAYS_MS[0],
      DEFAULT_RETRY_DELAYS_MS[1],
    ]);
  });
});
