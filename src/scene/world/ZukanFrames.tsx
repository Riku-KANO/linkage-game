import { useEffect, useLayoutEffect, useMemo, useRef } from 'react';
import {
  Color,
  Matrix4,
  MeshStandardMaterial,
  PlaneGeometry,
  Quaternion,
  Vector3,
  type InstancedMesh,
} from 'three';
import { t } from '@/i18n';
import { box, cylinder, mergeParts, type Part } from '../env/geometry';
import { PALETTE, vcMatte } from '../env/materials';
import { ROOM } from '../layout';
import { useWorld } from './store';
import { textTexture } from './textures';

/**
 * 図鑑の額(WORLD-2)。奥の壁、コース模型の右上に 3 × 2 の額が掛かっている。
 * 図鑑の中身は MVP の外なので、どの額も「?」の札。登録した機構の数(progress.zukan)だけ
 * 額の中が紙になり、札は真鍮の無地になる(中身の絵は図鑑を作るときに入れる)。
 */
export const ZUKAN_FRAMES = {
  columns: [2.45, 2.95, 3.45],
  rows: [2.24, 1.86],
  width: 0.34,
  height: 0.28,
  z: ROOM.zBack + ROOM.wallThickness / 2,
} as const;

const BORDER = 0.026;
const DEPTH = 0.022;

interface Slot {
  x: number;
  y: number;
}

const SLOTS: Slot[] = ZUKAN_FRAMES.rows.flatMap((y) => ZUKAN_FRAMES.columns.map((x) => ({ x, y })));

const M = new Matrix4();
const P = new Vector3();
const Q = new Quaternion();
const S = new Vector3();
const C = new Color();

export function ZukanFrames() {
  const registered = useWorld((s) => s.progress.zukan.length);
  const frames = useMemo(buildFrames, []);
  const { backing, plate, mark, mats } = useMemo(() => {
    const q = textTexture(t('world.frame.unknown'), {
      width: 128,
      height: 128,
      color: '#e9c46a',
      font: 'bold 96px serif',
    });
    const plateMap = textTexture(t('world.frame.unknown'), {
      width: 192,
      height: 64,
      background: '#b58d3d',
      color: '#3a2716',
      font: 'bold 44px serif',
    });
    return {
      backing: new PlaneGeometry(ZUKAN_FRAMES.width - BORDER * 2, ZUKAN_FRAMES.height - BORDER * 2),
      plate: new PlaneGeometry(0.1, 0.034),
      mark: new PlaneGeometry(0.11, 0.11),
      mats: {
        backing: new MeshStandardMaterial({ color: '#ffffff', roughness: 0.95 }),
        plate: new MeshStandardMaterial({
          color: plateMap ? '#ffffff' : PALETTE.brass,
          map: plateMap,
          roughness: 0.4,
          metalness: 0.4,
        }),
        mark: new MeshStandardMaterial({
          color: '#ffffff',
          map: q,
          transparent: true,
          opacity: q ? 0.55 : 0,
          depthWrite: false,
          roughness: 0.6,
        }),
      },
    };
  }, []);
  useEffect(
    () => () => {
      frames.dispose();
      backing.dispose();
      plate.dispose();
      mark.dispose();
      for (const m of Object.values(mats)) {
        m.map?.dispose();
        m.dispose();
      }
    },
    [frames, backing, plate, mark, mats],
  );

  const backs = useRef<InstancedMesh>(null);
  const plates = useRef<InstancedMesh>(null);
  const marks = useRef<InstancedMesh>(null);

  // 登録した数が変わったときだけ書き直す
  useLayoutEffect(() => {
    const b = backs.current;
    const p = plates.current;
    const m = marks.current;
    if (!b || !p || !m) return;
    Q.identity();
    SLOTS.forEach((slot, i) => {
      const filled = i < registered;
      P.set(slot.x, slot.y, ZUKAN_FRAMES.z + 0.004);
      b.setMatrixAt(i, M.compose(P, Q, S.set(1, 1, 1)));
      b.setColorAt(i, C.set(filled ? '#efe6d2' : '#3a2a20'));
      P.set(slot.x, slot.y - ZUKAN_FRAMES.height / 2 - 0.03, ZUKAN_FRAMES.z + 0.006);
      p.setMatrixAt(i, M.compose(P, Q, S.set(1, 1, 1)));
      P.set(slot.x, slot.y, ZUKAN_FRAMES.z + 0.006);
      m.setMatrixAt(i, M.compose(P, Q, filled ? S.set(0, 0, 0) : S.set(1, 1, 1)));
    });
    for (const x of [b, p, m]) {
      x.instanceMatrix.needsUpdate = true;
      if (x.instanceColor) x.instanceColor.needsUpdate = true;
      x.computeBoundingSphere();
    }
  }, [registered]);

  return (
    <group>
      <mesh geometry={frames} material={vcMatte} castShadow receiveShadow />
      <instancedMesh ref={backs} args={[backing, mats.backing, SLOTS.length]} receiveShadow />
      <instancedMesh ref={plates} args={[plate, mats.plate, SLOTS.length]} />
      <instancedMesh ref={marks} args={[mark, mats.mark, SLOTS.length]} />
    </group>
  );
}

/** 額縁(4 本の木枠)と、吊るす紐の釘 */
function buildFrames() {
  const parts: Part[] = [];
  const W = ZUKAN_FRAMES.width;
  const H = ZUKAN_FRAMES.height;
  const z = ZUKAN_FRAMES.z + DEPTH / 2;
  for (const { x, y } of SLOTS) {
    parts.push(box([W, BORDER, DEPTH], [x, y + H / 2 - BORDER / 2, z], PALETTE.woodDark));
    parts.push(box([W, BORDER, DEPTH], [x, y - H / 2 + BORDER / 2, z], PALETTE.woodDark));
    parts.push(
      box([BORDER, H - BORDER * 2, DEPTH], [x - W / 2 + BORDER / 2, y, z], PALETTE.woodDark),
    );
    parts.push(
      box([BORDER, H - BORDER * 2, DEPTH], [x + W / 2 - BORDER / 2, y, z], PALETTE.woodDark),
    );
    // 内側の細い縁(真鍮)
    parts.push(
      box(
        [W - BORDER * 2 + 0.006, 0.004, 0.006],
        [x, y + H / 2 - BORDER, z + 0.008],
        PALETTE.brass,
      ),
    );
    parts.push(
      box(
        [W - BORDER * 2 + 0.006, 0.004, 0.006],
        [x, y - H / 2 + BORDER, z + 0.008],
        PALETTE.brass,
      ),
    );
    // 釘
    parts.push(
      cylinder(
        0.005,
        0.005,
        0.02,
        [x, y + H / 2 + 0.05, ZUKAN_FRAMES.z + 0.01],
        PALETTE.metalDark,
        6,
        [Math.PI / 2, 0, 0],
      ),
    );
    // 紐(釘から額の両肩へ)
    for (const sx of [-1, 1]) {
      const ax = x;
      const ay = y + H / 2 + 0.05;
      const bx = x + sx * (W / 2 - 0.04);
      const by = y + H / 2 - 0.005;
      const len = Math.hypot(bx - ax, by - ay);
      parts.push(
        box(
          [len, 0.003, 0.003],
          [(ax + bx) / 2, (ay + by) / 2, ZUKAN_FRAMES.z + 0.006],
          '#5a4632',
          [0, 0, Math.atan2(by - ay, bx - ax)],
        ),
      );
    }
  }
  return mergeParts(parts);
}
