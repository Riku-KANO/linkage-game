import type { DesignDoc } from '@/core/model/types';
import { WalkerGait, type WalkerModel } from '../walker/walkerRig';

/**
 * 機械の縮尺模型(ジオラマの小さな機械・棚の模型・作業台の見本機)の大きさと歩幅。純粋な計算。
 * 単位:設計は cm、模型は m。縮尺 = m / 設計 cm。
 */

/**
 * 機械の大きさ(cm):脚列まで含めた外形の幅(x)・高さ(y)・奥行き(z)のいちばん大きいもの。
 * 前後反転の脚は最初のクランクの軸で x を折り返し、奥行きは脚の並び(legInstances と同じ間隔)。
 * ジョイントがなければ 0。
 */
export function designExtent(design: DesignDoc): number {
  const pivotId = design.cranks[0]?.pivot;
  const px = design.joints.find((j) => j.id === pivotId)?.x ?? 0;
  const mirror = design.legs.mirrorX;
  let xMin = Infinity;
  let xMax = -Infinity;
  let yMin = Infinity;
  let yMax = -Infinity;
  for (const j of design.joints) {
    if (!Number.isFinite(j.x) || !Number.isFinite(j.y)) continue;
    xMin = Math.min(xMin, j.x);
    xMax = Math.max(xMax, j.x);
    if (mirror) {
      xMin = Math.min(xMin, 2 * px - j.x);
      xMax = Math.max(xMax, 2 * px - j.x);
    }
    yMin = Math.min(yMin, j.y);
    yMax = Math.max(yMax, j.y);
  }
  if (!Number.isFinite(xMin)) return 0;
  const slots = Math.max(1, Math.floor(design.legs.count)) * (mirror ? 2 : 1);
  const depth = (slots - 1) * Math.max(0, design.legs.spacing);
  return Math.max(xMax - xMin, yMax - yMin, depth);
}

/**
 * 大きさが target(m)になる縮尺。極端に小さい・大きい設計でも模型が消えたり
 * はみ出したりしないよう、見本機と同じ大きさ(REFERENCE_EXTENT)の縮尺の 0.5〜2 倍に収める。
 */
/** ヤンセン型の見本機(jansenWalker)の大きさ(cm) */
export const REFERENCE_EXTENT = 150;

export function fitScale(design: DesignDoc, target: number): number {
  const base = target / REFERENCE_EXTENT;
  const ext = designExtent(design);
  if (!(ext > 1)) return base;
  return Math.min(base * 2, Math.max(base * 0.5, target / ext));
}

/** クランクを回す向き(作業台の見本機と同じ:回転数の符号。0 なら −1) */
export function crankDirection(design: DesignDoc): 1 | -1 {
  return (design.motor.rpm || -1) < 0 ? -1 : 1;
}

/**
 * クランク 1 rad あたりに機体が進む距離(cm、正)。脚先が滑らない前提で一周を数える。
 * 進まない機構(脚先がない・その場で足踏み)は 1 にする(歩くときは脚がそれなりに回る)。
 * 渡したモデルの姿勢を動かすので、描画の前(作った直後)に呼ぶ。
 */
export function stridePerRadian(model: WalkerModel, direction: 1 | -1, samples = 48): number {
  const gait = new WalkerGait(model);
  const d = (direction * 2 * Math.PI) / samples;
  let total = 0;
  gait.step(0);
  for (let i = 0; i < samples; i++) total += gait.step(d).advance;
  const per = Math.abs(total) / (2 * Math.PI);
  return Number.isFinite(per) && per > 0.05 ? per : 1;
}
