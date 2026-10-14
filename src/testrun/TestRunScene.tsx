import { useFrame } from '@react-three/fiber';
import { useCallback, useMemo } from 'react';
import { useStore } from 'zustand';
import type { Ghost } from '@/core/model/ghost';
import type { DesignDoc } from '@/core/model/types';
import type { TerrainSpec } from '@/core/sim/types';
import type { StageDef } from '@/game/types';
import type { TestRunController } from './controller';
import type { FollowParams } from './follow';
import { FollowCamera } from './FollowCamera';
import { GhostMachine } from './GhostMachine';
import { buildMachineLayout, machineRadius } from './layout';
import { MachineModel } from './MachineModel';
import { TerrainView } from './TerrainView';
import { ComMarker, ContactMarkers, FootTrails } from './Visualizations';

/**
 * 試走ビューの 3D 部分をまとめたもの。既存の <Canvas> の中に置く(Canvas は作らない)。
 *
 *  - controller.tick() を毎フレーム(他の部品より先に)呼ぶ
 *  - 機体、地形、可視化、ゴースト、追従カメラ
 *  - 表示の切り替えは controller.store(変わったときだけ再描画)
 */

export interface TestRunSceneOptions {
  /** 追従カメラ(既定 true)。store の follow も true のときだけ動く */
  camera?: boolean;
  cameraParams?: Partial<FollowParams>;
  /** 影(既定 false。低性能モードでは切る) */
  shadows?: boolean;
  /** 赤く点滅させるリンク id */
  highlightLinks?: readonly string[];
  /** controller.tick() をここで呼ぶ(既定 true)。統合側で回すなら false */
  drive?: boolean;
  /** 距離の目盛りの間隔(m) */
  tickStep?: number;
  gateHeight?: number;
  /** ゴーストを横にずらす(m) */
  ghostOffset?: [number, number, number];
  /** 脚先の軌跡を残す長さ(s) */
  trailSeconds?: number;
}

export interface TestRunSceneProps {
  controller: TestRunController;
  design: DesignDoc;
  terrain: TerrainSpec;
  /** スタートとゴール(ステージ定義の一部) */
  stage?: Pick<StageDef, 'start' | 'goal'> | null;
  /** 並走させるゴースト */
  ghost?: Ghost | null;
  /** ゴーストの機械の設計(省略時は design) */
  ghostDesign?: DesignDoc;
  options?: TestRunSceneOptions;
}

/** controller を毎フレーム進める(優先度 −10:描画部品より先) */
export function TestRunDriver({ controller }: { controller: TestRunController }) {
  useFrame((_, delta) => controller.tick(delta), -10);
  return null;
}

export function TestRunScene({
  controller,
  design,
  terrain,
  stage = null,
  ghost = null,
  ghostDesign,
  options = {},
}: TestRunSceneProps) {
  const show = useStore(controller.store, (s) => s.show);
  const follow = useStore(controller.store, (s) => s.follow);
  const getSnapshot = controller.getSnapshot;
  const getTime = useCallback(() => controller.getSnapshot().time, [controller]);
  const radius = useMemo(() => machineRadius(buildMachineLayout(design)), [design]);
  const footRadius = controller.sim.params.footRadius;
  const shadows = options.shadows ?? false;

  return (
    <group>
      {options.drive !== false && <TestRunDriver controller={controller} />}
      <TerrainView
        terrain={terrain}
        start={stage?.start ?? null}
        goal={stage?.goal ?? null}
        tickStep={options.tickStep}
        gateHeight={options.gateHeight ?? Math.max(1.2, radius * 1.2)}
        shadows={shadows}
      />
      <MachineModel
        design={design}
        getSnapshot={getSnapshot}
        shadows={shadows}
        highlightLinks={options.highlightLinks}
      />
      {show.trails && (
        <FootTrails design={design} getSnapshot={getSnapshot} seconds={options.trailSeconds ?? 3} />
      )}
      {show.contacts && <ContactMarkers getSnapshot={getSnapshot} footRadius={footRadius} />}
      {show.com && (
        <ComMarker getSnapshot={getSnapshot} terrain={terrain} footRadius={footRadius} />
      )}
      {show.ghost && ghost && (
        <GhostMachine
          design={ghostDesign ?? design}
          ghost={ghost}
          getTime={getTime}
          offset={options.ghostOffset}
        />
      )}
      {options.camera !== false && (
        <FollowCamera
          getSnapshot={getSnapshot}
          terrain={terrain}
          enabled={follow}
          scale={Math.max(0.4, radius)}
          params={options.cameraParams}
        />
      )}
    </group>
  );
}
