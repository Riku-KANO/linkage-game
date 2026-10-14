/**
 * 3D なしの通しループ(FLOW-6、`?dev=flow`)。統合ウェーブで 3D に置き換わるまでの検証用の DOM 版。
 * 2D 側面図(drawSideView)は WebGL が使えないときの代わりや、試走の縮小図にも使える。
 */
export { FlowLoop, type FlowLoopProps } from './FlowLoop';
export { SessionContext, useFlow, useFlowStore, type SessionStore } from './context';
export {
  drawSideView,
  sideViewCamera,
  convexHull,
  type SideViewInput,
  type SideViewGhost,
  type SideViewCamera,
} from './sideView';
