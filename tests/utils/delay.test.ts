import { sleep, humanDelay, withRetry } from '../../src/utils/delay';

describe('sleep', () => {
  beforeEach(() => jest.useFakeTimers());
  afterEach(() => jest.useRealTimers());

  it('resolves after the specified delay', async () => {
    const promise = sleep(1000);
    jest.advanceTimersByTime(1000);
    await expect(promise).resolves.toBeUndefined();
  });

  it('does not resolve before the delay', async () => {
    let resolved = false;
    sleep(1000).then(() => {
      resolved = true;
    });

    jest.advanceTimersByTime(999);
    await Promise.resolve();
    expect(resolved).toBe(false);

    jest.advanceTimersByTime(1);
    await Promise.resolve();
    expect(resolved).toBe(true);
  });

  it('handles zero delay', async () => {
    const promise = sleep(0);
    jest.advanceTimersByTime(0);
    await expect(promise).resolves.toBeUndefined();
  });
});

describe('humanDelay', () => {
  beforeEach(() => jest.useFakeTimers());
  afterEach(() => jest.useRealTimers());

  it('uses minimum delay when random returns 0', async () => {
    jest.spyOn(Math, 'random').mockReturnValue(0);
    const promise = humanDelay();
    jest.advanceTimersByTime(2000);
    await expect(promise).resolves.toBeUndefined();
    jest.spyOn(Math, 'random').mockRestore();
  });

  it('uses maximum delay when random returns close to 1', async () => {
    jest.spyOn(Math, 'random').mockReturnValue(0.999);
    const promise = humanDelay();
    jest.advanceTimersByTime(4000);
    await expect(promise).resolves.toBeUndefined();
    jest.spyOn(Math, 'random').mockRestore();
  });

  it('respects custom min/max values', async () => {
    jest.spyOn(Math, 'random').mockReturnValue(0);
    const promise = humanDelay(500, 1000);
    jest.advanceTimersByTime(500);
    await expect(promise).resolves.toBeUndefined();
    jest.spyOn(Math, 'random').mockRestore();
  });
});

describe('withRetry', () => {
  // Use real timers with small delays to avoid fake timer + async complexity
  it('returns the result on first success', async () => {
    const fn = jest.fn().mockResolvedValue('success');
    const result = await withRetry(fn, 3, 1);
    expect(result).toBe('success');
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it('retries on failure and succeeds eventually', async () => {
    const fn = jest
      .fn()
      .mockRejectedValueOnce(new Error('fail 1'))
      .mockRejectedValueOnce(new Error('fail 2'))
      .mockResolvedValue('success');

    const result = await withRetry(fn, 3, 1);
    expect(result).toBe('success');
    expect(fn).toHaveBeenCalledTimes(3);
  });

  it('throws after exhausting all retries', async () => {
    const fn = jest.fn().mockRejectedValue(new Error('persistent failure'));
    await expect(withRetry(fn, 2, 1)).rejects.toThrow('persistent failure');
    expect(fn).toHaveBeenCalledTimes(3); // initial + 2 retries
  });

  it('converts non-Error thrown values to Error', async () => {
    const fn = jest.fn().mockRejectedValue('string error');
    await expect(withRetry(fn, 0, 1)).rejects.toThrow('string error');
  });

  it('works with maxRetries = 0 (no retries)', async () => {
    const fn = jest.fn().mockRejectedValue(new Error('immediate fail'));
    await expect(withRetry(fn, 0, 1)).rejects.toThrow('immediate fail');
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it('applies increasing delays between retries', async () => {
    const fn = jest
      .fn()
      .mockRejectedValueOnce(new Error('fail'))
      .mockRejectedValueOnce(new Error('fail'))
      .mockResolvedValue('ok');

    const start = Date.now();
    await withRetry(fn, 3, 10);
    const elapsed = Date.now() - start;

    expect(fn).toHaveBeenCalledTimes(3);
    // baseDelay=10: first wait 10ms (10*2^0), then 20ms (10*2^1) = 30ms total minimum
    expect(elapsed).toBeGreaterThanOrEqual(20);
  });
});
