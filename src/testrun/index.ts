/**
 * 試走ビュー(TR-1〜TR-7)の公開 API。
 *
 * 使い方(既存の <Canvas> の中と、その上の DOM):
 *
 *   const sim = createKinematicPreviewSim(design, stage.terrain, { start: stage.start });
 *   // 統合時は createWalkerSim({ design, terrain: collider, start: stage.start }) に差し替える
 *   const controller = createTestRunController({ sim, goalX: stage.goal.x });
 *
 *   <Canvas>
 *     <TestRunScene controller={controller} design={design} terrain={stage.terrain}
 *                   stage={stage} ghost={previousGhost} options={{ shadows: !lowPerf }} />
 *   </Canvas>
 *   <TestRunHud controller={controller} design={design} keyboard />
 */

// 純粋なロジック
export * from './clock';
export * from './follow';
export * from './slowmo';
export * from './terrain';
export * from './hull';
export * from './layout';
export * from './legs';
export * from './previewSim';
export * from './snapshot';
export * from './ghostPlayer';
export * from './trails';
export * from './mini';
export * from './controller';
export { useTestRunController } from './useTestRunController';

// 3D(R3F。<Canvas> の中に置く)
export {
  TestRunScene,
  TestRunDriver,
  type TestRunSceneProps,
  type TestRunSceneOptions,
} from './TestRunScene';
export { MachineModel, type MachineModelProps, type MachineColors } from './MachineModel';
export { TerrainView, type TerrainViewProps } from './TerrainView';
export { FollowCamera, type FollowCameraProps } from './FollowCamera';
export { GhostMachine, type GhostMachineProps } from './GhostMachine';
export {
  FootTrails,
  ContactMarkers,
  ComMarker,
  footIndexOf,
  type FootTrailsProps,
  type ContactMarkersProps,
  type ComMarkerProps,
} from './Visualizations';
export { TestRunLights, type TestRunLightsProps } from './TestRunLights';
export { getMachineMaterials, MACHINE_PALETTE } from './materials';

// DOM(Canvas の上に重ねる)
export { TestRunHud, type TestRunHudProps } from './TestRunHud';
export { ControlBar, VisualTogglePanel, type ControlBarProps } from './ControlBar';
export { TorqueGauge, type TorqueGaugeProps } from './TorqueGauge';
export { MiniDesignView, type MiniDesignViewProps } from './MiniDesignView';
