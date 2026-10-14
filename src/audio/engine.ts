/**
 * 効果音のエンジン(AU-1)。AudioContext を 1 つだけ、最初のユーザー操作で作って起こす。
 *
 *   声(効果音)─→ sfx バス ─┐
 *                            ├→ まとめ用コンプレッサー → 主音量(音量・ミュート)→ ソフトクリップ → 出力
 *   モーターのうなり ─→ motor バス ┘
 *
 * コンプレッサーは 1 段だけ(DynamicsCompressorNode は 6ms ほど遅れるので、動きとの同期のため重ねない)。
 *
 * - モジュールを読み込んだだけでは何も作らない(Node・テストで安全)
 * - Web Audio が無い・作れない環境では、すべての呼び出しが黙って何もしない
 * - コンテキストが止まっている間(起こす前・タブが裏)の効果音は捨てる(再開時にまとめて鳴らない)
 */
import { normalizeOptions, softClipCurve, volumeToGain } from './mapping';
import { MotorHum, type MotorDeps } from './motor';
import { PITCH_FOLLOW, applyRate, buildSfx, layersDuration } from './recipes';
import { renderVoice, type NoiseBank, type RenderedVoice } from './render';
import { fillNoise, mulberry32, type NoiseKind } from './rng';
import type { SfxName, SfxOptions } from './sfx';
import { VoiceLimiter } from './voices';

export type AudioStatus =
  /** Web Audio が使えない */
  | 'unavailable'
  /** まだユーザー操作が無い(コンテキスト未作成・起こす前) */
  | 'locked'
  | 'running'
  /** タブが裏に回った等で一時停止中 */
  | 'suspended'
  | 'closed';

export interface AudioEngineDeps {
  /** AudioContext を作る。使えなければ null(既定:window.AudioContext / webkitAudioContext) */
  createContext?: () => AudioContext | null;
  /** 最初の操作を待つ対象(既定:window)。null なら待たない(unlock() を自分で呼ぶ) */
  gestureTarget?: EventTarget | null;
  /** タブの表示状態(既定:document)。裏に回ったらコンテキストを止める */
  visibility?: (EventTarget & { readonly hidden: boolean }) | null;
  /** 呼ぶたびの揺らぎに使う乱数のシード */
  seed?: number;
  /** モーターの後片付けのタイマー(テスト用) */
  timers?: MotorDeps;
}

/** 発音を少しだけ先に予約して、エンベロープの頭を確実に描く(秒) */
const LOOKAHEAD = 0.003;
/** 雑音バッファの長さ(秒)。うなりのざらつきでループ感が出ない長さ */
const NOISE_SECONDS = 2;
const NOISE_SEEDS: Record<NoiseKind, number> = { white: 0x5eed01, crackle: 0x5eed02 };
const GESTURE_EVENTS = ['pointerdown', 'mousedown', 'keydown', 'touchend'] as const;
/** 主音量の変化の時定数(秒) */
const MASTER_TC = 0.03;
/** バスの下げ幅。まとめ用コンプレッサーのメイクアップゲインと相殺して、譜面の音量をほぼそのまま出す */
const BUS_GAIN = 0.75;

interface Graph {
  sfx: GainNode;
  motor: GainNode;
  master: GainNode;
  noise: NoiseBank;
}

function defaultCreateContext(): AudioContext | null {
  const g = globalThis as {
    AudioContext?: typeof AudioContext;
    webkitAudioContext?: typeof AudioContext;
  };
  const Ctor = g.AudioContext ?? g.webkitAudioContext;
  if (!Ctor) return null;
  return new Ctor({ latencyHint: 'interactive' });
}

export class AudioEngine {
  private ctx: AudioContext | null = null;
  private graph: Graph | null = null;
  private unavailable = false;
  private attached = false;
  /** 最初の操作で resume() を呼び、まだ結果が出ていない */
  private resumePending = false;
  /** タブが裏に回って自分で止めた */
  private suspendedByVisibility = false;
  private silentPrimed = false;
  private volume = 0.8;
  private muted = false;
  private motor: MotorHum | null = null;
  private motorWanted = { rpm: 0, load: 0 };
  private readonly limiter = new VoiceLimiter();
  private readonly live = new Map<number, RenderedVoice>();
  private readonly rnd: () => number;
  private readonly createContext: () => AudioContext | null;
  private readonly gestureTarget: EventTarget | null;
  private readonly visibility: (EventTarget & { readonly hidden: boolean }) | null;
  private readonly timers: MotorDeps | undefined;

  constructor(deps: AudioEngineDeps = {}) {
    this.createContext = deps.createContext ?? defaultCreateContext;
    this.gestureTarget =
      deps.gestureTarget !== undefined
        ? deps.gestureTarget
        : typeof window !== 'undefined'
          ? window
          : null;
    this.visibility =
      deps.visibility !== undefined
        ? deps.visibility
        : typeof document !== 'undefined'
          ? document
          : null;
    this.rnd = mulberry32(deps.seed ?? 0x0a51c0);
    this.timers = deps.timers;
  }

  // --- ライフサイクル -------------------------------------------------------------

  /** 最初の操作とタブの表示状態を見張り始める(何度呼んでも 1 回) */
  attach(): void {
    if (this.attached) return;
    this.attached = true;
    for (const type of GESTURE_EVENTS) {
      this.gestureTarget?.addEventListener(type, this.onGesture, { capture: true, passive: true });
    }
    this.visibility?.addEventListener('visibilitychange', this.onVisibility);
  }

  /** 見張りをやめ、音を止めてコンテキストを閉じる */
  detach(): void {
    if (this.attached) {
      this.attached = false;
      for (const type of GESTURE_EVENTS) {
        this.gestureTarget?.removeEventListener(type, this.onGesture, { capture: true });
      }
      this.visibility?.removeEventListener('visibilitychange', this.onVisibility);
    }
    this.motor?.dispose();
    this.motor = null;
    this.live.clear();
    this.limiter.reset();
    const ctx = this.ctx;
    this.ctx = null;
    this.graph = null;
    this.resumePending = false;
    this.suspendedByVisibility = false;
    this.silentPrimed = false;
    if (ctx) {
      try {
        void ctx.close().catch(() => {});
      } catch {
        // 閉じられなくても困らない
      }
    }
  }

  /**
   * ユーザー操作の中で呼ぶ:コンテキストを作って起こす。
   * 既定では attach() が pointerdown / keydown などで自動的に呼ぶ。
   */
  unlock(): void {
    const ctx = this.ensureContext();
    if (!ctx) return;
    try {
      if (ctx.state !== 'running' && !this.resumePending) {
        this.resumePending = true;
        this.suspendedByVisibility = false;
        void ctx
          .resume()
          .catch(() => {})
          .finally(() => {
            this.resumePending = false;
          });
      }
      this.primeSilent(ctx);
      this.applyMotor();
    } catch {
      this.resumePending = false;
    }
  }

  status(): AudioStatus {
    if (this.unavailable) return 'unavailable';
    const ctx = this.ctx;
    if (!ctx) return 'locked';
    switch (ctx.state) {
      case 'running':
        return 'running';
      case 'closed':
        return 'closed';
      default:
        return this.suspendedByVisibility ? 'suspended' : 'locked';
    }
  }

  // --- 効果音 ---------------------------------------------------------------------

  play(name: SfxName, opts?: SfxOptions): void {
    const ctx = this.ctx;
    const graph = this.graph;
    if (!ctx || !graph || !this.canSchedule(ctx)) return;
    try {
      const o = normalizeOptions(opts);
      if (o.volume <= 0) return;
      const recipe = buildSfx(name, this.rnd);
      if (recipe.length === 0) return;
      const layers = applyRate(recipe, o.rate, PITCH_FOLLOW[name]);
      const now = ctx.currentTime;
      const d = this.limiter.request(name, now, layersDuration(layers));
      if (d.kind === 'drop') return;
      for (const id of d.steal) {
        this.live.get(id)?.stop(now);
        this.live.delete(id);
      }
      const voice = renderVoice(ctx, graph.sfx, now + LOOKAHEAD, layers, {
        gain: o.volume * d.gainScale,
        pan: o.pan,
        noise: graph.noise,
        onDone: () => this.live.delete(d.id),
      });
      if (voice.end > now) this.live.set(d.id, voice);
    } catch {
      // 効果音の失敗でゲームを止めない
    }
  }

  /** 鳴っている効果音の数(デバッグ表示用) */
  activeVoices(): number {
    const ctx = this.ctx;
    return ctx ? this.limiter.activeCount(ctx.currentTime) : 0;
  }

  // --- モーター -------------------------------------------------------------------

  /** rpm(符号は向き、0〜120)と負荷(0..1)。rpm = 0 で止める */
  setMotor(rpm: number, load: number): void {
    this.motorWanted = { rpm, load };
    this.applyMotor();
  }

  /** モーター音のノードが生きているか(デバッグ表示用) */
  motorActive(): boolean {
    return this.motor?.active ?? false;
  }

  // --- 音量 -----------------------------------------------------------------------

  /** 設定の音量 0..1(聴感カーブで主音量に写す) */
  setVolume(volume: number): void {
    this.volume = volume;
    this.applyMaster();
  }

  setMuted(muted: boolean): void {
    this.muted = muted;
    this.applyMaster();
  }

  isMuted(): boolean {
    return this.muted;
  }

  // --- 内部 -----------------------------------------------------------------------

  private readonly onGesture = (): void => {
    if (this.ctx?.state === 'running' && !this.suspendedByVisibility) return;
    this.unlock();
  };

  private readonly onVisibility = (): void => {
    const ctx = this.ctx;
    if (!ctx || !this.visibility) return;
    try {
      if (this.visibility.hidden) {
        if (ctx.state === 'running') {
          this.suspendedByVisibility = true;
          void ctx.suspend().catch(() => {});
        }
      } else if (this.suspendedByVisibility) {
        this.suspendedByVisibility = false;
        void ctx.resume().catch(() => {});
      }
    } catch {
      // 何もしない
    }
  };

  /** 今、音を予約してよいか。起こしている最中は許す(最初の操作の「押した音」を落とさない) */
  private canSchedule(ctx: AudioContext): boolean {
    if (this.suspendedByVisibility) return false;
    return ctx.state === 'running' || this.resumePending;
  }

  private ensureContext(): AudioContext | null {
    if (this.ctx) return this.ctx;
    if (this.unavailable) return null;
    let ctx: AudioContext | null = null;
    try {
      ctx = this.createContext();
      if (ctx) this.graph = this.buildGraph(ctx);
    } catch {
      ctx = null;
    }
    if (!ctx || !this.graph) {
      this.unavailable = true;
      this.graph = null;
      return null;
    }
    this.ctx = ctx;
    this.limiter.reset();
    return ctx;
  }

  private buildGraph(ctx: AudioContext): Graph {
    const sfx = ctx.createGain();
    sfx.gain.value = BUS_GAIN;
    const motor = ctx.createGain();
    motor.gain.value = BUS_GAIN;
    // まとめ用:穏やかに重なりを整える(自動のメイクアップゲインが +2.4dB ほど乗るのでバスで下げてある)
    const glue = ctx.createDynamicsCompressor();
    glue.threshold.value = -12;
    glue.knee.value = 6;
    glue.ratio.value = 3;
    glue.attack.value = 0.003;
    glue.release.value = 0.15;
    const master = ctx.createGain();
    master.gain.value = this.masterGain();
    // 安全弁:遅延の無いソフトクリップ。連打や重い打撃が重なっても割れない
    const clip = ctx.createWaveShaper();
    clip.curve = softClipCurve();
    sfx.connect(glue);
    motor.connect(glue);
    glue.connect(master);
    master.connect(clip);
    clip.connect(ctx.destination);

    const noise = {} as Record<NoiseKind, AudioBuffer>;
    for (const kind of Object.keys(NOISE_SEEDS) as NoiseKind[]) {
      const len = Math.round(ctx.sampleRate * NOISE_SECONDS);
      const buf = ctx.createBuffer(1, len, ctx.sampleRate);
      fillNoise(buf.getChannelData(0), NOISE_SEEDS[kind], kind);
      noise[kind] = buf;
    }
    return { sfx, motor, master, noise };
  }

  /** iOS Safari は操作の中で一度音源を鳴らさないと出力が始まらないことがある */
  private primeSilent(ctx: AudioContext): void {
    if (this.silentPrimed) return;
    this.silentPrimed = true;
    const src = ctx.createBufferSource();
    src.buffer = ctx.createBuffer(1, 1, ctx.sampleRate);
    src.connect(ctx.destination);
    src.start(0);
    src.onended = () => src.disconnect();
  }

  private masterGain(): number {
    return this.muted ? 0 : volumeToGain(this.volume);
  }

  private applyMaster(): void {
    const ctx = this.ctx;
    const graph = this.graph;
    if (!ctx || !graph) return;
    try {
      graph.master.gain.setTargetAtTime(this.masterGain(), ctx.currentTime, MASTER_TC);
    } catch {
      // 何もしない
    }
  }

  private applyMotor(): void {
    const ctx = this.ctx;
    const graph = this.graph;
    if (!ctx || !graph) return;
    try {
      if (!this.motor) {
        // 止める指示だけなら、まだ作らない
        if (this.motorWanted.rpm === 0 || !Number.isFinite(this.motorWanted.rpm)) return;
        this.motor = new MotorHum(ctx, graph.motor, graph.noise.crackle, this.timers);
      }
      this.motor.set(this.motorWanted.rpm, this.motorWanted.load);
    } catch {
      // 何もしない
    }
  }
}
