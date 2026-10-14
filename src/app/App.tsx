import { useState } from 'react';
import { GameShell } from '@/scene/GameShell';
import { bootApp } from './boot';
import { HOME_OVERLAYS, NoticeLayer } from './screens';
import { RUN_OVERLAYS, RunLayer, RunWorld, useRunBridge } from './screens/run3d';

/**
 * ゲーム本体。工房(1 つの 3D 空間)の中に全画面を置き、画面の切り替えはカメラの移動で表す。
 * 画面ごとの DOM(設計ビュー・結果パネルなど)は GameShell の overlays で差し込む。
 * 試走・結果(INT-2 / INT-3):試走コースの 3D(RunWorld)、試走の操作盤・結果パネル(RUN_OVERLAYS)、
 * 画面とセッションの橋(useRunBridge)、試走前チェックで止まったときの問題の一覧(RunLayer)。
 */
export default function App() {
  // 起動(INT-5):セッション・設定・見た遷移・共有リンク。最初の描画の前に 1 回(冪等)
  useState(bootApp);
  useRunBridge();
  return (
    <GameShell overlays={OVERLAYS} scene3d={<RunWorld />}>
      {/* 全画面共通の通知(右上) */}
      <NoticeLayer />
      <RunLayer />
    </GameShell>
  );
}

/** 画面ごとのオーバーレイ。ホーム側(INT-4・INT-5)は HOME_OVERLAYS、試走・結果(INT-2・INT-3)は RUN_OVERLAYS */
const OVERLAYS = {
  ...HOME_OVERLAYS,
  ...RUN_OVERLAYS,
};
