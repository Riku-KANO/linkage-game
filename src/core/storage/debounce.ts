/**
 * 自動保存用の debounce。最後の呼び出しから waitMs 何もなければ、最後の引数で 1 回呼ぶ。
 * maxWaitMs を指定すると、呼ばれ続けていてもその間隔で必ず呼ぶ(ドラッグし続けても保存される)。
 * タイマーは setTimeout(テストでは vi.useFakeTimers で進める)。
 */

export interface Debounced<A extends unknown[]> {
  (...args: A): void;
  /** 待っている呼び出しを今すぐ実行する(ページを離れる前など) */
  flush(): void;
  /** 待っている呼び出しを捨てる */
  cancel(): void;
  isPending(): boolean;
}

export interface DebounceOptions {
  /** 最初の呼び出しからこれ以上は待たない(ms) */
  maxWaitMs?: number;
}

export function debounce<A extends unknown[]>(
  fn: (...args: A) => void,
  waitMs: number,
  opts: DebounceOptions = {},
): Debounced<A> {
  let timer: ReturnType<typeof setTimeout> | null = null;
  let args: A | null = null;
  let firstAt = 0;

  const clear = () => {
    if (timer !== null) clearTimeout(timer);
    timer = null;
  };
  const invoke = () => {
    clear();
    const a = args;
    args = null;
    if (a) fn(...a);
  };

  const debounced = ((...a: A) => {
    const now = Date.now();
    if (args === null) firstAt = now;
    args = a;
    clear();
    let delay = waitMs;
    if (opts.maxWaitMs !== undefined) {
      delay = Math.max(0, Math.min(waitMs, firstAt + opts.maxWaitMs - now));
    }
    timer = setTimeout(invoke, delay);
  }) as Debounced<A>;
  debounced.flush = () => {
    if (args !== null) invoke();
  };
  debounced.cancel = () => {
    clear();
    args = null;
  };
  debounced.isPending = () => args !== null;
  return debounced;
}
