/**
 * 発音数の管理(純粋なブックキーピング)。Web Audio に依存しない。
 * 連打(貼り付けで一度に 20 個はまる等)で音が割れたり積み重なったりしないよう、
 * - 最小間隔より短い再要求は捨てる
 * - 同名の同時発音数を超えたら一番古い声を止める(新しい音のほうが動きに合っている)
 * - 全体の上限を超えたら一番古い声を止める
 * - 重なった数に応じて音量を下げる
 */
import type { SfxName } from './sfx';

export interface VoicePolicy {
  /** 同名の同時発音数 */
  maxVoices: number;
  /** これより短い間隔(秒)の再要求は捨てる */
  minInterval: number;
}

export const VOICE_POLICIES: Record<SfxName, VoicePolicy> = {
  snap: { maxVoices: 4, minInterval: 0.03 },
  press: { maxVoices: 2, minInterval: 0.04 },
  release: { maxVoices: 2, minInterval: 0.04 },
  error: { maxVoices: 1, minInterval: 0.12 },
  whoosh: { maxVoices: 2, minInterval: 0.15 },
  gear: { maxVoices: 2, minInterval: 0.05 },
  stamp: { maxVoices: 1, minInterval: 0.2 },
  step: { maxVoices: 6, minInterval: 0.025 },
  success: { maxVoices: 1, minInterval: 0.3 },
};

/** 全体の同時発音数の既定値 */
export const MAX_VOICES = 24;

const DEFAULT_POLICY: VoicePolicy = { maxVoices: 2, minInterval: 0.05 };

export type VoiceDecision =
  | { kind: 'drop' }
  | {
      kind: 'play';
      id: number;
      /** 重なりに応じた音量の倍率(1 以下) */
      gainScale: number;
      /** 止めるべき既存の声の id */
      steal: number[];
    };

interface Voice {
  id: number;
  name: string;
  start: number;
  end: number;
}

export class VoiceLimiter {
  private voices: Voice[] = [];
  private lastStart = new Map<string, number>();
  private nextId = 1;

  constructor(
    private readonly policies: Readonly<Record<string, VoicePolicy>> = VOICE_POLICIES,
    private readonly maxTotal = MAX_VOICES,
  ) {}

  /** 時刻 now(秒)に長さ duration の声を鳴らしてよいか決める */
  request(name: string, now: number, duration: number): VoiceDecision {
    const policy = this.policies[name] ?? DEFAULT_POLICY;
    this.prune(now);
    const last = this.lastStart.get(name);
    if (last !== undefined && now >= last && now - last < policy.minInterval) {
      return { kind: 'drop' };
    }

    const steal: number[] = [];
    const same = this.voices.filter((v) => v.name === name);
    // 古い順に並んでいるので先頭から止める
    for (let i = 0; i <= same.length - policy.maxVoices; i++) steal.push(same[i]!.id);
    let remaining = this.voices.filter((v) => !steal.includes(v.id));
    while (remaining.length >= this.maxTotal && remaining.length > 0) {
      steal.push(remaining[0]!.id);
      remaining = remaining.slice(1);
    }

    const overlapping = remaining.filter((v) => v.name === name).length;
    const id = this.nextId++;
    remaining.push({ id, name, start: now, end: now + Math.max(0, duration) });
    this.voices = remaining;
    this.lastStart.set(name, now);
    return { kind: 'play', id, gainScale: 1 / Math.sqrt(1 + overlapping), steal };
  }

  /** 鳴っている声の数(name を指定すると同名だけ) */
  activeCount(now: number, name?: string): number {
    this.prune(now);
    return name === undefined
      ? this.voices.length
      : this.voices.filter((v) => v.name === name).length;
  }

  /** 全部忘れる(コンテキストを作り直したときなど) */
  reset(): void {
    this.voices = [];
    this.lastStart.clear();
  }

  private prune(now: number): void {
    this.voices = this.voices.filter((v) => v.end > now);
  }
}
