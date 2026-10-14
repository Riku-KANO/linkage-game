import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { clamp } from './math';

/** requestAnimationFrame がない環境(テストなど)では setTimeout で代用する */
export function nextFrame(cb: (now: number) => void): () => void {
  if (typeof requestAnimationFrame === 'function') {
    const id = requestAnimationFrame(cb);
    return () => cancelAnimationFrame(id);
  }
  const id = setTimeout(() => cb(performance.now()), 16);
  return () => clearTimeout(id);
}

export interface ClockOptions {
  /** 開始までの遅延(s) */
  delay?: number;
  /** 長さ(s)。0 以下なら即座に終わる */
  duration: number;
  /** true で最終状態へ飛ぶ(スキップ・動きの軽減) */
  skip?: boolean;
  /** 動いている間の毎フレーム。効果音など描画以外の副作用用(t, 前のフレームの t) */
  onFrame?: (t: number, prev: number) => void;
  /** 終わったとき(スキップを含む)に 1 回だけ */
  onDone?: () => void;
}

/**
 * マウントした時刻から進む演出の時計。経過時間 t(s、0..duration)を返す。
 * 遅延の間と終わった後は再描画しない。skip が立つと最終状態に飛ぶ。
 */
export function useClock({ delay = 0, duration, skip = false, onFrame, onDone }: ClockOptions) {
  const finished = skip || !(duration > 0);
  const [t, setT] = useState(0);
  const latest = useRef({ delay, duration, onFrame, onDone });
  useLayoutEffect(() => {
    latest.current = { delay, duration, onFrame, onDone };
  });
  const origin = useRef<number | null>(null);
  const done = useRef(false);

  useEffect(() => {
    const finish = () => {
      if (done.current) return;
      done.current = true;
      latest.current.onDone?.();
    };
    if (finished) {
      finish();
      return;
    }
    let last = -1;
    let cancel = () => {};
    const loop = (now: number) => {
      if (origin.current === null) origin.current = now;
      const { delay: d, duration: dur } = latest.current;
      const e = (now - origin.current) / 1000 - d;
      const tt = clamp(e, 0, dur);
      if (tt !== last) {
        latest.current.onFrame?.(tt, Math.max(0, last));
        last = tt;
        setT(tt);
      }
      if (e >= dur) finish();
      else cancel = nextFrame(loop);
    };
    cancel = nextFrame(loop);
    return () => cancel();
  }, [finished]);

  return finished ? Math.max(0, duration) : t;
}
