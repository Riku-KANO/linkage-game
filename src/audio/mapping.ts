/**
 * 効果音のパラメータ写像(純粋関数)。Web Audio に依存しない。
 */
import type { SfxOptions } from './sfx';

export function clamp(v: number, lo: number, hi: number): number {
  return v < lo ? lo : v > hi ? hi : v;
}

function finiteOr(v: number | undefined, fallback: number): number {
  return v !== undefined && Number.isFinite(v) ? v : fallback;
}

/**
 * 設定の音量(0..1)を主音量のゲインに写す。聴感に合わせて 2 乗にする
 * (スライダーの真ん中で -12dB ほど)。
 */
export function volumeToGain(volume: number): number {
  const v = clamp(finiteOr(volume, 0), 0, 1);
  return v * v;
}

export interface NormalizedSfxOptions {
  /** 振幅の倍率 0..1(呼び出しごとの強さ。接地の衝撃などに比例させてよい) */
  volume: number;
  /** 再生速度 0.25..4。時間は 1/rate、音程は rate^(音ごとの追従率) */
  rate: number;
  /** 左右の定位 -1..1 */
  pan: number;
}

export function normalizeOptions(opts?: SfxOptions): NormalizedSfxOptions {
  return {
    volume: clamp(finiteOr(opts?.volume, 1), 0, 1),
    rate: clamp(finiteOr(opts?.rate, 1), 0.25, 4),
    pan: clamp(finiteOr(opts?.pan, 0), -1, 1),
  };
}

// ---------------------------------------------------------------------------
// モーターのうなり(AU-3)

/** 写像の上限 rpm(モーターの設定範囲 0〜120) */
export const MOTOR_MAX_RPM = 120;

export interface MotorParams {
  /** モーター音全体のゲイン。0 で止める */
  level: number;
  /** 低いうなり(のこぎり波)の基本周波数 */
  droneHz: number;
  /** うなりの低域通過の遮断周波数。負荷で開いて荒くなる */
  cutoffHz: number;
  /** 歯車の鳴き(三角波)の周波数 */
  whineHz: number;
  whineGain: number;
  /** 鳴きの音程の揺れ幅(Hz)。負荷が高いと 1 回転ごとに粘って揺れる */
  wobbleHz: number;
  /** 負荷で出てくる鳴きの倍音(きしみ) */
  strainGain: number;
  /** 噛み合いの粒(パチパチ雑音)を通す帯域通過の中心周波数 */
  gritHz: number;
  gritGain: number;
  /** ゴロゴロした揺れ(振幅変調)の速さと深さ。速さはクランクの回転と歯数から */
  amRate: number;
  amDepth: number;
}

/**
 * rpm(符号は向き)と負荷(0..1)からモーター音のパラメータを決める。
 * 音程は |rpm| に、ざらつきは負荷に追従する。負荷が高いとモーターが粘って音程が少し下がる。
 */
export function motorParams(rpm: number, load: number): MotorParams {
  const s = clamp(Math.abs(finiteOr(rpm, 0)), 0, MOTOR_MAX_RPM) / MOTOR_MAX_RPM;
  const l = clamp(finiteOr(load, 0), 0, 1);
  const running = s > 1e-4;
  const sag = 1 - 0.06 * l;
  const whineHz = (180 + 900 * s) * (1 - 0.04 * l);
  return {
    level: running ? (0.1 + 0.14 * Math.sqrt(s)) * (1 + 0.4 * l) : 0,
    droneHz: (38 + 70 * s) * sag,
    cutoffHz: 220 + 520 * s + 1400 * l,
    whineHz,
    whineGain: 0.05 + 0.2 * Math.pow(s, 0.7),
    wobbleHz: whineHz * (0.004 + 0.02 * l),
    strainGain: 0.12 * l * l,
    gritHz: 700 + 1100 * s + 500 * l,
    gritGain: 0.03 + 0.6 * Math.pow(l, 1.3),
    // クランク 1 回転あたり 12 回揺れる(2 rpm 相当を下限にする)
    amRate: Math.max(0.4, (s * MOTOR_MAX_RPM * 12) / 60),
    amDepth: 0.06 + 0.4 * l,
  };
}

// ---------------------------------------------------------------------------
// 風切りの音量の山(setValueCurveAtTime に渡す曲線)

/**
 * 0 から滑らかに立ち上がり、peakAt(0..1)で 1 になり、滑らかに 0 へ戻る曲線(n 点)。
 * 両側とも sin² なので、つなぎ目で傾きが 0 になる(プツッと鳴らない)。
 */
export function sweepEnvelope(peakAt: number, n = 32): Float32Array<ArrayBuffer> {
  const peak = clamp(finiteOr(peakAt, 0.5), 0.05, 0.95);
  const out = new Float32Array(Math.max(2, n));
  for (let i = 0; i < out.length; i++) {
    const x = i / (out.length - 1);
    const u = x < peak ? x / peak : 1 - (x - peak) / (1 - peak);
    out[i] = Math.sin((Math.PI / 2) * u) ** 2;
  }
  return out;
}

// ---------------------------------------------------------------------------
// 最終段の安全弁(WaveShaper のソフトクリップ曲線)

/**
 * 入力 -1..1 を n 点で写す曲線。|x| ≤ knee はそのまま(素通し)、それより上は tanh で
 * なめらかに頭打ちにして |y| < 1 に収める。コンプレッサーと違って遅延が無い。
 */
export function softClipCurve(n = 1025, knee = 0.6): Float32Array<ArrayBuffer> {
  const k = clamp(knee, 0.1, 0.95);
  const out = new Float32Array(Math.max(3, n));
  for (let i = 0; i < out.length; i++) {
    const x = (i / (out.length - 1)) * 2 - 1;
    const a = Math.abs(x);
    const y = a <= k ? a : k + (1 - k) * Math.tanh((a - k) / (1 - k));
    out[i] = Math.sign(x) * y;
  }
  return out;
}
