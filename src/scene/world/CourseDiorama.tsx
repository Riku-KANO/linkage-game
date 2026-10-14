import { useCallback, useEffect } from 'react';
import { useApp } from '@/app/store';
import type { StageId } from '@/game/types';
import { StageDiorama, useDioramaInteractive } from './StageDiorama';
import { getDioramaLayout } from './diorama';
import { DioramaWalker } from './DioramaWalker';
import { installStageSelectCamera } from './stageCamera';
import { activateStage, useWorld } from './store';

/**
 * コース模型に載せるジオラマ(useWorld につないだもの)。CourseModel が板の上に置く。
 * ホバー・選択は useWorld の hoveredStageId / selectedStageId で DOM の一覧と共有し、
 * クリックは activateStage(setStageSelectHandler で差し替えられる)へ渡す。
 * ステージ選択のカメラの構図(パネルに隠れない左側にジオラマ)もここで差し込む(stageCamera)。
 */
export function CourseDiorama() {
  const progress = useWorld((s) => s.progress);
  const hovered = useWorld((s) => s.hoveredStageId);
  const selected = useWorld((s) => s.selectedStageId);
  const atStageSelect = useApp((s) => s.screen === 'stageSelect');
  const reducedMotion = useApp((s) => s.settings.reducedMotion);
  const interactive = useDioramaInteractive();
  const walking = useWorld((s) => s.walking !== null);
  const onHover = useCallback((id: StageId | null) => useWorld.getState().hoverStage(id), []);
  useEffect(() => installStageSelectCamera(getDioramaLayout()), []);
  return (
    <>
      <StageDiorama
        progress={progress}
        hoveredStageId={atStageSelect ? hovered : null}
        selectedStageId={selected}
        // 名前は落ち着いている間だけ(ホバー中、なければ一覧で選んでいるステージ)
        labelStageId={interactive && !walking ? (hovered ?? selected) : null}
        onHoverStage={onHover}
        onSelectStage={activateStage}
        interactive={interactive}
        reducedMotion={reducedMotion}
      />
      <DioramaWalker />
    </>
  );
}
