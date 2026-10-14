import { useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import type { Group, Mesh } from 'three';
import { TOOLBOX } from '../layout';
import { useActivity } from '../home/activity';
import { box, cylinder, mergeParts, type Part } from './geometry';
import { PALETTE, steel, vcMatte, vcMetal } from './materials';

/**
 * 工具箱(設定)。上段の 2 つのトレイが平行リンク(両てこの平行四辺形)で前後へ開く
 * カンチレバー式。ホバーで少し開き、設定画面では大きく開く(T-08)。
 */
const BW = 0.52;
const BH = 0.2;
const BD = 0.26;
const LINK = 0.11;
/** リンクの付け根(箱の側面、上端近く)。トレイの前後で ±z */
const PIVOT_Y = BH - 0.035;
const PIVOT_Z = 0.035;
/** 閉じたときのリンクの角度(+y から外側へ、rad) */
const CLOSED = 0.35;
const OPENED = 1.75;

export function Toolbox() {
  const act = useActivity('settings');
  const open = useActivity(null, ['settings'], 3);
  const { base, tray } = useMemo(build, []);
  const trays = [useRef<Group>(null), useRef<Group>(null)];
  const links = [
    useRef<Mesh>(null),
    useRef<Mesh>(null),
    useRef<Mesh>(null),
    useRef<Mesh>(null),
    useRef<Mesh>(null),
    useRef<Mesh>(null),
    useRef<Mesh>(null),
    useRef<Mesh>(null),
  ];

  useFrame(() => {
    const k = Math.max((act.current ?? 0) * 0.45, open.current ?? 0);
    const ang = CLOSED + (OPENED - CLOSED) * k;
    for (let side = 0; side < 2; side++) {
      // side 0 = 前(+z)、1 = 奥(−z)
      const s = side === 0 ? 1 : -1;
      const pz = s * PIVOT_Z;
      // 平行四辺形:2 本のリンクが同じ角度で回るので、トレイは水平のまま弧を描く
      const ty = PIVOT_Y + Math.cos(ang) * LINK;
      const tz = pz + s * Math.sin(ang) * LINK;
      const tr = trays[side]!.current;
      if (tr) tr.position.set(0, ty - 0.02, tz - s * 0.01);
      for (let lx = 0; lx < 2; lx++) {
        for (let pair = 0; pair < 2; pair++) {
          const m = links[side * 4 + lx * 2 + pair]!.current;
          if (!m) continue;
          const x = (lx === 0 ? -1 : 1) * (BW / 2 + 0.008);
          const off = pair * 0.06 * s;
          m.position.set(
            x,
            PIVOT_Y + (Math.cos(ang) * LINK) / 2,
            pz + off + (s * Math.sin(ang) * LINK) / 2,
          );
          m.rotation.set(s * ang, 0, 0);
        }
      }
    }
  });

  return (
    <group position={TOOLBOX.center} rotation={[0, TOOLBOX.rotationY, 0]}>
      <mesh geometry={base} material={vcMetal} castShadow receiveShadow />
      {trays.map((r, i) => (
        <group key={i} ref={r}>
          <mesh geometry={tray} material={vcMetal} castShadow receiveShadow />
        </group>
      ))}
      {links.map((r, i) => (
        <mesh key={i} ref={r} material={steel} castShadow>
          <boxGeometry args={[0.008, LINK + 0.02, 0.016]} />
        </mesh>
      ))}
      <mesh
        geometry={wrench}
        position={[-0.42, 0.006, 0.1]}
        rotation={[-Math.PI / 2, 0, 0.6]}
        material={vcMatte}
        castShadow
      />
    </group>
  );
}

const wrench = mergeParts([
  box([0.02, 0.22, 0.008], [0, 0, 0], PALETTE.metal),
  box([0.05, 0.035, 0.008], [0, 0.12, 0], PALETTE.metal),
  box([0.04, 0.03, 0.008], [0, -0.11, 0], PALETTE.metal),
]);

function build() {
  const base: Part[] = [
    box([BW, BH, BD], [0, BH / 2, 0], PALETTE.red),
    box([BW + 0.01, 0.015, BD + 0.01], [0, BH - 0.01, 0], '#8e3022'),
    box([BW + 0.01, 0.02, BD + 0.01], [0, 0.01, 0], PALETTE.metalDark),
    // 側面の取っ手
    cylinder(0.01, 0.01, 0.12, [-(BW / 2 + 0.03), BH * 0.7, 0], PALETTE.metalDark, 6, [
      Math.PI / 2,
      0,
      0,
    ]),
    cylinder(0.01, 0.01, 0.12, [BW / 2 + 0.03, BH * 0.7, 0], PALETTE.metalDark, 6, [
      Math.PI / 2,
      0,
      0,
    ]),
    // 中身(ドライバーの柄)
    cylinder(0.012, 0.012, 0.1, [-0.12, BH + 0.02, 0.02], '#e0b23c', 6, [0.3, 0, 0]),
    cylinder(0.012, 0.012, 0.1, [-0.08, BH + 0.02, -0.03], '#3d6a9a', 6, [-0.3, 0, 0]),
  ];
  const tray: Part[] = [
    box([BW - 0.02, 0.012, 0.11], [0, -0.03, 0], PALETTE.red),
    box([BW - 0.02, 0.06, 0.01], [0, 0, 0.05], PALETTE.red),
    box([BW - 0.02, 0.06, 0.01], [0, 0, -0.05], PALETTE.red),
    box([0.01, 0.06, 0.11], [-(BW - 0.02) / 2, 0, 0], PALETTE.red),
    box([0.01, 0.06, 0.11], [(BW - 0.02) / 2, 0, 0], PALETTE.red),
    box([0.06, 0.02, 0.03], [-0.15, -0.015, 0], PALETTE.metal),
    box([0.04, 0.03, 0.03], [0.05, -0.01, 0.01], PALETTE.brass),
    box([0.1, 0.012, 0.02], [0.17, -0.018, -0.01], PALETTE.metalDark),
  ];
  return { base: mergeParts(base), tray: mergeParts(tray) };
}
