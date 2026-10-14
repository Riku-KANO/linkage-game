import { REDUCED_MOTION_FADE } from '@/ui/tokens';

/**
 * 結果画面の演出のタイムライン(RS-1)。
 * パネルが伸縮リンクで開く → 4 軸の歯車メーターが順に回って止まる → メダルを順にプレスで刻印する。
 * 2 回目以降(short)は短縮版、動きの軽減ではすべて最終状態で 0.3 秒のフェードだけ。
 */

export interface Span {
  /** パネルを出してからの開始時刻(s) */
  start: number;
  /** 長さ(s)。0 は即座に最終状態 */
  duration: number;
}

export interface ResultTimeline {
  panel: Span;
  meters: Span[];
  stamps: Span[];
  /** すべてが止まる時刻(s) */
  total: number;
  /** 動きの軽減のときのフェード(s)。それ以外は 0 */
  fade: number;
}

export const spanEnd = (s: Span) => s.start + s.duration;

interface Pace {
  panel: number;
  meter: number;
  meterStagger: number;
  stampGap: number;
  stamp: number;
  stampStagger: number;
}

/** 初回:じっくり見せる。メーターは前のものが回っている途中で次が回り始め、順に止まる */
const FIRST: Pace = {
  panel: 0.55,
  meter: 1.1,
  meterStagger: 0.42,
  stampGap: 0.15,
  stamp: 0.62,
  stampStagger: 0.36,
};

/** 2 回目以降(設計原則 5「二度目は短く」) */
const SHORT: Pace = {
  panel: 0.3,
  meter: 0.5,
  meterStagger: 0.14,
  stampGap: 0.05,
  stamp: 0.34,
  stampStagger: 0.14,
};

export function buildResultTimeline(opts: {
  short: boolean;
  reducedMotion: boolean;
  /** メダルを刻印するか(失敗のときは刻印しない) */
  stamps: boolean;
  axes?: number;
}): ResultTimeline {
  const n = opts.axes ?? 4;
  if (opts.reducedMotion) {
    const zero: Span = { start: 0, duration: 0 };
    return {
      panel: zero,
      meters: Array.from({ length: n }, () => zero),
      stamps: opts.stamps ? Array.from({ length: n }, () => zero) : [],
      total: REDUCED_MOTION_FADE,
      fade: REDUCED_MOTION_FADE,
    };
  }
  const p = opts.short ? SHORT : FIRST;
  const panel: Span = { start: 0, duration: p.panel };
  // パネルが 6 割ほど開いたところでメーターが回り始める(反応を待たせない)
  const meter0 = p.panel * 0.6;
  const meters = Array.from({ length: n }, (_, i) => ({
    start: meter0 + i * p.meterStagger,
    duration: p.meter,
  }));
  const metersDone = Math.max(spanEnd(panel), ...meters.map(spanEnd));
  const stamps = opts.stamps
    ? Array.from({ length: n }, (_, i) => ({
        start: metersDone + p.stampGap + i * p.stampStagger,
        duration: p.stamp,
      }))
    : [];
  const total = Math.max(metersDone, ...stamps.map(spanEnd));
  return { panel, meters, stamps, total, fade: 0 };
}
