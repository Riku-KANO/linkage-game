/**
 * 画面遷移の演出(INT-6):T-03 組み上げ、T-05 分解(T-03 の逆再生)、T-04 ゴールのスローと半周。
 *
 * 工房の Canvas に FxLayer が 1 つ入っている(WorkshopCanvas)。試走の統合(INT-2 / INT-3)は次の 4 つを守る:
 *
 *   // 1. 試走の機体を登録する(着地点 = 最初のスナップショット、分解の吊り上げ元 = 今のスナップショット)
 *   useEffect(() => registerTrackMachine({ design, getSnapshot: controller.getSnapshot, origin }), [...]);
 *   // 2. 演出が機械を描いている間は自分の機体を隠す
 *   const hidden = useFx((s) => s.machineInFx);   // <group visible={!hidden}>…
 *   // 3. 時間は演出の倍率をかけて進める(組み上げ中は 0 = 止まって待つ、ゴールでスロー → 結果で 0)
 *   useFrame((_, dt) => controller.tick(dt * getFxTimeScale()), -10);   // TestRunScene の drive: false
 *   // 4. (任意)組み上げが終わった瞬間
 *   useEffect(() => onFxHandover(() => …), []);
 *
 * 機体は `useFx((s) => s.ownsTrack)` が true の間(試走・結果の画面と、その出入りの遷移の間)は
 * 置いたままにする。演出のカメラはこの間 liveAnchors.testMachine を着地点に向ける。
 * 設計画面が図面を編集ビューに合わせてパン・ズームして描くなら setPaperMapping で位置と縮尺を渡す。
 */
export { FxLayer } from './FxLayer';
export {
  useFx,
  getFxTimeScale,
  registerTrackMachine,
  getTrackMachine,
  onFxHandover,
  setPaperMapping,
  getPaperMapping,
  fxDirector,
  type FxUiState,
  type TrackMachine,
} from './store';
export type { FxKind, FxFrame } from './director';
export type { PaperMapping } from './crane';
export { defaultPaperMapping, TRACK_LANDING } from './crane';
export { ASSEMBLY_PHASES, GOAL_SLOWMO, goalTimeScale } from './timeline';
export { STAND_IN_ORIGIN } from './StandIn';
