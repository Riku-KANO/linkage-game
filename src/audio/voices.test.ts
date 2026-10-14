import { describe, expect, it } from 'vitest';
import { VOICE_POLICIES, VoiceLimiter, type VoicePolicy } from './voices';
import type { SfxName } from './sfx';

const ALL: SfxName[] = [
  'snap',
  'press',
  'release',
  'error',
  'whoosh',
  'gear',
  'stamp',
  'step',
  'success',
];

const policies: Record<string, VoicePolicy> = {
  click: { maxVoices: 3, minInterval: 0.03 },
  thud: { maxVoices: 2, minInterval: 0 },
};

describe('VOICE_POLICIES', () => {
  it('すべての効果音に同時発音数と最小間隔がある', () => {
    for (const name of ALL) {
      const p = VOICE_POLICIES[name];
      expect(p.maxVoices).toBeGreaterThanOrEqual(1);
      expect(p.minInterval).toBeGreaterThanOrEqual(0);
      expect(p.minInterval).toBeLessThan(0.5);
    }
  });
});

describe('VoiceLimiter', () => {
  it('同じ瞬間に何度呼ばれても 1 回だけ鳴らす(最小間隔)', () => {
    const v = new VoiceLimiter(policies, 16);
    const results = Array.from({ length: 20 }, () => v.request('click', 1.0, 0.1));
    expect(results.filter((r) => r.kind === 'play')).toHaveLength(1);
    expect(v.activeCount(1.0)).toBe(1);
  });

  it('間隔が空けば鳴らし、重なった分だけ音量を下げる', () => {
    const v = new VoiceLimiter(policies, 16);
    const a = v.request('click', 0, 0.2);
    const b = v.request('click', 0.05, 0.2);
    const c = v.request('click', 0.1, 0.2);
    expect(a).toMatchObject({ kind: 'play', gainScale: 1, steal: [] });
    expect(b.kind).toBe('play');
    expect(c.kind).toBe('play');
    if (b.kind !== 'play' || c.kind !== 'play') return;
    expect(b.gainScale).toBeLessThan(1);
    expect(c.gainScale).toBeLessThan(b.gainScale);
  });

  it('同時発音数を超えたら一番古い同名の声を止める', () => {
    const v = new VoiceLimiter(policies, 16);
    const ids: number[] = [];
    for (let i = 0; i < 3; i++) {
      const r = v.request('click', i * 0.04, 1);
      if (r.kind === 'play') ids.push(r.id);
    }
    const r = v.request('click', 0.2, 1);
    expect(r.kind).toBe('play');
    if (r.kind !== 'play') return;
    expect(r.steal).toEqual([ids[0]]);
    expect(v.activeCount(0.2, 'click')).toBe(3);
  });

  it('全体の上限を超えたら一番古い声を止める', () => {
    const v = new VoiceLimiter(policies, 3);
    const a = v.request('thud', 0, 1);
    v.request('click', 0.01, 1);
    v.request('thud', 0.02, 1);
    const d = v.request('click', 0.1, 1);
    expect(d.kind).toBe('play');
    if (d.kind !== 'play' || a.kind !== 'play') return;
    expect(d.steal).toEqual([a.id]);
    expect(v.activeCount(0.1)).toBe(3);
  });

  it('鳴り終わった声は数えない', () => {
    const v = new VoiceLimiter(policies, 16);
    v.request('thud', 0, 0.1);
    v.request('thud', 0.01, 0.1);
    expect(v.activeCount(0.05)).toBe(2);
    expect(v.activeCount(0.5)).toBe(0);
    const r = v.request('thud', 0.5, 0.1);
    expect(r).toMatchObject({ kind: 'play', gainScale: 1, steal: [] });
  });

  it('時刻が巻き戻っても(コンテキストを作り直したとき)詰まらない', () => {
    const v = new VoiceLimiter(policies, 16);
    v.request('click', 10, 0.1);
    v.reset();
    expect(v.request('click', 0, 0.1).kind).toBe('play');
  });

  it('知らない名前は既定の方針で鳴らす', () => {
    const v = new VoiceLimiter(policies, 16);
    expect(v.request('unknown', 0, 0.1).kind).toBe('play');
  });
});
