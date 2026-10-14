import { useEffect, useState } from 'react';
import { selectOpponent, useSession } from '@/app/flow';
import { ResultPanel } from '@/result';
import type { ScreenOverlayProps } from '@/scene/overlay/placeholders';
import { backToDesign, goNextStage, replayFall, restartRun } from './run3d/actions';
import './run3d/run3d.css';

/** 試走 → 結果の遷移。見たことがあれば結果パネルの演出も短縮版にする(設計原則 5) */
const RESULT_TRANSITION = 'T-04';

/**
 * 結果画面の DOM(INT-3)。GameShell の overlays の result に置く。
 * ResultPanel(4 軸の歯車メーター・メダルの刻印・失敗理由・共有・相手との比較)を画面の右に寄せる
 * (カメラは機械を左寄りに映す:bridge の結果の定位置)。機械はコースの上に最後の姿勢で残っている。
 *
 *  - もう一度:同じ設計で新しい試走(前回の試走がゴーストになる)
 *  - 設計に戻る:結果を閉じて設計画面へ(T-05)
 *  - 次のステージ:次のステージを開いてステージ選択へ(T-06)
 *  - 転倒の瞬間を見る:試走画面で終わりの少し前から ×0.5 で再生し、結果に戻る
 *  - 共有:ResultPanel の共有の行が設計・記録・ゴーストを URL にしてコピーする
 *    (session.shareCurrent() と同じ中身。通知は出さない)
 */
export function ResultScreen(_props: ScreenOverlayProps) {
  const run = useSession((s) => s.run);
  const opponent = useSession(selectOpponent);
  // 開いた時点で決める(途中で記録が変わっても演出を組み直さない)
  const [short] = useState(() =>
    useSession.getState().progress.seenTransitions.includes(RESULT_TRANSITION),
  );
  useEffect(() => useSession.getState().markTransitionSeen(RESULT_TRANSITION), []);

  if (run.phase !== 'finished') return null;
  const { outcome } = run;
  const next = outcome.nextStageId;
  return (
    <div className="ak-run-result">
      <ResultPanel
        result={outcome.result}
        stage={outcome.stage}
        reasonKey={outcome.diagnosis?.key}
        design={outcome.design}
        ghost={outcome.ghost}
        opponent={opponent ?? undefined}
        short={short}
        onRetry={() => void restartRun()}
        onBackToDesign={() => backToDesign()}
        onNext={next ? () => goNextStage(next) : undefined}
        onReplayFall={
          outcome.summary.fallen && !outcome.result.cleared ? () => void replayFall() : undefined
        }
      />
    </div>
  );
}
