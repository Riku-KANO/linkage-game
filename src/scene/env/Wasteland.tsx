import { useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import {
  BufferAttribute,
  Color,
  IcosahedronGeometry,
  InstancedMesh,
  Matrix4,
  PlaneGeometry,
  Quaternion,
  Vector3,
  type Group,
} from 'three';
import { useApp } from '@/app/store';
import { ROOM, TEST_TRACK, WINDMILL } from '../layout';
import { useSceneUi } from '../store';
import { damp } from '../rig/spring';
import { barBetween, box, cylinder, jitterColor, mergeParts, seeded, type Part } from './geometry';
import { PALETTE, darkMetal, vcMatte, vcMetal } from './materials';

/**
 * 窓の外の荒野:起伏のある地面、遠くの台地(メサ)、岩、試走コース、風車。
 * 乱数はシード付き。工房と試走コースの周りは平らにならす。
 */
export function Wasteland() {
  const { ground, mesas, track } = useMemo(buildWasteland, []);
  return (
    <group>
      <mesh geometry={ground} material={vcMatte} receiveShadow />
      <mesh geometry={mesas} material={vcMatte} />
      <mesh geometry={track} material={vcMatte} receiveShadow castShadow />
      <Rocks />
      <Windmill />
    </group>
  );
}

/** 平らにならす範囲:工房から試走コースまでを含む長方形 */
const FLAT = { xMin: -16, xMax: 16, zMin: TEST_TRACK.z - 6, zMax: ROOM.zFront + 3 };

/** 起伏の重み(0 = 平ら、1 = 起伏そのまま)。平らな範囲から離れるほど大きい */
function roughness(x: number, z: number): number {
  const dx = Math.max(0, FLAT.xMin - x, x - FLAT.xMax);
  const dz = Math.max(0, FLAT.zMin - z, z - FLAT.zMax);
  const d = Math.hypot(dx, dz);
  return Math.min(1, Math.max(0, (d - 2) / 30));
}

/** 格子の値ノイズ(シード付き) */
function valueNoise(seed: number) {
  const rnd = seeded(seed);
  const N = 64;
  const grid = Array.from({ length: N * N }, () => rnd());
  const at = (i: number, j: number) => grid[(((i % N) + N) % N) * N + (((j % N) + N) % N)]!;
  return (x: number, y: number) => {
    const i = Math.floor(x);
    const j = Math.floor(y);
    const fx = x - i;
    const fy = y - j;
    const sx = fx * fx * (3 - 2 * fx);
    const sy = fy * fy * (3 - 2 * fy);
    const a = at(i, j) + (at(i + 1, j) - at(i, j)) * sx;
    const b = at(i, j + 1) + (at(i + 1, j + 1) - at(i, j + 1)) * sx;
    return a + (b - a) * sy;
  };
}

function buildWasteland() {
  const noise = valueNoise(11);
  const size = 420;
  const seg = 84;
  const g = new PlaneGeometry(size, size, seg, seg);
  g.rotateX(-Math.PI / 2);
  const pos = g.getAttribute('position');
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i);
    const z = pos.getZ(i);
    const n = noise(x / 22, z / 22) * 0.7 + noise(x / 7 + 50, z / 7) * 0.3;
    const w = roughness(x, z);
    pos.setY(i, -0.03 + (n - 0.35) * 9 * w);
  }
  const ground = g.toNonIndexed();
  g.dispose();
  ground.computeVertexNormals();
  // 高さで塗り分け(面ごとに一色)
  const p = ground.getAttribute('position');
  const colors = new Float32Array(p.count * 3);
  const rnd = seeded(5);
  const sand = new Color(PALETTE.sand);
  const ochre = new Color(PALETTE.ochre);
  const rust = new Color(PALETTE.rust);
  const c = new Color();
  for (let f = 0; f < p.count; f += 3) {
    const y = (p.getY(f) + p.getY(f + 1) + p.getY(f + 2)) / 3;
    const k = Math.min(1, Math.max(0, y / 4));
    c.copy(sand)
      .lerp(ochre, Math.min(1, k * 1.6))
      .lerp(rust, Math.max(0, k - 0.5));
    c.multiplyScalar(0.92 + rnd() * 0.12);
    for (let v = 0; v < 3; v++) {
      colors[(f + v) * 3] = c.r;
      colors[(f + v) * 3 + 1] = c.g;
      colors[(f + v) * 3 + 2] = c.b;
    }
  }
  ground.setAttribute('color', new BufferAttribute(colors, 3));
  ground.deleteAttribute('uv');

  // 遠くの台地(段になったメサ)
  const mesaParts: Part[] = [];
  const mr = seeded(23);
  const mesaSpots: [number, number][] = [
    [-60, -70],
    [-25, -95],
    [15, -80],
    [55, -110],
    [85, -60],
    [-95, -40],
    [-40, -130],
    [100, 20],
    [-110, 40],
  ];
  for (const [x, z] of mesaSpots) {
    const r = 6 + mr() * 9;
    const h = 7 + mr() * 14;
    const col = jitterColor(PALETTE.mesa, mr, 0.15);
    mesaParts.push(cylinder(r * 0.82, r, h, [x, h / 2 - 0.5, z], col, 7));
    mesaParts.push(
      cylinder(
        r * 0.55,
        r * 0.7,
        h * 0.35,
        [x + r * 0.1, h + h * 0.17, z],
        jitterColor(col, mr),
        6,
      ),
    );
    mesaParts.push(
      cylinder(r * 1.4, r * 1.25, 1.2, [x, 0.1, z], jitterColor(PALETTE.ochre, mr, 0.1), 8),
    );
  }

  // 試走コース:固めた土の帯、スタートとゴールの線、距離の杭、旗
  const t: Part[] = [];
  const len = TEST_TRACK.xGoal - TEST_TRACK.xStart + 6;
  const cx = (TEST_TRACK.xGoal + TEST_TRACK.xStart) / 2;
  t.push(box([len, 0.06, TEST_TRACK.width], [cx, 0.0, TEST_TRACK.z], '#a77b52'));
  t.push(box([len, 0.08, 0.12], [cx, 0.01, TEST_TRACK.z - TEST_TRACK.width / 2], PALETTE.woodDark));
  t.push(box([len, 0.08, 0.12], [cx, 0.01, TEST_TRACK.z + TEST_TRACK.width / 2], PALETTE.woodDark));
  t.push(box([0.12, 0.065, TEST_TRACK.width], [TEST_TRACK.xStart, 0.003, TEST_TRACK.z], '#e8dcc0'));
  // ゴールは市松
  for (let i = 0; i < 8; i++) {
    for (let j = 0; j < 2; j++) {
      const w = TEST_TRACK.width / 8;
      t.push(
        box(
          [0.2, 0.066, w],
          [
            TEST_TRACK.xGoal + (j - 0.5) * 0.2,
            0.004,
            TEST_TRACK.z - TEST_TRACK.width / 2 + w * (i + 0.5),
          ],
          (i + j) % 2 ? '#2b2118' : '#efe6d2',
        ),
      );
    }
  }
  for (let x = TEST_TRACK.xStart; x <= TEST_TRACK.xGoal; x += 2) {
    t.push(
      box([0.06, 0.3, 0.06], [x, 0.15, TEST_TRACK.z + TEST_TRACK.width / 2 + 0.2], PALETTE.wood),
    );
  }
  for (const side of [-1, 1]) {
    const z = TEST_TRACK.z + side * (TEST_TRACK.width / 2 + 0.25);
    t.push(cylinder(0.03, 0.03, 1.6, [TEST_TRACK.xGoal, 0.8, z], PALETTE.metal, 6));
    t.push(box([0.5, 0.32, 0.02], [TEST_TRACK.xGoal + 0.25, 1.42, z], PALETTE.red));
  }
  return { ground, mesas: mergeParts(mesaParts), track: mergeParts(t) };
}

/** 散らばった岩(インスタンス) */
function Rocks() {
  const mesh = useMemo(() => {
    const geo = new IcosahedronGeometry(1, 0);
    geo.deleteAttribute('uv');
    const n = 70;
    const m = new InstancedMesh(geo, vcMatteSolid, n);
    const rnd = seeded(31);
    const mat = new Matrix4();
    const q = new Quaternion();
    const p = new Vector3();
    const s = new Vector3();
    const c = new Color();
    let k = 0;
    while (k < n) {
      const x = (rnd() - 0.5) * 140;
      const z = -4 - rnd() * 90;
      // コースと窓の前は避ける
      if (Math.abs(z - TEST_TRACK.z) < 3.5 && Math.abs(x) < 13) continue;
      if (z > -7 && Math.abs(x + 1.8) < 4) continue;
      const r = 0.15 + rnd() ** 2 * 1.2;
      p.set(x, r * 0.3, z);
      q.setFromAxisAngle(new Vector3(rnd(), rnd(), rnd()).normalize(), rnd() * Math.PI);
      s.set(r * (0.8 + rnd() * 0.6), r * (0.5 + rnd() * 0.4), r * (0.8 + rnd() * 0.6));
      m.setMatrixAt(k, mat.compose(p, q, s));
      m.setColorAt(k, c.set(PALETTE.rust).multiplyScalar(0.75 + rnd() * 0.4));
      k++;
    }
    m.castShadow = true;
    m.receiveShadow = true;
    return m;
  }, []);
  return <primitive object={mesh} />;
}

const vcMatteSolid = vcMatte.clone();
vcMatteSolid.vertexColors = false;

/**
 * 窓の外の風車(多翼の揚水風車)。ふだんはゆっくり回り、
 * 窓(サンドボックス)にマウスを乗せる・サンドボックスにいるときは勢いよく回る。
 */
function Windmill() {
  const rotor = useRef<Group>(null);
  const speed = useRef(0.6);
  const { tower, blades } = useMemo(() => {
    const h = 5.2;
    const parts: Part[] = [];
    const legs: [number, number][] = [
      [-0.9, -0.9],
      [0.9, -0.9],
      [0.9, 0.9],
      [-0.9, 0.9],
    ];
    for (const [x, z] of legs) {
      parts.push(barBetween([x, 0, z], [x * 0.18, h, z * 0.18], 0.07, 0.07, PALETTE.metalDark));
    }
    for (const y of [1.3, 2.6, 3.9]) {
      const k = 1 - (y / h) * 0.82;
      for (let i = 0; i < 4; i++) {
        const a = legs[i]!;
        const b = legs[(i + 1) % 4]!;
        parts.push(
          barBetween([a[0] * k, y, a[1] * k], [b[0] * k, y, b[1] * k], 0.04, 0.04, PALETTE.metal),
        );
      }
    }
    parts.push(box([0.6, 0.08, 0.6], [0, h, 0], PALETTE.woodDark));
    parts.push(box([0.18, 0.18, 0.9], [0, h + 0.2, -0.1], PALETTE.metalDark));
    // 尾翼
    parts.push(box([0.03, 0.7, 1.0], [0, h + 0.25, -0.95], PALETTE.red));
    // 水槽
    parts.push(cylinder(0.9, 0.9, 0.8, [2.0, 0.4, 0.6], PALETTE.woodDark, 10));
    const bladeParts: Part[] = [];
    const n = 14;
    for (let i = 0; i < n; i++) {
      const a = (i / n) * Math.PI * 2;
      bladeParts.push(
        box([0.16, 1.05, 0.02], [Math.cos(a) * 0.72, Math.sin(a) * 0.72, 0], PALETTE.metal, [
          0,
          0,
          a - Math.PI / 2,
        ]),
      );
    }
    bladeParts.push(
      cylinder(0.12, 0.12, 0.14, [0, 0, 0], PALETTE.metalDark, 8, [Math.PI / 2, 0, 0]),
    );
    // 外輪
    for (let i = 0; i < 16; i++) {
      const a0 = (i / 16) * Math.PI * 2;
      const a1 = ((i + 1) / 16) * Math.PI * 2;
      bladeParts.push(
        barBetween(
          [Math.cos(a0) * 1.25, Math.sin(a0) * 1.25, 0],
          [Math.cos(a1) * 1.25, Math.sin(a1) * 1.25, 0],
          0.03,
          0.03,
          PALETTE.metalDark,
        ),
      );
    }
    return { tower: mergeParts(parts), blades: mergeParts(bladeParts) };
  }, []);

  useFrame((_, dt) => {
    const hovered = useSceneUi.getState().hovered === 'sandbox';
    const screen = useApp.getState().screen;
    const target = hovered || screen === 'sandbox' ? 5 : 0.6;
    speed.current = damp(speed.current, target, 2, dt);
    if (rotor.current) rotor.current.rotation.z -= speed.current * dt;
  });

  return (
    <group position={WINDMILL.position} rotation={[0, 0.7, 0]}>
      <mesh geometry={tower} material={vcMetal} castShadow />
      <group ref={rotor} position={[0, 5.4, 0.45]}>
        <mesh geometry={blades} material={vcMetal} castShadow />
      </group>
      <mesh position={[0, 5.4, 0.36]} material={darkMetal}>
        <cylinderGeometry args={[0.05, 0.05, 0.2, 6]} />
      </mesh>
    </group>
  );
}
