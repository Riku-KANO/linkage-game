import { useState } from 'react';
import { GameShell } from '@/scene/GameShell';
import type { Screen } from '@/ui/tokens';
import { bootApp } from './boot';
import {
  DesignHudScreen,
  HOME_OVERLAYS,
  NoticeLayer,
  PaperInk,
  useDesignGuide,
  useDesignPaperInsets,
} from './screens';
import { RUN_OVERLAYS, RunWorld, beginTestRun, useRunBridge } from './screens/run3d';

/**
 * ゲーム本体。工房(1 つの 3D 空間)の中に全画面を置き、画面の切り替えはカメラの移動で表す。
 * 画面ごとの DOM(設計ビュー・結果パネルなど)は GameShell の overlays で差し込む。
 * 工房に足す 3D:製図用紙に描く今の設計(PaperInk)、試走コースの 3D(RunWorld)。
 * 試走・結果(INT-2 / INT-3):試走の操作盤・結果パネル(RUN_OVERLAYS)、画面とセッションの橋(useRunBridge)。
 * 設計画面の HUD と案内(INT-7a):見出し・ヒント・チュートリアルの吹き出し・状況の一言・試走ボタンと
 * 試走前チェックの一覧・遊び方(DesignHudScreen)。試走の結果を一言のために覚える(useDesignGuide)。
 */
export default function App() {
  // 起動(INT-5):セッション・設定・見た遷移・共有リンク。最初の描画の前に 1 回(冪等)
  useState(bootApp);
  // 設計画面(INT-1):紙の周りに道具の帯・パネルの余白を空ける(遷移の前から決めておく)
  useDesignPaperInsets();
  useRunBridge();
  useDesignGuide();
  return (
    <GameShell
      overlays={OVERLAYS}
      scene3d={
        <>
          <PaperInk />
          <RunWorld />
        </>
      }
    >
      {/* 全画面共通の通知(右上) */}
      <NoticeLayer />
    </GameShell>
  );
}

/** 設計画面の試走ボタン:試走前チェックに通れば試走へ、だめなら設計に残って問題を示す */
function DesignOverlay({ screen }: { screen: Screen }) {
  return <DesignHudScreen screen={screen} onTestRun={() => void beginTestRun()} />;
}

/**
 * 画面ごとのオーバーレイ。ホーム側(INT-4・INT-5)は HOME_OVERLAYS、設計(INT-1)は DesignOverlay、
 * 試走・結果(INT-2・INT-3)は RUN_OVERLAYS
 */
const OVERLAYS = {
  ...HOME_OVERLAYS,
  design: DesignOverlay,
  ...RUN_OVERLAYS,
};
