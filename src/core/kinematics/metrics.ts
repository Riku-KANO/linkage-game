import type { CycleSample } from './solve';

/**
 * E-03 脚先の軌道の指標(片脚・1 回転分のサンプルから求める)。単位は cm。
 */
export interface FootMetrics {
  /** 歩幅:接地区間(最低点から contactTolerance 以内で続く区間)の水平の長さ */
  stride: number;
  /** 足上げ高さ:軌道の最高点 − 最低点 */
  lift: number;
  /**
   * 平らさ:最低点を含む、1 周の stanceFraction 分の連続区間のうち、最も平らなところの高さの振れ幅。
   * 小さいほど、接地中に機体が上下に揺れない
   */
  flatness: number;
  /** デューティ比:接地区間のサンプル数 / 全サンプル数 */
  duty: number;
  /**
   * θ が増える向き(rpm > 0、設計ビューで反時計回り)に回したとき機体が進む x の向き。
   * 接地中の脚先は機体に対して逆向きに動く。0:判定できない
   */
  direction: 1 | -1 | 0;
  /** 接地区間の最初と最後のサンプル index(サンプル順。1 周をまたぐことがある)。なければ -1 */
  contactStart: number;
  contactEnd: number;
  /** 最低点の高さ */
  minY: number;
}

export interface FootMetricsOptions {
  /** 最低点からこの高さ(cm)以内を接地とみなす。既定 0.5 */
  contactTolerance?: number;
  /** flatness を測る区間の長さ(1 周に対する割合)。既定 1/3(片側 3 脚を 120° ずらすと、1 脚が 1/3 周ずつ支える) */
  stanceFraction?: number;
}

const EMPTY: FootMetrics = {
  stride: 0,
  lift: 0,
  flatness: 0,
  duty: 0,
  direction: 0,
  contactStart: -1,
  contactEnd: -1,
  minY: 0,
};

export function footMetrics(
  cycle: CycleSample,
  footIndex: number,
  options: FootMetricsOptions = {},
): FootMetrics {
  const steps = cycle.steps;
  if (footIndex < 0 || steps < 2) return { ...EMPTY };
  const tol = options.contactTolerance ?? 0.5;
  const fraction = options.stanceFraction ?? 1 / 3;
  const x = new Float64Array(steps);
  const y = new Float64Array(steps);
  let lowest = -1;
  let maxY = -Infinity;
  for (let s = 0; s < steps; s++) {
    const p = cycle.positions[s]!;
    x[s] = p[footIndex * 2]!;
    y[s] = p[footIndex * 2 + 1]!;
    if (!cycle.ok[s]) continue;
    if (lowest < 0 || y[s]! < y[lowest]!) lowest = s;
    maxY = Math.max(maxY, y[s]!);
  }
  if (lowest < 0) return { ...EMPTY };
  const minY = y[lowest]!;
  const ok = (s: number) => cycle.ok[((s % steps) + steps) % steps]!;
  const at = (arr: Float64Array, s: number) => arr[((s % steps) + steps) % steps]!;

  // 接地区間:最低点から前後に、組み立てられて最低点から tol 以内のサンプルが続く範囲
  const inContact = (s: number) => ok(s) && at(y, s) <= minY + tol;
  let back = 0;
  while (back < steps - 1 && inContact(lowest - back - 1)) back++;
  let fwd = 0;
  while (back + fwd < steps - 1 && inContact(lowest + fwd + 1)) fwd++;
  const start = lowest - back;
  const end = lowest + fwd;
  let xmin = Infinity;
  let xmax = -Infinity;
  for (let s = start; s <= end; s++) {
    xmin = Math.min(xmin, at(x, s));
    xmax = Math.max(xmax, at(x, s));
  }
  const count = end - start + 1;

  // 平らさ:最低点を含む長さ W の窓(すべて組み立てられるもの)で、高さの振れ幅が最小のもの
  const W = Math.max(2, Math.min(steps, Math.round(steps * fraction)));
  let flatness = Infinity;
  for (let first = lowest - W + 1; first <= lowest; first++) {
    let lo = Infinity;
    let hi = -Infinity;
    let valid = true;
    for (let s = first; s < first + W; s++) {
      if (!ok(s)) {
        valid = false;
        break;
      }
      lo = Math.min(lo, at(y, s));
      hi = Math.max(hi, at(y, s));
    }
    if (valid) flatness = Math.min(flatness, hi - lo);
  }
  if (!Number.isFinite(flatness)) flatness = maxY - minY;

  // 向き:接地区間で脚先が動く向き(θ が増える向きにそろえる)の逆
  const dx = at(x, end) - at(x, start);
  const thetaSign = Math.sign(cycle.thetas[1]! - cycle.thetas[0]!);
  const footDir = Math.abs(dx) > 1e-6 ? Math.sign(dx) * thetaSign : 0;
  const direction = (footDir === 0 ? 0 : -footDir) as 1 | -1 | 0;

  const wrap = (s: number) => ((s % steps) + steps) % steps;
  return {
    stride: xmax - xmin,
    lift: maxY - minY,
    flatness,
    duty: count / steps,
    direction,
    contactStart: wrap(start),
    contactEnd: wrap(end),
    minY,
  };
}

/** rpm で回したときに機体が進む x の向き(+1 / −1、止まっていれば 0) */
export function walkDirection(metrics: FootMetrics, rpm: number): 1 | -1 | 0 {
  if (rpm === 0 || metrics.direction === 0) return 0;
  return (metrics.direction * Math.sign(rpm)) as 1 | -1;
}
