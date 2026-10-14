import type { DesignDoc, PartKind } from '@/core/model/types';
import type { TerrainSpec } from '@/core/sim/types';

/**
 * ステージ・評価・進行の契約。
 * 章 1・2 が MVP。章ごとに機構学の考え方を 1 つずつ学ぶ。
 */

export type StageId = string; // 'c1-s1' など

/** [金, 銀, 銅] の基準値。どれも小さいほど良い */
export type MedalThreshold = [gold: number, silver: number, bronze: number];
export type Medal = 'gold' | 'silver' | 'bronze' | null;

export interface StageDef {
  id: StageId;
  chapter: number;
  order: number;
  /** i18n キー */
  titleKey: string;
  descKey: string;
  terrain: TerrainSpec;
  /** スタート位置(m) */
  start: { x: number; z: number };
  /** ゴール:機体の重心が x >= goal.x に達する(m) */
  goal: { x: number };
  /** 制限時間(s) */
  timeLimit: number;
  /** 予算(コスト上限)。null なら無制限 */
  budget: number | null;
  /** 使える部品 */
  parts: PartKind[];
  /** 使える機能 */
  features: { legArray: boolean };
  /** 最初から置いてある設計(章 1 の「壊れた機械を直す」課題など) */
  initialDesign?: DesignDoc;
  /** 編集できないジョイント(チュートリアル用) */
  lockedJoints?: string[];
  medals: {
    time: MedalThreshold;
    parts: MedalThreshold;
    cost: MedalThreshold;
    energy: MedalThreshold;
  };
  /** 3 段階のヒント:方針の一言、部品配置の影、完成形の一部 */
  hints: [HintText, HintGhost, HintGhost];
  /** チュートリアル(章 1 の最初の 3 ステージ) */
  tutorial?: TutorialStep[];
}

export interface HintText {
  kind: 'text';
  key: string;
}
/** 設計ビューに影として重ねる部品配置 */
export interface HintGhost {
  kind: 'ghost';
  key: string;
  design: DesignDoc;
}

export interface TutorialStep {
  key: string;
  /** このステップで渡す部品 */
  give?: PartKind[];
  /** 完了条件 */
  until:
    | { kind: 'place'; part: PartKind; count: number }
    | { kind: 'dof'; value: number }
    | { kind: 'fullRotation' }
    | { kind: 'testRun' }
    | { kind: 'click' };
}

export type FailReason = 'fallen' | 'timeout' | 'stalled' | 'jammed' | 'overBudget' | 'invalid';

export interface RunResult {
  stageId: StageId;
  cleared: boolean;
  reason: FailReason | null;
  /** 到達時間(s)。未到達なら制限時間 */
  time: number;
  /** 部品数 */
  parts: number;
  cost: number;
  /** 消費エネルギー(J) */
  energy: number;
  /** 進んだ距離(m) */
  distance: number;
  medals: { time: Medal; parts: Medal; cost: Medal; energy: Medal };
}

/** クリア状況(U-01 で保存) */
export interface Progress {
  version: 1;
  /** ステージごとの最高記録 */
  best: Record<StageId, RunResult>;
  /** 解放済みの章 */
  unlockedChapters: number[];
  /** 図鑑に登録した機構 id(U-06、MVP では中身なし) */
  zukan: string[];
  /** 見た遷移(2 回目以降は短縮版、設計原則 5) */
  seenTransitions: string[];
}
