import type { SfxName } from '@/audio/sfx';
import { EASINGS } from '@/ui/tokens';

/**
 * 組み上げ演出(T-03 / T-05)の時間割。three・React に依存しない純粋なロジック。
 *
 * 進行度 u は「機械がどこまで組み上がったか」:0 = 図面(製図用紙の上の線)、1 = 試走コースに着地。
 * T-03 は u を 0 → 1 に、T-05(と T-03 の逆再生)は 1 → 0 にたどる。部品ごとの動きは u の関数なので、
 * 途中で向きが変わっても(割り込み)同じ姿をたどって戻る。
 *
 *  rise      図面の部品が順に立ち上がって厚みを持つ(クランクから機構をたどる順)
 *  duplicate 立ち上がった脚が奥行き方向に複製され、組ごとの位相の姿勢まで回る
 *  chassis   フレーム板・軸・モーターがはまって機体になる
 *  hookIn    クレーンのフックが降りてきて掛かる
 *  carry     吊り上げ、窓を抜けてコースの上まで運ぶ(途中で実寸に大きくなる)
 *  lower     コースのスタートに降ろす
 *  hookOut   フックが外れて上がる
 */

export interface Span {
  start: number;
  end: number;
}

export const ASSEMBLY_PHASES = {
  rise: { start: 0.0, end: 0.26 },
  duplicate: { start: 0.2, end: 0.44 },
  chassis: { start: 0.38, end: 0.5 },
  hookIn: { start: 0.42, end: 0.52 },
  carry: { start: 0.52, end: 0.86 },
  /** 窓の内外で大きくなる区間(carry の中の割合ではなく u) */
  grow: { start: 0.66, end: 0.84 },
  lower: { start: 0.86, end: 0.94 },
  /** 着地の前後で脚の姿勢を試走の機体(live)に合わせる */
  live: { start: 0.84, end: 0.94 },
  hookOut: { start: 0.94, end: 1.0 },
} as const satisfies Record<string, Span>;

/** 部品 1 つが立ち上がる・脚 1 組が複製される時間(u) */
export const PART_DURATION = 0.1;
export const INSTANCE_DURATION = 0.1;
/** ピン・脚先がはまって出てくる時間(u) */
export const PIN_POP = 0.035;

export const clamp01 = (x: number) => (x < 0 ? 0 : x > 1 ? 1 : x);

/** 区間の中の進み具合 0..1 */
export function spanProgress(u: number, s: Span): number {
  if (s.end <= s.start) return u >= s.end ? 1 : 0;
  return clamp01((u - s.start) / (s.end - s.start));
}

export function smoothstep(e0: number, e1: number, x: number): number {
  const t = e1 > e0 ? clamp01((x - e0) / (e1 - e0)) : x >= e1 ? 1 : 0;
  return t * t * (3 - 2 * t);
}

export const easeOutCubic = (t: number) => 1 - (1 - t) ** 3;
export const easeInOut = EASINGS.glide;
/** 最後に少し行き過ぎて戻る(部品がはまる) */
export const easeSettle = EASINGS.settle;

/**
 * n 個の区間を span の中に等間隔でずらして並べる(それぞれ長さ duration、span からはみ出さない)。
 */
export function staggerSpans(n: number, span: Span, duration: number): Span[] {
  const len = span.end - span.start;
  const d = Math.min(duration, len);
  if (n <= 0) return [];
  if (n === 1) return [{ start: span.start, end: span.start + d }];
  const step = (len - d) / (n - 1);
  return Array.from({ length: n }, (_, i) => ({
    start: span.start + i * step,
    end: span.start + i * step + d,
  }));
}

/**
 * 立ち上がる順:クランク(なければ固定点を含むリンク)から、ジョイントを共有するリンクを幅優先でたどる。
 * 「モーターから順に機構がつながっていく」見え方になる。たどれないリンクは最後に元の順で。
 *
 * @param links リンクごとのジョイント index
 * @param seeds 最初に立てるリンク(クランク)
 * @param fixedJoints 固定点の index(seeds が空のときの起点)
 */
export function riseOrder(
  links: readonly (readonly number[])[],
  seeds: readonly number[],
  fixedJoints: readonly number[] = [],
): number[] {
  const n = links.length;
  const seen = new Uint8Array(n);
  const order: number[] = [];
  const queue: number[] = [];
  const push = (li: number) => {
    if (li < 0 || li >= n || seen[li]) return;
    seen[li] = 1;
    queue.push(li);
  };
  seeds.forEach(push);
  if (queue.length === 0) {
    const fixed = new Set(fixedJoints);
    links.forEach((ls, li) => {
      if (ls.some((j) => fixed.has(j))) push(li);
    });
  }
  if (queue.length === 0 && n > 0) push(0);
  while (queue.length > 0 || order.length < n) {
    if (queue.length === 0) {
      // つながっていない部分:次の未訪問から
      const next = links.findIndex((_, li) => !seen[li]);
      if (next < 0) break;
      push(next);
    }
    const li = queue.shift()!;
    order.push(li);
    const mine = links[li]!;
    links.forEach((ls, other) => {
      if (!seen[other] && ls.some((j) => mine.includes(j))) push(other);
    });
  }
  return order;
}

/**
 * 複製の順:z = 0(図面から立ち上がった脚の位置)に近い組から、手前・奥を交互に。
 * 同じ距離なら反転していない組を先に。最初の組(primary)は立ち上がった脚そのもの。
 */
export function instanceOrder(instances: readonly { z: number; mirrored: boolean }[]): number[] {
  return instances
    .map((inst, k) => ({ k, d: Math.abs(inst.z), m: inst.mirrored ? 1 : 0, z: inst.z }))
    .sort((a, b) => a.d - b.d || a.m - b.m || b.z - a.z || a.k - b.k)
    .map((x) => x.k);
}

export interface FxEvent {
  u: number;
  /** 進む向き(組み上げ)で通ったときの音 */
  sfx: SfxName;
  volume: number;
  rate: number;
  /** 戻る向き(分解)で通ったときの音。null で鳴らさない。省略時は sfx と同じ */
  reverse?: { sfx: SfxName; volume: number; rate: number } | null;
}

export interface AssemblyPlanInput {
  /** リンクごとのジョイント index(描かないリンクは空配列でよい) */
  links: readonly (readonly number[])[];
  /** クランクのリンク index */
  crankLinks: readonly number[];
  fixedJoints: readonly number[];
  jointCount: number;
  instances: readonly { z: number; mirrored: boolean }[];
}

export interface AssemblyPlan {
  /** リンク index → 立ち上がる区間 */
  parts: Span[];
  /** ジョイント index → はまる時刻(つながるリンクがすべて立ち上がったとき)。どのリンクにも属さなければ 0 */
  pinLock: number[];
  /** 組 index → 複製される区間 */
  instances: Span[];
  /** 図面から立ち上がる組(最初から見える) */
  primary: number;
  /** フレーム板 i が入る区間(frameCount 個) */
  frames: Span[];
  events: FxEvent[];
}

/** 組み上げの時間割を作る(設計が変わったときだけ呼ぶ) */
export function planAssembly(input: AssemblyPlanInput, frameCount: number): AssemblyPlan {
  const P = ASSEMBLY_PHASES;
  const drawn = input.links.map((ls, li) => ({ li, n: ls.length }));
  const order = riseOrder(input.links, input.crankLinks, input.fixedJoints).filter(
    (li) => drawn[li]!.n >= 2,
  );
  const riseSpans = staggerSpans(order.length, P.rise, PART_DURATION);
  const parts: Span[] = input.links.map(() => ({ start: P.rise.start, end: P.rise.start }));
  order.forEach((li, i) => (parts[li] = riseSpans[i]!));

  const pinLock = Array.from({ length: input.jointCount }, () => 0);
  input.links.forEach((ls, li) => {
    if (ls.length < 2) return;
    for (const j of ls) pinLock[j] = Math.max(pinLock[j]!, parts[li]!.end);
  });

  const instOrder = instanceOrder(input.instances);
  const primary = instOrder[0] ?? 0;
  const instSpans = staggerSpans(instOrder.length, P.duplicate, INSTANCE_DURATION);
  const instances: Span[] = input.instances.map(() => ({ ...P.duplicate }));
  instOrder.forEach((k, i) => (instances[k] = instSpans[i]!));

  const frames = staggerSpans(frameCount, P.chassis, (P.chassis.end - P.chassis.start) * 0.6);

  const events: FxEvent[] = [];
  const soft = { sfx: 'release' as SfxName, volume: 0.18, rate: 1.2 };
  events.push({ u: 0.01, sfx: 'press', volume: 0.3, rate: 0.9, reverse: null });
  order.forEach((li, i) => {
    events.push({
      u: parts[li]!.end - PART_DURATION * 0.15,
      sfx: 'snap',
      volume: 0.22,
      rate: 1 + 0.35 * (order.length > 1 ? i / (order.length - 1) : 0),
      reverse: soft,
    });
  });
  // 複製は数が多いので、最大 6 回だけ小さく刻む
  const ticks = instOrder.length <= 1 ? [] : instOrder.slice(1);
  const every = Math.max(1, Math.ceil(ticks.length / 6));
  ticks.forEach((k, i) => {
    if (i % every !== every - 1 && i !== ticks.length - 1) return;
    events.push({ u: instances[k]!.end, sfx: 'press', volume: 0.14, rate: 1.7, reverse: null });
  });
  events.push({ u: P.chassis.end, sfx: 'snap', volume: 0.4, rate: 0.8, reverse: soft });
  events.push({ u: P.hookIn.end, sfx: 'snap', volume: 0.3, rate: 0.6 });
  events.push({ u: P.carry.start + 0.01, sfx: 'gear', volume: 0.35, rate: 0.8 });
  events.push({ u: P.lower.start + 0.01, sfx: 'gear', volume: 0.2, rate: 1.3, reverse: null });
  events.push({
    u: P.lower.end,
    sfx: 'step',
    volume: 0.6,
    rate: 1,
    reverse: { sfx: 'gear', volume: 0.3, rate: 0.9 },
  });
  events.sort((a, b) => a.u - b.u);
  return { parts, pinLock, instances, primary, frames, events };
}

/** 1 フレームでこれより大きく u が跳んだら(スキップ・reduced-motion)音は鳴らさない */
export const MAX_EVENT_JUMP = 0.25;

/**
 * u0 → u1 の間に通った出来事(進む向きなら u0 < e.u ≤ u1、戻る向きなら u1 ≤ e.u < u0)を
 * 通った順に out へ入れ、個数を返す。大きく跳んだときは何も返さない。
 */
export function eventsBetween(
  events: readonly FxEvent[],
  u0: number,
  u1: number,
  out: FxEvent[],
): number {
  out.length = 0;
  if (u0 === u1 || Math.abs(u1 - u0) > MAX_EVENT_JUMP) return 0;
  if (u1 > u0) {
    for (const e of events) if (e.u > u0 && e.u <= u1) out.push(e);
  } else {
    for (let i = events.length - 1; i >= 0; i--) {
      const e = events[i]!;
      if (e.u >= u1 && e.u < u0) out.push(e);
    }
  }
  return out.length;
}

export interface FxSound {
  sfx: SfxName;
  volume: number;
  rate: number;
}

/** 出来事を通ったときに鳴らす音(分解の向きでは reverse。null なら鳴らさない) */
export function soundFor(e: FxEvent, backwards: boolean): FxSound | null {
  if (!backwards || e.reverse === undefined) return e;
  return e.reverse;
}

/** 部品の立ち上がり:回転角(rad、−π/2 = 紙に寝ている、0 = 立っている)・跳ね上がり・厚みの倍率 */
export interface PartRise {
  angle: number;
  /** 立ち上がる途中で少し浮く量(0..1、最大で区間の真ん中) */
  hop: number;
  thickness: number;
}

/** 紙に寝ているときの厚みの倍率(図面の線の上に薄く載る) */
export const FLAT_THICKNESS = 0.06;

export function partRise(u: number, span: Span, out: PartRise): PartRise {
  const p = spanProgress(u, span);
  out.angle = (-Math.PI / 2) * (1 - (p >= 1 ? 1 : easeSettle(p)));
  out.hop = Math.sin(Math.PI * p);
  out.thickness = FLAT_THICKNESS + (1 - FLAT_THICKNESS) * smoothstep(0, 0.7, p);
  return out;
}

/**
 * T-04(試走 → 結果)の時間の倍率:ゴールの瞬間に素早くゆっくりになり、カメラが回り込むあいだ保ち、
 * 最後に止まる(結果画面では機械は止まっている)。t は遷移の線形の進み具合 0..1。
 */
export const GOAL_SLOWMO = {
  /** スロー中の倍率 */
  slowScale: 0.2,
  /** 1 → slowScale に落とす区間(t) */
  easeIn: 0.16,
  /** ここから止まり始める(t) */
  holdUntil: 0.72,
  /** 遷移の終わり(と結果画面の間)の倍率 */
  endScale: 0,
} as const;

export function goalTimeScale(t: number): number {
  const g = GOAL_SLOWMO;
  if (!(t > 0)) return 1;
  if (t >= 1) return g.endScale;
  if (t < g.easeIn) return 1 + (g.slowScale - 1) * easeOutCubic(t / g.easeIn);
  if (t < g.holdUntil) return g.slowScale;
  return g.slowScale + (g.endScale - g.slowScale) * smoothstep(g.holdUntil, 1, t);
}
