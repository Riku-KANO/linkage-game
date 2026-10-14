import { useCallback } from 'react';
import { useApp } from '@/app/store';
import type { StageId } from '@/game/types';
import { StageDiorama, useDioramaInteractive } from './StageDiorama';
import { DioramaWalker } from './DioramaWalker';
import { activateStage, useWorld } from './store';

/**
 * コース模型に載せるジオラマ(useWorld につないだもの)。CourseModel が板の上に置く。
 * ホバー・選択は useWorld の hoveredStageId / selectedStageId で DOM の一覧と共有し、
 * クリックは activateStage(setStageSelectHandler で差し替えられる)へ渡す。
 */
export function CourseDiorama() {
  const progress = useWorld((s) => s.progress);
  const hovered = useWorld((s) => s.hoveredStageId);
  const selected = useWorld((s) => s.selectedStageId);
  const atStageSelect = useApp((s) => s.screen === 'stageSelect');
  const reducedMotion = useApp((s) => s.settings.reducedMotion);
  const interactive = useDioramaInteractive();
  const onHover = useCallback((id: StageId | null) => useWorld.getState().hoverStage(id), []);
  return (
    <>
      <StageDiorama
        progress={progress}
        hoveredStageId={atStageSelect ? hovered : null}
        selectedStageId={selected}
        onHoverStage={onHover}
        onSelectStage={activateStage}
        interactive={interactive}
        reducedMotion={reducedMotion}
      />
      <DioramaWalker />
    </>
  );
}
