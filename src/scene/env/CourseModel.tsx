import { useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import type { Group } from 'three';
import { COURSE_MODEL, ROOM } from '../layout';
import { useActivity } from '../home/activity';
import { damp } from '../rig/spring';
import { useApp } from '@/app/store';
import { KinematicWalker } from '../walker/KinematicWalker';
import { box, cylinder, mergeParts, seeded, jitterColor, type Part } from './geometry';
import { PALETTE, vcMatte } from './materials';

/**
 * 壁のコース模型(ステージ選択)。奥の壁に棚受けで取り付けた板の上に、章ごとの台地のジオラマ。
 * 章 1・2 は色付き、章 3〜5 はまだ灰色。ホバーすると章 1 の台地で小さな機械が歩き出し、
 * ステージ選択に入ると模型が観察できる大きさに少し膨らむ(T-01)。
 */

/** 章ごとの台地(模型の中心からの相対位置、m) */
export const PLATEAUS = [0, 1, 2, 3, 4].map((i) => {
  const x = (i - 2) * 0.4;
  const z = i % 2 ? 0.09 : -0.07;
  const r = 0.135 + (i % 3) * 0.01;
  const h = 0.05 + i * 0.03;
  return { chapter: i + 1, x, z, r, h, topY: h + h * 0.45 };
});

const CHAPTER_COLORS = ['#d9b07a', '#c98a4b', '#8b909a', '#80868f', '#767c86'];

export function CourseModel() {
  const hover = useActivity('stageSelect');
  const atScreen = useActivity(null, ['stageSelect'], 3);
  const walk = useMemo(() => ({ current: 0 }), []);
  const grow = useRef<Group>(null);
  const growK = useRef(0);
  const { board, plateaus } = useMemo(build, []);
  const [cx, cy, cz] = COURSE_MODEL.center;
  const p1 = PLATEAUS[0]!;

  useFrame((_, dt) => {
    walk.current = Math.max(hover.current ?? 0, atScreen.current ?? 0);
    const target = useApp.getState().screen === 'stageSelect' ? 1 : 0;
    growK.current = damp(growK.current, target, 3.5, dt);
    const g = grow.current;
    if (g) {
      const s = 1 + 0.2 * growK.current;
      g.scale.set(s, s, s);
    }
  });

  return (
    <group position={[cx, cy, cz]}>
      <mesh geometry={board} material={vcMatte} castShadow receiveShadow />
      <group ref={grow}>
        <mesh geometry={plateaus} material={vcMatte} castShadow receiveShadow />
        {/* 章 1 の台地の上を歩く小さな機械 */}
        <KinematicWalker
          scale={0.01 / 36}
          bounds={{ xMin: p1.x - 0.05, xMax: p1.x + 0.05, z: p1.z }}
          groundY={p1.topY}
          activity={walk}
          rpm={45}
          castShadow={false}
        />
      </group>
    </group>
  );
}

function build() {
  const rnd = seeded(41);
  const W = COURSE_MODEL.width;
  const D = COURSE_MODEL.depth;
  const board: Part[] = [];
  board.push(box([W, 0.04, D], [0, -0.02, 0], PALETTE.woodDark));
  board.push(box([W + 0.04, 0.05, 0.03], [0, -0.015, D / 2 + 0.015], PALETTE.wood));
  board.push(box([W + 0.04, 0.05, 0.03], [0, -0.015, -D / 2 - 0.015], PALETTE.wood));
  // 地面(模型の砂)
  board.push(box([W - 0.06, 0.008, D - 0.06], [0, 0.004, 0], '#b98f62'));
  // 棚受け(壁へ)
  const wallZ = ROOM.zBack + ROOM.wallThickness / 2 - COURSE_MODEL.center[2];
  for (const x of [-W * 0.38, W * 0.38]) {
    board.push(box([0.04, 0.3, 0.04], [x, -0.17, wallZ + 0.02], PALETTE.metalDark));
    board.push(box([0.04, 0.04, D * 0.8], [x, -0.06, wallZ + D * 0.4], PALETTE.metalDark));
    board.push(box([0.03, 0.03, 0.42], [x, -0.17, wallZ + 0.2], PALETTE.metalDark, [-0.62, 0, 0]));
  }
  const parts: Part[] = [];
  PLATEAUS.forEach((p, i) => {
    const col = CHAPTER_COLORS[i]!;
    parts.push(cylinder(p.r * 0.86, p.r, p.h, [p.x, p.h / 2, p.z], col, 6));
    parts.push(
      cylinder(
        p.r * 0.6,
        p.r * 0.72,
        p.h * 0.45,
        [p.x + 0.01, p.h + p.h * 0.225, p.z - 0.01],
        jitterColor(col, rnd, 0.12),
        6,
      ),
    );
    // ステージの杭(章 1・2 は赤い旗つき)
    for (let k = 0; k < 5; k++) {
      const a = (k / 5) * Math.PI * 2 + 0.4;
      const sx = p.x + Math.cos(a) * p.r * 0.72;
      const sz = p.z + Math.sin(a) * p.r * 0.72;
      parts.push(cylinder(0.004, 0.004, 0.05, [sx, p.h + 0.025, sz], PALETTE.woodDark, 4));
      if (i < 2) parts.push(box([0.02, 0.012, 0.002], [sx + 0.01, p.h + 0.044, sz], PALETTE.red));
    }
    // 次の台地への橋
    const next = PLATEAUS[i + 1];
    if (next) {
      const dx = next.x - p.x;
      const dz = next.z - p.z;
      const dy = next.h - p.h;
      const len = Math.hypot(dx, dz) - p.r - next.r + 0.04;
      const mx = p.x + dx / 2;
      const mz = p.z + dz / 2;
      parts.push(
        box(
          [len, 0.008, 0.035],
          [mx, (p.h + next.h) / 2, mz],
          i < 1 ? PALETTE.woodLight : '#8a8a8a',
          [0, -Math.atan2(dz, dx), Math.atan2(dy, Math.hypot(dx, dz))],
        ),
      );
    }
  });
  // 低木と岩の点景
  for (let k = 0; k < 18; k++) {
    const x = (rnd() - 0.5) * (W - 0.15);
    const z = (rnd() - 0.5) * (D - 0.15);
    if (PLATEAUS.some((p) => Math.hypot(p.x - x, p.z - z) < p.r + 0.03)) continue;
    parts.push(
      cylinder(
        0.008,
        0.015,
        0.012 + rnd() * 0.015,
        [x, 0.012, z],
        rnd() > 0.5 ? PALETTE.rust : PALETTE.green,
        5,
      ),
    );
  }
  return { board: mergeParts(board), plateaus: mergeParts(parts) };
}
