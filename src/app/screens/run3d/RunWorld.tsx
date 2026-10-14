import { useFrame } from '@react-three/fiber';
import { useCallback, useEffect, useMemo, useRef } from 'react';
import { Object3D, type Group } from 'three';
import { useStore } from 'zustand';
import { useSession } from '@/app/flow';
import { useApp } from '@/app/store';
import { setMotorHum } from '@/audio/sfx';
import { useSceneUi } from '@/scene/store';
import { ComMarker, ContactMarkers, FootTrails } from '@/testrun/Visualizations';
import { GhostMachine } from '@/testrun/GhostMachine';
import { MachineModel } from '@/testrun/MachineModel';
import { TerrainView } from '@/testrun/TerrainView';
import { finishToResult } from './actions';
import { runFrame } from './frame';
import { courseViewTerrain } from './placement';
import { followRig, run3dSignals, runViewStore, type RunView } from './runView';

/** 共有相手のゴーストの色(前回の試走は testrun の既定の水色) */
const OPPONENT_COLOR = '#ffb36b';

/**
 * 試走のカメラ側(+z)からの弱い補助光。西日は窓の外の奥(−z)から差すので、追従カメラから見た
 * 機械は逆光になる。地面の照り返しの代わりに、機構の線が読める程度に正面を起こす(影は落とさない)。
 */
const FILL = {
  position: [1.5, 3, 6] as [number, number, number],
  intensity: 1.1,
  color: '#ffd8b0',
};

/**
 * 窓の外の試走コースに置く試走の 3D(INT-2)。GameShell の scene3d に置く。
 * 地形・機体・脚先の軌跡・接地・重心・ゴースト(前回・相手)を、ステージのスタートが
 * コースのスタートの線に重なるよう平行移動して描く。毎フレームの進行は runFrame。
 */
export function RunWorld() {
  const view = useStore(runViewStore, (s) => s.view);
  const lowPerf = useApp((s) => s.settings.lowPerf);
  if (!view) return null;
  return <RunCourse key={view.id} view={view} shadows={!lowPerf} />;
}

function RunCourse({ view, shadows }: { view: RunView; shadows: boolean }) {
  const { controller, live } = view;
  const show = useStore(controller.store, (s) => s.show);
  const stage = live.stage;
  const terrain = useMemo(() => courseViewTerrain(stage.terrain), [stage.terrain]);
  const getSnapshot = controller.getSnapshot;
  const getTime = useCallback(() => controller.getSnapshot().time, [controller]);
  const footRadius = live.sim.params.footRadius;
  const fillTarget = useMemo(() => new Object3D(), []);
  const machine = useRef<Group>(null);

  // 描画部品・カメラリグ(優先度 −1)より先に進める
  useFrame((_, dt) => {
    const r = runFrame(
      view,
      dt,
      {
        screen: useApp.getState().screen,
        revealed: useSceneUi.getState().revealed,
        hold: run3dSignals.hold,
        nowMs: performance.now(),
      },
      { follow: followRig, hum: setMotorHum },
    );
    if (machine.current) machine.current.visible = !run3dSignals.hideMachine;
    if (r.finish) {
      const run = useSession.getState().run;
      if (run.phase === 'running' && run.live === live) finishToResult();
      else view.handedOver = true;
    }
  }, -10);
  useEffect(() => () => setMotorHum(0, 0), []);

  return (
    <group position={view.placement.offset as [number, number, number]}>
      <primitive object={fillTarget} />
      <directionalLight
        position={FILL.position}
        intensity={FILL.intensity}
        color={FILL.color}
        target={fillTarget}
      />
      <TerrainView
        terrain={terrain}
        start={stage.start}
        goal={stage.goal}
        gateHeight={Math.max(1.2, view.machineScale * 1.2)}
        shadows={shadows}
      />
      <group ref={machine}>
        <MachineModel design={live.design} getSnapshot={getSnapshot} shadows={shadows} />
        {show.trails && <FootTrails design={live.design} getSnapshot={getSnapshot} seconds={3} />}
        {show.contacts && <ContactMarkers getSnapshot={getSnapshot} footRadius={footRadius} />}
        {show.com && (
          <ComMarker getSnapshot={getSnapshot} terrain={stage.terrain} footRadius={footRadius} />
        )}
      </group>
      {show.ghost && view.previousGhost && (
        <GhostMachine
          design={view.previousDesign ?? live.design}
          ghost={view.previousGhost}
          getTime={getTime}
        />
      )}
      {show.ghost && view.opponentGhost && (
        <GhostMachine
          design={view.opponentDesign ?? live.design}
          ghost={view.opponentGhost}
          getTime={getTime}
          color={OPPONENT_COLOR}
        />
      )}
    </group>
  );
}
