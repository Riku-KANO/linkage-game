import { compileMechanism, solvePose, type CompiledMechanism } from '@/core/kinematics';
import { legInstances, mirrorDesignX } from '@/core/kinematics/legs';
import { CM, type DesignDoc } from '@/core/model/types';

/**
 * 歩く見本機の運動学(描画用、動力学なし)。
 * 脚列(legInstances)ごとに solvePose で姿勢を解き、接地している脚先が後ろへ動いた分だけ
 * 機体を前へ進める(滑らない仮定)。ホームの作業台や試走コースの仮置きに使う。
 * 単位は設計の cm。描画側で縮尺を掛ける。
 */

export interface WalkerLeg {
  mech: CompiledMechanism;
  /** 奥行き(cm) */
  z: number;
  /** クランクの位相(rad) */
  phase: number;
  mirrored: boolean;
  pos: Float64Array;
  prev: Float64Array;
  hasPrev: boolean;
}

export interface BarSpec {
  leg: number;
  a: number;
  b: number;
  /** 重なり順(リンクごと) */
  layer: number;
}

export interface WalkerModel {
  legs: WalkerLeg[];
  bars: BarSpec[];
  pins: { leg: number; j: number }[];
  /** 層の数(リンクの数) */
  layers: number;
  /** 層の間隔(cm) */
  layerGap: number;
  footIndex: number;
  /** 固定点を囲む機体フレームの範囲(cm) */
  frame: { xMin: number; xMax: number; yMin: number; yMax: number; zMin: number; zMax: number };
}

export const LAYER_GAP = 1.7;

/** リンクを棒に分ける:2〜3 点はすべての組、4 点以上は外周 */
function linkEdges(joints: number[]): [number, number][] {
  const n = joints.length;
  if (n < 2) return [];
  if (n === 2) return [[joints[0]!, joints[1]!]];
  if (n === 3) {
    return [
      [joints[0]!, joints[1]!],
      [joints[1]!, joints[2]!],
      [joints[0]!, joints[2]!],
    ];
  }
  return joints.map((j, i) => [j, joints[(i + 1) % n]!] as [number, number]);
}

export function createWalkerModel(design: DesignDoc): WalkerModel {
  const instances = legInstances(design);
  const normal = compileMechanism(design);
  const hasMirror = instances.some((i) => i.mirrored);
  const mirrored = hasMirror ? compileMechanism(mirrorDesignX(design)) : normal;
  const legs: WalkerLeg[] = instances.map((inst) => {
    const mech = inst.mirrored ? mirrored : normal;
    const n = mech.jointIds.length * 2;
    return {
      mech,
      z: inst.z / CM,
      phase: inst.phase,
      mirrored: inst.mirrored,
      pos: new Float64Array(n),
      prev: new Float64Array(n),
      hasPrev: false,
    };
  });
  const bars: BarSpec[] = [];
  const pins: { leg: number; j: number }[] = [];
  legs.forEach((leg, li) => {
    leg.mech.links.forEach((joints, layer) => {
      for (const [a, b] of linkEdges(joints)) bars.push({ leg: li, a, b, layer });
    });
    for (let j = 0; j < leg.mech.jointIds.length; j++) pins.push({ leg: li, j });
  });
  // 機体フレーム:全ての脚の固定点を囲む箱
  let xMin = Infinity;
  let xMax = -Infinity;
  let yMin = Infinity;
  let yMax = -Infinity;
  for (const leg of legs) {
    for (let j = 0; j < leg.mech.jointIds.length; j++) {
      if (!leg.mech.fixed[j]) continue;
      xMin = Math.min(xMin, leg.mech.designPos[j * 2]!);
      xMax = Math.max(xMax, leg.mech.designPos[j * 2]!);
      yMin = Math.min(yMin, leg.mech.designPos[j * 2 + 1]!);
      yMax = Math.max(yMax, leg.mech.designPos[j * 2 + 1]!);
    }
  }
  if (!Number.isFinite(xMin)) {
    xMin = -10;
    xMax = 10;
    yMin = -5;
    yMax = 5;
  }
  const layers = Math.max(1, normal.links.length);
  const zs = legs.map((l) => l.z);
  const halfStack = ((layers - 1) / 2) * LAYER_GAP + 2;
  return {
    legs,
    bars,
    pins,
    layers,
    layerGap: LAYER_GAP,
    footIndex: normal.footIndex,
    frame: {
      xMin: xMin - 6,
      xMax: xMax + 6,
      yMin: yMin - 5,
      yMax: yMax + 5,
      zMin: Math.min(...zs) - halfStack,
      zMax: Math.max(...zs) + halfStack,
    },
  };
}

/** モーター角 theta(rad)で全ての脚の姿勢を解く */
export function poseWalker(model: WalkerModel, theta: number): boolean {
  let ok = true;
  for (const leg of model.legs) {
    const res = solvePose(leg.mech, theta + leg.phase, {
      prev: leg.hasPrev ? leg.prev : null,
      out: leg.pos,
    });
    ok = ok && res.ok;
    leg.prev.set(leg.pos);
    leg.hasPrev = true;
  }
  return ok;
}

/** 層 layer の棒の奥行きのずれ(cm) */
export function layerOffset(model: WalkerModel, layer: number): number {
  return (layer - (model.layers - 1) / 2) * model.layerGap;
}

/**
 * 歩容:脚先のうち一番低いもの(接地している脚)が後ろへ動いた分だけ機体が前へ進む。
 * step は前進量(cm、機体の +x 方向)と、機体の高さを決める脚先の最低点(cm)を返す。
 */
export class WalkerGait {
  theta = 0;
  private footX: Float64Array;
  private ready = false;

  constructor(private readonly model: WalkerModel) {
    this.footX = new Float64Array(model.legs.length);
  }

  step(dTheta: number): { advance: number; minFootY: number } {
    const m = this.model;
    if (m.footIndex < 0) {
      this.theta += dTheta;
      poseWalker(m, this.theta);
      return { advance: 0, minFootY: lowestJointY(m) };
    }
    if (!this.ready) {
      poseWalker(m, this.theta);
      this.ready = true;
    }
    m.legs.forEach((leg, i) => (this.footX[i] = leg.pos[m.footIndex * 2]!));
    this.theta += dTheta;
    poseWalker(m, this.theta);
    let lowest = 0;
    let minY = Infinity;
    m.legs.forEach((leg, i) => {
      const y = leg.pos[m.footIndex * 2 + 1]!;
      if (y < minY) {
        minY = y;
        lowest = i;
      }
    });
    const advance = -(m.legs[lowest]!.pos[m.footIndex * 2]! - this.footX[lowest]!);
    return { advance, minFootY: minY };
  }
}

function lowestJointY(m: WalkerModel): number {
  let y = Infinity;
  for (const leg of m.legs) {
    for (let j = 0; j < leg.mech.jointIds.length; j++) y = Math.min(y, leg.pos[j * 2 + 1]!);
  }
  return Number.isFinite(y) ? y : 0;
}

// ---------------------------------------------------------------------------
// 行ったり来たり(作業台の上・試走コースの仮置き)
// ---------------------------------------------------------------------------

export interface PacerBounds {
  xMin: number;
  xMax: number;
  /** 歩く線の z */
  z: number;
}

export interface PacerState {
  x: number;
  z: number;
  /** 向き(rad)。0 で +x、three の rotation.y と同じ向き */
  heading: number;
  mode: 'walk' | 'turn';
  turnFrom: number;
  turnTo: number;
  turnTime: number;
}

export const TURN_DURATION = 1.8;

export function createPacer(bounds: PacerBounds): PacerState {
  return {
    x: (bounds.xMin + bounds.xMax) / 2,
    z: bounds.z,
    heading: 0,
    mode: 'walk',
    turnFrom: 0,
    turnTo: 0,
    turnTime: 0,
  };
}

const wrap = (a: number) => Math.atan2(Math.sin(a), Math.cos(a));

/**
 * advance(m)だけ前進させ、端に着いたらその場で回れ右する。
 * 持ち上げて別の場所・向きに置かれても、範囲の中へ戻ってくる。
 */
export function updatePacer(s: PacerState, advance: number, dt: number, b: PacerBounds): void {
  if (s.mode === 'turn') {
    s.turnTime += dt;
    const k = Math.min(1, s.turnTime / TURN_DURATION);
    const e = k * k * (3 - 2 * k);
    s.heading = s.turnFrom + (s.turnTo - s.turnFrom) * e;
    // 回りながら少しだけ進む(小さな円弧)
    s.x += Math.cos(s.heading) * advance * 0.25;
    s.z -= Math.sin(s.heading) * advance * 0.25;
    if (k >= 1) {
      s.mode = 'walk';
      s.heading = wrap(s.turnTo);
    }
    return;
  }
  const dirX = Math.cos(s.heading);
  const goingOut = (s.x >= b.xMax && dirX > 0) || (s.x <= b.xMin && dirX < 0);
  if (goingOut) {
    // 範囲の中心を向くまで左回りに回る
    const desired = s.x >= b.xMax ? Math.PI : 0;
    let delta = wrap(desired - s.heading);
    if (delta <= 0) delta += 2 * Math.PI;
    if (delta > 1.75 * Math.PI) delta -= 2 * Math.PI;
    s.mode = 'turn';
    s.turnFrom = s.heading;
    s.turnTo = s.heading + delta;
    s.turnTime = 0;
    return;
  }
  // 歩く線へ寄せながら、向きを ±x へ揃える
  const base = dirX >= 0 ? 0 : Math.PI;
  const zErr = b.z - s.z;
  const steer = Math.max(-0.5, Math.min(0.5, zErr * 4)) * (dirX >= 0 ? -1 : 1);
  const target = base + steer;
  s.heading += wrap(target - s.heading) * Math.min(1, dt * 1.5);
  s.x += Math.cos(s.heading) * advance;
  s.z -= Math.sin(s.heading) * advance;
}
