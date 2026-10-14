import type { ActiveTransition, AppSettings } from '@/app/store';
import type { Screen } from '@/ui/tokens';
import { planTransition, sampleTransition, type TransitionPlan } from '../rig/timeline';
import { GOAL_SLOWMO, goalTimeScale } from './timeline';

/**
 * 演出の進行役(純粋なロジック、three・React に依存しない)。
 * useApp の画面・遷移から、どの演出を・どこまで進めるかを毎フレーム決める。
 *
 *  - assemble    設計 → 試走(T-03):図面から機械を組み上げてコースに降ろす(組み上がり具合 0 → 1)
 *  - disassemble 結果・試走 → 設計(T-05、T-03 の逆再生):機械を吊り上げて図面に戻す(1 → 0)
 *  - goal        試走 → 結果(T-04):時間がゆっくりになり、カメラが機械の周りを半周する
 *
 * 時間は遷移と同じ(rig/timeline の planTransition・sampleTransition)。reduced-motion(フェード)では
 * 演出を飛ばして終わりの状態にする。スキップは終わりへ跳ぶ。途中で逆向きの遷移が来たら(割り込み)、
 * 今の組み上がり具合から逆へたどる。
 */

export type FxKind = 'assemble' | 'disassemble' | 'goal';

const OUTDOOR: ReadonlySet<Screen> = new Set<Screen>(['testRun', 'result']);

export function isOutdoor(screen: Screen): boolean {
  return OUTDOOR.has(screen);
}

/** 遷移がどの演出か */
export function classifyTransition(
  tr: Pick<ActiveTransition, 'from' | 'to' | 'reverse'>,
): FxKind | null {
  if (tr.from === 'design' && OUTDOOR.has(tr.to)) return 'assemble';
  if (tr.to === 'design' && OUTDOOR.has(tr.from)) return 'disassemble';
  if (tr.from === 'testRun' && tr.to === 'result' && !tr.reverse) return 'goal';
  return null;
}

/** 遷移していないときの組み上がり具合:屋外の画面ではコースの上、それ以外は図面のまま */
export function restingLevel(screen: Screen): number {
  return OUTDOOR.has(screen) ? 1 : 0;
}

export interface FxFrame {
  /** 進行中の演出(終わったら null) */
  kind: FxKind | null;
  /** 組み上がり具合 0(図面)..1(コース) */
  level: number;
  /** 今の演出の始めと終わりの組み上がり具合 */
  fromLevel: number;
  toLevel: number;
  /** 遷移の線形の進み 0..1 */
  t: number;
  /** 演出が機械を描いている(試走の機体は隠す) */
  machineInFx: boolean;
  /** 試走の時間の倍率(controller.tick(dt × これ))。組み上げ・分解中は 0、ゴールでスロー */
  timeScale: number;
  /** このフレームで組み上げが終わり、試走の機体に引き継いだ */
  handover: boolean;
  /** この演出の遷移の計画(カメラが同じ遷移かを確かめる) */
  plan: TransitionPlan | null;
  /** 今の演出が始まったフレーム(カメラのつなぎに使う) */
  started: boolean;
}

export interface DirectorInput {
  screen: Screen;
  transition: ActiveTransition | null;
  settings: Pick<AppSettings, 'reducedMotion'>;
}

export class FxDirector {
  readonly frame: FxFrame = {
    kind: null,
    level: 0,
    fromLevel: 0,
    toLevel: 0,
    t: 1,
    machineInFx: false,
    timeScale: 1,
    handover: false,
    plan: null,
    started: false,
  };
  private tr: ActiveTransition | null = null;
  private skipped = false;

  /** 1 フレーム進める。skip はクリック・キーによるスキップの合図(リグと同じフレームで読む) */
  update(app: DirectorInput, nowMs: number, skip = false): FxFrame {
    const f = this.frame;
    f.handover = false;
    f.started = false;
    const tr = app.transition;
    if (tr !== this.tr) {
      this.tr = tr;
      this.skipped = false;
      if (tr) this.begin(tr, app.settings);
      else if (f.kind) this.finish();
    }
    if (skip && f.kind) this.skipped = true;
    if (f.kind && f.plan && f.t < 1) {
      const t = this.skipped || f.plan.mode === 'fade' ? 1 : sampleTransition(f.plan, nowMs).t;
      this.advance(t);
    } else if (!tr) {
      f.level = restingLevel(app.screen);
      f.fromLevel = f.toLevel = f.level;
    }
    f.machineInFx = (f.kind === 'assemble' || f.kind === 'disassemble') && f.t < 1;
    f.timeScale = this.timeScale(app);
    return f;
  }

  private begin(tr: ActiveTransition, settings: Pick<AppSettings, 'reducedMotion'>) {
    const f = this.frame;
    const kind = classifyTransition(tr);
    // 前の演出の途中なら、今の組み上がり具合から続ける
    const level =
      f.kind === 'assemble' || f.kind === 'disassemble' ? f.level : restingLevel(tr.from);
    f.kind = kind;
    f.plan = kind ? planTransition(tr, settings) : null;
    f.t = 0;
    f.started = kind !== null;
    f.fromLevel = level;
    f.level = level;
    f.toLevel = kind === 'assemble' ? 1 : kind === 'disassemble' ? 0 : restingLevel(tr.to);
    if (!kind) {
      f.level = f.toLevel;
      f.fromLevel = f.toLevel;
      f.t = 1;
    }
  }

  private advance(t: number) {
    const f = this.frame;
    f.t = t;
    if (f.kind === 'assemble' || f.kind === 'disassemble') {
      f.level = f.fromLevel + (f.toLevel - f.fromLevel) * t;
    }
    if (t >= 1) this.finish();
  }

  private finish() {
    const f = this.frame;
    if (f.kind === 'assemble') f.handover = true;
    if (f.kind === 'assemble' || f.kind === 'disassemble') f.level = f.toLevel;
    f.t = 1;
    // goal は結果画面にいる間、終わりの倍率を保つ(timeScale で見る)
    f.kind = f.kind === 'goal' ? 'goal' : null;
  }

  private timeScale(app: DirectorInput): number {
    const f = this.frame;
    if (f.kind === 'goal' && f.t < 1) return goalTimeScale(f.t);
    if ((f.kind === 'assemble' || f.kind === 'disassemble') && f.t < 1) return 0;
    const onResult = app.screen === 'result' || app.transition?.from === 'result';
    return onResult ? GOAL_SLOWMO.endScale : 1;
  }

  /** 進行中(終わっていない)の演出 */
  get active(): FxKind | null {
    const f = this.frame;
    return f.kind && f.t < 1 ? f.kind : null;
  }
}
