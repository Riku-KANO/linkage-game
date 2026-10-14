import { useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import {
  BoxGeometry,
  Color,
  InstancedMesh,
  Matrix4,
  Quaternion,
  Vector3,
  type Group,
  type Mesh,
} from 'three';
import { chebyshevLambda, fourBar } from '@/core/model/presets';
import { SHELF } from '../layout';
import { useActivity } from '../home/activity';
import { LinkageToy } from '../walker/LinkageToy';
import { box, mergeParts, seeded, type Part } from './geometry';
import { PALETTE, brass, steel, vcMatte } from './materials';
import { ModelSlot } from './ModelSlot';

/**
 * 右の壁際の棚(機構図鑑)。本と、小さなリンク機構の模型。下段の引き出しはシザーリンクで開く。
 * ホバーで模型が回り出し引き出しが少し開く。図鑑の画面では大きく開く(T-08「扉が開く」)。
 * 棚の正面はローカルの +z(ワールドでは −x、部屋の内側)。
 */
const W = SHELF.width;
const D = SHELF.depth;
const H = SHELF.height;
const BOARDS = [0.44, 0.88, 1.32, 1.76];

export function Shelf() {
  const act = useActivity('zukan', ['zukan']);
  const open = useActivity(null, ['zukan'], 3);
  const frame = useMemo(buildFrame, []);
  const books = useMemo(buildBooks, []);
  const toys = useMemo(() => ({ fourBar: fourBar(), lambda: chebyshevLambda() }), []);
  const drawer = useRef<Group>(null);
  const scissorA = useRef<Mesh>(null);
  const scissorB = useRef<Mesh>(null);

  useFrame(() => {
    const k = Math.max((act.current ?? 0) * 0.35, open.current ?? 0);
    const ext = 0.02 + 0.26 * k;
    if (drawer.current) drawer.current.position.z = ext;
    // シザーリンク:引き出しの側面で X 字に交差した 2 本の棒。伸びると寝る
    const span = 0.12 + ext;
    const ang = Math.atan2(0.12, span);
    const len = Math.hypot(span, 0.12);
    for (const [m, s] of [
      [scissorA.current, 1],
      [scissorB.current, -1],
    ] as const) {
      if (!m) continue;
      m.position.set(W / 2 - 0.05, 0.22, D / 2 - 0.12 + span / 2);
      m.rotation.set(s * ang, 0, 0);
      m.scale.set(1, 1, len);
    }
  });

  return (
    <group position={SHELF.center} rotation={[0, -Math.PI / 2, 0]}>
      <ModelSlot id="shelf">
        <mesh geometry={frame} material={vcMatte} castShadow receiveShadow />
        <primitive object={books} />
      </ModelSlot>
      {/* 引き出し */}
      <group ref={drawer}>
        <mesh
          geometry={drawerGeo}
          position={[0, 0.22, D / 2 - 0.19]}
          material={vcMatte}
          castShadow
        />
        <mesh position={[0, 0.3, D / 2 + 0.02]} material={brass}>
          <boxGeometry args={[0.16, 0.025, 0.025]} />
        </mesh>
      </group>
      <mesh ref={scissorA} material={steel} castShadow>
        <boxGeometry args={[0.012, 0.012, 1]} />
      </mesh>
      <mesh ref={scissorB} material={steel} castShadow>
        <boxGeometry args={[0.012, 0.012, 1]} />
      </mesh>
      {/* 模型:四節リンク(3 段目)とチェビシェフのラムダ機構(2 段目) */}
      <group position={[W * 0.22, BOARDS[2]! + 0.16, D * 0.15]}>
        <mesh position={[0.05, -0.14, -0.02]} material={vcMatte}>
          <boxGeometry args={[0.24, 0.03, 0.12]} />
        </mesh>
        <LinkageToy design={toys.fourBar} scale={0.0035} activity={act} rpm={40} idleRpm={0} />
      </group>
      <group position={[-W * 0.3, BOARDS[1]! + 0.2, D * 0.12]}>
        <mesh position={[0.05, -0.19, -0.02]} material={vcMatte}>
          <boxGeometry args={[0.2, 0.03, 0.12]} />
        </mesh>
        <LinkageToy
          design={toys.lambda}
          scale={0.0045}
          activity={act}
          rpm={35}
          idleRpm={0}
          barMaterial={steel}
        />
      </group>
    </group>
  );
}

const drawerGeo = (() => {
  const g = mergeParts([
    box([W - 0.08, 0.34, 0.03], [0, 0, 0.19], PALETTE.wood),
    box([W - 0.12, 0.02, D - 0.06], [0, -0.15, 0], PALETTE.woodDark),
    box([0.02, 0.28, D - 0.06], [-(W - 0.14) / 2, -0.03, 0], PALETTE.woodDark),
    box([0.02, 0.28, D - 0.06], [(W - 0.14) / 2, -0.03, 0], PALETTE.woodDark),
  ]);
  return g;
})();

function buildFrame() {
  const parts: Part[] = [];
  const t = 0.03;
  parts.push(box([t, H, D], [-W / 2 + t / 2, H / 2, 0], PALETTE.wood));
  parts.push(box([t, H, D], [W / 2 - t / 2, H / 2, 0], PALETTE.wood));
  parts.push(box([W, t, D + 0.02], [0, H - t / 2, 0.01], PALETTE.wood));
  parts.push(box([W - 2 * t, H, 0.015], [0, H / 2, -D / 2 + 0.0075], PALETTE.woodDark));
  for (const y of BOARDS)
    parts.push(box([W - 2 * t, 0.025, D - 0.02], [0, y, 0.01], PALETTE.woodLight));
  parts.push(box([W, 0.06, D], [0, 0.03, 0], PALETTE.woodDeep));
  return mergeParts(parts);
}

function buildBooks(): InstancedMesh {
  const rnd = seeded(77);
  const colors = [
    '#7a3b2e',
    '#2f4f6f',
    '#6b6b3a',
    '#8a5a2b',
    '#3e5a4a',
    '#9a7b4f',
    '#5a3a5a',
    '#b0a080',
  ];
  const items: {
    x: number;
    y: number;
    w: number;
    h: number;
    d: number;
    tilt: number;
    c: string;
  }[] = [];
  // 段ごとに本を並べる範囲(模型を置く所は空ける)
  const rows: [number, number, number][] = [
    [BOARDS[1]!, -W * 0.14, W / 2 - 0.05],
    [BOARDS[2]!, -W / 2 + 0.05, W * 0.06],
    [BOARDS[3]!, -W / 2 + 0.05, W / 2 - 0.05],
  ];
  for (const [base, from, to] of rows) {
    let x = from;
    while (x < to - 0.03) {
      const w = 0.022 + rnd() * 0.03;
      const h = 0.18 + rnd() * 0.17;
      if (rnd() < 0.07) {
        x += 0.05;
        continue;
      }
      items.push({
        x: x + w / 2,
        y: base + 0.0125 + h / 2,
        w,
        h,
        d: 0.15 + rnd() * 0.08,
        tilt: rnd() < 0.08 ? 0.16 : 0,
        c: colors[Math.floor(rnd() * colors.length)]!,
      });
      x += w + 0.003;
    }
  }
  const mesh = new InstancedMesh(new BoxGeometry(1, 1, 1), bookMat, items.length);
  const m = new Matrix4();
  const q = new Quaternion();
  const c = new Color();
  items.forEach((b, i) => {
    q.setFromAxisAngle(new Vector3(0, 0, 1), b.tilt);
    m.compose(new Vector3(b.x, b.y, -D / 2 + 0.02 + b.d / 2), q, new Vector3(b.w, b.h, b.d));
    mesh.setMatrixAt(i, m);
    mesh.setColorAt(i, c.set(b.c));
  });
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  return mesh;
}

const bookMat = vcMatte.clone();
bookMat.vertexColors = false;
