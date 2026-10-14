import { create } from 'zustand';
import type { DesignDoc } from '@/core/model/types';
import type { SimSnapshot } from '@/core/sim/types';
import type { FxKind } from './director';
import { FxDirector } from './director';
import { defaultPaperMapping, type PaperMapping } from './crane';

/**
 * 演出(INT-6)の公開する状態と、試走の統合(INT-2 / INT-3)との約束。
 *
 * 離散的な状態(変わったときだけ再描画)は useFx、毎フレームの値は fxDirector.frame(React を通さない)。
 */

export interface FxUiState {
  /** 進行中の演出(組み上げ・分解・ゴール)。終わると null */
  kind: FxKind | null;
  /** 演出が機械を描いている:試走の機体(MachineModel)は隠す */
  machineInFx: boolean;
  /**
   * 試走コースの機械を演出(と引き継ぎ先の試走の機体)が受け持つ:工房の仮置きの見本機は出さない。
   * 試走・結果の画面にいる間と、そこへ出入りする遷移の間 true。
   */
  ownsTrack: boolean;
  /** 統合側の試走の機体が登録されている(なければ演出が代わりの機体をコースに置く) */
  externalMachine: boolean;
}

export const useFx = create<FxUiState>(() => ({
  kind: null,
  machineInFx: false,
  ownsTrack: false,
  externalMachine: false,
}));

/** 演出の進行役(1 つだけ)。FxLayer が毎フレーム update する */
export const fxDirector = new FxDirector();

/**
 * 試走の時間の倍率。試走の進行役は `controller.tick(dt * getFxTimeScale())` で進める。
 *  - 組み上げ(T-03)・分解(T-05)の間は 0(コースに降りるまで試走は始まらない)
 *  - ゴール(T-04)では 1 → 0.2 にゆっくりになり、カメラが回り込んだあと 0 で止まる(結果画面の間 0)
 *  - それ以外は 1
 */
export function getFxTimeScale(): number {
  return fxDirector.frame.timeScale;
}

// ---------------------------------------------------------------------------
// 試走の機体(統合側が登録する)
// ---------------------------------------------------------------------------

export interface TrackMachine {
  /** コースの機械の設計(エディタの設計と同じもの) */
  design: DesignDoc;
  /**
   * 描画用のスナップショット(シミュレーション座標)。組み上げの着地点(最初の姿勢)と、
   * 分解で吊り上げる姿勢をここから読む。まだなければ null
   */
  getSnapshot(): SimSnapshot | null;
  /** シミュレーション座標の原点のワールド座標(TestRunScene を置いた group の位置) */
  origin: readonly [number, number, number];
}

interface Entry {
  machine: TrackMachine;
  fallback: boolean;
}
const entries: Entry[] = [];

function syncExternal() {
  const ext = entries.some((e) => !e.fallback);
  if (useFx.getState().externalMachine !== ext) useFx.setState({ externalMachine: ext });
}

/**
 * 試走コースの機体を登録する(解除関数を返す)。後から登録したものが優先。
 * fallback は演出が自分で置く代わりの機体(統合側の機体があればそちらを使う)。
 */
export function registerTrackMachine(
  machine: TrackMachine,
  opts: { fallback?: boolean } = {},
): () => void {
  const entry: Entry = { machine, fallback: opts.fallback ?? false };
  entries.push(entry);
  syncExternal();
  return () => {
    const i = entries.indexOf(entry);
    if (i >= 0) entries.splice(i, 1);
    syncExternal();
  };
}

/** 今の試走の機体(統合側を優先) */
export function getTrackMachine(): TrackMachine | null {
  for (let i = entries.length - 1; i >= 0; i--)
    if (!entries[i]!.fallback) return entries[i]!.machine;
  return entries[entries.length - 1]?.machine ?? null;
}

// ---------------------------------------------------------------------------
// 引き継ぎの合図
// ---------------------------------------------------------------------------

type Listener = () => void;
const handoverListeners = new Set<Listener>();

/**
 * 組み上げ(T-03)が終わって機械がコースに着いた瞬間(スキップ・reduced-motion でも 1 回)。
 * 試走の機体を見せて走らせ始める合図。解除関数を返す。
 */
export function onFxHandover(fn: Listener): () => void {
  handoverListeners.add(fn);
  return () => handoverListeners.delete(fn);
}

export function emitHandover() {
  for (const fn of handoverListeners) fn();
}

// ---------------------------------------------------------------------------
// 製図用紙と設計座標の対応
// ---------------------------------------------------------------------------

let paperMapping: () => PaperMapping = defaultPaperMapping;

/**
 * 紙の上の図面の位置と縮尺を差し替える(設計画面が編集ビューをパン・ズームして紙に描く場合)。
 * 組み上げはこの位置の図面から立ち上がり、分解はここへ戻る。null で既定(PAPER_DESIGN = 紙)。
 */
export function setPaperMapping(fn: (() => PaperMapping) | null): void {
  paperMapping = fn ?? defaultPaperMapping;
}

export function getPaperMapping(): PaperMapping {
  return paperMapping();
}
