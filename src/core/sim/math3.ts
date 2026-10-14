/**
 * 動力学用の小さな 3D 数学(行列は行優先の Float64Array)。割り当てを避けるため出力先を受け取る。
 */

/** 単位四元数 (x, y, z, w) から回転行列 R(ローカル → ワールド)を作る */
export function quatToMat(qx: number, qy: number, qz: number, qw: number, out: Float64Array): void {
  const xx = qx * qx;
  const yy = qy * qy;
  const zz = qz * qz;
  const xy = qx * qy;
  const xz = qx * qz;
  const yz = qy * qz;
  const xw = qx * qw;
  const yw = qy * qw;
  const zw = qz * qw;
  out[0] = 1 - 2 * (yy + zz);
  out[1] = 2 * (xy - zw);
  out[2] = 2 * (xz + yw);
  out[3] = 2 * (xy + zw);
  out[4] = 1 - 2 * (xx + zz);
  out[5] = 2 * (yz - xw);
  out[6] = 2 * (xz - yw);
  out[7] = 2 * (yz + xw);
  out[8] = 1 - 2 * (xx + yy);
}

/** out = R · B · Rᵀ(3×3) */
export function rotateTensor(R: Float64Array, B: Float64Array, out: Float64Array): void {
  // T = R · B
  const t0 = R[0]! * B[0]! + R[1]! * B[3]! + R[2]! * B[6]!;
  const t1 = R[0]! * B[1]! + R[1]! * B[4]! + R[2]! * B[7]!;
  const t2 = R[0]! * B[2]! + R[1]! * B[5]! + R[2]! * B[8]!;
  const t3 = R[3]! * B[0]! + R[4]! * B[3]! + R[5]! * B[6]!;
  const t4 = R[3]! * B[1]! + R[4]! * B[4]! + R[5]! * B[7]!;
  const t5 = R[3]! * B[2]! + R[4]! * B[5]! + R[5]! * B[8]!;
  const t6 = R[6]! * B[0]! + R[7]! * B[3]! + R[8]! * B[6]!;
  const t7 = R[6]! * B[1]! + R[7]! * B[4]! + R[8]! * B[7]!;
  const t8 = R[6]! * B[2]! + R[7]! * B[5]! + R[8]! * B[8]!;
  // out = T · Rᵀ
  out[0] = t0 * R[0]! + t1 * R[1]! + t2 * R[2]!;
  out[1] = t0 * R[3]! + t1 * R[4]! + t2 * R[5]!;
  out[2] = t0 * R[6]! + t1 * R[7]! + t2 * R[8]!;
  out[3] = t3 * R[0]! + t4 * R[1]! + t5 * R[2]!;
  out[4] = t3 * R[3]! + t4 * R[4]! + t5 * R[5]!;
  out[5] = t3 * R[6]! + t4 * R[7]! + t5 * R[8]!;
  out[6] = t6 * R[0]! + t7 * R[1]! + t8 * R[2]!;
  out[7] = t6 * R[3]! + t7 * R[4]! + t8 * R[5]!;
  out[8] = t6 * R[6]! + t7 * R[7]! + t8 * R[8]!;
}

/**
 * 対称正定値の n×n 系 A x = b をコレスキー分解で解く(A は壊す)。
 * 正定値でなければ false。
 */
export function solveSpd(A: Float64Array, b: Float64Array, n: number, x: Float64Array): boolean {
  // in-place: lower triangle of A becomes L
  for (let i = 0; i < n; i++) {
    for (let j = 0; j <= i; j++) {
      let sum = A[i * n + j]!;
      for (let k = 0; k < j; k++) sum -= A[i * n + k]! * A[j * n + k]!;
      if (i === j) {
        if (!(sum > 0)) return false;
        A[i * n + i] = Math.sqrt(sum);
      } else {
        A[i * n + j] = sum / A[j * n + j]!;
      }
    }
  }
  for (let i = 0; i < n; i++) {
    let sum = b[i]!;
    for (let k = 0; k < i; k++) sum -= A[i * n + k]! * x[k]!;
    x[i] = sum / A[i * n + i]!;
  }
  for (let i = n - 1; i >= 0; i--) {
    let sum = x[i]!;
    for (let k = i + 1; k < n; k++) sum -= A[k * n + i]! * x[k]!;
    x[i] = sum / A[i * n + i]!;
  }
  return true;
}

/** 3×3 の逆行列(対称でなくてもよい)。特異なら false */
export function invert3(m: Float64Array, out: Float64Array): boolean {
  const a = m[0]!,
    b = m[1]!,
    c = m[2]!,
    d = m[3]!,
    e = m[4]!,
    f = m[5]!,
    g = m[6]!,
    h = m[7]!,
    i = m[8]!;
  const A = e * i - f * h;
  const B = -(d * i - f * g);
  const C = d * h - e * g;
  const det = a * A + b * B + c * C;
  if (!(Math.abs(det) > 1e-300)) return false;
  const s = 1 / det;
  out[0] = A * s;
  out[1] = -(b * i - c * h) * s;
  out[2] = (b * f - c * e) * s;
  out[3] = B * s;
  out[4] = (a * i - c * g) * s;
  out[5] = -(a * f - c * d) * s;
  out[6] = C * s;
  out[7] = -(a * h - b * g) * s;
  out[8] = (a * e - b * d) * s;
  return true;
}
