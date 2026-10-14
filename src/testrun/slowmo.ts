import type { Quat } from '@/core/sim/types';

/**
 * 転倒の瞬間の自動スロー(TR-3、「転倒の瞬間は自動でスローになる」)。純粋なロジック。
 *
 * 傾き(機体の上方向と鉛直のなす角)と傾きの速さから「倒れ始め」を検出し、時間の倍率を
 * 1 → slowScale へ素早く落とし、hold 秒保ってから 1 へ戻す。1 回の試走で 1 度だけ発動する。
 * 時間は実時間(描画の dt)で進める。傾きの速さはシミュレーション時間で測ること
 * (スロー中に値が小さく見えないように)。
 */

export interface SlowMoParams {
  /** この傾き(rad)以上で、かつ傾きの速さが tiltRateThreshold 以上なら倒れ始めとみなす */
  tiltThreshold: number;
  /** 傾きの速さ(rad/s、シミュレーション時間) */
  tiltRateThreshold: number;
  /** 速さに関係なく発動する傾き(rad) */
  hardTilt: number;
  /** スロー中の時間の倍率 */
  slowScale: number;
  /** 実時間(s):落とす時間、保つ時間、戻す時間 */
  easeIn: number;
  hold: number;
  easeOut: number;
}

export const DEFAULT_SLOWMO: SlowMoParams = {
  tiltThreshold: (18 * Math.PI) / 180,
  tiltRateThreshold: 0.9,
  hardTilt: (40 * Math.PI) / 180,
  slowScale: 0.2,
  easeIn: 0.15,
  hold: 1.8,
  easeOut: 0.7,
};

export type SlowMoPhase = 'idle' | 'in' | 'hold' | 'out' | 'done';

export interface SlowMoState {
  phase: SlowMoPhase;
  /** 今の段階に入ってからの実時間(s) */
  t: number;
  /** 今の時間の倍率 */
  scale: number;
}

export interface FallSignal {
  /** 傾き(rad) */
  tilt: number;
  /** 傾きの増える速さ(rad/s) */
  tiltRate: number;
  /** シミュレーションが転倒と判定した */
  fallen: boolean;
}

export function createSlowMoState(): SlowMoState {
  return { phase: 'idle', t: 0, scale: 1 };
}

export function resetSlowMo(s: SlowMoState): void {
  s.phase = 'idle';
  s.t = 0;
  s.scale = 1;
}

/** 倒れ始めか */
export function isFallStarting(sig: FallSignal, p: SlowMoParams = DEFAULT_SLOWMO): boolean {
  if (sig.fallen) return true;
  if (!Number.isFinite(sig.tilt)) return false;
  if (sig.tilt >= p.hardTilt) return true;
  return sig.tilt >= p.tiltThreshold && sig.tiltRate >= p.tiltRateThreshold;
}

/** 状態を実時間 realDt だけ進め、時間の倍率を返す */
export function updateSlowMo(
  s: SlowMoState,
  sig: FallSignal,
  realDt: number,
  p: SlowMoParams = DEFAULT_SLOWMO,
): number {
  const dt = realDt > 0 && Number.isFinite(realDt) ? realDt : 0;
  if (s.phase === 'idle') {
    if (isFallStarting(sig, p)) {
      s.phase = 'in';
      s.t = 0;
    } else {
      s.scale = 1;
      return 1;
    }
  }
  s.t += dt;
  // 段階を進める(長いフレームでは複数の段階をまたぐ)
  for (;;) {
    if (s.phase === 'in' && s.t >= p.easeIn) {
      s.t -= p.easeIn;
      s.phase = 'hold';
    } else if (s.phase === 'hold' && s.t >= p.hold) {
      s.t -= p.hold;
      s.phase = 'out';
    } else if (s.phase === 'out' && s.t >= p.easeOut) {
      s.t = 0;
      s.phase = 'done';
    } else break;
  }
  const lo = p.slowScale;
  switch (s.phase) {
    case 'in':
      s.scale = 1 + (lo - 1) * smooth(s.t / p.easeIn);
      break;
    case 'hold':
      s.scale = lo;
      break;
    case 'out':
      s.scale = lo + (1 - lo) * smooth(s.t / p.easeOut);
      break;
    default:
      s.scale = 1;
  }
  return s.scale;
}

/** スロー中(戻りきっていない)か */
export function isSlowMoActive(s: SlowMoState): boolean {
  return s.phase === 'in' || s.phase === 'hold' || s.phase === 'out';
}

/** 機体の上方向(ローカル +y)と鉛直のなす角(rad) */
export function tiltFromQuat(q: Quat): number {
  // R の (1,1) 成分 = 上方向ベクトルの y = 1 − 2(qx² + qz²)
  const len2 = q.x * q.x + q.y * q.y + q.z * q.z + q.w * q.w || 1;
  const upY = 1 - (2 * (q.x * q.x + q.z * q.z)) / len2;
  return Math.acos(upY > 1 ? 1 : upY < -1 ? -1 : upY);
}

function smooth(u: number): number {
  const x = u <= 0 ? 0 : u >= 1 ? 1 : u;
  return x * x * (3 - 2 * x);
}
