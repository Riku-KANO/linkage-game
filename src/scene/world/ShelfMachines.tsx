import { useEffect, useMemo, useRef, type RefObject } from 'react';
import { useFrame } from '@react-three/fiber';
import { MeshStandardMaterial, type Group, type InstancedMesh, type Material } from 'three';
import { jansenWalker } from '@/core/model/presets';
import type { DesignDoc } from '@/core/model/types';
import { CHAPTERS } from '@/game/chapters';
import { t } from '@/i18n';
import { box, mergeParts, type Part } from '../env/geometry';
import { PALETTE, vcMatte } from '../env/materials';
import { useActivity } from '../home/activity';
import { SHELF } from '../layout';
import { MachineMeshes, useMachineRig, writeMachineInstances } from './machine';
import { silhouetteMat } from './materials';
import { fitScale } from './miniature';
import { useWorld } from './store';
import { textTexture } from './textures';

/**
 * 棚に並ぶ章の機械(WORLD-2)。章をクリアした機械の模型が 2 段目(下から 2 番目の段)に章の順に並ぶ。
 * まだクリアしていない章は影絵(暗いヤンセン型の 1 脚)。図鑑の画面とホバーの間だけ、模型が足踏みする。
 * 座標は棚のローカル(Shelf の group の中:+x が棚の幅、+z が正面)。
 */

/** 模型を置く段の上面(棚の段 0.44m の板の上) */
const BOARD_TOP = 0.44 + 0.0125;
const PLINTH_H = 0.016;
/** 模型の大きさ(m) */
const MODEL_SIZE = 0.2;
const SLOT_SPACING = (SHELF.width - 0.3) / 4;

/** 影絵の形:ヤンセン型の見本機を前後 1 組だけにしたもの */
function silhouetteDesign(): DesignDoc {
  const d = jansenWalker();
  return { ...d, legs: { count: 1, phaseStepDeg: 0, spacing: 20, mirrorX: true } };
}

export function ShelfMachines() {
  const machines = useWorld((s) => s.chapterMachines);
  const activity = useActivity('zukan', ['zukan']);
  const plinths = useMemo(buildPlinths, []);
  const silhouette = useMemo(silhouetteDesign, []);
  const plates = useMemo(
    () =>
      CHAPTERS.map((c) => {
        const map = textTexture(t('world.shelf.chapter', { n: c.chapter }), {
          width: 192,
          height: 64,
          background: '#c9a24a',
          color: '#3a2716',
          font: 'bold 34px sans-serif',
        });
        return new MeshStandardMaterial({
          color: map ? '#ffffff' : PALETTE.brass,
          map,
          roughness: 0.4,
          metalness: 0.4,
        });
      }),
    [],
  );
  useEffect(
    () => () => {
      plinths.dispose();
      for (const m of plates) {
        m.map?.dispose();
        m.dispose();
      }
    },
    [plinths, plates],
  );

  return (
    <group>
      <mesh geometry={plinths} material={vcMatte} castShadow receiveShadow />
      {CHAPTERS.map((c, i) => {
        const x = slotX(i);
        const design = machines[c.chapter];
        return (
          <group key={c.chapter} position={[x, BOARD_TOP + PLINTH_H, 0]}>
            <mesh position={[0, -PLINTH_H / 2, 0.106]} material={plates[i]}>
              <planeGeometry args={[0.075, 0.025]} />
            </mesh>
            {design ? (
              <ShelfMachine design={design} activity={activity} />
            ) : (
              <ShelfMachine design={silhouette} material={silhouetteMat} />
            )}
          </group>
        );
      })}
    </group>
  );
}

function slotX(i: number): number {
  return (i - 2) * SLOT_SPACING;
}

/** 台座(章ごとに 1 つ)と名札の裏板 */
function buildPlinths() {
  const parts: Part[] = [];
  CHAPTERS.forEach((_, i) => {
    const x = slotX(i);
    parts.push(box([0.24, PLINTH_H, 0.2], [x, BOARD_TOP + PLINTH_H / 2, 0], PALETTE.woodDark));
    parts.push(
      box([0.085, PLINTH_H + 0.006, 0.006], [x, BOARD_TOP + PLINTH_H / 2, 0.102], PALETTE.wood),
    );
  });
  return mergeParts(parts);
}

/** 1 台の模型。activity があれば足踏みし、なければ止まった姿勢のまま(毎フレーム解かない) */
function ShelfMachine({
  design,
  activity,
  material,
}: {
  design: DesignDoc;
  activity?: RefObject<number>;
  material?: Material;
}) {
  const rig = useMachineRig(design);
  const scale = useMemo(() => fitScale(design, MODEL_SIZE), [design]);
  const root = useRef<Group>(null);
  const bars = useRef<InstancedMesh>(null);
  const pins = useRef<InstancedMesh>(null);
  const needsPose = useRef(true);
  useEffect(() => {
    needsPose.current = true;
  }, [rig]);
  const f = rig.model.frame;
  const cx = ((f.xMin + f.xMax) / 2) * scale;

  useFrame((_, dt) => {
    const a = activity?.current ?? 0;
    const dTheta = rig.direction * 2.4 * a * Math.min(dt, 0.1);
    if (Math.abs(dTheta) < 1e-6 && !needsPose.current) return;
    // 最初は少し回した姿勢(脚が開いて形が分かる)
    const { minFootY } = rig.gait.step(needsPose.current ? rig.direction * 0.9 : dTheta);
    needsPose.current = false;
    writeMachineInstances(rig.model, bars.current, pins.current);
    const g = root.current;
    if (g) g.position.set(-cx, -minFootY * scale, 0);
  });

  return (
    <group ref={root}>
      <group scale={scale}>
        <MachineMeshes
          rig={rig}
          bars={bars}
          pins={pins}
          {...(material
            ? { barMaterial: material, pinMaterial: material, chassisMaterial: material }
            : { castShadow: true })}
        />
      </group>
    </group>
  );
}
