import type { ActiveTransition, AppSettings } from '@/app/store';
import {
  BACK_SPEEDUP,
  BOOT,
  DEFAULT_TRANSITION,
  EASINGS,
  PANEL_REVEAL_AT,
  REDUCED_MOTION_FADE,
  TRANSITIONS,
  type EasingName,
  type Screen,
  type TransitionId,
} from '@/ui/tokens';

/**
 * 画面遷移の時間割(SC-3)。useApp の ActiveTransition とトークンから、
 * 「何秒で・どのイージングで・どう見せるか」を決める純粋なロジック。
 */

export type TransitionMode =
  /** カメラが工房の中を移動する */
  | 'fly'
  /** reduced-motion:カメラは行き先へ即座に移り、直前の画を 0.3 秒でクロスフェードする */
  | 'fade';

export interface TransitionPlan {
  id: TransitionId | null;
  from: Screen;
  to: Screen;
  mode: TransitionMode;
  /** 長さ(s) */
  duration: number;
  easingName: EasingName;
  /** t ∈ [0,1] → 進行度。戻る操作では逆再生(1 − e(1 − t)) */
  easing: (t: number) => number;
  reverse: boolean;
  short: boolean;
  /** 行き先の UI パネルを出す進行度(線形の t) */
  revealAt: number;
  /** performance.now() 基準の開始時刻(ms) */
  startedAt: number;
}

/** イージングの逆再生:時間を反転して同じ動きを逆向きにたどる */
export function reverseEasing(e: (t: number) => number): (t: number) => number {
  return (t) => 1 - e(1 - t);
}

export function planTransition(
  tr: ActiveTransition,
  settings: Pick<AppSettings, 'reducedMotion'>,
): TransitionPlan {
  const token = tr.id ? TRANSITIONS.find((x) => x.id === tr.id) : undefined;
  const base = {
    id: tr.id,
    from: tr.from,
    to: tr.to,
    reverse: tr.reverse,
    short: tr.short,
    startedAt: tr.startedAt,
  };
  if (settings.reducedMotion) {
    return {
      ...base,
      mode: 'fade',
      duration: REDUCED_MOTION_FADE,
      easingName: 'linear',
      easing: EASINGS.linear,
      revealAt: 0.5,
    };
  }
  let duration: number;
  let easingName: EasingName;
  if (!token) {
    duration = DEFAULT_TRANSITION.duration;
    easingName = DEFAULT_TRANSITION.easing;
  } else {
    easingName = token.easing;
    if (tr.reverse) duration = token.repeat / BACK_SPEEDUP;
    else if (tr.short) duration = token.repeat;
    else duration = token.first ?? (token.id === 'T-00' ? BOOT.pullBack : token.repeat);
  }
  const forward = EASINGS[easingName];
  return {
    ...base,
    mode: 'fly',
    duration,
    easingName,
    easing: tr.reverse ? reverseEasing(forward) : forward,
    revealAt: (tr.id ? PANEL_REVEAL_AT[tr.id] : undefined) ?? PANEL_REVEAL_AT.default,
  };
}

export interface TransitionSample {
  /** 線形の時間進行 0..1 */
  t: number;
  /** イージング後の進行度(settle は 1 を少し超えることがある) */
  eased: number;
  done: boolean;
  revealed: boolean;
}

export function sampleTransition(plan: TransitionPlan, nowMs: number): TransitionSample {
  const elapsed = Math.max(0, nowMs - plan.startedAt) / 1000;
  const t = plan.duration > 0 ? Math.min(1, elapsed / plan.duration) : 1;
  return {
    t,
    eased: t >= 1 ? 1 : t <= 0 ? 0 : plan.easing(t),
    done: t >= 1,
    revealed: t >= plan.revealAt,
  };
}

/**
 * 進行中の遷移を 1 つだけ持つ。割り込み(新しい遷移)・スキップに対応する。
 * カメラリグはこれを毎フレーム sample し、done になったら finishTransition を呼ぶ。
 */
export class TransitionDriver {
  plan: TransitionPlan | null = null;
  private skipped = false;

  begin(tr: ActiveTransition, settings: Pick<AppSettings, 'reducedMotion'>): TransitionPlan {
    this.plan = planTransition(tr, settings);
    this.skipped = false;
    return this.plan;
  }

  /** クリック・キーでスキップ:次の sample で終点へ飛ぶ */
  skip() {
    if (this.plan) this.skipped = true;
  }

  get active(): boolean {
    return this.plan !== null;
  }

  sample(nowMs: number): TransitionSample | null {
    if (!this.plan) return null;
    if (this.skipped) return { t: 1, eased: 1, done: true, revealed: true };
    return sampleTransition(this.plan, nowMs);
  }

  clear() {
    this.plan = null;
    this.skipped = false;
  }
}

// ---------------------------------------------------------------------------
// 入力(戻る・スキップ)
// ---------------------------------------------------------------------------

export interface InputLike {
  type: 'keydown' | 'pointerdown' | 'contextmenu';
  key?: string;
  button?: number;
  repeat?: boolean;
  /** Event.timeStamp(performance.now() と同じ時間軸、ms) */
  timeStamp: number;
  defaultPrevented: boolean;
  /** 入力欄など、文字入力中の要素で起きたか */
  editable?: boolean;
}

export interface InputContext {
  screen: Screen;
  transition: ActiveTransition | null;
  historyLength: number;
}

export type InputAction = 'back' | 'skip' | 'skipBoot' | null;

const MODIFIER_KEYS = new Set(['Shift', 'Control', 'Alt', 'Meta', 'CapsLock', 'Tab']);

/**
 * 入力をどう扱うか。
 * - Esc・右クリック:戻る(履歴がなければ、遷移中ならスキップ)
 * - 遷移中のクリック・キー:スキップ(遷移を始めた操作そのものは除く)
 * - 起動中(ロゴ):スキップしてホームへ
 * 他の UI が先に処理した(preventDefault した)入力と、文字入力中のキーは無視する。
 */
export function classifyInput(e: InputLike, ctx: InputContext): InputAction {
  if (e.defaultPrevented) return null;
  const tr = ctx.transition;
  // 遷移を始めた操作(遷移の開始より前に起きた入力)はスキップに数えない
  const afterStart = tr ? e.timeStamp >= tr.startedAt : false;
  if (e.type === 'contextmenu') {
    return ctx.historyLength > 0 ? 'back' : null;
  }
  if (e.type === 'keydown') {
    if (e.editable) return null;
    if (e.key === 'Escape') {
      if (ctx.historyLength > 0 && ctx.screen !== 'boot') return 'back';
      if (tr && afterStart) return 'skip';
      if (ctx.screen === 'boot') return 'skipBoot';
      return null;
    }
    if (e.repeat || (e.key !== undefined && MODIFIER_KEYS.has(e.key))) return null;
    if (tr) return afterStart ? 'skip' : null;
    if (ctx.screen === 'boot') return 'skipBoot';
    return null;
  }
  // pointerdown
  if (e.button !== undefined && e.button !== 0) return null;
  if (tr) return afterStart ? 'skip' : null;
  if (ctx.screen === 'boot') return 'skipBoot';
  return null;
}
