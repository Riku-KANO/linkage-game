import { useMemo, type ReactNode } from 'react';
import { Canvas, events as createPointerEvents, useFrame } from '@react-three/fiber';
import { Selection } from '@react-three/postprocessing';
import { useApp } from '@/app/store';
import { BENCH, COURSE_MODEL, PAPER_WORLD, SHELF, TEST_TRACK, TOOLBOX, WINDOW } from './layout';
import { BlendCamera } from './rig/BlendCamera';
import { CameraRig } from './rig/CameraRig';
import { CrossFade } from './rig/CrossFade';
import { rayFromNdc } from './rig/projection';
import { liveAnchors } from './rig/stations';
import { Effects } from './effects/Effects';
import { BootLogo } from './env/BootLogo';
import { CourseModel } from './env/CourseModel';
import { Lights } from './env/Lights';
import { Room } from './env/Room';
import { Shelf } from './env/Shelf';
import { Sky } from './env/Sky';
import { Toolbox } from './env/Toolbox';
import { Wasteland } from './env/Wasteland';
import { WindowHotspot } from './env/WindowHotspot';
import { Workbench } from './env/Workbench';
import { MenuObject } from './home/MenuObject';
import { PerfProbe } from './perf/PerfProbe';
import { KinematicWalker } from './walker/KinematicWalker';
import { BenchWalker } from './world/BenchWalker';
import { ZukanFrames } from './world/ZukanFrames';

type PointerEventsFactory = typeof createPointerEvents;

/**
 * レイキャストを透視⇄平行の補間行列に対応させる。射影の逆行列から near と far の点を戻してレイを作る
 * (Raycaster.setFromCamera は透視か平行のどちらかしか扱えない)。
 */
const blendEvents: PointerEventsFactory = (store) => {
  const base = createPointerEvents(store);
  return {
    ...base,
    compute(event, state) {
      state.pointer.set(
        (event.offsetX / state.size.width) * 2 - 1,
        -(event.offsetY / state.size.height) * 2 + 1,
      );
      const cam = state.camera;
      cam.updateMatrixWorld();
      rayFromNdc(
        state.pointer.x,
        state.pointer.y,
        cam.projectionMatrixInverse,
        cam.matrixWorld,
        state.raycaster.ray.origin,
        state.raycaster.ray.direction,
      );
      state.raycaster.camera = cam;
    },
  };
};

/**
 * 工房(全画面の 3D 空間)。全ての画面はこの中のカメラの位置の違いでしかない。
 * children はシーンの中に置く追加の 3D(試走ストリームの機体・地形など)。
 */
export function WorkshopCanvas({
  children,
  measurePerf,
}: {
  children?: ReactNode;
  /** 初回起動時の性能測定をするか(保存済みの判定がなければ true) */
  measurePerf: boolean;
}) {
  const lowPerf = useApp((s) => s.settings.lowPerf);
  const camera = useMemo(() => new BlendCamera(42, 16 / 9, 0.05, 900), []);
  return (
    <Canvas
      className="ak-canvas"
      camera={camera}
      events={blendEvents}
      shadows={lowPerf ? false : 'percentage'}
      dpr={lowPerf ? 1 : [1, 1.5]}
      gl={{ antialias: true, powerPreference: 'high-performance' }}
    >
      <Selection>
        <Sky />
        <Lights />
        <Room />
        <Wasteland />
        <MenuObject
          id="continue"
          labelAt={[PAPER_WORLD.center[0], BENCH.top + 0.38, PAPER_WORLD.center[2]]}
        >
          <Workbench />
        </MenuObject>
        {/* 作業台の見本機(自分の最新の機械、初回はヤンセン型)。ドラッグで持ち上げて向きを変えられる */}
        <BenchWalker />
        <MenuObject
          id="stageSelect"
          labelAt={[
            COURSE_MODEL.center[0],
            COURSE_MODEL.center[1] + 0.45,
            COURSE_MODEL.center[2] + 0.1,
          ]}
        >
          <CourseModel />
        </MenuObject>
        <MenuObject
          id="zukan"
          labelAt={[SHELF.center[0] - 0.3, SHELF.height + 0.2, SHELF.center[2]]}
        >
          <Shelf />
        </MenuObject>
        <MenuObject
          id="sandbox"
          labelAt={[(WINDOW.xMin + WINDOW.xMax) / 2, WINDOW.yMax + 0.25, WINDOW.z + 0.2]}
        >
          <WindowHotspot />
        </MenuObject>
        <MenuObject id="settings" labelAt={[TOOLBOX.center[0], 0.62, TOOLBOX.center[2]]}>
          <Toolbox />
        </MenuObject>
        {/* 図鑑の額(奥の壁、コース模型の右上) */}
        <ZukanFrames />
        <BootLogo />
        <TestTrackMachine />
        {children}
        <CameraRig />
        <CrossFade />
        <PerfProbe enabled={measurePerf} />
        <Effects />
      </Selection>
    </Canvas>
  );
}

/** 試走コースの仮置き:実寸の見本機がコースを行き来する。結果画面では止まる */
function TestTrackMachine() {
  const activity = useMemo(() => ({ current: 1 }), []);
  useFrame(() => {
    activity.current = useApp.getState().screen === 'result' ? 0 : 1;
  });
  return (
    <KinematicWalker
      scale={TEST_TRACK.scale}
      bounds={{ xMin: TEST_TRACK.xStart + 1.2, xMax: TEST_TRACK.xGoal - 1.2, z: TEST_TRACK.z }}
      groundY={0.03}
      startX={TEST_TRACK.xStart + 1.5}
      activity={activity}
      anchor={liveAnchors.testMachine}
    />
  );
}
