import type { WorldRect } from '@/editor/viewport';
import { PAPER_DESIGN } from '@/scene/layout';
import type { DesignRect, Insets, ScreenRect } from '@/scene/rig/paper';

/**
 * 設計画面(INT-1)の配置。工房の製図用紙を真上から見下ろし、紙の周りに UI の置き場所を空ける。
 *
 * DOM の位置(CSS 変数)と、カメラが紙を収める余白(setPaperInsets)を同じ数値から作るので、
 * パネルが紙(=機構)に重なることはない。数値はすべて CSS px、オーバーレイ層(全画面)の左上基準。
 *
 *   ┌ header:← 戻る │ ステージの見出し(slot) │ ヒント(slot) │ 試走する ┐
 *   ├ toolbar(エディタの道具)                    ┬───────────────┤
 *   │                                             │               │
 *   │        製図用紙 = 編集ビュー(ed-canvas)       │  side(エディタ  │
 *   │                                             │   のパネル)   │
 *   └ status(エディタの状態行、紙のすぐ下)          ┴───────────────┘
 *
 * 幅が狭い画面(compact)では side を下に回す。
 */
export const DESIGN_UI = {
  /** 画面の端からの余白 */
  margin: 12,
  /** 領域どうしの間 */
  gap: 8,
  headerHeight: 48,
  toolbarHeight: 44,
  /** 横のパネルの幅(エディタ単体の配置と同じ 300px) */
  sideWidth: 300,
  /** 紙のすぐ下に出すエディタの状態行 */
  statusHeight: 22,
  /** 画面下端の「Esc・右クリックで戻る」の行(scene のオーバーレイ層が出す)。パネルはこの上で止める */
  footerHeight: 22,
  /** これより狭い画面では横のパネルを下に回す */
  compactBelow: 900,
  /** 下に回したパネルの高さ(画面の高さに対する比と上限) */
  sheetRatio: 0.36,
  sheetMax: 300,
} as const;

export interface Box {
  left: number;
  top: number;
  width: number;
  height: number;
}

export interface DesignLayout {
  width: number;
  height: number;
  /** 横のパネルを下に回す配置 */
  compact: boolean;
  /** 紙の周りの余白(setPaperInsets に渡す)。カメラはこの内側に紙を収める */
  insets: Insets;
  /** 上の帯(戻る・見出し・試走) */
  header: Box;
  /** エディタの道具の帯(width は最大幅) */
  toolbar: Box;
  /** エディタの横のパネル(状態・選択・モーター・脚列・コスト) */
  side: Box;
}

const nonNeg = (v: number) => Math.max(0, v);

/** 画面の大きさ → 設計画面の各領域と紙の余白 */
export function designLayout(width: number, height: number): DesignLayout {
  const U = DESIGN_UI;
  const W = Math.max(1, width);
  const H = Math.max(1, height);
  const M = U.margin;
  const G = U.gap;
  const compact = W < U.compactBelow;
  const header: Box = { left: M, top: M, width: nonNeg(W - 2 * M), height: U.headerHeight };
  const rowTop = M + U.headerHeight + G;
  const toolbar: Box = {
    left: M,
    top: rowTop,
    width: nonNeg(compact ? W - 2 * M : W - 2 * M - U.sideWidth - G),
    height: U.toolbarHeight,
  };
  const bottomEdge = H - M - U.footerHeight;
  let side: Box;
  if (compact) {
    const sheet = Math.round(Math.min(U.sheetMax, H * U.sheetRatio));
    side = { left: M, top: bottomEdge - sheet, width: nonNeg(W - 2 * M), height: sheet };
  } else {
    side = {
      left: W - M - U.sideWidth,
      top: rowTop,
      width: U.sideWidth,
      height: nonNeg(bottomEdge - rowTop),
    };
  }
  const statusBand = U.statusHeight + G / 2;
  const insets: Insets = {
    top: rowTop + U.toolbarHeight + G,
    left: M,
    right: compact ? M : M + U.sideWidth + G,
    bottom: compact ? H - side.top + G + statusBand : M + statusBand,
  };
  return { width: W, height: H, compact, insets, header, toolbar, side };
}

/**
 * 設計画面でカメラが落ち着いたときの紙の画面矩形(カメラを使わない予測)。
 * 紙は余白の内側に縦横比を保ってちょうど収まり、中央に来る(scene の designStationPose と同じ規則)。
 * 編集ビューを遷移の終わり前から正しい大きさで用意しておくのに使う。
 */
export function predictPaperRect(
  width: number,
  height: number,
  insets: Insets,
  design: DesignRect = PAPER_DESIGN,
): ScreenRect {
  const availW = Math.max(1, width - insets.left - insets.right);
  const availH = Math.max(1, height - insets.top - insets.bottom);
  const scale = fitScale(availW, availH, design);
  const w = (design.xMax - design.xMin) * scale;
  const h = (design.yMax - design.yMin) * scale;
  return {
    left: insets.left + (availW - w) / 2,
    top: insets.top + (availH - h) / 2,
    width: w,
    height: h,
  };
}

/** 設計画面で 1 cm が何 CSS px になるか(紙が余白の内側にちょうど収まる倍率) */
export function paperPxPerCm(
  width: number,
  height: number,
  insets: Insets,
  design: DesignRect = PAPER_DESIGN,
): number {
  const availW = Math.max(1, width - insets.left - insets.right);
  const availH = Math.max(1, height - insets.top - insets.bottom);
  return fitScale(availW, availH, design);
}

function fitScale(availW: number, availH: number, d: DesignRect): number {
  return Math.min(availW / (d.xMax - d.xMin), availH / (d.yMax - d.yMin));
}

/** scene の設計範囲(xMin…)→ エディタの矩形(minX…)。同じ cm の範囲 */
export function toWorldRect(d: DesignRect): WorldRect {
  return { minX: d.xMin, minY: d.yMin, maxX: d.xMax, maxY: d.yMax };
}

/** 2 つの矩形が(境界の接触を除いて)重なるか */
export function boxesOverlap(a: Box, b: Box): boolean {
  return (
    a.left < b.left + b.width &&
    b.left < a.left + a.width &&
    a.top < b.top + b.height &&
    b.top < a.top + a.height
  );
}
