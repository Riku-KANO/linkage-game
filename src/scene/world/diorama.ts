import type { TerrainSpec } from '@/core/sim/types';
import { CHAPTERS } from '@/game/chapters';
import { terrainHeightAt } from '@/game/courses';
import { STAGES } from '@/game/stages';
import type { ChapterDef, StageDef, StageId } from '@/game/types';

/**
 * ステージ選択のジオラマ(WORLD-1)の配置。three・React に依存しない純粋な計算。
 *
 * 座標はコース模型のローカル(m):原点は板の中心(板の上面 y = 0)、+x が章の進む向き、
 * +y 上、+z 手前(部屋の内側)。模型はステージ選択で MODEL_GROW 倍に膨らむ(原点中心)。
 *
 * 章ごとに台地が 1 つあり、台地の上を S 字の小道が西(−x)から東(+x)へ抜ける。
 * 小道は橋で次の章の台地へつながり、全体で 1 本の「道のり」(Route)になる。
 * ステージの目印は道のりに沿って並び、小道の脇(交互に左右)に立つ。機械は小道の上を歩く。
 */

/** 模型の砂地の上面(m) */
export const SAND_TOP = 0.008;
/** 小道の幅(m) */
export const PATH_WIDTH = 0.024;
/** 小道の厚み(台地の上面からの高さ、m) */
export const PATH_LIFT = 0.0025;
/** 目印の台座の中心と小道の中心の距離(m) */
export const MARKER_OFFSET = 0.034;
/** 目印の台座の半径(m) */
export const MARKER_RADIUS = 0.012;
/** ステージ選択で模型が膨らむ倍率(CourseModel が使う) */
export const MODEL_GROW = 1.2;
/** 段差のあるステージの段(小道の下に敷く台)の長さ・幅(m) */
export const TERRACE_LENGTH = 0.05;
export const TERRACE_WIDTH = 0.092;
/** 段の上り下りの斜面の長さ(機械の高さを滑らかにつなぐ、m) */
const TERRACE_RAMP = 0.006;
/** 小道の端を台地の縁のどこまで伸ばすか(半径に対する比) */
const RIM = 0.92;
/** 小道の S 字の始点・終点(半径に対する比) */
const INNER = 0.8;
/** 台地 1 つの小道の分割数 */
const INNER_SAMPLES = 120;
const RIM_SAMPLES = 4;
const BRIDGE_SAMPLES = 32;

export interface PlateauSpec {
  chapter: number;
  /** 中心(m) */
  x: number;
  z: number;
  /** 外接半径(m) */
  r: number;
  /** 上面の高さ(m) */
  top: number;
  /** 多角柱の辺の数 */
  sides: number;
  /** ステージがあって遊べる章か */
  playable: boolean;
  /** S 字の向き(最初に曲がる側) */
  turn: 1 | -1;
}

/** 章ごとの台地(章 1・2 は大きく、まだ遊べない章 3〜5 は小さく右へ並ぶ) */
const PLATEAU_TABLE: readonly Omit<PlateauSpec, 'chapter' | 'playable'>[] = [
  { x: -0.66, z: -0.02, r: 0.205, top: 0.05, sides: 8, turn: 1 },
  { x: -0.12, z: 0.03, r: 0.215, top: 0.085, sides: 8, turn: -1 },
  { x: 0.34, z: -0.02, r: 0.115, top: 0.11, sides: 7, turn: 1 },
  { x: 0.61, z: 0.025, r: 0.1, top: 0.14, sides: 7, turn: -1 },
  { x: 0.87, z: -0.01, r: 0.095, top: 0.17, sides: 6, turn: 1 },
];

/** ステージの地形の特徴(模型の段・溝の手がかり) */
export interface TerrainHint {
  /** スタートの面からいちばん高い面までの高さ(m、0 以上) */
  stepM: number;
  /** スタートの面より 2cm 以上低い溝があるか */
  ditch: boolean;
}

/** 地形の中心線(z = 0)をスタートからゴールまで 2cm おきに調べる */
export function terrainHint(
  terrain: TerrainSpec,
  startX: number,
  goalX: number,
  startZ = 0,
): TerrainHint {
  const base = terrainHeightAt(terrain, startX, startZ);
  let max = base;
  let min = base;
  const step = 0.02;
  for (let x = startX; x <= goalX + 1e-9; x += step) {
    const h = terrainHeightAt(terrain, x, startZ);
    if (!Number.isFinite(h)) continue;
    if (h > max) max = h;
    if (h < min) min = h;
  }
  return { stepM: Math.max(0, max - base), ditch: min < base - 0.02 };
}

/** 段の高さ(模型、m)。実寸の段差を誇張して 4〜12mm に収める。2cm 未満の段は作らない */
export function terraceHeight(hint: TerrainHint): number {
  if (hint.stepM < 0.02) return 0;
  return Math.min(0.012, Math.max(0.004, hint.stepM * 0.08));
}

export interface MarkerSpec {
  stageId: StageId;
  chapter: number;
  order: number;
  /** STAGES の中の番号(インスタンスの番号) */
  index: number;
  /** 機械が立つ道のりの位置(m)。目印はこの位置の小道の脇に立つ */
  s: number;
  /** 目印の台座の中心(台座が載る面の高さ、m) */
  x: number;
  y: number;
  z: number;
  /** その位置の小道の向き(rad、0 で +x、three の rotation.y と同じ向き) */
  heading: number;
  /** 小道のどちら側に立つか */
  side: 1 | -1;
  hint: TerrainHint;
  /** 小道の下に敷く段の高さ(m、0 なら段なし) */
  terrace: number;
  /** 小道を横切る溝の位置(道のり、m)。null なら溝なし */
  ditchS: number | null;
}

/** 道のり:小道と橋をつないだ折れ線。s は水平方向の弧長(m) */
export interface Route {
  count: number;
  x: Float64Array;
  y: Float64Array;
  z: Float64Array;
  /** 各点の向き(rad、0 で +x) */
  heading: Float64Array;
  s: Float64Array;
  length: number;
}

export interface BridgeSpec {
  /** 渡る前の章と渡った後の章 */
  from: number;
  to: number;
  /** 端点(台地の縁、小道の高さ) */
  a: [number, number, number];
  b: [number, number, number];
}

export interface DioramaLayout {
  plateaus: PlateauSpec[];
  route: Route;
  markers: MarkerSpec[];
  bridges: BridgeSpec[];
  /** 章ごとの小道(S 字)の道のりの範囲 [入口, 出口] */
  chapterSpan: Map<number, [number, number]>;
}

/** S 字の横ずれ:両端で傾き 0、u = 1/4 と 3/4 で ±1 */
function sCurve(u: number): number {
  return Math.sin(2 * Math.PI * u) - 0.5 * Math.sin(4 * Math.PI * u);
}

const smooth = (k: number) => k * k * (3 - 2 * k);

export function buildDioramaLayout(
  stages: readonly StageDef[] = STAGES,
  chapters: readonly ChapterDef[] = CHAPTERS,
): DioramaLayout {
  const plateaus: PlateauSpec[] = chapters.map((c, i) => {
    const row = PLATEAU_TABLE[Math.min(i, PLATEAU_TABLE.length - 1)]!;
    return { ...row, chapter: c.chapter, playable: stages.some((s) => s.chapter === c.chapter) };
  });

  // 道のりの点(x, 基準の y, z)と、章の小道の始点・終点の番号
  const px: number[] = [];
  const py: number[] = [];
  const pz: number[] = [];
  const inner = new Map<number, [number, number]>();
  const bridges: BridgeSpec[] = [];
  const push = (x: number, y: number, z: number) => {
    px.push(x);
    py.push(y);
    pz.push(z);
  };
  plateaus.forEach((p, i) => {
    const y = p.top + PATH_LIFT;
    // S 字の振れ幅(m)。小さな台地では曲がりがきつくならないよう半径の 2 乗で縮める
    const amp = (0.4 * p.r * p.r) / 0.21;
    // 西の縁から S 字の始点まで(まっすぐ)
    for (let k = 0; k < RIM_SAMPLES; k++) {
      const f = k / RIM_SAMPLES;
      push(p.x - p.r * (RIM + (INNER - RIM) * f), y, p.z);
    }
    const first = px.length;
    for (let k = 0; k <= INNER_SAMPLES; k++) {
      const u = k / INNER_SAMPLES;
      push(p.x + p.r * INNER * (2 * u - 1), y, p.z + amp * p.turn * sCurve(u));
    }
    inner.set(p.chapter, [first, px.length - 1]);
    // S 字の終点から東の縁まで
    for (let k = 1; k <= RIM_SAMPLES; k++) {
      const f = k / RIM_SAMPLES;
      push(p.x + p.r * (INNER + (RIM - INNER) * f), y, p.z);
    }
    const q = plateaus[i + 1];
    if (!q) return;
    // 次の台地への橋(高さと横ずれは滑らかにつなぐ:両端で小道と同じ向き)
    const a: [number, number, number] = [p.x + p.r * RIM, y, p.z];
    const b: [number, number, number] = [q.x - q.r * RIM, q.top + PATH_LIFT, q.z];
    bridges.push({ from: p.chapter, to: q.chapter, a, b });
    for (let k = 1; k < BRIDGE_SAMPLES; k++) {
      const f = k / BRIDGE_SAMPLES;
      const e = smooth(f);
      push(a[0] + (b[0] - a[0]) * f, a[1] + (b[1] - a[1]) * e, a[2] + (b[2] - a[2]) * e);
    }
  });

  const n = px.length;
  const route: Route = {
    count: n,
    x: Float64Array.from(px),
    y: Float64Array.from(py),
    z: Float64Array.from(pz),
    heading: new Float64Array(n),
    s: new Float64Array(n),
    length: 0,
  };
  for (let i = 1; i < n; i++) {
    route.s[i] = route.s[i - 1]! + Math.hypot(px[i]! - px[i - 1]!, pz[i]! - pz[i - 1]!);
  }
  route.length = route.s[n - 1] ?? 0;
  for (let i = 0; i < n; i++) {
    const a = Math.max(0, i - 1);
    const b = Math.min(n - 1, i + 1);
    route.heading[i] = Math.atan2(-(pz[b]! - pz[a]!), px[b]! - px[a]!);
  }
  const chapterSpan = new Map<number, [number, number]>();
  for (const [ch, [i0, i1]] of inner) chapterSpan.set(ch, [route.s[i0]!, route.s[i1]!]);

  // 目印:章の小道の 10%〜90% に等間隔
  const markers: MarkerSpec[] = [];
  const tmp = createRouteSample();
  for (const p of plateaus) {
    const list = stages
      .map((st, index) => ({ st, index }))
      .filter((e) => e.st.chapter === p.chapter)
      .sort((a, b) => a.st.order - b.st.order);
    const span = chapterSpan.get(p.chapter);
    if (!span || list.length === 0) continue;
    list.forEach(({ st, index }, k) => {
      const f = list.length > 1 ? 0.1 + (0.8 * k) / (list.length - 1) : 0.5;
      const s = span[0] + f * (span[1] - span[0]);
      sampleRoute(route, s, tmp);
      const hint = terrainHint(st.terrain, st.start.x, st.goal.x, st.start.z);
      const terrace = terraceHeight(hint);
      const side: 1 | -1 = k % 2 === 0 ? 1 : -1;
      // 小道の左の法線(進む向きに対して左)
      const nx = -Math.sin(tmp.heading);
      const nz = -Math.cos(tmp.heading);
      markers.push({
        stageId: st.id,
        chapter: st.chapter,
        order: st.order,
        index,
        s,
        x: tmp.x + nx * MARKER_OFFSET * side,
        y: p.top + terrace,
        z: tmp.z + nz * MARKER_OFFSET * side,
        heading: tmp.heading,
        side,
        hint,
        terrace,
        ditchS: hint.ditch ? s - (terrace > 0 ? TERRACE_LENGTH / 2 + 0.016 : 0.03) : null,
      });
    });
  }
  markers.sort((a, b) => a.index - b.index);

  // 段:目印の前後の小道を持ち上げる(機械が段に上って立つ)。斜面は台の縁の内側に収める
  for (const m of markers) {
    if (m.terrace <= 0) continue;
    const flat = TERRACE_LENGTH / 2 - TERRACE_RAMP;
    for (let i = 0; i < n; i++) {
      const d = Math.abs(route.s[i]! - m.s);
      if (d >= flat + TERRACE_RAMP) continue;
      const k = d <= flat ? 1 : smooth(1 - (d - flat) / TERRACE_RAMP);
      route.y[i] = route.y[i]! + m.terrace * k;
    }
  }

  return { plateaus, route, markers, bridges, chapterSpan };
}

let cachedLayout: DioramaLayout | null = null;
/** ゲームのステージ(STAGES)のジオラマの配置。一度だけ作って使い回す */
export function getDioramaLayout(): DioramaLayout {
  cachedLayout ??= buildDioramaLayout();
  return cachedLayout;
}

export interface RouteSample {
  x: number;
  y: number;
  z: number;
  heading: number;
}

export function createRouteSample(): RouteSample {
  return { x: 0, y: 0, z: 0, heading: 0 };
}

/** 道のりの位置 s(m)の点と向き。範囲外は端に留める。out に書いて返す(確保しない) */
export function sampleRoute(route: Route, s: number, out: RouteSample): RouteSample {
  const n = route.count;
  if (n === 0) {
    out.x = out.y = out.z = out.heading = 0;
    return out;
  }
  const S = route.s;
  if (n === 1 || s <= 0) return copyPoint(route, 0, out);
  if (s >= route.length) return copyPoint(route, n - 1, out);
  // 二分探索:S[lo] <= s < S[hi]
  let lo = 0;
  let hi = n - 1;
  while (hi - lo > 1) {
    const mid = (lo + hi) >> 1;
    if (S[mid]! <= s) lo = mid;
    else hi = mid;
  }
  const ds = S[hi]! - S[lo]!;
  const k = ds > 0 ? (s - S[lo]!) / ds : 0;
  out.x = route.x[lo]! + (route.x[hi]! - route.x[lo]!) * k;
  out.y = route.y[lo]! + (route.y[hi]! - route.y[lo]!) * k;
  out.z = route.z[lo]! + (route.z[hi]! - route.z[lo]!) * k;
  const h0 = route.heading[lo]!;
  const dh = Math.atan2(Math.sin(route.heading[hi]! - h0), Math.cos(route.heading[hi]! - h0));
  out.heading = h0 + dh * k;
  return out;
}

function copyPoint(route: Route, i: number, out: RouteSample): RouteSample {
  out.x = route.x[i]!;
  out.y = route.y[i]!;
  out.z = route.z[i]!;
  out.heading = route.heading[i]!;
  return out;
}

export function markerOf(layout: DioramaLayout, id: StageId | null): MarkerSpec | undefined {
  if (!id) return undefined;
  return layout.markers.find((m) => m.stageId === id);
}

/** 模型のローカル座標 → ワールド(ステージ選択で膨らんだ後の大きさ) */
export function dioramaToWorld(
  center: readonly [number, number, number],
  x: number,
  y: number,
  z: number,
  out: [number, number, number],
): [number, number, number] {
  out[0] = center[0] + x * MODEL_GROW;
  out[1] = center[1] + y * MODEL_GROW;
  out[2] = center[2] + z * MODEL_GROW;
  return out;
}
