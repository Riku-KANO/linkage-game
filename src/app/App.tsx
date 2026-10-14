import { useState } from 'react';
import { GameShell } from '@/scene/GameShell';
import { bootApp } from './boot';
import {
  DesignScreen,
  HOME_OVERLAYS,
  NoticeLayer,
  PaperInk,
  useDesignPaperInsets,
} from './screens';

/**
 * ゲーム本体。工房(1 つの 3D 空間)の中に全画面を置き、画面の切り替えはカメラの移動で表す。
 * 画面ごとの DOM(設計ビュー・結果パネルなど)は GameShell の overlays で差し込む。
 * 工房に足す 3D:製図用紙に描く今の設計(PaperInk)。
 */
export default function App() {
  // 起動(INT-5):セッション・設定・見た遷移・共有リンク。最初の描画の前に 1 回(冪等)
  useState(bootApp);
  // 設計画面(INT-1):紙の周りに道具の帯・パネルの余白を空ける(遷移の前から決めておく)
  useDesignPaperInsets();
  return (
    <GameShell overlays={OVERLAYS} scene3d={<PaperInk />}>
      {/* 全画面共通の通知(右上) */}
      <NoticeLayer />
    </GameShell>
  );
}

/** 画面ごとのオーバーレイ。ホーム側(INT-4・INT-5)は HOME_OVERLAYS、設計・試走・結果は各ストリームが足す */
const OVERLAYS = {
  ...HOME_OVERLAYS,
  design: DesignScreen,
};
