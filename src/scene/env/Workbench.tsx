import { useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import { MeshStandardMaterial, type Group, type Mesh } from 'three';
import { BENCH, DESK_LAMP, DRAFTER_BASE, PAPER_WORLD } from '../layout';
import { useActivity } from '../home/activity';
import { barBetween, box, cylinder, jitterColor, mergeParts, seeded, type Part } from './geometry';
import { PALETTE, brass, bulb, darkMetal, steel, vcMatte, vcMetal } from './materials';
import { createPaperTexture } from './paperTexture';

/**
 * 作業台(「続きから」)。天板の上に製図用紙・製図機械(ドラフター)・卓上ライト・小物。
 * 設計画面ではこの紙を真上から見下ろす。ホバーするとドラフターの腕が紙の上を動き出す。
 */
export function Workbench() {
  const { body, props, metal } = useMemo(buildBench, []);
  const paperMat = useMemo(() => {
    const map = createPaperTexture();
    return new MeshStandardMaterial({
      color: map ? '#ffffff' : PALETTE.paper,
      map,
      roughness: 0.92,
      metalness: 0,
    });
  }, []);
  return (
    <group>
      <mesh geometry={body} material={vcMatte} castShadow receiveShadow />
      <mesh geometry={props} material={vcMatte} castShadow receiveShadow />
      <mesh geometry={metal} material={vcMetal} castShadow receiveShadow />
      <mesh
        position={PAPER_WORLD.center}
        rotation={[-Math.PI / 2, 0, 0]}
        material={paperMat}
        receiveShadow
      >
        <planeGeometry args={[PAPER_WORLD.width, PAPER_WORLD.height]} />
      </mesh>
      <Drafter />
      <DeskLamp />
    </group>
  );
}

function buildBench() {
  const rnd = seeded(3);
  const [cx, , cz] = BENCH.center;
  const top = BENCH.top;
  const hw = BENCH.width / 2;
  const hd = BENCH.depth / 2;
  const body: Part[] = [];
  // 天板(3 枚の板)
  const boards = 3;
  for (let i = 0; i < boards; i++) {
    const d = BENCH.depth / boards;
    body.push(
      box(
        [BENCH.width, 0.06, d - 0.004],
        [cx, top - 0.03, cz - hd + d * (i + 0.5)],
        jitterColor(PALETTE.woodLight, rnd, 0.1),
      ),
    );
  }
  // 脚・幕板・下の棚
  for (const sx of [-1, 1]) {
    for (const sz of [-1, 1]) {
      body.push(
        box(
          [0.08, top - 0.06, 0.08],
          [cx + sx * (hw - 0.1), (top - 0.06) / 2, cz + sz * (hd - 0.08)],
          PALETTE.wood,
        ),
      );
    }
    body.push(
      box([0.04, 0.1, BENCH.depth - 0.16], [cx + sx * (hw - 0.1), top - 0.11, cz], PALETTE.wood),
    );
  }
  for (const sz of [-1, 1]) {
    body.push(
      box([BENCH.width - 0.2, 0.1, 0.04], [cx, top - 0.11, cz + sz * (hd - 0.08)], PALETTE.wood),
    );
  }
  body.push(box([BENCH.width - 0.24, 0.03, BENCH.depth - 0.2], [cx, 0.2, cz], PALETTE.woodDark));
  // 下の棚の木箱
  body.push(box([0.42, 0.26, 0.34], [cx - 0.6, 0.345, cz + 0.05], PALETTE.wood));
  body.push(
    box([0.3, 0.18, 0.3], [cx + 0.55, 0.305, cz - 0.05], jitterColor(PALETTE.woodLight, rnd)),
  );

  // 小物:定規、鉛筆、消しゴム、マグカップ、テープ
  const props: Part[] = [];
  const y = top;
  props.push(box([0.5, 0.004, 0.035], [-0.15, y + 0.002, -0.47], '#e8d9a8', [0, 0.12, 0]));
  for (let i = 0; i < 3; i++) {
    props.push(
      cylinder(
        0.0045,
        0.0045,
        0.17,
        [-0.02 + i * 0.03, y + 0.005, -0.55 + i * 0.012],
        ['#c94f3a', '#3d6a9a', '#e0b23c'][i]!,
        6,
        [0, 0.3 + i * 0.2, Math.PI / 2],
      ),
    );
  }
  props.push(box([0.05, 0.015, 0.025], [-0.08, y + 0.0075, -0.62], '#d98e9a', [0, 0.4, 0]));
  props.push(cylinder(0.045, 0.04, 0.1, [-0.05, y + 0.05, -1.3], '#d8cdb8', 10));
  props.push(cylinder(0.038, 0.038, 0.004, [-0.05, y + 0.1, -1.3], '#3a2416', 10));
  // 用紙の四隅のマスキングテープ
  const [px, , pz] = PAPER_WORLD.center;
  for (const sx of [-1, 1]) {
    for (const sz of [-1, 1]) {
      props.push(
        box(
          [0.05, 0.002, 0.022],
          [
            px + sx * (PAPER_WORLD.width / 2 - 0.004),
            y + 0.0025,
            pz + sz * (PAPER_WORLD.height / 2 - 0.004),
          ],
          '#e9d98f',
          [0, sx * sz * 0.785, 0],
        ),
      );
    }
  }
  // 万力(右手前)と小さな歯車
  const metal: Part[] = [];
  metal.push(box([0.16, 0.08, 0.12], [0.95, y + 0.04, -0.47], PALETTE.blue));
  metal.push(box([0.16, 0.07, 0.03], [0.95, y + 0.045, -0.38], PALETTE.blue));
  metal.push(
    cylinder(0.008, 0.008, 0.2, [0.95, y + 0.04, -0.33], PALETTE.metal, 6, [Math.PI / 2, 0, 0]),
  );
  metal.push(cylinder(0.05, 0.05, 0.012, [0.62, y + 0.006, -0.5], PALETTE.brass, 12));
  for (let i = 0; i < 12; i++) {
    const a = (i / 12) * Math.PI * 2;
    metal.push(
      box(
        [0.018, 0.012, 0.014],
        [0.62 + Math.cos(a) * 0.055, y + 0.006, -0.5 + Math.sin(a) * 0.055],
        PALETTE.brass,
        [0, -a, 0],
      ),
    );
  }
  return { body: mergeParts(body), props: mergeParts(props), metal: mergeParts(metal) };
}

/** 製図機械:2 本の平行リンクの腕で、定規の向きを保ったまま紙の上を動く */
function Drafter() {
  const activity = useActivity('continue');
  const arm1 = useRef<Mesh>(null);
  const arm1b = useRef<Mesh>(null);
  const arm2 = useRef<Mesh>(null);
  const arm2b = useRef<Mesh>(null);
  const elbow = useRef<Mesh>(null);
  const head = useRef<Group>(null);
  const time = useRef(0);
  const L = 0.45;
  const Y = BENCH.top + 0.03;
  const [bx, , bz] = DRAFTER_BASE;
  // 休ませる位置:紙の左下の外(定規も紙に掛からない)
  const rest = { x: -1.06, z: -0.5 };

  useFrame((_, dt) => {
    const a = activity.current ?? 0;
    time.current += dt * a;
    const t = time.current;
    const px = -0.6 + 0.2 * Math.sin(t * 0.9);
    const pz = -0.95 + 0.12 * Math.sin(t * 1.4 + 0.6);
    const hx = rest.x + (px - rest.x) * a;
    const hz = rest.z + (pz - rest.z) * a;
    // 逆運動学:肘は紙から離れる側(左)
    const dx = hx - bx;
    const dz = hz - bz;
    const d = Math.min(Math.hypot(dx, dz), 2 * L - 1e-4);
    const ux = dx / (Math.hypot(dx, dz) || 1);
    const uz = dz / (Math.hypot(dx, dz) || 1);
    const along = d / 2;
    const h = Math.sqrt(Math.max(0, L * L - along * along));
    const ex = bx + ux * along - uz * h;
    const ez = bz + uz * along + ux * h;
    placeBar(arm1.current, bx, bz, ex, ez, Y);
    placeBar(arm1b.current, bx, bz, ex, ez, Y + 0.022);
    placeBar(arm2.current, ex, ez, hx, hz, Y + 0.008);
    placeBar(arm2b.current, ex, ez, hx, hz, Y + 0.03);
    elbow.current?.position.set(ex, Y + 0.015, ez);
    head.current?.position.set(hx, Y - 0.012, hz);
  });

  return (
    <group>
      <mesh position={[bx, BENCH.top + 0.03, bz]} material={darkMetal} castShadow>
        <boxGeometry args={[0.08, 0.06, 0.1]} />
      </mesh>
      {[arm1, arm1b, arm2, arm2b].map((r, i) => (
        <mesh key={i} ref={r} material={i % 2 ? steel : brass} castShadow>
          <boxGeometry args={[1, 0.008, 0.018]} />
        </mesh>
      ))}
      <mesh ref={elbow} material={darkMetal}>
        <cylinderGeometry args={[0.016, 0.016, 0.05, 8]} />
      </mesh>
      {/* 定規の付いた頭:向きは常に x・z 軸に平行 */}
      <group ref={head}>
        <mesh material={brass} castShadow>
          <cylinderGeometry args={[0.04, 0.04, 0.012, 12]} />
        </mesh>
        <mesh position={[0.17, -0.004, 0.03]} material={vcMatteRuler} castShadow>
          <boxGeometry args={[0.3, 0.004, 0.03]} />
        </mesh>
        <mesh position={[0.03, -0.004, 0.13]} material={vcMatteRuler} castShadow>
          <boxGeometry args={[0.03, 0.004, 0.22]} />
        </mesh>
      </group>
    </group>
  );
}

const vcMatteRuler = new MeshStandardMaterial({ color: '#e8dca8', roughness: 0.6 });

function placeBar(m: Mesh | null, ax: number, az: number, bx: number, bz: number, y: number) {
  if (!m) return;
  const dx = bx - ax;
  const dz = bz - az;
  m.position.set((ax + bx) / 2, y, (az + bz) / 2);
  m.rotation.set(0, Math.atan2(-dz, dx), 0);
  m.scale.set(Math.hypot(dx, dz) + 0.02, 1, 1);
}

/** 卓上ライト:2 本の腕(これもリンク)と笠、暖色の点光源 */
function DeskLamp() {
  const geo = useMemo(() => {
    const [bx, by, bz] = DESK_LAMP.base;
    const [hx, hy, hz] = DESK_LAMP.head;
    const shoulder: [number, number, number] = [bx, by + 0.05, bz];
    const elbow: [number, number, number] = [bx - 0.1, by + 0.58, bz - 0.02];
    const parts: Part[] = [
      cylinder(0.09, 0.1, 0.03, [bx, by + 0.015, bz], PALETTE.metalDark, 12),
      cylinder(0.02, 0.02, 0.05, shoulder, PALETTE.metalDark, 8),
      barBetween(shoulder, elbow, 0.018, 0.012, PALETTE.red),
      barBetween(
        [shoulder[0], shoulder[1], shoulder[2] + 0.025],
        [elbow[0], elbow[1], elbow[2] + 0.025],
        0.01,
        0.008,
        PALETTE.metal,
      ),
      barBetween(elbow, [hx, hy, hz], 0.018, 0.012, PALETTE.red),
      barBetween(
        [elbow[0], elbow[1], elbow[2] + 0.025],
        [hx, hy, hz + 0.025],
        0.01,
        0.008,
        PALETTE.metal,
      ),
      cylinder(0.022, 0.022, 0.05, elbow, PALETTE.metalDark, 8, [Math.PI / 2, 0, 0]),
    ];
    return mergeParts(parts);
  }, []);
  const [hx, hy, hz] = DESK_LAMP.head;
  return (
    <group>
      <mesh geometry={geo} material={vcMetal} castShadow />
      <group position={[hx, hy, hz]} rotation={[0.25, 0, 0.45]}>
        <mesh position={[0, -0.04, 0]} material={darkMetal} castShadow>
          <cylinderGeometry args={[0.035, 0.11, 0.12, 12, 1, true]} />
        </mesh>
        <mesh position={[0, -0.07, 0]} material={bulb}>
          <sphereGeometry args={[0.03, 10, 8]} />
        </mesh>
        <pointLight
          color="#ffcf8a"
          intensity={2.2}
          distance={0}
          decay={2}
          position={[0, -0.12, 0]}
        />
      </group>
    </group>
  );
}
