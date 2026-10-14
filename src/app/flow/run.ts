import type { MechanismAnalysis } from '@/core/kinematics/analyze';
import { createGhostRecorder, type Ghost, type GhostRecorder } from '@/core/model/ghost';
import type { DesignDoc } from '@/core/model/types';
import type { DesignSlot } from '@/core/storage/persistence';
import {
  Walker,
  type SimParams,
  type SimSnapshot,
  type TerrainCollider,
  type WalkerSim,
} from '@/core/sim';
import {
  diagnoseFailure,
  evaluateRun,
  improvedAxes,
  isStageUnlocked,
  newlyUnlocked,
  nextStageId,
  recordResult,
  type FailureDiagnosis,
  type PreflightResult,
  type Progress,
  type RunResult,
  type RunSummary,
  type ScoreAxis,
  type StageDef,
  type StageId,
  type Unlocks,
} from '@/game';

/**
 * 試走のライフサイクル(FLOW-2)。
 *
 * `LiveRun` は 1 回の試走:機体(WalkerSim)を 240Hz の固定ステップで進め、ステップごとに終了を
 * 判定し、ゴーストを記録する。3D/2D のビューは `advance(実時間)` で進めて `snapshot()` を描く。
 * ヘッドレス(`runStageHeadless`)も同じ `step()` を回すだけなので、同じ設計・同じ地形なら
 * ライブとヘッドレスの結果はビット単位で一致する(S-05)。
 *
 * 終了条件(どれか 1 つで止まる):
 *  - goal:重心が stage.goal.x に達した
 *  - fallen:転倒(傾きが fallTilt を超えた) / jammed:機構が組立不能で止まった
 *  - stalled:停動(トルク上限で止まる)が STALL_TIMEOUT 秒続いた
 *  - timeLimit:制限時間に達した
 */

/** 停動がこの秒数続いたら試走を打ち切る */
export const STALL_TIMEOUT = 2;
/** advance 1 回で進める実時間の上限(s)。タブが裏にあって大きく飛んだときに固まらないように */
export const MAX_FRAME_DT = 0.1;
/** 再生速度の候補(試走ビューのボタン) */
export const RUN_SPEEDS = [0.5, 1, 2] as const;

export type RunEnd = 'goal' | 'fallen' | 'jammed' | 'stalled' | 'timeLimit';

export interface LiveRunOptions {
  /** シミュレーションの設定の上書き(テスト用。停動トルクなど) */
  params?: Partial<SimParams>;
  /** ゴーストの記録頻度(Hz、既定 10) */
  ghostHz?: number;
}

/** 試走中の表示用の値(HUD-5:時間・距離・ゴールまでの進み具合) */
export interface RunStatus {
  time: number;
  timeLimit: number;
  /** スタートから進んだ距離(m、重心の x) */
  distance: number;
  /** スタートからゴールまでの距離(m) */
  goalDistance: number;
  /** ゴールまでの進み具合 0..1 */
  progress: number;
  stalled: boolean;
  fallen: boolean;
  jammed: boolean;
  done: boolean;
  end: RunEnd | null;
}

export class LiveRun {
  readonly stage: StageDef;
  readonly design: DesignDoc;
  readonly terrain: TerrainCollider;
  /** 機体(3D/2D の描画用)。ステップは LiveRun を通して進めること */
  readonly sim: WalkerSim;
  /** スタート時の重心の x(m) */
  readonly startX: number;
  /** スタート時(直立)の重心の高さ(m、足元の地形から)。失敗理由「重心が高い」の判定に使う */
  readonly comHeight: number;
  /** 再生速度(advance の実時間に掛ける) */
  speed = 1;
  paused = false;

  private readonly walker: Walker;
  private readonly recorder: GhostRecorder;
  private readonly maxSteps: number;
  private steps = 0;
  private acc = 0;
  private stallRun = 0;
  private maxTilt: number;
  private reachedGoal: boolean;
  private _end: RunEnd | null = null;
  private snap: { steps: number; value: SimSnapshot } | null = null;

  constructor(
    stage: StageDef,
    design: DesignDoc,
    terrain: TerrainCollider,
    options: LiveRunOptions = {},
  ) {
    this.stage = stage;
    this.design = design;
    this.terrain = terrain;
    this.walker = new Walker({
      design,
      terrain,
      start: stage.start,
      ...(options.params ? { params: options.params } : {}),
    });
    this.sim = this.walker;
    const w = this.walker;
    this.startX = w.com[0]!;
    const ground = terrain.heightAt(w.com[0]!, w.com[2]!);
    this.comHeight = Number.isFinite(ground) ? w.com[1]! - ground : w.com[1]!;
    this.maxSteps = Math.max(0, Math.ceil(stage.timeLimit / w.params.dt - 1e-9));
    this.maxTilt = w.tilt;
    this.reachedGoal = w.com[0]! >= stage.goal.x;
    this.recorder = createGhostRecorder(options.ghostHz);
    this.record();
    this.checkEnd();
  }

  get done(): boolean {
    return this._end !== null;
  }

  /** 終わった理由(走行中は null) */
  get end(): RunEnd | null {
    return this._end;
  }

  /** シミュレーションの時刻(s) */
  get time(): number {
    return this.walker.time;
  }

  /** 固定ステップの長さ(s、既定 1/240) */
  get dt(): number {
    return this.walker.params.dt;
  }

  /** 固定ステップを 1 回進める。終わっていれば何もしない。進めたら true */
  step(): boolean {
    if (this._end !== null) return false;
    const w = this.walker;
    w.step();
    this.steps++;
    this.stallRun = w.stalled ? this.stallRun + w.params.dt : 0;
    const tilt = w.tilt;
    if (tilt > this.maxTilt) this.maxTilt = tilt;
    if (!this.reachedGoal && w.com[0]! >= this.stage.goal.x) this.reachedGoal = true;
    this.record();
    this.checkEnd();
    return true;
  }

  /**
   * 実時間 realDt(s)だけ進める(× speed、一時停止中は進めない)。端数は次の呼び出しへ持ち越す。
   * 進めたステップ数を返す。
   */
  advance(realDt: number): number {
    if (this.paused || this._end !== null) return 0;
    const dt = this.walker.params.dt;
    const d = Number.isFinite(realDt) ? Math.min(MAX_FRAME_DT, Math.max(0, realDt)) : 0;
    this.acc += d * Math.max(0, this.speed);
    let n = 0;
    // 1e-9:1/60 秒のフレームでちょうど 4 ステップになるように(浮動小数の誤差で 3 と 5 を繰り返さない)
    while (this.acc >= dt - 1e-9 && this._end === null) {
      this.step();
      this.acc -= dt;
      n++;
    }
    if (this._end !== null) this.acc = 0;
    return n;
  }

  /** 終わるまで一気に進めて要約を返す(ヘッドレス・「結果へ」のスキップ) */
  runToEnd(): RunSummary {
    while (this._end === null) this.step();
    return this.summary();
  }

  /** 今の状態のスナップショット(同じステップの間はキャッシュを返す) */
  snapshot(): SimSnapshot {
    if (this.snap?.steps !== this.steps) {
      this.snap = { steps: this.steps, value: this.walker.snapshot() };
    }
    return this.snap.value;
  }

  status(): RunStatus {
    const w = this.walker;
    const goalDistance = this.stage.goal.x - this.startX;
    const distance = w.com[0]! - this.startX;
    return {
      time: w.time,
      timeLimit: this.stage.timeLimit,
      distance,
      goalDistance,
      progress: goalDistance > 0 ? Math.min(1, Math.max(0, distance / goalDistance)) : 1,
      stalled: w.stalled,
      fallen: w.fallen,
      jammed: w.jammed,
      done: this._end !== null,
      end: this._end,
    };
  }

  /** 評価の入力(走行中に呼ぶと、その時点で打ち切ったときの要約) */
  summary(): RunSummary {
    const w = this.walker;
    return {
      time: w.time,
      distance: w.com[0]! - this.startX,
      reachedGoal: this.reachedGoal,
      fallen: w.fallen,
      stalled: w.stalled,
      jammed: w.jammed,
      energy: w.energy,
      maxTilt: this.maxTilt,
      comHeight: this.comHeight,
    };
  }

  /** この試走のゴースト(10Hz の姿勢列、コピー) */
  ghost(): Ghost {
    return this.recorder.ghost();
  }

  private record() {
    const p = this.walker.poseSample();
    this.recorder.record({
      time: p.time,
      body: { position: p.position, quaternion: p.quaternion },
      motorAngle: p.motorAngle,
    });
  }

  private checkEnd() {
    if (this._end !== null) return;
    const w = this.walker;
    if (this.reachedGoal) this._end = 'goal';
    else if (w.fallen) this._end = 'fallen';
    else if (w.jammed) this._end = 'jammed';
    else if (this.stallRun >= STALL_TIMEOUT - 1e-9) this._end = 'stalled';
    else if (this.steps >= this.maxSteps) this._end = 'timeLimit';
  }
}

export interface HeadlessRun {
  summary: RunSummary;
  ghost: Ghost;
  end: RunEnd;
}

/** ヘッドレスで最後まで走らせる(テスト・メダル基準の調整用)。ライブと同じ結果になる */
export function runStageHeadless(
  stage: StageDef,
  design: DesignDoc,
  terrain: TerrainCollider,
  options: LiveRunOptions = {},
): HeadlessRun {
  const run = new LiveRun(stage, design, terrain, options);
  const summary = run.runToEnd();
  return { summary, ghost: run.ghost(), end: run.end! };
}

/** 試走 1 回の結果(結果画面・通知・ゴーストに使うものをまとめたもの) */
export interface RunOutcome {
  stage: StageDef;
  /** 設計のスロット(ステージ id かサンドボックス) */
  slot: DesignSlot;
  /** 試走した設計 */
  design: DesignDoc;
  summary: RunSummary;
  result: RunResult;
  /** 失敗理由(クリアなら null)。結果画面の reasonKey は diagnosis.key */
  diagnosis: FailureDiagnosis | null;
  /** この試走のゴースト(共有リンクと、次の試走の「前回」ゴーストに使う) */
  ghost: Ghost;
  /** この試走の前の最高記録 */
  previousBest: RunResult | null;
  /** 最高記録を更新した軸 */
  improved: ScoreAxis[];
  /** この試走で新しく解放されたもの */
  unlocks: Unlocks;
  /** クリアして次のステージが遊べるなら、その id */
  nextStageId: StageId | null;
}

export interface CompleteRunInput {
  stage: StageDef;
  slot: DesignSlot;
  design: DesignDoc;
  summary: RunSummary;
  ghost: Ghost;
  /** 試走前の進行 */
  progress: Progress;
  preflight?: PreflightResult;
  analysis?: MechanismAnalysis;
}

/**
 * 試走を評価して進行に記録する(純粋な関数)。evaluateRun → diagnoseFailure → recordResult →
 * newlyUnlocked。知らないステージ(サンドボックス)は進行を変えない。
 */
export function completeRun(input: CompleteRunInput): { outcome: RunOutcome; progress: Progress } {
  const { stage, design, summary, progress } = input;
  const result = evaluateRun(stage, design, summary);
  const diagnosis = diagnoseFailure(stage, design, summary, {
    ...(input.analysis ? { analysis: input.analysis } : {}),
    ...(input.preflight ? { preflight: input.preflight } : {}),
  });
  const previousBest = progress.best[stage.id] ?? null;
  const after = recordResult(progress, result);
  const next = result.cleared ? nextStageId(stage.id) : null;
  return {
    progress: after,
    outcome: {
      stage,
      slot: input.slot,
      design,
      summary,
      result,
      diagnosis,
      ghost: input.ghost,
      previousBest,
      improved: improvedAxes(previousBest ?? undefined, result),
      unlocks: newlyUnlocked(progress, after),
      nextStageId: next !== null && isStageUnlocked(after, next) ? next : null,
    },
  };
}
