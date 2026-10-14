import { useFrame } from '@react-three/fiber';
import { useEffect, useLayoutEffect, useMemo, useRef } from 'react';
import {
  BoxGeometry,
  Color,
  CylinderGeometry,
  DynamicDrawUsage,
  ExtrudeGeometry,
  Group,
  InstancedMesh,
  Shape,
  type BufferGeometry,
  type ColorRepresentation,
  type Material,
} from 'three';
import type { DesignDoc } from '@/core/model/types';
import { CM } from '@/core/model/types';
import { mirrorDesignX } from '@/core/kinematics/legs';
import type { SimSnapshot } from '@/core/sim/types';
import type { P2 } from './hull';
import { buildMachineLayout, plateOutline, type MachineLayout, type PlatePart } from './layout';
import { createGhostMaterial, getMachineMaterials, MACHINE_PALETTE } from './materials';

/**
 * 機体の 3D 描画(TR-1)。
 *
 * 部品はインスタンシングでまとめて描く(棒・ボス・ピン・脚先はそれぞれ 1 回の描画、
 * プレートはリンクと反転の別ごとに 1 回)。毎フレーム getSnapshot() を useFrame の中で読み、
 * インスタンスの行列を直接書き換える(React の再描画なし、割り当てなし)。
 * 機体の姿勢は外側の group に入れ、部品は機体ローカル座標(m)で置く。
 */

export interface MachineColors {
  wood?: ColorRepresentation;
  plate?: ColorRepresentation;
  crank?: ColorRepresentation;
  highlight?: ColorRepresentation;
}

export interface MachineModelProps {
  design: DesignDoc;
  /** 最新のスナップショット(useFrame の中で毎フレーム読む)。null なら設計姿勢のまま止める */
  getSnapshot: () => SimSnapshot | null;
  /** 半透明のゴーストとして描く */
  ghost?: boolean;
  ghostColor?: ColorRepresentation;
  ghostOpacity?: number;
  /** 赤く点滅させるリンク id(問題のリンク) */
  highlightLinks?: readonly string[];
  colors?: MachineColors;
  /** 影を落とす */
  shadows?: boolean;
  /** 胴体(フレーム板・軸・モーター)を描く(既定 true) */
  chassis?: boolean;
}

interface PlateGroup {
  plate: PlatePart;
  instances: number[];
  geometry: ExtrudeGeometry;
  /** 設計位置での 2 点 a, b(m)と a→b の角度 */
  ax: number;
  ay: number;
  angle: number;
}

interface Rig {
  layout: MachineLayout;
  K: number;
  /** 組ごとの設計位置(cm)。反転した組は反転した設計の位置 */
  designPos: Float64Array[];
  plateGroups: PlateGroup[];
  foot: number;
  /** 脚先のピンの z 範囲(なければ null) */
  footPin: { zMin: number; zMax: number } | null;
  box: BoxGeometry;
  cyl: BufferGeometry;
  frame: ExtrudeGeometry | null;
  housing: BoxGeometry;
  disposables: BufferGeometry[];
}

function extrude(outline: readonly P2[], thickness: number): ExtrudeGeometry {
  const shape = new Shape();
  outline.forEach((p, i) => (i === 0 ? shape.moveTo(p.x, p.y) : shape.lineTo(p.x, p.y)));
  shape.closePath();
  const bevel = thickness * 0.14;
  const g = new ExtrudeGeometry(shape, {
    depth: thickness - 2 * bevel,
    bevelEnabled: true,
    bevelThickness: bevel,
    bevelSize: bevel,
    bevelSegments: 1,
    curveSegments: 4,
  });
  g.translate(0, 0, -(thickness - 2 * bevel) / 2);
  return g;
}

function buildRig(design: DesignDoc): Rig {
  const layout = buildMachineLayout(design);
  const K = layout.instances.length;
  const toPos = (d: DesignDoc) => new Float64Array(d.joints.flatMap((j) => [j.x, j.y]));
  const normalPos = toPos(design);
  const mirroredPos = layout.instances.some((i) => i.mirrored)
    ? toPos(mirrorDesignX(design))
    : null;
  const designPos = layout.instances.map((i) =>
    i.mirrored && mirroredPos ? mirroredPos : normalPos,
  );
  const disposables: BufferGeometry[] = [];
  const plateGroups: PlateGroup[] = [];
  for (const plate of layout.plates) {
    for (const mirrored of [false, true]) {
      const instances = layout.instances.flatMap((inst, k) =>
        inst.mirrored === mirrored ? [k] : [],
      );
      if (instances.length === 0) continue;
      const pos = mirrored && mirroredPos ? mirroredPos : normalPos;
      const geometry = extrude(
        plateOutline(pos, plate.joints, layout.barWidth / 2),
        layout.barThickness,
      );
      disposables.push(geometry);
      const ax = pos[plate.a * 2]! * CM;
      const ay = pos[plate.a * 2 + 1]! * CM;
      const bx = pos[plate.b * 2]! * CM;
      const by = pos[plate.b * 2 + 1]! * CM;
      plateGroups.push({ plate, instances, geometry, ax, ay, angle: Math.atan2(by - ay, bx - ax) });
    }
  }
  const box = new BoxGeometry(1, 1, 1);
  const cyl = new CylinderGeometry(1, 1, 1, 18, 1).rotateX(Math.PI / 2);
  const frame =
    layout.frameOutline.length >= 3 ? extrude(layout.frameOutline, layout.barThickness) : null;
  const w = layout.barWidth;
  const housing = new BoxGeometry(w * 2.8, w * 2.8, Math.max(0.05, layout.slot * 0.4));
  disposables.push(box, cyl, housing);
  if (frame) disposables.push(frame);
  const foot = design.foot ? design.joints.findIndex((j) => j.id === design.foot) : -1;
  const footPin = layout.pins.find((p) => p.joint === foot) ?? null;
  return {
    layout,
    K,
    designPos,
    plateGroups,
    foot,
    footPin,
    box,
    cyl,
    frame,
    housing,
    disposables,
  };
}

/** 回転(z 軸回り)・拡大・平行移動の行列を列優先で書く */
function writeMat(
  a: Float32Array | number[],
  i: number,
  c: number,
  s: number,
  sx: number,
  sy: number,
  sz: number,
  x: number,
  y: number,
  z: number,
) {
  const o = i * 16;
  a[o] = c * sx;
  a[o + 1] = s * sx;
  a[o + 2] = 0;
  a[o + 3] = 0;
  a[o + 4] = -s * sy;
  a[o + 5] = c * sy;
  a[o + 6] = 0;
  a[o + 7] = 0;
  a[o + 8] = 0;
  a[o + 9] = 0;
  a[o + 10] = sz;
  a[o + 11] = 0;
  a[o + 12] = x;
  a[o + 13] = y;
  a[o + 14] = z;
  a[o + 15] = 1;
}

interface Meshes {
  bars: InstancedMesh | null;
  bosses: InstancedMesh | null;
  pins: InstancedMesh | null;
  feet: InstancedMesh | null;
  plates: (InstancedMesh | null)[];
}

/** 脚の姿勢(組ごとの cm 座標)から全インスタンスの行列を書く */
function poseLegs(rig: Rig, m: Meshes, legs: readonly Float64Array[]) {
  const { layout } = rig;
  const K = Math.min(rig.K, legs.length);
  const w = layout.barWidth;
  const t = layout.barThickness;
  const nb = layout.bars.length;
  const np = layout.pins.length;
  const barArr = m.bars?.instanceMatrix.array as Float32Array | undefined;
  const bossArr = m.bosses?.instanceMatrix.array as Float32Array | undefined;
  const pinArr = m.pins?.instanceMatrix.array as Float32Array | undefined;
  const footArr = m.feet?.instanceMatrix.array as Float32Array | undefined;
  for (let k = 0; k < K; k++) {
    const pos = legs[k]!;
    const z0 = layout.instances[k]!.z;
    for (let bi = 0; bi < nb; bi++) {
      const bar = layout.bars[bi]!;
      const ax = pos[bar.a * 2]! * CM;
      const ay = pos[bar.a * 2 + 1]! * CM;
      const bx = pos[bar.b * 2]! * CM;
      const by = pos[bar.b * 2 + 1]! * CM;
      const dx = bx - ax;
      const dy = by - ay;
      const L = Math.hypot(dx, dy);
      const c = L > 1e-9 ? dx / L : 1;
      const s = L > 1e-9 ? dy / L : 0;
      const z = z0 + layout.layerZ[bar.layer]!;
      const idx = k * nb + bi;
      if (barArr)
        writeMat(barArr, idx, c, s, Math.max(L, 1e-4), w, t, (ax + bx) / 2, (ay + by) / 2, z);
      if (bossArr) {
        writeMat(bossArr, idx * 2, 1, 0, w / 2, w / 2, t, ax, ay, z);
        writeMat(bossArr, idx * 2 + 1, 1, 0, w / 2, w / 2, t, bx, by, z);
      }
    }
    if (pinArr) {
      for (let pi = 0; pi < np; pi++) {
        const pin = layout.pins[pi]!;
        const x = pos[pin.joint * 2]! * CM;
        const y = pos[pin.joint * 2 + 1]! * CM;
        const r = layout.pinRadius;
        writeMat(
          pinArr,
          k * np + pi,
          1,
          0,
          r,
          r,
          pin.zMax - pin.zMin,
          x,
          y,
          z0 + (pin.zMin + pin.zMax) / 2,
        );
      }
    }
    if (footArr && rig.foot >= 0) {
      const x = pos[rig.foot * 2]! * CM;
      const y = pos[rig.foot * 2 + 1]! * CM;
      const pin = rig.footPin;
      const len = pin ? pin.zMax - pin.zMin : t * 2;
      const zc = pin ? (pin.zMin + pin.zMax) / 2 : 0;
      writeMat(footArr, k, 1, 0, w * 0.5, w * 0.5, len * 0.9, x, y, z0 + zc);
    }
  }
  rig.plateGroups.forEach((g, gi) => {
    const mesh = m.plates[gi];
    if (!mesh) return;
    const arr = mesh.instanceMatrix.array as Float32Array;
    g.instances.forEach((k, slot) => {
      const pos = legs[k];
      if (!pos) return;
      const ax = pos[g.plate.a * 2]! * CM;
      const ay = pos[g.plate.a * 2 + 1]! * CM;
      const bx = pos[g.plate.b * 2]! * CM;
      const by = pos[g.plate.b * 2 + 1]! * CM;
      const phi = Math.atan2(by - ay, bx - ax) - g.angle;
      const c = Math.cos(phi);
      const s = Math.sin(phi);
      // p = a_now − R(φ) a_design
      const px = ax - (c * g.ax - s * g.ay);
      const py = ay - (s * g.ax + c * g.ay);
      writeMat(
        arr,
        slot,
        c,
        s,
        1,
        1,
        1,
        px,
        py,
        layout.instances[k]!.z + layout.layerZ[g.plate.layer]!,
      );
    });
    mesh.instanceMatrix.needsUpdate = true;
  });
  if (m.bars) m.bars.instanceMatrix.needsUpdate = true;
  if (m.bosses) m.bosses.instanceMatrix.needsUpdate = true;
  if (m.pins) m.pins.instanceMatrix.needsUpdate = true;
  if (m.feet) m.feet.instanceMatrix.needsUpdate = true;
}

export function MachineModel({
  design,
  getSnapshot,
  ghost = false,
  ghostColor = '#9fd8ff',
  ghostOpacity = 0.28,
  highlightLinks,
  colors,
  shadows = false,
  chassis = true,
}: MachineModelProps) {
  const rig = useMemo(() => buildRig(design), [design]);
  useEffect(() => () => rig.disposables.forEach((g) => g.dispose()), [rig]);

  const shared = getMachineMaterials();
  const ghostMat = useMemo(
    () => (ghost ? createGhostMaterial(ghostColor, ghostOpacity) : null),
    [ghost, ghostColor, ghostOpacity],
  );
  useEffect(() => () => ghostMat?.dispose(), [ghostMat]);
  const mat = (m: Material): Material => ghostMat ?? m;

  const body = useRef<Group>(null);
  const hub = useRef<Group>(null);
  const meshes = useRef<Meshes>({ bars: null, bosses: null, pins: null, feet: null, plates: [] });
  const frameMesh = useRef<InstancedMesh>(null);
  const shaftMesh = useRef<InstancedMesh>(null);

  const { layout, K } = rig;
  const nb = layout.bars.length;
  const np = layout.pins.length;
  const highlight = useMemo(() => new Set(highlightLinks ?? []), [highlightLinks]);

  // インスタンス色(木の色・クランク・問題のリンク)
  const palette = useMemo(
    () => ({
      wood: new Color(colors?.wood ?? MACHINE_PALETTE.wood),
      plate: new Color(colors?.plate ?? MACHINE_PALETTE.plate),
      crank: new Color(colors?.crank ?? MACHINE_PALETTE.crank),
      highlight: new Color(colors?.highlight ?? MACHINE_PALETTE.highlight),
      tmp: new Color(),
    }),
    [colors?.wood, colors?.plate, colors?.crank, colors?.highlight],
  );

  const applyColors = (pulse: number) => {
    if (ghostMat) return;
    const m = meshes.current;
    const { tmp } = palette;
    for (let k = 0; k < K; k++) {
      for (let bi = 0; bi < nb; bi++) {
        const bar = layout.bars[bi]!;
        const base = bar.crank ? palette.crank : palette.wood;
        const hot = highlight.has(layout.linkIds[bar.link]!);
        tmp.copy(base);
        if (hot) tmp.lerp(palette.highlight, pulse);
        const idx = k * nb + bi;
        m.bars?.setColorAt(idx, tmp);
        m.bosses?.setColorAt(idx * 2, tmp);
        m.bosses?.setColorAt(idx * 2 + 1, tmp);
      }
    }
    rig.plateGroups.forEach((g, gi) => {
      const mesh = m.plates[gi];
      if (!mesh) return;
      const hot = highlight.has(layout.linkIds[g.plate.link]!);
      tmp.copy(g.plate.crank ? palette.crank : palette.plate);
      if (hot) tmp.lerp(palette.highlight, pulse);
      for (let s = 0; s < g.instances.length; s++) mesh.setColorAt(s, tmp);
      if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
    });
    if (m.bars?.instanceColor) m.bars.instanceColor.needsUpdate = true;
    if (m.bosses?.instanceColor) m.bosses.instanceColor.needsUpdate = true;
  };

  // 初期配置:設計姿勢、色、胴体(動かない部品)
  useLayoutEffect(() => {
    const m = meshes.current;
    for (const mesh of [m.bars, m.bosses, m.pins, m.feet, ...m.plates]) {
      mesh?.instanceMatrix.setUsage(DynamicDrawUsage);
    }
    poseLegs(rig, m, rig.designPos);
    applyColors(1);
    const fm = frameMesh.current;
    if (fm) {
      const arr = fm.instanceMatrix.array as Float32Array;
      layout.frameZ.forEach((z, i) => writeMat(arr, i, 1, 0, 1, 1, 1, 0, 0, z));
      fm.instanceMatrix.needsUpdate = true;
    }
    const sm = shaftMesh.current;
    if (sm) {
      const arr = sm.instanceMatrix.array as Float32Array;
      const [z0, z1] = layout.shaftZ;
      const r = layout.pinRadius * 1.35;
      layout.fixedJoints.forEach((j, i) => {
        const p = rig.designPos[0]!;
        writeMat(arr, i, 1, 0, r, r, z1 - z0, p[j * 2]! * CM, p[j * 2 + 1]! * CM, (z0 + z1) / 2);
      });
      sm.instanceMatrix.needsUpdate = true;
    }
  }, [rig, ghostMat, palette, highlight]);

  useFrame((state) => {
    const s = getSnapshot();
    if (highlight.size > 0) applyColors(0.55 + 0.45 * Math.sin(state.clock.elapsedTime * 14));
    if (!s) return;
    const g = body.current;
    if (g) {
      g.position.set(s.body.position.x, s.body.position.y, s.body.position.z);
      g.quaternion.set(
        s.body.quaternion.x,
        s.body.quaternion.y,
        s.body.quaternion.z,
        s.body.quaternion.w,
      );
    }
    if (hub.current) hub.current.rotation.z = s.motorAngle;
    poseLegs(rig, meshes.current, s.legPositions);
  });

  const w = layout.barWidth;
  const motor = layout.motorJoint;
  const mp = rig.designPos[0];
  const mx = motor >= 0 && mp ? mp[motor * 2]! * CM : 0;
  const my = motor >= 0 && mp ? mp[motor * 2 + 1]! * CM : 0;
  const housingDepth = Math.max(0.05, layout.slot * 0.4);
  const cast = shadows && !ghost;
  const footCount = rig.foot >= 0 ? K : 0;

  return (
    <group ref={body}>
      {nb > 0 && (
        <instancedMesh
          key={`bars-${nb * K}`}
          ref={(el) => void (meshes.current.bars = el)}
          args={[rig.box, mat(shared.wood), nb * K]}
          frustumCulled={false}
          castShadow={cast}
          receiveShadow={cast}
        />
      )}
      {nb > 0 && (
        <instancedMesh
          key={`bosses-${nb * K}`}
          ref={(el) => void (meshes.current.bosses = el)}
          args={[rig.cyl, mat(shared.wood), nb * K * 2]}
          frustumCulled={false}
          castShadow={cast}
          receiveShadow={cast}
        />
      )}
      {rig.plateGroups.map((g, gi) => (
        <instancedMesh
          key={`plate-${gi}`}
          ref={(el) => void (meshes.current.plates[gi] = el)}
          args={[g.geometry, mat(shared.wood), g.instances.length]}
          frustumCulled={false}
          castShadow={cast}
          receiveShadow={cast}
        />
      ))}
      {np > 0 && (
        <instancedMesh
          key={`pins-${np * K}`}
          ref={(el) => void (meshes.current.pins = el)}
          args={[rig.cyl, mat(shared.steel), np * K]}
          frustumCulled={false}
          castShadow={cast}
        />
      )}
      {footCount > 0 && (
        <instancedMesh
          key={`feet-${footCount}`}
          ref={(el) => void (meshes.current.feet = el)}
          args={[rig.cyl, mat(shared.rubber), footCount]}
          frustumCulled={false}
          castShadow={cast}
        />
      )}
      {chassis && rig.frame && (
        <instancedMesh
          key={`frame-${layout.frameZ.length}`}
          ref={frameMesh}
          args={[rig.frame, mat(shared.frame), layout.frameZ.length]}
          frustumCulled={false}
          castShadow={cast}
          receiveShadow={cast}
        />
      )}
      {chassis && layout.fixedJoints.length > 0 && (
        <instancedMesh
          key={`shafts-${layout.fixedJoints.length}`}
          ref={shaftMesh}
          args={[rig.cyl, mat(shared.steel), layout.fixedJoints.length]}
          frustumCulled={false}
          castShadow={cast}
        />
      )}
      {chassis && motor >= 0 && (
        <>
          {/* モーター:奥側の端。手前の端には回るハブ */}
          <mesh
            geometry={rig.housing}
            material={mat(shared.frame)}
            position={[mx, my, layout.shaftZ[0] - housingDepth / 2]}
            castShadow={cast}
          />
          <mesh
            geometry={rig.cyl}
            material={mat(shared.brass)}
            position={[mx, my, layout.shaftZ[0] - housingDepth - w * 0.15]}
            scale={[w * 1.05, w * 1.05, w * 0.3]}
          />
          <group ref={hub} position={[mx, my, layout.shaftZ[1] + w * 0.2]}>
            <mesh
              geometry={rig.cyl}
              material={mat(shared.brass)}
              scale={[w * 1.3, w * 1.3, w * 0.4]}
            />
            <mesh
              geometry={rig.box}
              material={mat(shared.frame)}
              position={[w * 0.7, 0, w * 0.22]}
              scale={[w * 1.2, w * 0.35, w * 0.12]}
            />
          </group>
        </>
      )}
    </group>
  );
}
