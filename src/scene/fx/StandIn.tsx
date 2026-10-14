import { useEffect, useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import type { Group } from 'three';
import { useApp } from '@/app/store';
import { useEditor } from '@/editor/store';
import type { DesignDoc } from '@/core/model/types';
import type { TerrainSpec } from '@/core/sim/types';
import { createTestRunController } from '@/testrun/controller';
import { MachineModel } from '@/testrun/MachineModel';
import { createKinematicPreviewSim } from '@/testrun/previewSim';
import { TEST_TRACK } from '../layout';
import { liveAnchors } from '../rig/stations';
import { TRACK_LANDING } from './crane';
import { fxDirector, registerTrackMachine, useFx } from './store';

/**
 * 試走の統合(INT-2)の前の代わりの機体:エディタの設計を、運動学だけの簡易シミュレーションで
 * コースのスタートから歩かせる(MachineModel で描くので、演出からの引き継ぎは本物と同じ)。
 * 統合側が registerTrackMachine で本物の機体を登録すると出なくなる。
 *
 * 統合側の使い方の見本にもなっている:
 *  - registerTrackMachine({ design, getSnapshot, origin }) で演出に機体を知らせる
 *  - controller.tick(dt * getFxTimeScale()) で進める(組み上げ中は止まり、ゴールでスロー)
 *  - useFx の machineInFx の間は自分の機体を隠す
 */

/** 簡易シミュレーションの原点のワールド座標(コースのスタート、板の上面) */
export const STAND_IN_ORIGIN: readonly [number, number, number] = [
  TRACK_LANDING.x,
  TRACK_LANDING.groundY,
  TRACK_LANDING.z,
];

const FLAT: TerrainSpec = { ground: { y: 0 }, shapes: [] };

export function TrackStandIn() {
  const ownsTrack = useFx((s) => s.ownsTrack);
  const external = useFx((s) => s.externalMachine);
  const design = useEditor((s) => s.design);
  if (!ownsTrack || external) return null;
  return <StandInMachine design={design} />;
}

function StandInMachine({ design }: { design: DesignDoc }) {
  const lowPerf = useApp((s) => s.settings.lowPerf);
  const controller = useMemo(
    () =>
      createTestRunController({
        sim: createKinematicPreviewSim(design, FLAT, { start: { x: 0, z: 0 } }),
        goalX: null,
        autoSlowMo: false,
        ghostHz: 0,
      }),
    [design],
  );
  useEffect(
    () =>
      registerTrackMachine(
        { design, getSnapshot: controller.getSnapshot, origin: STAND_IN_ORIGIN },
        { fallback: true },
      ),
    [design, controller],
  );
  const group = useRef<Group>(null);
  // 演出の進行役(優先度 −2)が着地点として読む前に進める
  useFrame((_, dt) => {
    const s = controller.getSnapshot();
    // コースの端(ゴールの先)で止まる
    const atEnd = STAND_IN_ORIGIN[0] + s.body.position.x > TEST_TRACK.xGoal + 1.5;
    controller.tick(atEnd ? 0 : Math.min(dt, 0.1) * fxDirector.frame.timeScale);
  }, -3);
  // 進行役のあと・カメラリグ(−1)の前:演出が機械を描いている間は隠す(引き継ぎのフレームで途切れない)
  useFrame(() => {
    const f = fxDirector.frame;
    const g = group.current;
    if (g) g.visible = !f.machineInFx;
    if (f.machineInFx) return;
    const s = controller.getSnapshot();
    liveAnchors.testMachine[0] = STAND_IN_ORIGIN[0] + s.body.position.x;
    liveAnchors.testMachine[1] = STAND_IN_ORIGIN[1] + s.body.position.y;
    liveAnchors.testMachine[2] = STAND_IN_ORIGIN[2] + s.body.position.z;
  }, -1.5);
  return (
    <group ref={group} position={[...STAND_IN_ORIGIN]}>
      <MachineModel design={design} getSnapshot={controller.getSnapshot} shadows={!lowPerf} />
    </group>
  );
}
