import { useEffect, useLayoutEffect, useMemo, useRef } from 'react';
import {
  BoxGeometry,
  BufferAttribute,
  BufferGeometry,
  CanvasTexture,
  DoubleSide,
  InstancedMesh,
  MeshBasicMaterial,
  MeshStandardMaterial,
  NearestFilter,
  PlaneGeometry,
  SRGBColorSpace,
} from 'three';
import type { TerrainSpec } from '@/core/sim/types';
import { t } from '@/i18n';
import { gridTexture } from './materials';
import { buildTerrainMesh, courseBounds, distanceTicks, terrainHeightAt } from './terrain';

/**
 * 地形の描画(TR-2):TerrainSpec の箱・坂(1 つのメッシュにまとめる)、地面、スタートの線、
 * ゴールの門、スタートからの距離の目盛り(既定 1m ごと)。どれも静的なので作るのは 1 回だけ。
 */

export interface TerrainViewProps {
  terrain: TerrainSpec;
  start?: { x: number; z: number } | null;
  goal?: { x: number } | null;
  /** 目盛りの間隔(m)。0 で消す */
  tickStep?: number;
  /** ゴールの門の高さ(m) */
  gateHeight?: number;
  /** 地面の 1 辺(m) */
  groundSize?: number;
  shadows?: boolean;
}

const COURSE_COLOR = '#c7a47a';
const GROUND_COLOR = '#6a5442';
const MAX_TICKS = 120;

function checkerTexture(): CanvasTexture | null {
  if (typeof document === 'undefined') return null;
  const c = document.createElement('canvas');
  c.width = 64;
  c.height = 16;
  const g = c.getContext('2d');
  if (!g) return null;
  for (let i = 0; i < 16; i++) {
    for (let j = 0; j < 4; j++) {
      g.fillStyle = (i + j) % 2 === 0 ? '#f6efe2' : '#1f1a17';
      g.fillRect(i * 4, j * 4, 4, 4);
    }
  }
  const tex = new CanvasTexture(c);
  tex.colorSpace = SRGBColorSpace;
  tex.magFilter = NearestFilter;
  return tex;
}

/** 目盛りの文字(「3 m」)を 1 枚の画像に並べる */
function labelAtlas(labels: string[], cols: number): CanvasTexture | null {
  if (typeof document === 'undefined' || labels.length === 0) return null;
  const cw = 128;
  const ch = 64;
  const rows = Math.ceil(labels.length / cols);
  const c = document.createElement('canvas');
  c.width = cw * cols;
  c.height = ch * rows;
  const g = c.getContext('2d');
  if (!g) return null;
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  g.font = `600 40px 'Hiragino Sans', 'Noto Sans JP', system-ui, sans-serif`;
  g.lineJoin = 'round';
  labels.forEach((s, i) => {
    const x = (i % cols) * cw + cw / 2;
    const y = Math.floor(i / cols) * ch + ch / 2;
    g.lineWidth = 8;
    g.strokeStyle = 'rgba(40, 26, 16, 0.85)';
    g.strokeText(s, x, y);
    g.fillStyle = '#fff4df';
    g.fillText(s, x, y);
  });
  const tex = new CanvasTexture(c);
  tex.colorSpace = SRGBColorSpace;
  tex.anisotropy = 4;
  return tex;
}

export function TerrainView({
  terrain,
  start = null,
  goal = null,
  tickStep = 1,
  gateHeight = 1.6,
  groundSize = 160,
  shadows = false,
}: TerrainViewProps) {
  const bounds = useMemo(
    () => courseBounds(terrain, { start: start ?? undefined, goal: goal ?? undefined }),
    [terrain, start, goal],
  );
  const zc = (bounds.zMin + bounds.zMax) / 2;
  const heightAt = (x: number) => {
    const h = terrainHeightAt(terrain, x, zc);
    return Number.isFinite(h) ? h : 0;
  };

  // コース(箱・坂)
  const course = useMemo(() => {
    const data = buildTerrainMesh(terrain.shapes);
    const g = new BufferGeometry();
    g.setAttribute('position', new BufferAttribute(data.positions, 3));
    g.setAttribute('normal', new BufferAttribute(data.normals, 3));
    g.setAttribute('uv', new BufferAttribute(data.uvs, 2));
    g.computeBoundingSphere();
    return g;
  }, [terrain.shapes]);
  const courseMat = useMemo(
    () =>
      new MeshStandardMaterial({
        color: COURSE_COLOR,
        map: gridTexture('#ffffff', 'rgba(70, 45, 25, 0.16)', 'rgba(70, 45, 25, 0.5)'),
        roughness: 0.86,
        metalness: 0,
      }),
    [],
  );
  const groundMat = useMemo(() => {
    const map = gridTexture('#ffffff', 'rgba(0, 0, 0, 0.10)', 'rgba(0, 0, 0, 0.28)');
    map?.repeat.set(groundSize, groundSize);
    return new MeshStandardMaterial({ color: GROUND_COLOR, map, roughness: 0.95, metalness: 0 });
  }, [groundSize]);
  const groundGeom = useMemo(() => new PlaneGeometry(groundSize, groundSize), [groundSize]);

  // ゴールの市松模様
  const checker = useMemo(
    () =>
      new MeshStandardMaterial({
        map: checkerTexture(),
        roughness: 0.7,
        side: DoubleSide,
        emissive: '#3a2a1a',
      }),
    [],
  );
  const postMat = useMemo(
    () => new MeshStandardMaterial({ color: '#8b5a34', roughness: 0.6, metalness: 0.1 }),
    [],
  );
  const lineMat = useMemo(
    () => new MeshStandardMaterial({ color: '#f6efe2', emissive: '#6b5a40', roughness: 0.6 }),
    [],
  );
  const unitBox = useMemo(() => new BoxGeometry(1, 1, 1), []);

  // 目盛り
  const ticks = useMemo(() => {
    if (!(tickStep > 0)) return [];
    const x0 = start ? start.x : 0;
    const to = Math.max(bounds.xMax, goal ? goal.x : bounds.xMax);
    return distanceTicks(0, to - x0, tickStep)
      .slice(0, MAX_TICKS)
      .map((d) => ({ d, x: x0 + d }));
  }, [tickStep, start, goal, bounds.xMax]);
  const tickMesh = useRef<InstancedMesh>(null);
  const tickMat = useMemo(() => new MeshStandardMaterial({ color: '#3b2a1d', roughness: 0.8 }), []);
  const labels = useMemo(() => {
    if (ticks.length === 0) return null;
    const cols = 8;
    const atlas = labelAtlas(
      ticks.map((tk) => t('testrun.tick', { m: Math.round(tk.d * 100) / 100 })),
      cols,
    );
    const rows = Math.ceil(ticks.length / cols);
    const pos: number[] = [];
    const uv: number[] = [];
    const idx: number[] = [];
    const w = 0.26;
    const hd = 0.13;
    // 札をカメラ側へ起こす(水平から 55°):横から見ても読める
    const tilt = (55 * Math.PI) / 180;
    const up = hd * Math.sin(tilt);
    const back = hd * Math.cos(tilt);
    const z = bounds.zMax - 0.12;
    ticks.forEach((tk, i) => {
      const y = terrainHeightAt(terrain, tk.x, z - back);
      const yy = (Number.isFinite(y) ? y : 0) + 0.003;
      const u0 = (i % cols) / cols;
      const u1 = (i % cols) / cols + 1 / cols;
      const v1 = 1 - Math.floor(i / cols) / rows;
      const v0 = v1 - 1 / rows;
      const b = pos.length / 3;
      pos.push(tk.x - w / 2, yy, z, tk.x + w / 2, yy, z);
      pos.push(tk.x + w / 2, yy + up, z - back, tk.x - w / 2, yy + up, z - back);
      uv.push(u0, v0, u1, v0, u1, v1, u0, v1);
      idx.push(b, b + 1, b + 2, b, b + 2, b + 3);
    });
    const g = new BufferGeometry();
    g.setAttribute('position', new BufferAttribute(new Float32Array(pos), 3));
    g.setAttribute('uv', new BufferAttribute(new Float32Array(uv), 2));
    g.setIndex(idx);
    g.computeBoundingSphere();
    const mat = new MeshBasicMaterial({
      map: atlas,
      transparent: true,
      depthWrite: false,
      toneMapped: false,
    });
    return { geometry: g, material: mat };
  }, [ticks, terrain, bounds.zMax]);

  useLayoutEffect(() => {
    const m = tickMesh.current;
    if (!m) return;
    const z = bounds.zMax - 0.07;
    ticks.forEach((tk, i) => {
      const h = terrainHeightAt(terrain, tk.x, z);
      const y = (Number.isFinite(h) ? h : 0) + 0.002;
      const major = Math.abs(tk.d % 5) < 1e-6;
      const a = m.instanceMatrix.array as Float32Array;
      const o = i * 16;
      a.fill(0, o, o + 16);
      a[o] = 0.014;
      a[o + 5] = 0.004;
      a[o + 10] = major ? 0.2 : 0.11;
      a[o + 12] = tk.x;
      a[o + 13] = y;
      a[o + 14] = z - (major ? 0.045 : 0);
      a[o + 15] = 1;
    });
    m.instanceMatrix.needsUpdate = true;
  }, [ticks, terrain, bounds.zMax]);

  useEffect(
    () => () => {
      course.dispose();
    },
    [course],
  );
  useEffect(
    () => () => {
      labels?.geometry.dispose();
      labels?.material.map?.dispose();
      labels?.material.dispose();
    },
    [labels],
  );
  useEffect(
    () => () => {
      groundGeom.dispose();
      groundMat.map?.dispose();
      groundMat.dispose();
    },
    [groundGeom, groundMat],
  );
  useEffect(
    () => () => {
      for (const m of [courseMat, checker, postMat, lineMat, tickMat]) {
        m.map?.dispose();
        m.dispose();
      }
      unitBox.dispose();
    },
    [courseMat, checker, postMat, lineMat, tickMat, unitBox],
  );

  const width = bounds.zMax - bounds.zMin;
  const goalBase = goal ? heightAt(goal.x) : 0;
  const startBase = start ? heightAt(start.x) : 0;
  const gx = (bounds.xMin + bounds.xMax) / 2;

  return (
    <group>
      {terrain.ground && (
        <mesh
          geometry={groundGeom}
          material={groundMat}
          rotation={[-Math.PI / 2, 0, 0]}
          position={[gx, terrain.ground.y - 0.0005, zc]}
          receiveShadow={shadows}
        />
      )}
      {terrain.shapes.length > 0 && (
        <mesh geometry={course} material={courseMat} receiveShadow={shadows} castShadow={shadows} />
      )}
      {start && (
        <mesh
          geometry={unitBox}
          material={lineMat}
          position={[start.x, startBase + 0.002, zc]}
          scale={[0.05, 0.004, width]}
        />
      )}
      {goal && (
        <group position={[goal.x, goalBase, zc]}>
          <mesh
            geometry={unitBox}
            material={checker}
            position={[0, 0.002, 0]}
            scale={[0.12, 0.004, width]}
          />
          {[-1, 1].map((side) => (
            <mesh
              key={side}
              geometry={unitBox}
              material={postMat}
              position={[0, gateHeight / 2, side * (width / 2 + 0.08)]}
              scale={[0.07, gateHeight, 0.07]}
              castShadow={shadows}
            />
          ))}
          <mesh
            geometry={unitBox}
            material={postMat}
            position={[0, gateHeight, 0]}
            scale={[0.07, 0.07, width + 0.3]}
            castShadow={shadows}
          />
          <mesh
            material={checker}
            position={[0, gateHeight - 0.16, 0]}
            rotation={[0, Math.PI / 2, 0]}
          >
            <planeGeometry args={[width + 0.16, 0.22]} />
          </mesh>
          {/* 手前の柱の旗(横から見るカメラに向ける) */}
          <mesh material={checker} position={[0.22, gateHeight - 0.16, width / 2 + 0.08]}>
            <planeGeometry args={[0.4, 0.26]} />
          </mesh>
        </group>
      )}
      {ticks.length > 0 && (
        <instancedMesh
          key={`ticks-${ticks.length}`}
          ref={tickMesh}
          args={[unitBox, tickMat, ticks.length]}
          receiveShadow={shadows}
        />
      )}
      {labels && <mesh geometry={labels.geometry} material={labels.material} renderOrder={1} />}
    </group>
  );
}
