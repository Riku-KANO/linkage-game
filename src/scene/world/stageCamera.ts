import { createPose } from '../rig/pose';
import { setStationOverride } from '../rig/stations';
import type { DioramaLayout } from './diorama';
import { closeUpPose, overviewPose } from './framing';

/**
 * ステージ選択のカメラの定位置(world が持つ)。ふだんは遊べる章の台地をパネルに隠れない左側に収める構図、
 * T-06 で機械が歩く間は歩く区間に寄った構図。リグの setStationOverride('stageSelect') を 1 つだけ使う。
 */
export const stageCamera = {
  /** T-06 の歩く区間に寄っているか(DioramaWalker が切り替える) */
  closeUp: false,
  /** 歩く区間の両端(模型のローカル座標、m) */
  a: [0, 0, 0] as [number, number, number],
  b: [0, 0, 0] as [number, number, number],
};

/** ステージ選択の定位置の差し替えを始める。戻り値で止める(既定の定位置に戻る) */
export function installStageSelectCamera(layout: DioramaLayout): () => void {
  const pose = createPose();
  setStationOverride('stageSelect', (_, ctx) =>
    stageCamera.closeUp
      ? closeUpPose(stageCamera.a, stageCamera.b, ctx.width, ctx.height, pose)
      : overviewPose(layout, ctx.width, ctx.height, pose),
  );
  return () => {
    stageCamera.closeUp = false;
    setStationOverride('stageSelect', null);
  };
}
