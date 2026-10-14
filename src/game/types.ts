import type { DesignDoc, LegLayout, PartKind } from '@/core/model/types';
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
  /**
   * (追加)作者の参考解。必ず自由度 1・一回転・試走前チェック合格。プレイヤーには見せない。
   * ヘッドレス試走でメダル基準を調整するのに使う。ヒントの影はここから切り出す。
   */
  reference?: DesignDoc;
  /**
   * (追加)脚列の既定値。features.legArray が false の間は、設計の legs はこれに固定される
   * (エディタは脚列 UI を出さず、preflight が検査する)。未指定なら DEFAULT_LEGS。
   */
  defaultLegs?: LegLayout;
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
  /**
   * 完了条件。
   * - place:このステップが始まってから part を count 個置いた(PartCounts の増分)
   * - dof:自由度がちょうど value
   * - fullRotation:自由度 1 で、クランクが一回転できる
   * - testRun:試走を始めた / click:プレイヤーが「次へ」を押した
   * dof・fullRotation はステップが始まった時点で満たしていれば、すぐ次へ進む。
   */
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

/* ------------------------------------------------------------------------------------------------
 * ここから下はウェーブ 1(game ストリーム)での追加。既存の型・フィールドは変えていない(後方互換)。
 *  - StageDef に任意フィールド reference / defaultLegs を追加
 *  - RunSummary:シミュレーター → 評価の入力(統合ウェーブで sim の結果をこの形に写す)
 *  - PreflightProblem / PreflightResult:試走前チェック
 *  - FailCause / FailureDiagnosis:結果画面の失敗理由
 *  - ChapterDef / GameFeature:章の一覧と解放内容
 *  - PartCounts / TutorialSnapshot / TutorialEvent / TutorialState:チュートリアルの状態機械
 * ---------------------------------------------------------------------------------------------- */

/**
 * 1 回の試走の要約(評価の入力)。シミュレーターの最終スナップショットと経過から作る。
 * 単位は m・s・J・rad。
 */
export interface RunSummary {
  /** 試走を終えた時刻(s)。ゴールしたらその時刻、しなければ打ち切った時刻 */
  time: number;
  /** スタートから +x 方向に進んだ距離(m、後退なら負) */
  distance: number;
  /** 機体の重心が goal.x に達した */
  reachedGoal: boolean;
  /** 転倒した(傾きが SimParams.fallTilt を超えた) */
  fallen: boolean;
  /** モーターがトルク上限で止まったまま終わった(S-04) */
  stalled: boolean;
  /** 機構が組立不能になって止まった */
  jammed: boolean;
  /** 消費エネルギー Σ|τ·Δθ|(J) */
  energy: number;
  /** 試走中の最大の傾き(rad) */
  maxTilt?: number;
  /** 重心の高さ(m、足元の地面から)。転倒時の「重心が高い」の判定に使う。なければ設計から推定 */
  comHeight?: number;
}

export type PreflightCode =
  | 'empty'
  | 'mechanism'
  | 'noCrank'
  | 'dofLocked'
  | 'dofLoose'
  | 'notAssemblable'
  | 'noFullRotation'
  | 'partNotAllowed'
  | 'legArrayLocked'
  | 'overBudget'
  | 'motorStopped'
  | 'rpmTooHigh'
  | 'noFoot'
  | 'walksBackward';

export interface PreflightProblem {
  code: PreflightCode;
  /** error は試走できない。warn は試走できるが注意を出す */
  severity: 'error' | 'warn';
  /** i18n キー */
  key: string;
  params?: Record<string, string | number>;
  /** 赤く示すリンク・ジョイント(分かる場合) */
  linkIds?: string[];
  jointIds?: string[];
}

export interface PreflightResult {
  /** error が 1 つもなければ true(試走できる) */
  ok: boolean;
  /** 重要な順。先頭を 1 つ表示すればよい */
  problems: PreflightProblem[];
}

/**
 * 結果画面に出す失敗理由(FailReason を細かくしたもの)。
 * (TUNE-2 で追加)stumbled:段差の側面に脚先が引っかかって止まった(停動のうち、足元に上り段差があるもの)
 */
export type FailCause =
  | 'invalid'
  | 'overBudget'
  | 'jammed'
  | 'stumbled'
  | 'stalled'
  | 'topHeavy'
  | 'fallen'
  | 'wrongWay'
  | 'timeout';

export interface FailureDiagnosis {
  cause: FailCause;
  /** 一言の理由(i18n キー、例:トルク不足) */
  key: string;
  /** 次に試すことの一言(i18n キー) */
  adviceKey: string;
}

/** 章で解放される機能(部品以外) */
export type GameFeature = 'legArray' | 'bodyPreset';

export interface ChapterDef {
  chapter: number;
  titleKey: string;
  descKey: string;
  /** ステージがあって遊べるか(MVP は章 1・2 のみ) */
  playable: boolean;
  /** この章で新しく使えるようになる部品と機能 */
  parts: PartKind[];
  features: GameFeature[];
}

/** 設計に含まれる部品の数(種類ごと、片脚の設計図で数える) */
export type PartCounts = Record<'link' | 'pin' | 'fixed' | 'crank', number>;

/** チュートリアルが見る設計の状態 */
export interface TutorialSnapshot {
  parts: PartCounts;
  dof: number;
  fullRotation: boolean;
}

export type TutorialEvent =
  { type: 'design'; snapshot: TutorialSnapshot } | { type: 'testRun' } | { type: 'click' };

export interface TutorialState {
  /** 今のステップ。steps.length なら終了 */
  index: number;
  /** 今のステップが始まったときの部品数('place' はここからの増分で数える) */
  baseline: PartCounts;
  /** 最後に受け取った設計の状態 */
  snapshot: TutorialSnapshot;
}
