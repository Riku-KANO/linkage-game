import { useFrame } from '@react-three/fiber';
import { useEffect, useMemo, useRef } from 'react';
import {
  BufferAttribute,
  BufferGeometry,
  Color,
  CylinderGeometry,
  DoubleSide,
  DynamicDrawUsage,
  Group,
  InstancedMesh,
  LineBasicMaterial,
  LineLoop,
  Matrix4,
  Mesh,
  MeshBasicMaterial,
  Quaternion,
  RingGeometry,
  SphereGeometry,
  Vector3,
} from 'three';
import type { DesignDoc } from '@/core/model/types';
import { CM } from '@/core/model/types';
import type { SimSnapshot, TerrainSpec } from '@/core/sim/types';
import { convexHullInto, insideHull } from './hull';
import { terrainHeightAt } from './terrain';
import {
  clearTrails,
  createTrailSet,
  pushTrail,
  readTrail,
  ribbonIndex,
  TRAIL_STRIDE,
  writeRibbon,
  type RibbonColors,
} from './trails';

/**
 * 可視化(TR-5、S-07):脚先の軌跡、接地点と接地力、重心の投影と支持多角形。
 * どれも useFrame の中でスナップショットを読み、確保済みのバッファを書き換える。
 */

type GetSnapshot = () => SimSnapshot | null;

/** 脚先の index(未指定なら -1) */
export function footIndexOf(design: DesignDoc): number {
  return design.foot ? design.joints.findIndex((j) => j.id === design.foot) : -1;
}

// ---------------------------------------------------------------- 脚先の軌跡

export interface FootTrailsProps {
  design: DesignDoc;
  getSnapshot: GetSnapshot;
  /** 残す長さ(シミュレーション時間の秒) */
  seconds?: number;
  /** 記録の間隔(シミュレーション時間の秒) */
  interval?: number;
  /** 帯の幅(m) */
  width?: number;
  colors?: RibbonColors;
}

const DEFAULT_RIBBON: RibbonColors = { stance: [0.36, 0.92, 0.72], swing: [1.0, 0.68, 0.3] };

export function FootTrails({
  design,
  getSnapshot,
  seconds = 3,
  interval = 1 / 60,
  width = 0.012,
  colors = DEFAULT_RIBBON,
}: FootTrailsProps) {
  const foot = footIndexOf(design);
  const capacity = Math.max(2, Math.ceil(seconds / interval));
  const state = useMemo(() => {
    const lines = Math.max(1, design.legs.count) * (design.legs.mirrorX ? 2 : 1);
    const trails = createTrailSet(lines, capacity);
    const index = new BufferAttribute(ribbonIndex(capacity), 1);
    const geoms = Array.from({ length: lines }, () => {
      const g = new BufferGeometry();
      const pos = new BufferAttribute(new Float32Array(capacity * 2 * 3), 3);
      const col = new BufferAttribute(new Float32Array(capacity * 2 * 4), 4);
      pos.setUsage(DynamicDrawUsage);
      col.setUsage(DynamicDrawUsage);
      g.setAttribute('position', pos);
      g.setAttribute('color', col);
      g.setIndex(index);
      g.setDrawRange(0, 0);
      return g;
    });
    const material = new MeshBasicMaterial({
      vertexColors: true,
      transparent: true,
      depthWrite: false,
      side: DoubleSide,
      toneMapped: false,
    });
    return {
      trails,
      geoms,
      material,
      scratch: new Float32Array(capacity * TRAIL_STRIDE),
      contactIdx: new Int32Array(lines).fill(-1),
      contactLen: -1,
      lastTime: -Infinity,
      v: new Vector3(),
      q: new Quaternion(),
    };
  }, [design, capacity]);
  useEffect(
    () => () => {
      state.geoms.forEach((g) => g.dispose());
      state.material.dispose();
    },
    [state],
  );

  useFrame(() => {
    const s = getSnapshot();
    if (!s || foot < 0) return;
    const st = state;
    if (s.time < st.lastTime - 1e-9) {
      clearTrails(st.trails);
      st.lastTime = -Infinity;
    }
    if (s.time - st.lastTime >= interval - 1e-9) {
      st.lastTime = s.time;
      // 接地の索引を作り直す(接触点の並びが変わったときだけ)
      if (st.contactLen !== s.contacts.length) {
        st.contactLen = s.contacts.length;
        st.contactIdx.fill(-1);
        s.contacts.forEach((c, i) => {
          if (c.joint === foot && c.instance >= 0 && c.instance < st.contactIdx.length) {
            st.contactIdx[c.instance] = i;
          }
        });
      }
      const b = s.body;
      st.q.set(b.quaternion.x, b.quaternion.y, b.quaternion.z, b.quaternion.w);
      const K = Math.min(st.trails.lines, s.legPositions.length, s.instances.length);
      for (let k = 0; k < K; k++) {
        const p = s.legPositions[k]!;
        st.v.set(p[foot * 2]! * CM, p[foot * 2 + 1]! * CM, s.instances[k]!.z).applyQuaternion(st.q);
        const ci = st.contactIdx[k]!;
        const touching = ci >= 0 && s.contacts[ci]?.contact ? 1 : 0;
        pushTrail(
          st.trails,
          k,
          b.position.x + st.v.x,
          b.position.y + st.v.y,
          b.position.z + st.v.z,
          touching,
        );
      }
      for (let k = 0; k < st.geoms.length; k++) {
        const g = st.geoms[k]!;
        const n = readTrail(st.trails, k, st.scratch);
        const pos = g.getAttribute('position') as BufferAttribute;
        const col = g.getAttribute('color') as BufferAttribute;
        const verts = writeRibbon(
          st.scratch,
          n,
          width,
          colors,
          pos.array as Float32Array,
          col.array as Float32Array,
        );
        g.setDrawRange(0, Math.max(0, (verts / 2 - 1) * 6));
        pos.needsUpdate = true;
        col.needsUpdate = true;
      }
    }
  });

  return (
    <group>
      {state.geoms.map((g, i) => (
        <mesh
          key={i}
          geometry={g}
          material={state.material}
          frustumCulled={false}
          renderOrder={2}
        />
      ))}
    </group>
  );
}

// ---------------------------------------------------------------- 接地点

export interface ContactMarkersProps {
  getSnapshot: GetSnapshot;
  /** 接触球の半径(m)。円盤を地面の高さに置くのに使う */
  footRadius?: number;
  /** 力の線の長さ(m/N) */
  forceScale?: number;
  /** 確保する数の上限 */
  capacity?: number;
}

export function ContactMarkers({
  getSnapshot,
  footRadius = 0.02,
  forceScale = 0.0016,
  capacity = 256,
}: ContactMarkersProps) {
  const res = useMemo(() => {
    const disc = new CylinderGeometry(1, 1, 1, 20, 1);
    const stick = new CylinderGeometry(1, 1, 1, 6, 1).translate(0, 0.5, 0);
    const discMat = new MeshBasicMaterial({
      color: '#5ef0c4',
      transparent: true,
      opacity: 0.85,
      depthWrite: false,
      toneMapped: false,
    });
    const stickMat = new MeshBasicMaterial({ color: '#8ff7da', toneMapped: false });
    return {
      disc,
      stick,
      discMat,
      stickMat,
      m: new Matrix4(),
      p: new Vector3(),
      s: new Vector3(),
      q: new Quaternion(),
      up: new Vector3(0, 1, 0),
      dir: new Vector3(),
    };
  }, []);
  useEffect(
    () => () => {
      res.disc.dispose();
      res.stick.dispose();
      res.discMat.dispose();
      res.stickMat.dispose();
    },
    [res],
  );
  const discs = useRef<InstancedMesh>(null);
  const sticks = useRef<InstancedMesh>(null);

  useFrame(() => {
    const s = getSnapshot();
    const dm = discs.current;
    const sm = sticks.current;
    if (!dm || !sm) return;
    if (!s) {
      dm.count = 0;
      sm.count = 0;
      return;
    }
    let n = 0;
    for (let i = 0; i < s.contacts.length && n < capacity; i++) {
      const c = s.contacts[i]!;
      if (!c.contact) continue;
      const f = Math.hypot(c.force.x, c.force.y, c.force.z);
      const r = 0.018 + 0.0035 * Math.sqrt(f);
      res.p.set(c.position.x, c.position.y - footRadius + 0.002, c.position.z);
      res.q.identity();
      res.s.set(r, 0.003, r);
      res.m.compose(res.p, res.q, res.s);
      dm.setMatrixAt(n, res.m);
      // 力の向きと大きさ
      const len = Math.min(0.6, f * forceScale);
      if (f > 1e-6) res.dir.set(c.force.x / f, c.force.y / f, c.force.z / f);
      else res.dir.copy(res.up);
      res.q.setFromUnitVectors(res.up, res.dir);
      res.s.set(0.004, Math.max(1e-4, len), 0.004);
      res.m.compose(res.p, res.q, res.s);
      sm.setMatrixAt(n, res.m);
      n++;
    }
    dm.count = n;
    sm.count = n;
    dm.instanceMatrix.needsUpdate = true;
    sm.instanceMatrix.needsUpdate = true;
  });

  return (
    <group>
      <instancedMesh
        ref={discs}
        args={[res.disc, res.discMat, capacity]}
        frustumCulled={false}
        renderOrder={3}
      />
      <instancedMesh
        ref={sticks}
        args={[res.stick, res.stickMat, capacity]}
        frustumCulled={false}
      />
    </group>
  );
}

// ---------------------------------------------------------------- 重心の投影

export interface ComMarkerProps {
  getSnapshot: GetSnapshot;
  /** 地形(投影先の高さ)。なければ接地点の平均の高さ */
  terrain?: TerrainSpec | null;
  footRadius?: number;
  /** 支持多角形の点の上限 */
  capacity?: number;
}

const COM_OK = new Color('#7ee081');
const COM_WARN = new Color('#ffc24d');
const COM_BAD = new Color('#ff5a45');

export function ComMarker({
  getSnapshot,
  terrain = null,
  footRadius = 0.02,
  capacity = 128,
}: ComMarkerProps) {
  const res = useMemo(() => {
    const ring = new RingGeometry(0.05, 0.075, 32).rotateX(-Math.PI / 2);
    const dot = new SphereGeometry(0.03, 16, 12);
    const line = new CylinderGeometry(0.004, 0.004, 1, 6, 1).translate(0, 0.5, 0);
    const ringMat = new MeshBasicMaterial({
      color: COM_OK,
      toneMapped: false,
      depthWrite: false,
      transparent: true,
    });
    const dotMat = new MeshBasicMaterial({ color: '#fff3d6', toneMapped: false });
    const lineMat = new MeshBasicMaterial({
      color: '#fff3d6',
      toneMapped: false,
      transparent: true,
      opacity: 0.6,
    });
    const polyGeom = new BufferGeometry();
    const polyPos = new BufferAttribute(new Float32Array(capacity * 3), 3);
    polyPos.setUsage(DynamicDrawUsage);
    polyGeom.setAttribute('position', polyPos);
    polyGeom.setDrawRange(0, 0);
    const polyMat = new LineBasicMaterial({
      color: COM_OK,
      toneMapped: false,
      transparent: true,
      opacity: 0.9,
    });
    const poly = new LineLoop(polyGeom, polyMat);
    poly.frustumCulled = false;
    poly.renderOrder = 3;
    return {
      ring,
      dot,
      line,
      ringMat,
      dotMat,
      lineMat,
      poly,
      polyGeom,
      polyMat,
      xs: new Float64Array(capacity),
      zs: new Float64Array(capacity),
      ys: new Float64Array(capacity),
      work: new Int32Array(capacity),
      hull: new Int32Array(capacity + 1),
    };
  }, [capacity]);
  useEffect(
    () => () => {
      for (const g of [res.ring, res.dot, res.line, res.polyGeom]) g.dispose();
      for (const m of [res.ringMat, res.dotMat, res.lineMat, res.polyMat]) m.dispose();
    },
    [res],
  );
  const group = useRef<Group>(null);
  const ringMesh = useRef<Mesh>(null);
  const dotMesh = useRef<Mesh>(null);
  const lineMesh = useRef<Mesh>(null);

  useFrame(() => {
    const s = getSnapshot();
    const g = group.current;
    if (!g) return;
    g.visible = !!s;
    if (!s) return;
    // 接地点(xz)と平均の高さ
    let n = 0;
    let ySum = 0;
    for (let i = 0; i < s.contacts.length && n < capacity; i++) {
      const c = s.contacts[i]!;
      if (!c.contact) continue;
      res.xs[n] = c.position.x;
      res.zs[n] = c.position.z;
      res.ys[n] = c.position.y - footRadius;
      ySum += res.ys[n]!;
      n++;
    }
    let gy = terrain ? terrainHeightAt(terrain, s.com.x, s.com.z) : -Infinity;
    if (!Number.isFinite(gy)) gy = n > 0 ? ySum / n : s.com.y - 0.5;
    ringMesh.current?.position.set(s.com.x, gy + 0.004, s.com.z);
    dotMesh.current?.position.set(s.com.x, s.com.y, s.com.z);
    const lm = lineMesh.current;
    if (lm) {
      lm.position.set(s.com.x, gy, s.com.z);
      lm.scale.set(1, Math.max(1e-3, s.com.y - gy), 1);
    }
    // 支持多角形(接地点の凸包)
    const pos = res.polyGeom.getAttribute('position') as BufferAttribute;
    const arr = pos.array as Float32Array;
    let color = COM_WARN;
    if (n >= 1) {
      const m = convexHullInto(res.xs, res.zs, n, res.work, res.hull);
      for (let k = 0; k < m; k++) {
        const i = res.hull[k]!;
        arr[k * 3] = res.xs[i]!;
        arr[k * 3 + 1] = res.ys[i]! + 0.004;
        arr[k * 3 + 2] = res.zs[i]!;
      }
      res.polyGeom.setDrawRange(0, m);
      if (m >= 3)
        color = insideHull(res.xs, res.zs, res.hull, m, s.com.x, s.com.z) ? COM_OK : COM_BAD;
    } else {
      res.polyGeom.setDrawRange(0, 0);
      color = COM_BAD;
    }
    pos.needsUpdate = true;
    res.ringMat.color.copy(color);
    res.polyMat.color.copy(color);
  });

  return (
    <group ref={group}>
      <mesh ref={ringMesh} geometry={res.ring} material={res.ringMat} renderOrder={3} />
      <mesh ref={dotMesh} geometry={res.dot} material={res.dotMat} />
      <mesh ref={lineMesh} geometry={res.line} material={res.lineMat} />
      <primitive object={res.poly} />
    </group>
  );
}
