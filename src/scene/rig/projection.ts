import { Matrix4, Vector3 } from 'three';

/**
 * 透視投影と平行投影の連続的な補間(設計ビューへの遷移 T-02 / T-07 の核)。
 *
 * P を透視投影、O を「注視距離 focus の平面で P と同じ範囲が見える」平行投影とし、
 *   M(s) = (1 − s)·P + s·focus·O
 * とする(行列の要素ごとの線形補間)。focus の平面上の点は s によらず同じ画面位置に写り、
 * s = 1 でちょうど平行投影になる。途中は「カメラを後ろへ引きながら画角を絞る」ドリーズームと
 * 等価で、実効画角は tan(fov_eff/2) = (1 − s)·tan(fov/2)。near / far 平面は常に −1 / +1 に写る。
 *
 * 補間行列は透視でも平行でもないので、Raycaster.setFromCamera は使えない。
 * レイは rayFromNdc で、射影の逆行列から near と far の点を戻して作る。
 */
export function blendedProjection(
  out: Matrix4,
  fovDeg: number,
  aspect: number,
  near: number,
  far: number,
  focus: number,
  ortho: number,
): Matrix4 {
  const s = Math.min(1, Math.max(0, ortho));
  const tanHalf = Math.tan((fovDeg * Math.PI) / 360);
  const top = near * tanHalf;
  const right = top * aspect;
  out.makePerspective(-right, right, top, -top, near, far);
  if (s === 0) return out;
  const h = Math.max(1e-6, focus) * tanHalf;
  const w = h * aspect;
  const o = TMP.makeOrthographic(-w, w, h, -h, near, far);
  const pe = out.elements;
  const oe = o.elements;
  const k = s * Math.max(1e-6, focus);
  for (let i = 0; i < 16; i++) pe[i] = (1 - s) * pe[i]! + k * oe[i]!;
  return out;
}

const TMP = new Matrix4();
const NEAR = new Vector3();
const FAR = new Vector3();

/**
 * 画面の正規化座標(NDC、−1..1)からワールドのレイを作る。どんな射影行列でも正しい。
 * @param projInverse 射影行列の逆行列
 * @param cameraWorld カメラの matrixWorld
 */
export function rayFromNdc(
  ndcX: number,
  ndcY: number,
  projInverse: Matrix4,
  cameraWorld: Matrix4,
  outOrigin: Vector3,
  outDirection: Vector3,
): void {
  NEAR.set(ndcX, ndcY, -1).applyMatrix4(projInverse).applyMatrix4(cameraWorld);
  FAR.set(ndcX, ndcY, 1).applyMatrix4(projInverse).applyMatrix4(cameraWorld);
  outOrigin.copy(NEAR);
  outDirection.copy(FAR).sub(NEAR).normalize();
}

/** 平行投影の度合い s での実効的な縦の画角(度)。表示やデバッグ用 */
export function effectiveFov(fovDeg: number, ortho: number): number {
  const s = Math.min(1, Math.max(0, ortho));
  return (Math.atan((1 - s) * Math.tan((fovDeg * Math.PI) / 360)) * 360) / Math.PI;
}
