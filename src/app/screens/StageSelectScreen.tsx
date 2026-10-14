import { useState } from 'react';
import { StageSelectPanel } from '@/hud';
import type { StageId } from '@/game';
import { openStage } from '../actions';
import { useSession } from '../flow';
import { useApp } from '../store';
import { focusWorldStage, useWorldSelectedStage } from '../worldBridge';
import './screens.css';

/**
 * ステージ選択(INT-4、T-01 でコース模型へ寄った後・T-06 で結果から戻った後)。
 * HUD の一覧を画面の端に寄せ、3D のジオラマを見えるままにする。
 *  - 進行から解放・最高メダル・「次」のステージ(最初のフォーカス)
 *  - 解放済みのステージを選ぶ → startStage + 設計画面へ(T-02)
 *  - Esc・閉じる → ホームへ(逆再生の短縮版)
 *  - フォーカス ⇄ ジオラマの選択(world があるとき。worldBridge)
 */
export function StageSelectScreen() {
  const progress = useSession((s) => s.progress);
  const worldSelected = useWorldSelectedStage();
  const [focused, setFocused] = useState<StageId | null>(null);
  const controlled = worldSelected ?? focused;
  return (
    <div className="app-dock app-dock--stage">
      <StageSelectPanel
        progress={progress}
        // 何も選んでいない間は一覧が「次」のステージを選ぶ(非制御)
        focusedStageId={controlled ?? undefined}
        onFocusStage={(id) => {
          setFocused(id);
          focusWorldStage(id);
        }}
        onSelectStage={(id) => void openStage(id)}
        onClose={() => useApp.getState().back()}
      />
    </div>
  );
}
