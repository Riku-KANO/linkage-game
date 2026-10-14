import { describe, expect, it } from 'vitest';
import { createMemoryStorage, type StorageLike } from '@/core/storage/persistence';
import {
  applyUserChoice,
  emptyPrefs,
  enforceUserChoices,
  loadPrefs,
  parsePrefs,
  PREFS_KEY,
  resolveSettings,
  savePrefs,
} from './prefs';
import type { AppSettings } from './store';

const BASE: AppSettings = { reducedMotion: false, lowPerf: false, volume: 0.8 };

describe('parsePrefs / loadPrefs / savePrefs', () => {
  it('keeps valid fields and drops broken ones one by one', () => {
    expect(
      parsePrefs({ muted: true, reducedMotion: 'yes', lowPerf: false, lastSlot: 'c1-s3' }),
    ).toEqual({ version: 1, muted: true, lowPerf: false, lastSlot: 'c1-s3' });
    expect(parsePrefs({ lastSlot: '' })).toEqual(emptyPrefs());
    expect(parsePrefs({ lastSlot: 'x'.repeat(65) })).toEqual(emptyPrefs());
    expect(parsePrefs(null)).toEqual(emptyPrefs());
    expect(parsePrefs([true])).toEqual(emptyPrefs());
  });

  it('round-trips through storage and survives broken JSON or a throwing storage', () => {
    const s = createMemoryStorage();
    expect(loadPrefs(s)).toEqual(emptyPrefs());
    const prefs = { ...emptyPrefs(), muted: true, lastSlot: 'sandbox' };
    expect(savePrefs(s, prefs)).toEqual({ ok: true });
    expect(loadPrefs(s)).toEqual(prefs);

    s.setItem(PREFS_KEY, '{not json');
    expect(loadPrefs(s)).toEqual(emptyPrefs());
    // 巨大な値・プロトタイプを汚す鍵は読まない
    s.setItem(PREFS_KEY, JSON.stringify({ muted: true, pad: 'x'.repeat(1_000_001) }));
    expect(loadPrefs(s)).toEqual(emptyPrefs());
    s.setItem(PREFS_KEY, '{"__proto__":{"muted":true},"lowPerf":true}');
    const hostile = loadPrefs(s);
    expect(hostile).toEqual({ version: 1, lowPerf: true });
    expect(({} as { muted?: boolean }).muted).toBeUndefined();

    const broken: StorageLike = {
      getItem: () => {
        throw new Error('blocked');
      },
      setItem: () => {
        throw Object.assign(new Error('full'), { name: 'QuotaExceededError' });
      },
      removeItem: () => {},
    };
    expect(loadPrefs(broken)).toEqual(emptyPrefs());
    expect(savePrefs(broken, prefs)).toEqual({ ok: false, reason: 'quota' });
    expect(loadPrefs(null)).toEqual(emptyPrefs());
    expect(savePrefs(null, prefs)).toEqual({ ok: false, reason: 'unavailable' });
  });
});

describe('resolveSettings', () => {
  it('follows the OS and the GPU decision when the player has not chosen (source auto)', () => {
    const s = resolveSettings(BASE, emptyPrefs(), {
      osReducedMotion: true,
      perf: { lowPerf: true, reason: 'software' },
    });
    expect(s).toMatchObject({ reducedMotion: true, lowPerf: true, muted: false, volume: 0.8 });
    expect(s.sources).toEqual({ reducedMotion: 'auto', lowPerf: 'auto' });
  });

  it('ignores stale stored values: no decision yet means low-perf off until measured', () => {
    const stale: AppSettings = { ...BASE, reducedMotion: true, lowPerf: true };
    const s = resolveSettings(stale, emptyPrefs(), { osReducedMotion: false, perf: null });
    expect(s).toMatchObject({ reducedMotion: false, lowPerf: false });
  });

  it("uses the player's explicit choices over the automatic ones (source user)", () => {
    const prefs = { ...emptyPrefs(), reducedMotion: true, lowPerf: false, muted: true };
    const s = resolveSettings(BASE, prefs, {
      osReducedMotion: false,
      perf: { lowPerf: true, reason: 'slow', medianMs: 30 },
    });
    expect(s).toMatchObject({ reducedMotion: true, lowPerf: false, muted: true });
    expect(s.sources).toEqual({ reducedMotion: 'user', lowPerf: 'user' });
  });

  it('always reduces motion when the OS asks for it, even if the player chose off', () => {
    const prefs = { ...emptyPrefs(), reducedMotion: false };
    const s = resolveSettings(BASE, prefs, { osReducedMotion: true, perf: null });
    expect(s.reducedMotion).toBe(true);
    expect(s.sources?.reducedMotion).toBe('user');
  });

  it('treats a manual decision from the old scene settings as a user choice', () => {
    const s = resolveSettings(BASE, emptyPrefs(), {
      osReducedMotion: false,
      perf: { lowPerf: true, reason: 'manual' },
    });
    expect(s.lowPerf).toBe(true);
    expect(s.sources?.lowPerf).toBe('user');
  });
});

describe('enforceUserChoices', () => {
  it('reverts automatic writes that contradict an explicit choice', () => {
    const prefs = { ...emptyPrefs(), reducedMotion: true, lowPerf: false };
    // OS の追従が false に、GPU の測定が true にした
    const s: AppSettings = { ...BASE, reducedMotion: false, lowPerf: true };
    expect(enforceUserChoices(s, prefs, false)).toEqual({ reducedMotion: true, lowPerf: false });
  });

  it('accepts automatic values for items the player has not chosen', () => {
    const s: AppSettings = { ...BASE, reducedMotion: true, lowPerf: true };
    expect(enforceUserChoices(s, emptyPrefs(), true)).toBeNull();
    expect(enforceUserChoices(s, emptyPrefs(), false)).toBeNull();
  });

  it('keeps reduced motion on while the OS asks for it', () => {
    const prefs = { ...emptyPrefs(), reducedMotion: false };
    expect(enforceUserChoices({ ...BASE, reducedMotion: true }, prefs, true)).toBeNull();
    expect(enforceUserChoices({ ...BASE, reducedMotion: true }, prefs, false)).toEqual({
      reducedMotion: false,
    });
  });
});

describe('applyUserChoice', () => {
  it('records only the given fields and returns the same object when nothing changes', () => {
    const p = emptyPrefs();
    const a = applyUserChoice(p, { reducedMotion: true });
    expect(a).toEqual({ version: 1, reducedMotion: true });
    expect(applyUserChoice(a, { reducedMotion: true })).toBe(a);
    expect(applyUserChoice(a, {})).toBe(a);
    expect(applyUserChoice(a, { muted: false, lowPerf: true })).toEqual({
      version: 1,
      reducedMotion: true,
      muted: false,
      lowPerf: true,
    });
  });
});
