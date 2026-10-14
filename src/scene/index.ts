/**
 * scene モジュールの公開 API(工房・カメラリグ・画面遷移・ホーム)。
 *
 * - GameShell:全画面の工房 + DOM オーバーレイ層。overlays で画面ごとの DOM を差し込む
 * - usePaperViewport / setPaperInsets:設計画面の製図用紙と画面の対応(編集ビューの位置合わせ)
 * - setStationOverride / liveAnchors:画面のカメラ定位置の差し替え(試走の追従カメラなど)
 * - layout:工房の配置(試走コース、紙、作業台など)
 */
export { GameShell, type GameShellProps } from './GameShell';
export { WorkshopCanvas } from './WorkshopCanvas';
export { OverlayLayer } from './overlay/OverlayLayer';
export { Panel, Button, BackButton } from './overlay/Panel';
export {
  PLACEHOLDER_OVERLAYS,
  type ScreenOverlay,
  type ScreenOverlayProps,
} from './overlay/placeholders';
export {
  usePaperViewport,
  setPaperInsets,
  useSceneUi,
  rigSignals,
  rigDebug,
  type PaperViewport,
  type MenuItemId,
} from './store';
export {
  DEFAULT_PAPER_INSETS,
  designToScreen,
  screenToDesign,
  designToWorld,
  type Insets,
  type ScreenRect,
  type DesignRect,
} from './rig/paper';
export {
  setStationOverride,
  resolveStation,
  liveAnchors,
  type StationOverride,
  type StationContext,
} from './rig/stations';
export type { CameraPose } from './rig/pose';
export { BlendCamera } from './rig/BlendCamera';
export * as layout from './layout';
export { MODEL_MANIFEST, modelUrl } from './assets';
export { KinematicWalker } from './walker/KinematicWalker';
export { MENU_ITEMS, activateMenu, setMenuHandler, type MenuItem } from './home/menu';
