/**
 * モーターのうなり(AU-3)。鳴らし続ける音なので、ノードを 1 組だけ作って値を滑らかに動かす。
 *
 *   のこぎり波(うなり)→ 低域通過 ┐
 *   正弦波(胴)                   ├→ 振幅変調(ゴロゴロ)→ 出力
 *   三角波(歯車の鳴き)+ 倍音   │      ↑ 低周波(クランクの回転 × 歯数)
 *   パチパチ雑音 → 帯域通過       ┘
 *
 * rpm = 0 で音量を絞り(音程も少し下がって回転が止まるように聞こえる)、しばらくしてノードを捨てる。
 */
import { motorParams, type MotorParams } from './mapping';

/** 値の追従の時定数(秒)。小さすぎるとジッパー音、大きすぎると反応が鈍い */
const RISE_TC = 0.06;
/** 止めるときの時定数(秒) */
const FALL_TC = 0.15;
/** 止めてからノードを捨てるまで(ms) */
const TEARDOWN_MS = 1500;
/** 胴(正弦波)とうなり(のこぎり波)の混ぜ具合 */
const BODY_GAIN = 0.45;
const DRONE_GAIN = 0.5;
/** きしみの倍音の比(わずかに非整数倍) */
const STRAIN_RATIO = 2.03;

interface MotorNodes {
  out: GainNode;
  am: GainNode;
  amLfo: OscillatorNode;
  amDepth: GainNode;
  drone: OscillatorNode;
  droneLp: BiquadFilterNode;
  body: OscillatorNode;
  whine: OscillatorNode;
  whineGain: GainNode;
  wobble: GainNode;
  strain: OscillatorNode;
  strainGain: GainNode;
  gritBp: BiquadFilterNode;
  gritGain: GainNode;
  sources: AudioScheduledSourceNode[];
}

export interface MotorDeps {
  setTimeout: (fn: () => void, ms: number) => unknown;
  clearTimeout: (handle: unknown) => void;
}

const defaultDeps: MotorDeps = {
  setTimeout: (fn, ms) => globalThis.setTimeout(fn, ms),
  clearTimeout: (h) => globalThis.clearTimeout(h as ReturnType<typeof setTimeout>),
};

export class MotorHum {
  private nodes: MotorNodes | null = null;
  private teardownTimer: unknown = null;
  private lastRpm = Number.NaN;
  private lastLoad = Number.NaN;

  constructor(
    private readonly ctx: BaseAudioContext,
    private readonly dest: AudioNode,
    private readonly crackle: AudioBuffer,
    private readonly deps: MotorDeps = defaultDeps,
  ) {}

  /** ノードが生きているか(鳴っている、または止まりかけ) */
  get active(): boolean {
    return this.nodes !== null;
  }

  set(rpm: number, load: number): void {
    // 毎フレーム呼ばれても、ほとんど変わらないなら何もしない
    if (Math.abs(rpm - this.lastRpm) < 0.05 && Math.abs(load - this.lastLoad) < 0.002) return;
    this.lastRpm = rpm;
    this.lastLoad = load;
    const p = motorParams(rpm, load);
    const now = this.ctx.currentTime;
    if (p.level === 0) {
      if (!this.nodes) return;
      this.apply(this.nodes, p, now, FALL_TC);
      this.scheduleTeardown();
      return;
    }
    this.cancelTeardown();
    if (!this.nodes) this.nodes = this.build(p, now);
    this.apply(this.nodes, p, now, RISE_TC);
  }

  /** すぐに止めてノードを捨てる */
  dispose(): void {
    this.cancelTeardown();
    this.teardown();
    this.lastRpm = Number.NaN;
    this.lastLoad = Number.NaN;
  }

  private build(p: MotorParams, now: number): MotorNodes {
    const c = this.ctx;
    const osc = (type: OscillatorType, hz: number) => {
      const o = c.createOscillator();
      o.type = type;
      o.frequency.value = hz;
      return o;
    };
    const gain = (v: number) => {
      const g = c.createGain();
      g.gain.value = v;
      return g;
    };
    const filter = (type: BiquadFilterType, hz: number, q: number) => {
      const f = c.createBiquadFilter();
      f.type = type;
      f.frequency.value = hz;
      f.Q.value = q;
      return f;
    };

    // 音量 0 から立ち上げる
    const out = gain(0);
    out.connect(this.dest);
    const am = gain(1 - p.amDepth);
    am.connect(out);

    const amLfo = osc('sine', p.amRate);
    const amDepth = gain(p.amDepth);
    amLfo.connect(amDepth);
    amDepth.connect(am.gain);

    const drone = osc('sawtooth', p.droneHz);
    const droneLp = filter('lowpass', p.cutoffHz, 0.9);
    const droneGain = gain(DRONE_GAIN);
    drone.connect(droneLp);
    droneLp.connect(droneGain);
    droneGain.connect(am);

    const body = osc('sine', p.droneHz);
    const bodyGain = gain(BODY_GAIN);
    body.connect(bodyGain);
    bodyGain.connect(am);

    const whine = osc('triangle', p.whineHz);
    const whineGain = gain(p.whineGain);
    whine.connect(whineGain);
    whineGain.connect(am);
    // 負荷で鳴きの音程が 1 回転ごとに揺れる
    const wobble = gain(p.wobbleHz);
    amLfo.connect(wobble);
    wobble.connect(whine.frequency);

    const strain = osc('triangle', p.whineHz * STRAIN_RATIO);
    const strainGain = gain(p.strainGain);
    strain.connect(strainGain);
    strainGain.connect(am);

    const grit = c.createBufferSource();
    grit.buffer = this.crackle;
    grit.loop = true;
    const gritBp = filter('bandpass', p.gritHz, 1.1);
    const gritGain = gain(p.gritGain);
    grit.connect(gritBp);
    gritBp.connect(gritGain);
    gritGain.connect(am);

    const sources: AudioScheduledSourceNode[] = [amLfo, drone, body, whine, strain, grit];
    for (const s of sources) s.start(now);
    return {
      out,
      am,
      amLfo,
      amDepth,
      drone,
      droneLp,
      body,
      whine,
      whineGain,
      wobble,
      strain,
      strainGain,
      gritBp,
      gritGain,
      sources,
    };
  }

  private apply(n: MotorNodes, p: MotorParams, now: number, tc: number): void {
    const to = (param: AudioParam, v: number) => param.setTargetAtTime(v, now, tc);
    to(n.out.gain, p.level);
    to(n.am.gain, 1 - p.amDepth);
    to(n.amDepth.gain, p.amDepth);
    to(n.amLfo.frequency, p.amRate);
    to(n.drone.frequency, p.droneHz);
    to(n.body.frequency, p.droneHz);
    to(n.droneLp.frequency, p.cutoffHz);
    to(n.whine.frequency, p.whineHz);
    to(n.whineGain.gain, p.whineGain);
    to(n.wobble.gain, p.wobbleHz);
    to(n.strain.frequency, p.whineHz * STRAIN_RATIO);
    to(n.strainGain.gain, p.strainGain);
    to(n.gritBp.frequency, p.gritHz);
    to(n.gritGain.gain, p.gritGain);
  }

  private scheduleTeardown(): void {
    if (this.teardownTimer !== null) return;
    this.teardownTimer = this.deps.setTimeout(() => {
      this.teardownTimer = null;
      this.teardown();
    }, TEARDOWN_MS);
  }

  private cancelTeardown(): void {
    if (this.teardownTimer === null) return;
    this.deps.clearTimeout(this.teardownTimer);
    this.teardownTimer = null;
  }

  private teardown(): void {
    const n = this.nodes;
    if (!n) return;
    this.nodes = null;
    for (const s of n.sources) {
      try {
        s.stop();
      } catch {
        // すでに止まっている
      }
    }
    n.out.disconnect();
  }
}
