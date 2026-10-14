import { EASINGS } from '@/ui/tokens';

/**
 * 機構で動く UI 部品(RS-4)の純粋な計算。React にも DOM にも依存しない。
 *
 * 角度の約束:SVG 座標(y 下向き)の回転と同じく、時計回りが正の rad。
 * 文字盤の角度だけは「真上が 0」で数える(dialAngle)。
 */

export const TAU = Math.PI * 2;

export const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));
export const clamp01 = (v: number) => clamp(v, 0, 1);
export const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
export const toDeg = (rad: number) => (rad * 180) / Math.PI;

/** 小数 2 桁に丸めた文字列(SVG の属性を短くする) */
export const f2 = (v: number) => String(Math.round(v * 100) / 100);

/**
 * 「きりのよい」値(steps × 10^k、既定は 1, 2, 2.5, 5)に切り上げる。目盛りの最大値に使う。
 * steps は 1 以上 10 未満の昇順。
 */
export function niceCeil(v: number, steps: readonly number[] = [1, 2, 2.5, 5]): number {
  if (!(v > 0) || !Number.isFinite(v)) return 1;
  const base = 10 ** Math.floor(Math.log10(v));
  for (const m of steps) if (m * base >= v * (1 - 1e-9)) return m * base;
  return 10 * base;
}

// ---- 文字盤と歯車列 ----

/**
 * 値 → 針の角度(rad、真上が 0、時計回りが正)。sweep は針が振れる全角度。
 * 範囲外の値は端で止まる(文字盤のストッパー)。
 */
export function dialAngle(value: number, max: number, sweep: number): number {
  const f = max > 0 && Number.isFinite(value) ? clamp01(value / max) : 0;
  return -sweep / 2 + sweep * f;
}

/** 文字盤の角度(真上が 0)→ SVG 上の点 */
export function dialPoint(cx: number, cy: number, r: number, angle: number): [number, number] {
  return [cx + r * Math.sin(angle), cy - r * Math.cos(angle)];
}

/** 文字盤の円弧(真上が 0、時計回り)の SVG path */
export function arcPath(cx: number, cy: number, r: number, a0: number, a1: number): string {
  const [x0, y0] = dialPoint(cx, cy, r, a0);
  const [x1, y1] = dialPoint(cx, cy, r, a1);
  const large = Math.abs(a1 - a0) > Math.PI ? 1 : 0;
  const sweep = a1 >= a0 ? 1 : 0;
  return `M${f2(x0)} ${f2(y0)}A${f2(r)} ${f2(r)} 0 ${large} ${sweep} ${f2(x1)} ${f2(y1)}`;
}

/**
 * かみ合う 2 枚の歯車。driver(歯数 tDriver)が角度 a のときの driven(歯数 tDriven)の角度。
 * dir は driver の中心から見た driven の中心の方向。歯車の角度 0 で歯の中心が +x を向くとして、
 * driver の歯が driven を向いたとき driven が歯溝を driver に向ける位相を含む(歯が重ならない)。
 */
export function meshedAngle(a: number, tDriver: number, tDriven: number, dir: number): number {
  return dir + Math.PI + Math.PI / tDriven - (a - dir) * (tDriver / tDriven);
}

/**
 * 歯車の輪郭(SVG path、中心 (0,0))。台形の歯で、歯底 pitchR - depth/2、歯先 pitchR + depth/2。
 * 角度 0 の向き(+x)に歯の中心がある。
 */
export function gearPath(teeth: number, pitchR: number, depth: number): string {
  const p = TAU / teeth;
  const r0 = pitchR - depth / 2;
  const r1 = pitchR + depth / 2;
  const pts: string[] = [];
  const at = (r: number, a: number) => `${f2(r * Math.cos(a))} ${f2(r * Math.sin(a))}`;
  for (let k = 0; k < teeth; k++) {
    const c = k * p;
    pts.push(at(r0, c - 0.3 * p), at(r1, c - 0.13 * p), at(r1, c + 0.13 * p), at(r0, c + 0.3 * p));
  }
  return `M${pts.join('L')}Z`;
}

/** 角度 a0 → a1 の間に、間隔 step の目盛り(歯)を何回またいだか(向きによらない) */
export function stepCrossings(a0: number, a1: number, step: number): number {
  return Math.abs(Math.floor(a1 / step) - Math.floor(a0 / step));
}

/** 歯車メーターの表示値:t(s)で 0 から value まで回り、settle のイージングで少し行き過ぎて止まる */
export function meterValueAt(t: number, duration: number, value: number): number {
  if (!(duration > 0)) return value;
  const u = clamp01(t / duration);
  if (u <= 0) return 0;
  return u >= 1 ? value : value * EASINGS.settle(u);
}

// ---- 数字ドラム(オドメーター) ----

/** 整数部の桁数(最低 1) */
export function digitCount(v: number): number {
  const n = Math.floor(Math.abs(Number.isFinite(v) ? v : 0));
  return n < 1 ? 1 : String(n).length;
}

/**
 * 数字ドラムの位置(上の桁から順)。位置 p ∈ [0, 10) は数字 floor(p) から次の数字へ
 * (p mod 1)だけ回った状態。下の桁がすべて 9 から 0 へ回るときだけ上の桁も回る(繰り上がり)。
 * 表示できる範囲を超えたら全桁 9 で止まり、負と NaN は 0。
 */
export function odometerDrums(value: number, intDigits: number, decimals: number): number[] {
  const total = intDigits + decimals;
  const cap = 10 ** total - 1;
  let n = Number.isFinite(value) ? clamp(value * 10 ** decimals, 0, cap) : 0;
  // 止まっている値(12.4 × 10 = 124.00000000000001 など)は整数にそろえる
  if (Math.abs(n - Math.round(n)) < 1e-6) n = Math.round(n);
  const out: number[] = [];
  for (let k = total - 1; k >= 0; k--) {
    const unit = 10 ** k;
    const whole = Math.floor(n / unit);
    const rest = n - whole * unit;
    out.push((whole % 10) + Math.max(0, rest - (unit - 1)));
  }
  return out;
}

// ---- プレス(スライダークランク) ----

/** プレスのクランク半径と連接棒の長さ(PressStamp の SVG の座標と同じ) */
export const PRESS_CRANK = { r: 11, l: 36 } as const;
/** 刻印の瞬間(全体の長さに対する割合) */
export const PRESS_IMPACT = 0.42;
/** 下死点で止まっている割合 */
export const PRESS_DWELL = 0.1;

/** スライダークランク:クランク角 θ(0 = 上死点)のラムの下がり量を 0..1 に正規化 */
export function sliderCrankStroke(theta: number, r: number, l: number): number {
  const s = Math.sin(theta);
  const y = -r * Math.cos(theta) + Math.sqrt(Math.max(0, l * l - r * r * s * s));
  return (y - (l - r)) / (2 * r);
}

export interface PressPose {
  /** クランク角(rad、0 = 上死点、π = 下死点) */
  crank: number;
  /** ラムの下がり量 0(上)..1(刻印) */
  ram: number;
  /** 刻印済みか */
  stamped: boolean;
  /** 刻印の衝撃による台の揺れ(-1..1、減衰振動) */
  shake: number;
}

/**
 * プレスのタイムライン。クランクが加速しながら半回転して刻印し、少し止まってから戻る。
 * duration が 0 以下なら刻印済みで上に戻った最終状態。
 */
export function pressPose(t: number, duration: number): PressPose {
  const u = duration > 0 ? clamp01(t / duration) : 1;
  let crank: number;
  if (u < PRESS_IMPACT) {
    const k = u / PRESS_IMPACT;
    crank = Math.PI * k * k * k;
  } else if (u < PRESS_IMPACT + PRESS_DWELL) {
    crank = Math.PI;
  } else {
    const k = (u - PRESS_IMPACT - PRESS_DWELL) / (1 - PRESS_IMPACT - PRESS_DWELL);
    crank = Math.PI + Math.PI * EASINGS.glide(clamp01(k));
  }
  const stamped = u >= PRESS_IMPACT;
  const since = (u - PRESS_IMPACT) * Math.max(0, duration);
  const shake = stamped && u < 1 ? Math.exp(-since / 0.04) * Math.cos(since * TAU * 22) : 0;
  return { crank, ram: sliderCrankStroke(crank, PRESS_CRANK.r, PRESS_CRANK.l), stamped, shake };
}

// ---- 伸縮リンク(パンタグラフ) ----

export interface ScissorGeometry {
  /** 横幅(棒の水平方向の広がり) */
  width: number;
  /** 1 段の高さ */
  cellHeight: number;
  /** 棒 [x1, y1, x2, y2] */
  bars: [number, number, number, number][];
  /** ピン [x, y](端と交点) */
  pins: [number, number][];
}

/**
 * 縦に伸びる伸縮リンク(レイジートング)。長さ bar の棒を X 字に組んだ段を cells 段重ね、
 * 全体の高さを height にする。棒の長さは一定なので、伸びるほど幅が狭くなる。
 * y = 0 が上端、cx が左右の中心。
 */
export function scissorGeometry(
  height: number,
  cells: number,
  bar: number,
  cx = 0,
): ScissorGeometry {
  const n = Math.max(1, Math.round(cells));
  const h = clamp(height / n, 0, bar);
  const w = Math.sqrt(Math.max(0, bar * bar - h * h));
  const xl = cx - w / 2;
  const xr = cx + w / 2;
  const bars: ScissorGeometry['bars'] = [];
  const pins: ScissorGeometry['pins'] = [];
  for (let i = 0; i < n; i++) {
    const y0 = i * h;
    const y1 = (i + 1) * h;
    bars.push([xl, y0, xr, y1], [xr, y0, xl, y1]);
    pins.push([cx, (y0 + y1) / 2]);
  }
  for (let i = 0; i <= n; i++) pins.push([xl, i * h], [xr, i * h]);
  return { width: w, cellHeight: h, bars, pins };
}

/** パネルの開き具合。開くときは snap で素早く寄り、閉じるときは glide で畳む */
export function panelProgress(t: number, duration: number, opening: boolean): number {
  const u = duration > 0 ? clamp01(t / duration) : 1;
  return opening ? EASINGS.snap(u) : 1 - EASINGS.glide(u);
}

// ---- ボタン(リンクで沈む) ----

/** ボタンの天板と台の隙間(px):離しているとき、押し込んだとき */
export const BUTTON_GAP = { rest: 8, pressed: 3.5 } as const;

/** 押し込み量(0..1、ばねで少し行き過ぎる)→ 隙間。行き過ぎは -0.3..1.2 で止める */
export function buttonGap(press: number): number {
  return lerp(BUTTON_GAP.rest, BUTTON_GAP.pressed, clamp(press, -0.3, 1.2));
}

// ---- ばね ----

export interface SpringState {
  x: number;
  v: number;
}

/** ばね・ダンパーを dt 秒進める(半陰的オイラー、1/240 s の小刻み) */
export function stepSpring(
  s: SpringState,
  target: number,
  stiffness: number,
  damping: number,
  dt: number,
): SpringState {
  let { x, v } = s;
  let rem = Math.min(Math.max(0, dt), 0.25);
  while (rem > 1e-9) {
    const h = Math.min(rem, 1 / 240);
    const a = -stiffness * (x - target) - damping * v;
    v += a * h;
    x += v * h;
    rem -= h;
  }
  return { x, v };
}

export function springAtRest(s: SpringState, target: number, eps = 1e-3): boolean {
  return Math.abs(s.x - target) < eps && Math.abs(s.v) < eps * 10;
}
