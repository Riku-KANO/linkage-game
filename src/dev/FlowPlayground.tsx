import { FlowLoop } from '@/app/flow/dom';

/**
 * 開発用プレイグラウンド(?dev=flow、FLOW-6)。3D なしで遊べる通しのループ:
 * ステージ選択 → 設計 → 2D 側面の試走 → 結果 → 次のステージ。
 * 進行と設計はブラウザに保存される(本番と同じ保存先)。共有リンク(#s=...)で開くとその機械を読み込む。
 */
export default function FlowPlayground() {
  return <FlowLoop />;
}
