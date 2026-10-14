/**
 * world:工房が育つ(WORLD-1・WORLD-2)。ステージ選択のジオラマ、T-06 で歩く小さな機械、
 * 棚に並ぶ章の機械、図鑑の額、作業台の見本機。統合は useWorld に進行と機械を流し込む。
 */
export {
  useWorld,
  activateStage,
  setStageSelectHandler,
  applyRun,
  initialWorldData,
  type WorldData,
  type WorldState,
  type RunNote,
} from './store';
export { StageDiorama, type StageDioramaProps } from './StageDiorama';
export { CourseDiorama } from './CourseDiorama';
export { DioramaWalker, WALKER_SIZE } from './DioramaWalker';
export { ShelfMachines } from './ShelfMachines';
export { ZukanFrames, ZUKAN_FRAMES } from './ZukanFrames';
export { BenchWalker } from './BenchWalker';
export { WorldDevPanel, type WorldDevApi } from './WorldDevPanel';
export {
  markerState,
  markerMedals,
  frontierStage,
  planWalk,
  restingStage,
  MEDAL_AXES,
  type MarkerState,
  type MedalAxis,
  type WalkPlan,
} from './stageView';
export {
  buildDioramaLayout,
  getDioramaLayout,
  sampleRoute,
  createRouteSample,
  markerOf,
  dioramaToWorld,
  terrainHint,
  MODEL_GROW,
  type DioramaLayout,
  type MarkerSpec,
  type PlateauSpec,
  type Route,
  type RouteSample,
  type TerrainHint,
} from './diorama';
export { T06_WALK, t06WalkProgress, t06WalkEnd } from './t06';
export {
  closeUpPose,
  overviewPose,
  freeRegion,
  frameSubject,
  playableBounds,
  STAGE_PANEL,
} from './framing';
export { stageCamera, installStageSelectCamera } from './stageCamera';
export { installWorldSave } from './store';
export { WORLD_SAVE_KEY, loadWorldSave, saveWorldSave, parseWorldSave } from './save';
export { designExtent, fitScale } from './miniature';
export { worldDebug } from './debug';
