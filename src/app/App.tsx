import { GameShell } from '@/scene/GameShell';
import { RUN_OVERLAYS, RunLayer, RunWorld, useRunSession } from './screens/run3d';

/**
 * ゲーム本体。工房(1 つの 3D 空間)の中に全画面を置き、画面の切り替えはカメラの移動で表す。
 * 画面ごとの DOM(設計ビュー・結果パネルなど)は GameShell の overlays で差し込む。
 * 試走・結果(INT-2 / INT-3):起動時にセッションを読み込み、試走コースの 3D・操作盤・結果パネル・通知を置く。
 */
export default function App() {
  useRunSession();
  return (
    <GameShell overlays={RUN_OVERLAYS} scene3d={<RunWorld />}>
      <RunLayer />
    </GameShell>
  );
}
