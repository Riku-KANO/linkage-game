import { useEffect, useState } from 'react';
import { ResultPanel } from '@/result';
import { useFlow, useFlowStore } from './context';
import { selectOpponent } from '../session';

/** 結果画面の遷移(試走 → 結果)。見たことがあれば短縮版にする(設計原則 5) */
const RESULT_TRANSITION = 'T-04';

/** 結果画面:ResultPanel(4 軸メーター・メダル・失敗理由・共有・対戦)と次の行動 */
export function ResultView() {
  const store = useFlowStore();
  const run = useFlow((s) => s.run);
  const opponent = useFlow(selectOpponent);
  // 開いた時点で決める(途中で記録が変わっても演出を組み直さない)
  const [short] = useState(() =>
    store.getState().progress.seenTransitions.includes(RESULT_TRANSITION),
  );
  useEffect(() => store.getState().markTransitionSeen(RESULT_TRANSITION), [store]);

  if (run.phase !== 'finished') return null;
  const { outcome } = run;
  const s = store.getState;
  const next = outcome.nextStageId;
  return (
    <div className="fl-result">
      <ResultPanel
        result={outcome.result}
        stage={outcome.stage}
        reasonKey={outcome.diagnosis?.key}
        design={outcome.design}
        ghost={outcome.ghost}
        opponent={opponent ?? undefined}
        short={short}
        onRetry={() => void s().startRun()}
        onBackToDesign={() => s().dismissResult()}
        onNext={next ? () => s().startStage(next) : undefined}
        onReplayFall={
          outcome.summary.fallen && !outcome.result.cleared ? () => void s().replayRun() : undefined
        }
      />
    </div>
  );
}
