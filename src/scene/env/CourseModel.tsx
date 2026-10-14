import { useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import type { Group } from 'three';
import { COURSE_MODEL, ROOM } from '../layout';
import { damp } from '../rig/spring';
import { useApp } from '@/app/store';
import { CourseDiorama } from '../world/CourseDiorama';
import { MODEL_GROW } from '../world/diorama';
import { box, mergeParts, type Part } from './geometry';
import { PALETTE, vcMatte } from './materials';

/**
 * 壁のコース模型(ステージ選択)。奥の壁に棚受けで取り付けた板の上に、章ごとの台地のジオラマ
 * (world/CourseDiorama:ステージの目印と、小道を歩く自分の機械)。
 * ステージ選択に入ると模型が観察できる大きさに少し膨らむ(T-01)。
 */
export function CourseModel() {
  const grow = useRef<Group>(null);
  const growK = useRef(0);
  const board = useMemo(buildBoard, []);
  const [cx, cy, cz] = COURSE_MODEL.center;

  useFrame((_, dt) => {
    const target = useApp.getState().screen === 'stageSelect' ? 1 : 0;
    growK.current = damp(growK.current, target, 3.5, dt);
    const g = grow.current;
    if (g) {
      const s = 1 + (MODEL_GROW - 1) * growK.current;
      g.scale.set(s, s, s);
    }
  });

  return (
    <group position={[cx, cy, cz]}>
      <mesh geometry={board} material={vcMatte} castShadow receiveShadow />
      <group ref={grow}>
        <CourseDiorama />
      </group>
    </group>
  );
}

function buildBoard() {
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
  return mergeParts(board);
}
