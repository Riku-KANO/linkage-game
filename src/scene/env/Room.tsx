import { useMemo } from 'react';
import { ROOM, WINDOW } from '../layout';
import { box, cylinder, jitterColor, mergeParts, seeded, type Part } from './geometry';
import { PALETTE, bulb, darkMetal, glass, vcMatte, vcMetal } from './materials';
import { ModelSlot } from './ModelSlot';

/**
 * 工房の建物:床板・奥と左右の壁・天井と梁・窓枠(開き窓)・壁の小物。
 * 手前(+z)は壁がなく、ドールハウスのように中が見える。
 */
export function Room() {
  const { shell, floor, frame, metal } = useMemo(buildRoom, []);
  return (
    <group>
      <ModelSlot id="room">
        <mesh geometry={floor} material={vcMatte} receiveShadow />
        <mesh geometry={shell} material={vcMatte} castShadow receiveShadow />
        <mesh geometry={frame} material={vcMatte} castShadow receiveShadow />
        <mesh geometry={metal} material={vcMetal} castShadow />
        <WindowPanes />
      </ModelSlot>
      <HangingBulb />
    </group>
  );
}

const T = ROOM.wallThickness;
const H = ROOM.height;
const Z_IN = ROOM.zBack + T / 2;
const Z_OUT = ROOM.zBack - T / 2;

function buildRoom() {
  const rnd = seeded(7);
  // 床板(x 方向に長い板を z に並べる)
  const planks: Part[] = [];
  const pw = 0.19;
  for (let z = Z_IN; z < ROOM.zFront; z += pw) {
    const w = Math.min(pw, ROOM.zFront - z) - 0.006;
    planks.push(
      box([ROOM.xMax - ROOM.xMin, 0.04, w], [0, -0.02, z + w / 2], jitterColor(PALETTE.floor, rnd)),
    );
  }
  // 床下の土台(外から見たときの厚み)
  planks.push(
    box(
      [ROOM.xMax - ROOM.xMin + 2 * T, 0.32, ROOM.zFront - ROOM.zBack + T],
      [0, -0.2, (ROOM.zFront + ROOM.zBack) / 2 - T / 2],
      PALETTE.woodDeep,
    ),
  );
  const floor = mergeParts(planks);

  const shell: Part[] = [];
  const wallW = ROOM.xMax - ROOM.xMin + 2 * T;
  // 奥の壁(窓の穴を残して 4 枚)
  const leftW = WINDOW.xMin - (ROOM.xMin - T);
  const rightW = ROOM.xMax + T - WINDOW.xMax;
  shell.push(
    box([leftW, H, T], [ROOM.xMin - T + leftW / 2, H / 2, ROOM.zBack], PALETTE.plaster),
    box([rightW, H, T], [WINDOW.xMax + rightW / 2, H / 2, ROOM.zBack], PALETTE.plaster),
    box(
      [WINDOW.xMax - WINDOW.xMin, WINDOW.yMin, T],
      [(WINDOW.xMin + WINDOW.xMax) / 2, WINDOW.yMin / 2, ROOM.zBack],
      PALETTE.plaster,
    ),
    box(
      [WINDOW.xMax - WINDOW.xMin, H - WINDOW.yMax, T],
      [(WINDOW.xMin + WINDOW.xMax) / 2, (H + WINDOW.yMax) / 2, ROOM.zBack],
      PALETTE.plaster,
    ),
  );
  // 左右の壁
  const depth = ROOM.zFront - ROOM.zBack + T;
  const zMid = (ROOM.zFront + ROOM.zBack) / 2 - T / 2 + T / 2;
  shell.push(
    box([T, H, depth], [ROOM.xMin - T / 2, H / 2, zMid], PALETTE.plaster),
    box([T, H, depth], [ROOM.xMax + T / 2, H / 2, zMid], PALETTE.plaster),
  );
  // 腰板(壁の下半分の板張り)
  const wain = 0.85;
  shell.push(
    box([ROOM.xMax - ROOM.xMin, wain, 0.03], [0, wain / 2, Z_IN + 0.015], PALETTE.woodDark),
    box([0.03, wain, depth - T], [ROOM.xMin + 0.015, wain / 2, zMid + T / 2], PALETTE.woodDark),
    box([0.03, wain, depth - T], [ROOM.xMax - 0.015, wain / 2, zMid + T / 2], PALETTE.woodDark),
  );
  // 腰板の上の見切り
  shell.push(
    box([ROOM.xMax - ROOM.xMin, 0.04, 0.05], [0, wain, Z_IN + 0.025], PALETTE.wood),
    box([0.05, 0.04, depth - T], [ROOM.xMin + 0.025, wain, zMid + T / 2], PALETTE.wood),
    box([0.05, 0.04, depth - T], [ROOM.xMax - 0.025, wain, zMid + T / 2], PALETTE.wood),
  );
  // 天井と梁
  shell.push(box([wallW, 0.14, depth], [0, H + 0.07, zMid], PALETTE.woodDeep));
  for (const z of [-1.7, 0.6, 2.9]) {
    shell.push(box([ROOM.xMax - ROOM.xMin, 0.2, 0.22], [0, H - 0.1, z], PALETTE.woodDark));
  }
  // 柱(壁の角)
  for (const x of [ROOM.xMin + 0.09, ROOM.xMax - 0.09]) {
    shell.push(box([0.18, H, 0.18], [x, H / 2, Z_IN + 0.09], PALETTE.woodDark));
  }

  // 窓枠そのものは WindowHotspot(サンドボックスのメニュー物体)が持つ
  const frame: Part[] = [];
  // 窓台の上の小物:植木鉢と小さな歯車
  frame.push(
    cylinder(
      0.07,
      0.055,
      0.12,
      [WINDOW.xMin + 0.22, WINDOW.yMin + 0.06, Z_IN + 0.06],
      PALETTE.rust,
      7,
    ),
    cylinder(
      0.012,
      0.012,
      0.18,
      [WINDOW.xMin + 0.22, WINDOW.yMin + 0.2, Z_IN + 0.06],
      PALETTE.green,
      5,
    ),
  );
  // 左の壁の有孔ボードと工具のシルエット
  const pegX = ROOM.xMin + 0.04;
  frame.push(box([0.02, 0.9, 1.6], [pegX, 1.55, -0.6], PALETTE.woodLight));
  const metal: Part[] = [];
  for (let i = 0; i < 6; i++) {
    const z = -1.25 + i * 0.26;
    const len = 0.25 + rnd() * 0.25;
    metal.push(box([0.025, len, 0.035], [pegX + 0.02, 1.6 - len / 4, z], PALETTE.metal));
    metal.push(box([0.03, 0.06, 0.09], [pegX + 0.02, 1.6 + len / 4, z], PALETTE.metalDark));
  }
  // のこぎり
  metal.push(box([0.01, 0.12, 0.5], [pegX + 0.02, 1.2, -0.55], PALETTE.metal));
  frame.push(box([0.03, 0.12, 0.14], [pegX + 0.02, 1.2, -0.25], PALETTE.wood));

  return {
    floor,
    shell: mergeParts(shell),
    frame: mergeParts(frame),
    metal: mergeParts(metal),
  };
}

/** 開き窓のガラス戸。外へ大きく開いていて、カメラが窓を通り抜けられる */
function WindowPanes() {
  const { frameGeo, paneW, paneH } = useMemo(() => {
    const paneW = (WINDOW.xMax - WINDOW.xMin) / 2;
    const paneH = WINDOW.yMax - WINDOW.yMin;
    const f = 0.05;
    // 戸の枠(ヒンジ側が原点、+x へ伸びる)
    const parts: Part[] = [
      box([paneW, f, 0.04], [paneW / 2, paneH / 2 - f / 2, 0], PALETTE.woodDark),
      box([paneW, f, 0.04], [paneW / 2, -paneH / 2 + f / 2, 0], PALETTE.woodDark),
      box([f, paneH, 0.04], [f / 2, 0, 0], PALETTE.woodDark),
      box([f, paneH, 0.04], [paneW - f / 2, 0, 0], PALETTE.woodDark),
      box([paneW, 0.03, 0.03], [paneW / 2, 0, 0], PALETTE.woodDark),
    ];
    return { frameGeo: mergeParts(parts), paneW, paneH };
  }, []);
  const wy = (WINDOW.yMin + WINDOW.yMax) / 2;
  const open = 1.25;
  return (
    <group>
      {/* 左の戸:左端のヒンジで外(−z)へ開く */}
      <group position={[WINDOW.xMin, wy, Z_OUT]} rotation={[0, open, 0]}>
        <mesh geometry={frameGeo} material={vcMatte} castShadow />
        <mesh position={[paneW / 2, 0, 0]} material={glass}>
          <planeGeometry args={[paneW - 0.1, paneH - 0.1]} />
        </mesh>
      </group>
      {/* 右の戸:右端のヒンジで外へ開く */}
      <group position={[WINDOW.xMax, wy, Z_OUT]} rotation={[0, Math.PI - open, 0]}>
        <mesh geometry={frameGeo} material={vcMatte} castShadow />
        <mesh position={[paneW / 2, 0, 0]} material={glass}>
          <planeGeometry args={[paneW - 0.1, paneH - 0.1]} />
        </mesh>
      </group>
    </group>
  );
}

/** 天井から下がる裸電球(暖色の点光源) */
function HangingBulb() {
  const pos: [number, number, number] = [0.3, 2.75, 1.4];
  return (
    <group position={pos}>
      <mesh position={[0, (H - pos[1]) / 2, 0]} material={darkMetal}>
        <cylinderGeometry args={[0.006, 0.006, H - pos[1], 4]} />
      </mesh>
      <mesh position={[0, 0.06, 0]} material={darkMetal}>
        <cylinderGeometry args={[0.03, 0.12, 0.08, 10, 1, true]} />
      </mesh>
      <mesh material={bulb}>
        <sphereGeometry args={[0.035, 10, 8]} />
      </mesh>
      <pointLight color="#ffc480" intensity={5} distance={0} decay={2} position={[0, -0.05, 0]} />
    </group>
  );
}
