import { useEffect, useMemo, useRef, type RefObject } from 'react';
import { useFrame, type ThreeEvent } from '@react-three/fiber';
import {
  BoxGeometry,
  CylinderGeometry,
  Euler,
  InstancedMesh,
  Matrix4,
  Plane,
  Quaternion,
  Vector3,
  type Group,
  type Material,
} from 'three';
import type { DesignDoc } from '@/core/model/types';
import { jansenWalker } from '@/core/model/presets';
import { damp } from '../rig/spring';
import type { V3 } from '../rig/pose';
import { box, cylinder, mergeParts } from '../env/geometry';
import { PALETTE, brass, invisible, steel, vcMatte } from '../env/materials';
import {
  WalkerGait,
  createPacer,
  createWalkerModel,
  layerOffset,
  legPositions,
  updatePacer,
  type PacerBounds,
} from './walkerRig';

/**
 * 運動学だけで歩く機械(SC-5)。棒はインスタンス描画、毎フレーム ref で行列を書き換える。
 * 作業台の見本機・コース模型の小さな機械・試走コースの仮置きに使う。
 */
export interface KinematicWalkerProps {
  design?: DesignDoc;
  /** 縮尺(m / 設計 cm) */
  scale: number;
  /** 行き来する範囲(親の座標、m) */
  bounds: PacerBounds;
  /** 歩く面の高さ(m) */
  groundY: number;
  /** クランクの回転数(rpm、絶対値)。既定は設計の値 */
  rpm?: number;
  /** 0..1 で歩く速さを絞る(0 で止まる)。省略時は常に歩く */
  activity?: RefObject<number>;
  /** ドラッグで持ち上げて動かし、向きを変えられる */
  draggable?: boolean;
  /** 毎フレーム、機体の位置(親の座標、m)を書き込む */
  anchor?: V3;
  /** 持ち上げられる範囲(親の座標、m) */
  dragArea?: { xMin: number; xMax: number; zMin: number; zMax: number };
  barMaterial?: Material;
  castShadow?: boolean;
  /** 初期位置の x(省略時は範囲の中央) */
  startX?: number;
}

const BAR_W = 4.2;
const BAR_T = 1.3;
const PIN_R = 1.7;
const LIFT = 0.07;

const M = new Matrix4();
const Q = new Quaternion();
const P = new Vector3();
const S = new Vector3();
const E = new Euler();
const HIT = new Vector3();

export function KinematicWalker({
  design,
  scale,
  bounds,
  groundY,
  rpm,
  activity,
  draggable = false,
  anchor,
  dragArea,
  barMaterial = brass,
  castShadow = true,
  startX,
}: KinematicWalkerProps) {
  const doc = useMemo(() => design ?? jansenWalker(), [design]);
  const model = useMemo(() => createWalkerModel(doc), [doc]);
  const gait = useMemo(() => new WalkerGait(model), [model]);
  const pacer = useMemo(() => {
    const p = createPacer(bounds);
    if (startX !== undefined) p.x = startX;
    return p;
    // 範囲が変わっても歩いている位置は保つ(作り直すのは機構が変わったときだけ)
  }, [model]);
  const root = useRef<Group>(null);
  const bars = useRef<InstancedMesh>(null);
  const pins = useRef<InstancedMesh>(null);
  const drag = useRef({ held: false, lift: 0, lastX: 0, lastZ: 0, plane: new Plane() });
  const speed = useRef(1);

  const { barGeo, pinGeo, chassis, hit } = useMemo(() => {
    const barGeo = new BoxGeometry(1, 1, 1);
    const pinGeo = new CylinderGeometry(1, 1, 1, 8);
    pinGeo.rotateX(Math.PI / 2);
    const f = model.frame;
    const cx = (f.xMin + f.xMax) / 2;
    const cy = (f.yMin + f.yMax) / 2;
    const chassis = mergeParts([
      // 固定点を結ぶ梁(脚の列を貫く)と、上に載る箱
      box([f.xMax - f.xMin, 5, f.zMax - f.zMin], [cx, cy, 0], PALETTE.woodDark),
      box(
        [(f.xMax - f.xMin) * 0.55, 10, (f.zMax - f.zMin) * 0.7],
        [cx, f.yMax + 5, 0],
        PALETTE.wood,
      ),
      cylinder(2.2, 2.2, f.zMax - f.zMin + 6, [0, 0, 0], PALETTE.metalDark, 8, [Math.PI / 2, 0, 0]),
    ]);
    const hit = new BoxGeometry(f.xMax - f.xMin + 80, 140, f.zMax - f.zMin + 10);
    hit.translate(cx, -30, 0);
    return { barGeo, pinGeo, chassis, hit };
  }, [model]);

  useEffect(
    () => () => {
      barGeo.dispose();
      pinGeo.dispose();
      chassis.dispose();
      hit.dispose();
    },
    [barGeo, pinGeo, chassis, hit],
  );

  const omega = ((Math.abs(rpm ?? doc.motor.rpm) || 40) * Math.PI * 2) / 60;
  const direction = (doc.motor.rpm || -1) < 0 ? -1 : 1;

  useFrame((_, rawDt) => {
    const dt = Math.min(rawDt, 0.1);
    const target = activity ? (activity.current ?? 0) : 1;
    speed.current = damp(speed.current, target, 3, dt);
    const { advance, minFootY } = gait.step(direction * omega * speed.current * dt);
    const d = drag.current;
    d.lift = damp(d.lift, d.held ? LIFT : 0, 10, dt);
    if (!d.held) updatePacer(pacer, Math.max(0, advance) * scale, dt, bounds);
    const g = root.current;
    if (g) {
      g.position.set(pacer.x, groundY - minFootY * scale + d.lift, pacer.z);
      g.rotation.y = pacer.heading;
    }
    if (anchor) {
      anchor[0] = pacer.x;
      anchor[1] = groundY - minFootY * scale * 0.5;
      anchor[2] = pacer.z;
    }
    writeInstances();
  });

  function writeInstances() {
    const b = bars.current;
    const p = pins.current;
    if (!b || !p) return;
    model.bars.forEach((bar, i) => {
      const pos = legPositions(model, bar.leg);
      const ax = pos[bar.a * 2]!;
      const ay = pos[bar.a * 2 + 1]!;
      const bx = pos[bar.b * 2]!;
      const by = pos[bar.b * 2 + 1]!;
      const len = Math.hypot(bx - ax, by - ay);
      P.set((ax + bx) / 2, (ay + by) / 2, model.legs[bar.leg]!.z + layerOffset(model, bar.layer));
      Q.setFromEuler(E.set(0, 0, Math.atan2(by - ay, bx - ax)));
      S.set(len + BAR_W, BAR_W, BAR_T);
      b.setMatrixAt(i, M.compose(P, Q, S));
    });
    b.instanceMatrix.needsUpdate = true;
    const pinLen = model.layers * model.layerGap + 1.5;
    Q.identity();
    model.pins.forEach((pin, i) => {
      const pos = legPositions(model, pin.leg);
      P.set(pos[pin.j * 2]!, pos[pin.j * 2 + 1]!, model.legs[pin.leg]!.z);
      S.set(PIN_R, PIN_R, pinLen);
      p.setMatrixAt(i, M.compose(P, Q, S));
    });
    p.instanceMatrix.needsUpdate = true;
  }

  // ドラッグ:持ち上げて動かす。動かした向きへ機体が向く
  const onDown = (e: ThreeEvent<PointerEvent>) => {
    if (!draggable || e.button !== 0) return;
    e.stopPropagation();
    (e.target as Element).setPointerCapture?.(e.pointerId);
    const d = drag.current;
    d.held = true;
    d.lastX = pacer.x;
    d.lastZ = pacer.z;
    d.plane.set(new Vector3(0, 1, 0), -(groundY + LIFT));
    document.body.style.cursor = 'grabbing';
  };
  const onMove = (e: ThreeEvent<PointerEvent>) => {
    if (!draggable) return;
    e.stopPropagation();
    const d = drag.current;
    if (!d.held) return;
    if (!e.ray.intersectPlane(d.plane, HIT)) return;
    const area = dragArea ?? {
      xMin: bounds.xMin - 0.3,
      xMax: bounds.xMax + 0.3,
      zMin: bounds.z - 0.3,
      zMax: bounds.z + 0.3,
    };
    const x = Math.min(area.xMax, Math.max(area.xMin, HIT.x));
    const z = Math.min(area.zMax, Math.max(area.zMin, HIT.z));
    const vx = x - d.lastX;
    const vz = z - d.lastZ;
    if (Math.hypot(vx, vz) > 0.004) {
      const want = Math.atan2(-vz, vx);
      const diff = Math.atan2(Math.sin(want - pacer.heading), Math.cos(want - pacer.heading));
      pacer.heading += diff * 0.25;
      d.lastX = x;
      d.lastZ = z;
    }
    pacer.x = x;
    pacer.z = z;
    pacer.mode = 'walk';
  };
  const onUp = (e: ThreeEvent<PointerEvent>) => {
    const d = drag.current;
    if (!d.held) return;
    e.stopPropagation();
    (e.target as Element).releasePointerCapture?.(e.pointerId);
    d.held = false;
    document.body.style.cursor = draggable ? 'grab' : '';
  };

  return (
    <group ref={root}>
      <group scale={scale}>
        <instancedMesh
          ref={bars}
          args={[barGeo, barMaterial, model.bars.length]}
          castShadow={castShadow}
          frustumCulled={false}
        />
        <instancedMesh
          ref={pins}
          args={[pinGeo, steel, model.pins.length]}
          castShadow={castShadow}
          frustumCulled={false}
        />
        <mesh geometry={chassis} material={vcMatte} castShadow={castShadow} />
        {draggable && (
          <mesh
            geometry={hit}
            material={invisible}
            onPointerDown={onDown}
            onPointerMove={onMove}
            onPointerUp={onUp}
            onPointerOver={(e) => {
              e.stopPropagation();
              if (!drag.current.held) document.body.style.cursor = 'grab';
            }}
            onPointerOut={() => {
              if (!drag.current.held) document.body.style.cursor = '';
            }}
            onClick={(e) => e.stopPropagation()}
          />
        )}
      </group>
    </group>
  );
}
