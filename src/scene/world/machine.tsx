import { useEffect, useMemo, type RefObject } from 'react';
import {
  BoxGeometry,
  CylinderGeometry,
  Euler,
  Matrix4,
  Quaternion,
  Vector3,
  type BufferGeometry,
  type InstancedMesh,
  type Material,
} from 'three';
import type { DesignDoc } from '@/core/model/types';
import { box, cylinder, mergeParts } from '../env/geometry';
import { PALETTE, brass, steel, vcMatte } from '../env/materials';
import {
  WalkerGait,
  createWalkerModel,
  layerOffset,
  legPositions,
  type WalkerModel,
} from '../walker/walkerRig';
import { crankDirection, stridePerRadian } from './miniature';

/**
 * 機械の模型(運動学だけ、インスタンス描画)。ジオラマの小さな機械と棚の模型が共有する。
 * 描き方は作業台の見本機(KinematicWalker)と同じ:棒とピンを 1 本のインスタンスにまとめ、
 * 解いた姿勢を行列に書き込む。毎フレーム呼んでも確保はしない。
 */
export interface MachineRig {
  design: DesignDoc;
  model: WalkerModel;
  gait: WalkerGait;
  /** クランクを回す向き */
  direction: 1 | -1;
  /** クランク 1 rad あたりの前進(cm) */
  stride: number;
  barGeo: BufferGeometry;
  pinGeo: BufferGeometry;
  chassis: BufferGeometry;
}

export function createMachineRig(design: DesignDoc): MachineRig {
  const model = createWalkerModel(design);
  const direction = crankDirection(design);
  const stride = stridePerRadian(model, direction);
  const gait = new WalkerGait(model);
  const barGeo = new BoxGeometry(1, 1, 1);
  const pinGeo = new CylinderGeometry(1, 1, 1, 6);
  pinGeo.rotateX(Math.PI / 2);
  const f = model.frame;
  const cx = (f.xMin + f.xMax) / 2;
  const cy = (f.yMin + f.yMax) / 2;
  const chassis = mergeParts([
    box([f.xMax - f.xMin, 5, f.zMax - f.zMin], [cx, cy, 0], PALETTE.woodDark),
    box([(f.xMax - f.xMin) * 0.55, 10, (f.zMax - f.zMin) * 0.7], [cx, f.yMax + 5, 0], PALETTE.wood),
    cylinder(2.2, 2.2, f.zMax - f.zMin + 6, [0, 0, 0], PALETTE.metalDark, 8, [Math.PI / 2, 0, 0]),
  ]);
  return { design, model, gait, direction, stride, barGeo, pinGeo, chassis };
}

export function disposeMachineRig(rig: MachineRig): void {
  rig.barGeo.dispose();
  rig.pinGeo.dispose();
  rig.chassis.dispose();
}

/** 設計が変わったときだけ作り直す(古いジオメトリは捨てる) */
export function useMachineRig(design: DesignDoc): MachineRig {
  const rig = useMemo(() => createMachineRig(design), [design]);
  useEffect(() => () => disposeMachineRig(rig), [rig]);
  return rig;
}

const BAR_W = 4.2;
const BAR_T = 1.3;
const PIN_R = 1.7;
const M = new Matrix4();
const Q = new Quaternion();
const P = new Vector3();
const S = new Vector3();
const E = new Euler();

/** 今の姿勢(最後に解いた姿勢)を棒とピンの行列に書く */
export function writeMachineInstances(
  model: WalkerModel,
  bars: InstancedMesh | null,
  pins: InstancedMesh | null,
): void {
  if (!bars || !pins) return;
  const list = model.bars;
  for (let i = 0; i < list.length; i++) {
    const bar = list[i]!;
    const pos = legPositions(model, bar.leg);
    const ax = pos[bar.a * 2]!;
    const ay = pos[bar.a * 2 + 1]!;
    const bx = pos[bar.b * 2]!;
    const by = pos[bar.b * 2 + 1]!;
    P.set((ax + bx) / 2, (ay + by) / 2, model.legs[bar.leg]!.z + layerOffset(model, bar.layer));
    Q.setFromEuler(E.set(0, 0, Math.atan2(by - ay, bx - ax)));
    S.set(Math.hypot(bx - ax, by - ay) + BAR_W, BAR_W, BAR_T);
    bars.setMatrixAt(i, M.compose(P, Q, S));
  }
  bars.instanceMatrix.needsUpdate = true;
  const pinLen = model.layers * model.layerGap + 1.5;
  Q.identity();
  const pl = model.pins;
  for (let i = 0; i < pl.length; i++) {
    const pin = pl[i]!;
    const pos = legPositions(model, pin.leg);
    P.set(pos[pin.j * 2]!, pos[pin.j * 2 + 1]!, model.legs[pin.leg]!.z);
    S.set(PIN_R, PIN_R, pinLen);
    pins.setMatrixAt(i, M.compose(P, Q, S));
  }
  pins.instanceMatrix.needsUpdate = true;
}

/** 棒・ピン・機体(設計の cm のまま。親の group で縮尺を掛ける) */
export function MachineMeshes({
  rig,
  bars,
  pins,
  barMaterial = brass,
  pinMaterial = steel,
  chassisMaterial = vcMatte,
  castShadow = false,
}: {
  rig: MachineRig;
  bars: RefObject<InstancedMesh | null>;
  pins: RefObject<InstancedMesh | null>;
  barMaterial?: Material;
  pinMaterial?: Material;
  chassisMaterial?: Material;
  castShadow?: boolean;
}) {
  return (
    <>
      <instancedMesh
        ref={bars}
        args={[rig.barGeo, barMaterial, rig.model.bars.length]}
        castShadow={castShadow}
        frustumCulled={false}
      />
      <instancedMesh
        ref={pins}
        args={[rig.pinGeo, pinMaterial, rig.model.pins.length]}
        castShadow={castShadow}
        frustumCulled={false}
      />
      <mesh geometry={rig.chassis} material={chassisMaterial} castShadow={castShadow} />
    </>
  );
}
