/**
 * テスト用の最小の AudioContext の偽物(本番では読み込まない)。
 * ノードの生成・接続・AudioParam の予約を記録するだけで、音は計算しない。
 * 本物と同じく、指数ランプに 0 以下を渡すと例外を投げる。
 */

export interface ParamEvent {
  type: 'set' | 'linear' | 'exp' | 'target' | 'curve' | 'cancel';
  value: number;
  time: number;
}

export class FakeParam {
  readonly events: ParamEvent[] = [];
  constructor(public value = 0) {}

  setValueAtTime(value: number, time: number): this {
    this.check(value, time);
    this.events.push({ type: 'set', value, time });
    this.value = value;
    return this;
  }
  linearRampToValueAtTime(value: number, time: number): this {
    this.check(value, time);
    this.events.push({ type: 'linear', value, time });
    this.value = value;
    return this;
  }
  exponentialRampToValueAtTime(value: number, time: number): this {
    this.check(value, time);
    if (!(value > 0)) throw new RangeError('exponentialRampToValueAtTime: value must be > 0');
    this.events.push({ type: 'exp', value, time });
    this.value = value;
    return this;
  }
  setTargetAtTime(value: number, time: number, timeConstant: number): this {
    this.check(value, time);
    if (!(timeConstant > 0)) throw new RangeError('setTargetAtTime: timeConstant must be > 0');
    this.events.push({ type: 'target', value, time });
    this.value = value;
    return this;
  }
  setValueCurveAtTime(curve: Float32Array, time: number, duration: number): this {
    this.check(0, time);
    if (curve.length < 2 || !(duration > 0)) throw new RangeError('setValueCurveAtTime');
    const last = curve[curve.length - 1]!;
    this.events.push({ type: 'curve', value: last, time });
    this.value = last;
    return this;
  }
  cancelScheduledValues(time: number): this {
    this.events.push({ type: 'cancel', value: this.value, time });
    return this;
  }

  private check(value: number, time: number) {
    if (!Number.isFinite(value) || !Number.isFinite(time) || time < 0) {
      throw new TypeError(`non-finite automation: value=${value} time=${time}`);
    }
  }
}

export class FakeNode {
  readonly outputs: (FakeNode | FakeParam)[] = [];
  disconnected = false;
  constructor(
    readonly ctx: FakeAudioContext,
    readonly kind: string,
  ) {
    ctx.nodes.push(this);
  }
  connect<T extends FakeNode | FakeParam>(dest: T): T {
    this.outputs.push(dest);
    return dest;
  }
  disconnect(): void {
    this.outputs.length = 0;
    this.disconnected = true;
  }
}

export class FakeGain extends FakeNode {
  readonly gain = new FakeParam(1);
}

export class FakeBiquad extends FakeNode {
  type = 'lowpass';
  readonly frequency = new FakeParam(350);
  readonly Q = new FakeParam(1);
  readonly gain = new FakeParam(0);
}

export class FakeCompressor extends FakeNode {
  readonly threshold = new FakeParam(-24);
  readonly knee = new FakeParam(30);
  readonly ratio = new FakeParam(12);
  readonly attack = new FakeParam(0.003);
  readonly release = new FakeParam(0.25);
}

export class FakePanner extends FakeNode {
  readonly pan = new FakeParam(0);
}

export class FakeSource extends FakeNode {
  startTime: number | null = null;
  stopTime: number | null = null;
  ended = false;
  onended: (() => void) | null = null;
  start(when = 0): void {
    if (this.startTime !== null) throw new Error('InvalidStateError: start called twice');
    this.startTime = when;
  }
  stop(when = 0): void {
    if (this.startTime === null) throw new Error('InvalidStateError: stop before start');
    this.stopTime = when;
  }
}

export class FakeOscillator extends FakeSource {
  type = 'sine';
  readonly frequency = new FakeParam(440);
  readonly detune = new FakeParam(0);
}

export class FakeBuffer {
  private readonly channels: Float32Array[];
  constructor(
    readonly numberOfChannels: number,
    readonly length: number,
    readonly sampleRate: number,
  ) {
    this.channels = Array.from({ length: numberOfChannels }, () => new Float32Array(length));
  }
  get duration(): number {
    return this.length / this.sampleRate;
  }
  getChannelData(i: number): Float32Array {
    const c = this.channels[i];
    if (!c) throw new RangeError('channel');
    return c;
  }
}

export class FakeBufferSource extends FakeSource {
  buffer: FakeBuffer | null = null;
  loop = false;
  readonly playbackRate = new FakeParam(1);
}

export class FakeAudioContext {
  state: 'suspended' | 'running' | 'closed' = 'suspended';
  currentTime = 0;
  readonly sampleRate: number;
  readonly nodes: FakeNode[] = [];
  readonly destination: FakeNode;
  resumeCalls = 0;
  suspendCalls = 0;
  /** false にすると resume() が状態を変えない(起こすのに失敗する環境) */
  resumeWorks = true;

  constructor(sampleRate = 48000) {
    this.sampleRate = sampleRate;
    this.destination = new FakeNode(this, 'destination');
  }

  resume(): Promise<void> {
    this.resumeCalls++;
    if (this.resumeWorks) this.state = 'running';
    return Promise.resolve();
  }
  suspend(): Promise<void> {
    this.suspendCalls++;
    this.state = 'suspended';
    return Promise.resolve();
  }
  close(): Promise<void> {
    this.state = 'closed';
    return Promise.resolve();
  }

  createGain() {
    return new FakeGain(this, 'gain');
  }
  createBiquadFilter() {
    return new FakeBiquad(this, 'biquad');
  }
  createDynamicsCompressor() {
    return new FakeCompressor(this, 'compressor');
  }
  createStereoPanner() {
    return new FakePanner(this, 'panner');
  }
  createOscillator() {
    return new FakeOscillator(this, 'oscillator');
  }
  createBufferSource() {
    return new FakeBufferSource(this, 'bufferSource');
  }
  createBuffer(channels: number, length: number, sampleRate: number) {
    return new FakeBuffer(channels, length, sampleRate);
  }

  /** 本物の型として渡す */
  asAudioContext(): AudioContext {
    return this as unknown as AudioContext;
  }

  /** 時刻を進め、止まる時刻を過ぎた音源の onended を呼ぶ */
  advance(dt: number): void {
    this.currentTime += dt;
    for (const n of this.sources()) {
      if (!n.ended && n.stopTime !== null && n.stopTime <= this.currentTime) {
        n.ended = true;
        n.onended?.();
      }
    }
  }

  sources(): FakeSource[] {
    return this.nodes.filter((n): n is FakeSource => n instanceof FakeSource);
  }

  oscillators(): FakeOscillator[] {
    return this.nodes.filter((n): n is FakeOscillator => n instanceof FakeOscillator);
  }

  /** 出力につながっているか(接続をたどる) */
  reachesDestination(node: FakeNode): boolean {
    const seen = new Set<FakeNode>();
    const walk = (n: FakeNode): boolean => {
      if (n === this.destination) return true;
      if (seen.has(n)) return false;
      seen.add(n);
      return n.outputs.some((o) => o instanceof FakeNode && walk(o));
    };
    return walk(node);
  }
}
