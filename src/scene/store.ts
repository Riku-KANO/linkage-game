import { create } from 'zustand';
import type { Screen } from '@/ui/tokens';
import { PAPER_DESIGN } from './layout';
import { DEFAULT_PAPER_INSETS, type DesignRect, type Insets, type ScreenRect } from './rig/paper';

/**
 * scene モジュールの UI 状態(離散的な変化だけ。毎フレームの値は rigDebug / ref に置く)。
 */

/** ホームのメニュー項目(工房の物体と画面端のテキストメニューで共通) */
export type MenuItemId = 'continue' | 'stageSelect' | 'zukan' | 'sandbox' | 'settings';

export interface PaperViewport {
  /** 設計画面でカメラが落ち着いているか。false の間は rect を使わない(編集ビューを隠す) */
  ready: boolean;
  /** 製図用紙の画面上の矩形(Canvas 要素 = オーバーレイ層の左上基準、CSS px) */
  screen: ScreenRect;
  /** 紙に対応する設計座標(cm)。y 上向き:yMax が画面の上端 */
  design: DesignRect;
  /** 1 cm あたりの CSS px */
  pxPerCm: number;
}

interface SceneUiState {
  hovered: MenuItemId | null;
  /** 行き先の UI パネルを出してよい画面(遷移が revealAt を過ぎた、または落ち着いた) */
  revealed: Screen | null;
  paper: PaperViewport;
  /** 設計画面で紙の周りに空ける余白(編集ビュー側が道具パネルに合わせて変えてよい) */
  paperInsets: Insets;
  setHovered(id: MenuItemId | null): void;
  setRevealed(s: Screen | null): void;
  setPaper(p: PaperViewport): void;
  setPaperInsets(i: Insets): void;
}

const EMPTY_RECT: ScreenRect = { left: 0, top: 0, width: 0, height: 0 };

export const useSceneUi = create<SceneUiState>((set, get) => ({
  hovered: null,
  revealed: null,
  paper: { ready: false, screen: EMPTY_RECT, design: { ...PAPER_DESIGN }, pxPerCm: 0 },
  paperInsets: DEFAULT_PAPER_INSETS,
  setHovered(id) {
    if (get().hovered !== id) set({ hovered: id });
  },
  setRevealed(s) {
    if (get().revealed !== s) set({ revealed: s });
  },
  setPaper(p) {
    const q = get().paper;
    const same =
      q.ready === p.ready &&
      Math.abs(q.screen.left - p.screen.left) < 0.01 &&
      Math.abs(q.screen.top - p.screen.top) < 0.01 &&
      Math.abs(q.screen.width - p.screen.width) < 0.01 &&
      Math.abs(q.screen.height - p.screen.height) < 0.01;
    if (!same) set({ paper: p });
  },
  setPaperInsets(i) {
    set({ paperInsets: i });
  },
}));

/**
 * 製図用紙の画面上の位置と、対応する設計座標。設計画面の編集ビュー(DOM / SVG)を
 * 紙にピクセル単位で重ねるために使う。ready のときだけ有効(遷移中・他の画面では false)。
 * 画面サイズが変わると更新される(毎フレームの再描画は起こさない)。
 */
export function usePaperViewport(): PaperViewport {
  return useSceneUi((s) => s.paper);
}

/** 紙の周りの余白を変える(編集ビューの道具パネルの大きさに合わせる)。カメラが紙を収め直す */
export function setPaperInsets(insets: Insets): void {
  useSceneUi.getState().setPaperInsets(insets);
}

/** リグへの合図(React を通さない)。入力処理が書き、カメラリグが毎フレーム読む */
export const rigSignals = {
  skip: false,
  skipBoot: false,
};

/** デバッグ表示用の値(カメラリグが毎フレーム書く。React の再描画は起こさない) */
export const rigDebug = {
  screen: 'boot' as Screen,
  transitionId: null as string | null,
  progress: 0,
  eased: 0,
  mode: 'idle' as 'idle' | 'fly' | 'fade',
  duration: 0,
  reverse: false,
  short: false,
  fps: 0,
  ortho: 0,
  fov: 0,
};
