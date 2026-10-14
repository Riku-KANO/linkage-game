import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { debounce } from './debounce';

describe('debounce (MOD-5)', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it('calls once with the latest arguments after the quiet period', () => {
    const fn = vi.fn<(v: number) => void>();
    const d = debounce(fn, 500);
    d(1);
    vi.advanceTimersByTime(300);
    d(2);
    vi.advanceTimersByTime(300);
    d(3);
    expect(fn).not.toHaveBeenCalled();
    expect(d.isPending()).toBe(true);
    vi.advanceTimersByTime(500);
    expect(fn).toHaveBeenCalledTimes(1);
    expect(fn).toHaveBeenCalledWith(3);
    expect(d.isPending()).toBe(false);
  });

  it('flushes and cancels', () => {
    const fn = vi.fn<(v: string) => void>();
    const d = debounce(fn, 500);
    d('a');
    d.flush();
    expect(fn).toHaveBeenCalledWith('a');
    d.flush();
    expect(fn).toHaveBeenCalledTimes(1);
    d('b');
    d.cancel();
    vi.advanceTimersByTime(1000);
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it('saves at least every maxWait during continuous editing', () => {
    const fn = vi.fn<(v: number) => void>();
    const d = debounce(fn, 500, { maxWaitMs: 2000 });
    for (let t = 0; t < 5000; t += 100) {
      d(t);
      vi.advanceTimersByTime(100);
    }
    // 5 秒間ずっと呼ばれ続けても 2 秒ごとに保存される
    expect(fn.mock.calls.length).toBeGreaterThanOrEqual(2);
    expect(fn.mock.calls.length).toBeLessThanOrEqual(3);
  });

  it('keeps working when the callback throws', () => {
    let n = 0;
    const d = debounce(() => {
      n++;
      throw new Error('boom');
    }, 10);
    d();
    expect(() => vi.advanceTimersByTime(20)).toThrow('boom');
    d();
    expect(() => d.flush()).toThrow('boom');
    expect(n).toBe(2);
    expect(d.isPending()).toBe(false);
  });
});
