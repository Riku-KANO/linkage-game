/**
 * 結果画面(RS-1〜RS-3)。試走の結果を受け取って表示し、行動はコールバックで返す。
 * 3D の Canvas の上に重ねる DOM のパネル。置き場所(画面の右など)は呼び出し側が決める。
 */
export { ResultPanel, type ResultPanelProps } from './ResultPanel';
export {
  compareRuns,
  toShareRun,
  quantizeRun,
  type RunComparison,
  type AxisComparison,
} from './compare';
export { buildResultTimeline, type ResultTimeline } from './timeline';
