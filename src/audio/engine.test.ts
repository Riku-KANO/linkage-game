import { afterEach, describe, expect, it, vi } from 'vitest';
import { useApp } from '@/app/store';
import { AudioEngine, type AudioEngineDeps } from './engine';
import {
  FakeAudioContext,
  FakeBufferSource,
  FakeCompressor,
  FakeGain,
  FakeOscillator,
  FakeShaper,
  type FakeNode,
} from './fakeAudioContext';
import { getAudioStatus, installAudio, playSfx, setMotorHum, uninstallAudio } from './index';
import { SFX_NAMES } from './recipes';
import { VOICE_POLICIES } from './voices';

class FakeDocument extends EventTarget {
  hidden = false;
  setHidden(h: boolean) {
    this.hidden = h;
    this.dispatchEvent(new Event('visibilitychange'));
  }
}

interface Rig {
  engine: AudioEngine;
  ctx: FakeAudioContext;
  target: EventTarget;
  doc: FakeDocument;
  factory: ReturnType<typeof vi.fn<() => AudioContext | null>>;
  timers: { run: () => void; pending: () => number };
  gesture: (type?: string) => void;
}

function rig(extra: Partial<AudioEngineDeps> = {}): Rig {
  const ctx = new FakeAudioContext();
  const target = new EventTarget();
  const doc = new FakeDocument();
  const factory = vi.fn<() => AudioContext | null>(() => ctx.asAudioContext());
  const queue = new Map<number, () => void>();
  let nextHandle = 1;
  const engine = new AudioEngine({
    createContext: factory,
    gestureTarget: target,
    visibility: doc,
    timers: {
      setTimeout: (fn) => {
        const h = nextHandle++;
        queue.set(h, fn);
        return h;
      },
      clearTimeout: (h) => {
        queue.delete(h as number);
      },
    },
    ...extra,
  });
  engine.attach();
  return {
    engine,
    ctx,
    target,
    doc,
    factory,
    timers: {
      run: () => {
        const fns = [...queue.values()];
        queue.clear();
        fns.forEach((f) => f());
      },
      pending: () => queue.size,
    },
    gesture: (type = 'pointerdown') => target.dispatchEvent(new Event(type)),
  };
}

/** 主音量のゲイン:出力直前のソフトクリップの手前のゲイン */
function masterGain(ctx: FakeAudioContext): FakeGain {
  const clip = ctx.nodes.find(
    (n): n is FakeShaper => n instanceof FakeShaper && n.outputs.includes(ctx.destination),
  );
  const master = ctx.nodes.find(
    (n): n is FakeGain => n instanceof FakeGain && !!clip && n.outputs.includes(clip),
  );
  if (!master) throw new Error('master gain not found');
  return master;
}

const newNodes = (ctx: FakeAudioContext, before: number): FakeNode[] => ctx.nodes.slice(before);

afterEach(() => {
  vi.restoreAllMocks();
  uninstallAudio();
  useApp.getState().setSettings({ volume: 0.8 });
});

describe('Node・Web Audio の無い環境', () => {
  it('読み込みも呼び出しも黙って何もしない', () => {
    const e = new AudioEngine();
    e.attach();
    expect(() => {
      e.unlock();
      e.play('snap');
      e.setMotor(60, 0.5);
      e.setVolume(0.3);
      e.setMuted(true);
      e.detach();
    }).not.toThrow();
    expect(e.status()).toBe('unavailable');
  });

  it('installAudio は何度呼んでも同じエンジンで、playSfx / setMotorHum は安全', () => {
    const a = installAudio();
    const b = installAudio();
    expect(a).toBe(b);
    expect(() => {
      for (const name of SFX_NAMES) playSfx(name);
      setMotorHum(80, 0.4);
      setMotorHum(0, 0);
    }).not.toThrow();
    expect(getAudioStatus()).toBe('locked');
  });

  it('コンテキストを作れない(null・例外)なら unavailable になり、二度と作ろうとしない', () => {
    const r = rig({ createContext: vi.fn(() => null) });
    r.gesture();
    r.gesture('keydown');
    expect(r.engine.status()).toBe('unavailable');
    const thrower = vi.fn((): AudioContext | null => {
      throw new Error('NotAllowedError');
    });
    const r2 = rig({ createContext: thrower });
    expect(() => r2.gesture()).not.toThrow();
    r2.gesture();
    expect(thrower).toHaveBeenCalledTimes(1);
    expect(r2.engine.status()).toBe('unavailable');
    expect(() => r2.engine.play('snap')).not.toThrow();
  });
});

describe('アンロック(最初のユーザー操作)', () => {
  it('操作の前は AudioContext を作らず、効果音も鳴らさない', () => {
    const r = rig();
    r.engine.play('snap');
    r.engine.setMotor(60, 0.5);
    expect(r.factory).not.toHaveBeenCalled();
    expect(r.engine.status()).toBe('locked');
  });

  it('最初の pointerdown で 1 つだけ作って起こし、2 回目以降は何もしない', () => {
    const r = rig();
    r.gesture('pointerdown');
    expect(r.factory).toHaveBeenCalledTimes(1);
    expect(r.ctx.resumeCalls).toBe(1);
    expect(r.engine.status()).toBe('running');
    r.gesture('keydown');
    r.gesture('touchend');
    expect(r.factory).toHaveBeenCalledTimes(1);
    expect(r.ctx.resumeCalls).toBe(1);
  });

  it('起動が遅い(resume が返らない)環境:操作直後の音は予約し、猶予を過ぎたら捨て、次の操作でまた起こす', () => {
    const clock = vi.spyOn(performance, 'now').mockReturnValue(1000);
    const r = rig();
    r.ctx.resumeWorks = false;
    r.gesture();
    expect(r.ctx.resumeCalls).toBe(1);
    const n0 = r.ctx.nodes.length;
    r.engine.play('press');
    expect(r.ctx.nodes.length).toBeGreaterThan(n0);
    clock.mockReturnValue(2000);
    const n1 = r.ctx.nodes.length;
    r.engine.play('snap');
    expect(r.ctx.nodes.length).toBe(n1);
    r.gesture('keydown');
    expect(r.ctx.resumeCalls).toBe(2);
    expect(r.factory).toHaveBeenCalledTimes(1);
  });

  it('keydown でも起きる', () => {
    const r = rig();
    r.gesture('keydown');
    expect(r.engine.status()).toBe('running');
  });

  it('attach は何度呼んでも 1 組だけ見張る', () => {
    const r = rig();
    r.engine.attach();
    r.engine.attach();
    r.gesture();
    expect(r.ctx.resumeCalls).toBe(1);
  });

  it('タブが裏に回ったら止め、その間の効果音は捨て、戻ったら再開する', () => {
    const r = rig();
    r.gesture();
    r.doc.setHidden(true);
    expect(r.ctx.suspendCalls).toBe(1);
    expect(r.engine.status()).toBe('suspended');
    const before = r.ctx.nodes.length;
    r.engine.play('snap');
    expect(r.ctx.nodes.length).toBe(before);
    r.doc.setHidden(false);
    expect(r.engine.status()).toBe('running');
    r.engine.play('snap');
    expect(r.ctx.nodes.length).toBeGreaterThan(before);
  });

  it('detach でコンテキストを閉じ、見張りもやめる', () => {
    const r = rig();
    r.gesture();
    r.engine.detach();
    expect(r.ctx.state).toBe('closed');
    r.gesture();
    expect(r.factory).toHaveBeenCalledTimes(1);
  });
});

describe('主音量・ミュート', () => {
  it('音量は聴感カーブで主音量に、ミュートは 0 に、解除で戻る', () => {
    const r = rig();
    r.engine.setVolume(0.5);
    r.gesture();
    const master = masterGain(r.ctx);
    expect(master.gain.value).toBeCloseTo(0.25);
    r.engine.setMuted(true);
    expect(master.gain.value).toBe(0);
    expect(r.engine.isMuted()).toBe(true);
    r.engine.setVolume(1);
    expect(master.gain.value).toBe(0);
    r.engine.setMuted(false);
    expect(master.gain.value).toBeCloseTo(1);
    // 音量の変化は滑らかに(setTargetAtTime)
    expect(master.gain.events.at(-1)?.type).toBe('target');
  });

  it('効果音はコンプレッサーとソフトクリップを通って出力に届く', () => {
    const r = rig();
    r.gesture();
    const before = r.ctx.nodes.length;
    r.engine.play('stamp');
    const sources = newNodes(r.ctx, before).filter(
      (n) => n instanceof FakeOscillator || n instanceof FakeBufferSource,
    );
    expect(sources.length).toBeGreaterThan(3);
    for (const s of sources) expect(r.ctx.reachesDestination(s)).toBe(true);
    // 遅延を増やさないよう、コンプレッサーは 1 段だけ。最後は曲線の入ったソフトクリップ
    expect(r.ctx.nodes.filter((n) => n instanceof FakeCompressor)).toHaveLength(1);
    const clip = r.ctx.nodes.find((n): n is FakeShaper => n instanceof FakeShaper);
    expect(clip?.curve?.length).toBeGreaterThan(100);
    expect(clip?.outputs).toContain(r.ctx.destination);
  });
});

describe('効果音の再生', () => {
  it.each(SFX_NAMES)('%s:極端な rate・pan・volume でも例外なく予約でき、短時間で止まる', (name) => {
    for (const opts of [
      {},
      { rate: 0.25, pan: -1, volume: 0.2 },
      { rate: 4, pan: 1, volume: 1 },
      { rate: Number.NaN, volume: 3 },
    ]) {
      const r = rig();
      r.gesture();
      const before = r.ctx.nodes.length;
      expect(() => r.engine.play(name, opts)).not.toThrow();
      const sources = newNodes(r.ctx, before).filter(
        (n): n is FakeOscillator | FakeBufferSource =>
          n instanceof FakeOscillator || n instanceof FakeBufferSource,
      );
      expect(sources.length).toBeGreaterThan(0);
      for (const s of sources) {
        expect(s.startTime).not.toBeNull();
        expect(s.startTime!).toBeGreaterThanOrEqual(r.ctx.currentTime);
        expect(s.stopTime).not.toBeNull();
        // 最も遅い rate 0.25 でも 5 秒以内に止まる
        expect(s.stopTime!).toBeLessThan(5);
      }
      for (const o of sources.filter((s) => s instanceof FakeOscillator)) {
        for (const ev of o.frequency.events) expect(ev.value).toBeLessThanOrEqual(48000 / 2);
      }
    }
  });

  it('volume 0 は何も作らない', () => {
    const r = rig();
    r.gesture();
    const before = r.ctx.nodes.length;
    r.engine.play('snap', { volume: 0 });
    expect(r.ctx.nodes.length).toBe(before);
  });

  it('同じ瞬間の連打は 1 回だけ鳴らす(貼り付けで 50 個はまっても積み重ならない)', () => {
    const r = rig();
    r.gesture();
    const n0 = r.ctx.nodes.length;
    r.engine.play('snap');
    const one = r.ctx.nodes.length - n0;
    for (let i = 0; i < 49; i++) r.engine.play('snap');
    expect(r.ctx.nodes.length - n0).toBe(one);
    expect(r.engine.activeVoices()).toBe(1);
    r.ctx.advance(0.05);
    r.engine.play('snap');
    expect(r.ctx.nodes.length - n0).toBeGreaterThan(one);
  });

  it('速い足音が続いても同時発音数の上限(6)を超えない', () => {
    const r = rig();
    r.gesture();
    let peak = 0;
    for (let i = 0; i < 100; i++) {
      // 遅い再生で 1 歩を長くし、上限に当たるまで重ねる
      r.engine.play('step', { rate: 0.25, volume: 0.5 + 0.15 * (i % 3) });
      peak = Math.max(peak, r.engine.activeVoices());
      expect(r.engine.activeVoices()).toBeLessThanOrEqual(6);
      r.ctx.advance(0.03);
    }
    expect(peak).toBe(VOICE_POLICIES.step.maxVoices);
  });

  it('上限を超えたら古い声を短くフェードして止める', () => {
    const r = rig();
    r.gesture();
    const n0 = r.ctx.nodes.length;
    r.engine.play('stamp');
    const firstVoiceOut = r.ctx.nodes[n0] as FakeGain;
    const firstSources = newNodes(r.ctx, n0).filter(
      (n): n is FakeOscillator | FakeBufferSource =>
        n instanceof FakeOscillator || n instanceof FakeBufferSource,
    );
    r.ctx.advance(0.3);
    r.engine.play('stamp');
    expect(firstVoiceOut.gain.events.some((e) => e.type === 'target' && e.value === 0)).toBe(true);
    for (const s of firstSources) expect(s.stopTime!).toBeLessThan(0.3 + 0.1);
  });

  it('鳴り終わった声は切り離される', () => {
    const r = rig();
    r.gesture();
    const n0 = r.ctx.nodes.length;
    r.engine.play('press', { pan: 0.5 });
    const voiceOut = r.ctx.nodes[n0] as FakeGain;
    expect(voiceOut.disconnected).toBe(false);
    r.ctx.advance(1);
    expect(voiceOut.disconnected).toBe(true);
    expect(r.engine.activeVoices()).toBe(0);
  });

  it('呼ぶたびに少しずつ違う(同じ音の機械的な繰り返しにならない)', () => {
    const r = rig();
    r.gesture();
    const freqsOf = (from: number) =>
      newNodes(r.ctx, from)
        .filter((n): n is FakeOscillator => n instanceof FakeOscillator)
        .map((o) => o.frequency.events[0]?.value);
    const a0 = r.ctx.nodes.length;
    r.engine.play('step');
    const a = freqsOf(a0);
    r.ctx.advance(0.5);
    const b0 = r.ctx.nodes.length;
    r.engine.play('step');
    const b = freqsOf(b0);
    expect(a.length).toBe(b.length);
    expect(a).not.toEqual(b);
  });
});

describe('モーターのうなり', () => {
  /** モーターの出力:バス(コンプレッサーにつながるゲイン)へつながるゲイン。効果音を鳴らす前なら一意 */
  const motorOut = (ctx: FakeAudioContext): FakeGain => {
    const buses = ctx.nodes.filter(
      (n): n is FakeGain =>
        n instanceof FakeGain && n.outputs.some((o) => o instanceof FakeCompressor),
    );
    const out = ctx.nodes.find(
      (n): n is FakeGain => n instanceof FakeGain && buses.some((b) => n.outputs.includes(b)),
    );
    if (!out) throw new Error('motor out not found');
    return out;
  };

  it('操作の前に頼まれた回転は、起きたときに鳴り始める', () => {
    const r = rig();
    r.engine.setMotor(60, 0.2);
    expect(r.ctx.oscillators()).toHaveLength(0);
    r.gesture();
    expect(r.ctx.oscillators().length).toBeGreaterThanOrEqual(5);
    expect(r.engine.motorActive()).toBe(true);
    expect(motorOut(r.ctx).gain.value).toBeGreaterThan(0);
  });

  it('rpm = 0 だけなら何も作らない', () => {
    const r = rig();
    r.gesture();
    const before = r.ctx.nodes.length;
    r.engine.setMotor(0, 0);
    expect(r.ctx.nodes.length).toBe(before);
    expect(r.engine.motorActive()).toBe(false);
  });

  it('毎フレーム呼んでもノードは 1 組だけで、値は滑らかに(setTargetAtTime で)動く', () => {
    const r = rig();
    r.gesture();
    for (let i = 0; i < 120; i++) {
      r.engine.setMotor(10 + i, (i % 60) / 60);
      r.ctx.advance(1 / 60);
    }
    const oscs = r.ctx.oscillators();
    expect(oscs.length).toBeLessThanOrEqual(6);
    for (const o of oscs) {
      const after = o.frequency.events;
      expect(after.length).toBeGreaterThan(10);
      expect(after.every((e) => e.type === 'target')).toBe(true);
    }
  });

  it('rpm = 0 でフェードアウトし、しばらくしてノードを捨て、また回せば作り直す', () => {
    const r = rig();
    r.gesture();
    r.engine.setMotor(90, 0.5);
    const out = motorOut(r.ctx);
    r.engine.setMotor(0, 0.5);
    expect(out.gain.events.at(-1)).toMatchObject({ type: 'target', value: 0 });
    expect(r.engine.motorActive()).toBe(true);
    expect(r.timers.pending()).toBe(1);
    r.timers.run();
    expect(r.engine.motorActive()).toBe(false);
    expect(out.disconnected).toBe(true);
    for (const s of r.ctx.sources().filter((s) => s.startTime !== null && s.stopTime === null)) {
      // 残っているのはアンロック用の無音だけ
      expect(s instanceof FakeBufferSource && s.buffer?.length === 1).toBe(true);
    }
    const before = r.ctx.oscillators().length;
    r.engine.setMotor(-60, 0.1);
    expect(r.engine.motorActive()).toBe(true);
    expect(r.ctx.oscillators().length).toBeGreaterThan(before);
  });

  it('止めかけて、すぐまた回したら捨てない', () => {
    const r = rig();
    r.gesture();
    r.engine.setMotor(90, 0.5);
    r.engine.setMotor(0, 0);
    r.engine.setMotor(40, 0);
    expect(r.timers.pending()).toBe(0);
    r.timers.run();
    expect(r.engine.motorActive()).toBe(true);
  });
});

describe('installAudio と設定の音量', () => {
  it('useApp の settings.volume に追従する', () => {
    const ctx = new FakeAudioContext();
    const target = new EventTarget();
    installAudio({ createContext: () => ctx.asAudioContext(), gestureTarget: target });
    target.dispatchEvent(new Event('pointerdown'));
    expect(getAudioStatus()).toBe('running');
    const master = masterGain(ctx);
    expect(master.gain.value).toBeCloseTo(0.64);
    useApp.getState().setSettings({ volume: 0.3 });
    expect(master.gain.value).toBeCloseTo(0.09);
    const before = ctx.nodes.length;
    playSfx('success');
    expect(ctx.nodes.length).toBeGreaterThan(before);
  });

  it('uninstallAudio で登録が外れ、playSfx は何もしなくなる', () => {
    const ctx = new FakeAudioContext();
    const target = new EventTarget();
    installAudio({ createContext: () => ctx.asAudioContext(), gestureTarget: target });
    target.dispatchEvent(new Event('pointerdown'));
    uninstallAudio();
    const before = ctx.nodes.length;
    playSfx('snap');
    setMotorHum(60, 1);
    expect(ctx.nodes.length).toBe(before);
    useApp.getState().setSettings({ volume: 0.1 });
    expect(ctx.state).toBe('closed');
  });
});
