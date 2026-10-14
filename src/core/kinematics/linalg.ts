/**
 * 小さな密行列の線形代数(拘束のヤコビアンの階数・零空間を求めるため)。
 * 行列は行優先の Float64Array(m 行 n 列)。
 */

export interface NullSpaceResult {
  /** 数値的な階数 */
  rank: number;
  /** 零空間の基底(n 次元の単位ベクトル、n - rank 本)。正規直交とは限らない */
  basis: Float64Array[];
}

/**
 * 列ピボット付きハウスホルダー QR で A の階数と零空間 { x | A x = 0 } を求める。
 * 残りの列のノルムが tol 以下になったところで打ち切る。
 * tol = relTol · max(m, n) · (最大の列ノルム)
 */
export function nullSpace(A: Float64Array, m: number, n: number, relTol = 1e-8): NullSpaceResult {
  if (n === 0) return { rank: 0, basis: [] };
  const R = Float64Array.from(A.subarray(0, m * n));
  const perm = Array.from({ length: n }, (_, j) => j);
  let maxNorm = 0;
  for (let j = 0; j < n; j++) {
    let s = 0;
    for (let i = 0; i < m; i++) s += R[i * n + j]! ** 2;
    maxNorm = Math.max(maxNorm, Math.sqrt(s));
  }
  const tol = relTol * Math.max(m, n) * Math.max(maxNorm, 1e-300);
  const kmax = Math.min(m, n);
  const v = new Float64Array(m);
  let rank = 0;
  for (let k = 0; k < kmax; k++) {
    // 残りの部分で最もノルムの大きい列を k 番目に持ってくる
    let p = -1;
    let best = -1;
    for (let j = k; j < n; j++) {
      let s = 0;
      for (let i = k; i < m; i++) s += R[i * n + j]! ** 2;
      if (s > best) {
        best = s;
        p = j;
      }
    }
    if (Math.sqrt(best) <= tol) break;
    if (p !== k) {
      for (let i = 0; i < m; i++) {
        const t = R[i * n + k]!;
        R[i * n + k] = R[i * n + p]!;
        R[i * n + p] = t;
      }
      const t = perm[k]!;
      perm[k] = perm[p]!;
      perm[p] = t;
    }
    // ハウスホルダー反射で k 列目の k+1 行目以降を 0 にする
    const norm = Math.sqrt(best);
    const x0 = R[k * n + k]!;
    const alpha = x0 > 0 ? -norm : norm;
    let vn2 = 0;
    for (let i = k; i < m; i++) {
      v[i] = R[i * n + k]!;
      if (i === k) v[i] = x0 - alpha;
      vn2 += v[i]! ** 2;
    }
    if (vn2 > 0) {
      for (let j = k; j < n; j++) {
        let s = 0;
        for (let i = k; i < m; i++) s += v[i]! * R[i * n + j]!;
        const f = (2 * s) / vn2;
        for (let i = k; i < m; i++) R[i * n + j]! -= f * v[i]!;
      }
    }
    R[k * n + k] = alpha;
    for (let i = k + 1; i < m; i++) R[i * n + k] = 0;
    rank = k + 1;
  }
  // 零空間:自由な列 f ごとに R11 y = -R[:, f] を後退代入で解く
  const basis: Float64Array[] = [];
  const y = new Float64Array(rank);
  for (let f = rank; f < n; f++) {
    for (let i = rank - 1; i >= 0; i--) {
      let s = -R[i * n + f]!;
      for (let k = i + 1; k < rank; k++) s -= R[i * n + k]! * y[k]!;
      y[i] = s / R[i * n + i]!;
    }
    const z = new Float64Array(n);
    for (let i = 0; i < rank; i++) z[perm[i]!] = y[i]!;
    z[perm[f]!] = 1;
    let len = 0;
    for (let i = 0; i < n; i++) len += z[i]! ** 2;
    len = Math.sqrt(len);
    for (let i = 0; i < n; i++) z[i]! /= len;
    basis.push(z);
  }
  return { rank, basis };
}

/** 転置(m×n → n×m) */
export function transpose(A: Float64Array, m: number, n: number): Float64Array {
  const T = new Float64Array(m * n);
  for (let i = 0; i < m; i++) for (let j = 0; j < n; j++) T[j * m + i] = A[i * n + j]!;
  return T;
}
