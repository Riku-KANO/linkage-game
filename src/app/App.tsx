import { GameShell } from '@/scene/GameShell';
import { APP_OVERLAYS, PaperInk, useDesignPaperInsets } from './screens';

/**
 * ゲーム本体。工房(1 つの 3D 空間)の中に全画面を置き、画面の切り替えはカメラの移動で表す。
 * 画面ごとの DOM(設計ビュー・結果パネルなど)は GameShell の overlays で差し込む。
 * 工房に足す 3D:製図用紙に描く今の設計(PaperInk)。
 */
export default function App() {
  useDesignPaperInsets();
  return <GameShell overlays={APP_OVERLAYS} scene3d={<PaperInk />} />;
}
