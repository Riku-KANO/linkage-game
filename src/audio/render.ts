/**
 * 譜面(recipes.ts の Layer)を Web Audio のノードに組み立てて鳴らす。
 * ノードは使い捨て:鳴り終わったら自動で切り離す。
 */
import { sweepEnvelope } from './mapping';
import {
  layersDuration,
  type Layer,
  type ModalLayer,
  type NoiseLayer,
  type SweepLayer,
} from './recipes';
import type { NoiseKind } from './rng';

export type NoiseBank = Readonly<Record<NoiseKind, AudioBuffer>>;

export interface RenderedVoice {
  /** 鳴り終わる時刻(コンテキストの時刻) */
  readonly end: number;
  /** 早めに止める(声の横取り)。数 ms でフェードしてから止める */
  stop(when: number): void;
}

export interface VoiceOptions {
  /** 声全体の振幅 */
  gain: number;
  /** 左右の定位 -1..1 */
  pan: number;
  noise: NoiseBank;
  /** 全部の音源が鳴り終わって切り離されたとき */
  onDone?: () => void;
}

/** ノードを止めるときの余白(秒) */
const TAIL = 0.01;
/** 横取りで止めるときのフェードの時定数(秒) */
const STEAL_TC = 0.006;

type Source = AudioScheduledSourceNode;

/** 予約した止める時刻(横取りで止めるとき、遅らせないために覚えておく) */
const stopTimeOf = new WeakMap<Source, number>();

function scheduleStop(s: Source, when: number): void {
  s.stop(when);
  stopTimeOf.set(s, when);
}

/** 線形の立ち上がり+指数の減衰(-60dB まで) */
function envelope(param: AudioParam, t: number, attack: number, decay: number, peak: number) {
  param.setValueAtTime(0, t);
  param.linearRampToValueAtTime(peak, t + attack);
  param.exponentialRampToValueAtTime(peak * 1e-3, t + attack + decay);
}

function freqLimits(ctx: BaseAudioContext): [number, number] {
  return [20, ctx.sampleRate * 0.45];
}

function clampFreq(ctx: BaseAudioContext, f: number): number {
  const [lo, hi] = freqLimits(ctx);
  return Math.min(hi, Math.max(lo, f));
}

function renderNoise(
  ctx: BaseAudioContext,
  out: AudioNode,
  t0: number,
  l: NoiseLayer,
  bank: NoiseBank,
): Source[] {
  if (l.gain <= 0) return [];
  const t = t0 + l.at;
  const len = l.attack + l.decay + TAIL;
  const buf = bank[l.noise];
  const src = ctx.createBufferSource();
  src.buffer = buf;
  const f = ctx.createBiquadFilter();
  f.type = l.filter;
  f.Q.value = l.q;
  f.frequency.setValueAtTime(clampFreq(ctx, l.freq), t);
  if (l.freqEnd !== undefined) {
    f.frequency.exponentialRampToValueAtTime(clampFreq(ctx, l.freqEnd), t + l.attack + l.decay);
  }
  const g = ctx.createGain();
  envelope(g.gain, t, l.attack, l.decay, l.gain);
  src.connect(f);
  f.connect(g);
  g.connect(out);
  src.start(t, l.offset * Math.max(0, buf.duration - len));
  scheduleStop(src, t + len);
  return [src];
}

function renderModal(ctx: BaseAudioContext, out: AudioNode, t0: number, l: ModalLayer): Source[] {
  const t = t0 + l.at;
  const [lo, hi] = freqLimits(ctx);
  const sources: Source[] = [];
  for (const p of l.partials) {
    const f = l.base * p.ratio;
    // ナイキスト付近の部分音は折り返して濁るので鳴らさない
    if (f < lo || f > hi || p.gain <= 0) continue;
    const osc = ctx.createOscillator();
    osc.type = 'sine';
    if (l.drop !== undefined && l.dropTime !== undefined && l.dropTime > 0) {
      osc.frequency.setValueAtTime(Math.min(hi, f * l.drop), t);
      osc.frequency.exponentialRampToValueAtTime(f, t + l.dropTime);
    } else {
      osc.frequency.setValueAtTime(f, t);
    }
    const g = ctx.createGain();
    envelope(g.gain, t, l.attack, p.decay, p.gain);
    osc.connect(g);
    g.connect(out);
    osc.start(t);
    scheduleStop(osc, t + l.attack + p.decay + TAIL);
    sources.push(osc);
  }
  return sources;
}

function renderSweep(
  ctx: BaseAudioContext,
  out: AudioNode,
  t0: number,
  l: SweepLayer,
  bank: NoiseBank,
): Source[] {
  if (l.gain <= 0 || l.duration <= 0) return [];
  const t = t0 + l.at;
  const buf = bank.white;
  const src = ctx.createBufferSource();
  src.buffer = buf;
  src.loop = true;
  const f = ctx.createBiquadFilter();
  f.type = 'bandpass';
  f.Q.value = l.q;
  f.frequency.setValueAtTime(clampFreq(ctx, l.freqs[0]), t);
  f.frequency.exponentialRampToValueAtTime(clampFreq(ctx, l.freqs[1]), t + l.duration * l.peakAt);
  f.frequency.exponentialRampToValueAtTime(clampFreq(ctx, l.freqs[2]), t + l.duration);
  const g = ctx.createGain();
  g.gain.value = 0;
  const curve = sweepEnvelope(l.peakAt);
  for (let i = 0; i < curve.length; i++) curve[i] = curve[i]! * l.gain;
  g.gain.setValueCurveAtTime(curve, t, l.duration);
  src.connect(f);
  f.connect(g);
  if (typeof ctx.createStereoPanner === 'function') {
    const pan = ctx.createStereoPanner();
    pan.pan.setValueAtTime(l.pan[0], t);
    pan.pan.linearRampToValueAtTime(l.pan[1], t + l.duration);
    g.connect(pan);
    pan.connect(out);
  } else {
    g.connect(out);
  }
  src.start(t, l.offset * Math.max(0, buf.duration - l.duration));
  scheduleStop(src, t + l.duration + TAIL);
  return [src];
}

/**
 * 1 回分の効果音(声)を t0 から鳴らす。声ごとにゲイン(と定位)を 1 つ持ち、dest につなぐ。
 */
export function renderVoice(
  ctx: BaseAudioContext,
  dest: AudioNode,
  t0: number,
  layers: readonly Layer[],
  opts: VoiceOptions,
): RenderedVoice {
  const out = ctx.createGain();
  out.gain.value = opts.gain;
  let panner: StereoPannerNode | null = null;
  if (opts.pan !== 0 && typeof ctx.createStereoPanner === 'function') {
    panner = ctx.createStereoPanner();
    panner.pan.value = opts.pan;
    out.connect(panner);
    panner.connect(dest);
  } else {
    out.connect(dest);
  }

  const sources: Source[] = [];
  for (const l of layers) {
    switch (l.kind) {
      case 'noise':
        sources.push(...renderNoise(ctx, out, t0, l, opts.noise));
        break;
      case 'modal':
        sources.push(...renderModal(ctx, out, t0, l));
        break;
      case 'sweep':
        sources.push(...renderSweep(ctx, out, t0, l, opts.noise));
        break;
    }
  }

  const stopTimes = sources.map((s) => stopTimeOf.get(s) ?? Infinity);
  let pending = sources.length;
  let done = false;
  const finish = () => {
    if (done) return;
    done = true;
    out.disconnect();
    panner?.disconnect();
    opts.onDone?.();
  };
  for (const s of sources) {
    s.onended = () => {
      pending--;
      if (pending <= 0) finish();
    };
  }
  if (pending === 0) finish();

  return {
    end: t0 + layersDuration(layers),
    stop(when: number) {
      out.gain.cancelScheduledValues(when);
      out.gain.setTargetAtTime(0, when, STEAL_TC);
      // stop() は前の予約を置き換えるので、早める場合だけ呼ぶ
      const at = when + STEAL_TC * 8;
      sources.forEach((s, i) => {
        if (at >= (stopTimes[i] ?? 0)) return;
        try {
          s.stop(at);
        } catch {
          // 古い Safari は stop の 2 度呼びで例外を投げる。鳴り終わりを待てばよい
        }
      });
    },
  };
}
