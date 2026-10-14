import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  createAutosaver,
  createPersistence,
  SANDBOX_SLOT,
  STORAGE_PREFIX,
  storageKeys,
  type StorageLike,
} from './persistence';
import { createDefaultProgress, validateProgress } from './progress';
import { jansenLeg, jansenWalker, fourBar } from '@/core/model/presets';
import { designToJSONText } from '@/core/model/file';
import type { Progress, RunResult } from '@/game/types';

/** テスト用の Storage。容量の上限や例外を差し込める */
class FakeStorage implements StorageLike {
  data = new Map<string, string>();
  quota = Infinity;
  failGet = false;
  failSet: 'quota' | 'security' | null = null;
  getItem(key: string): string | null {
    if (this.failGet) throw new DOMException('denied', 'SecurityError');
    return this.data.get(key) ?? null;
  }
  setItem(key: string, value: string): void {
    if (this.failSet === 'security') throw new DOMException('denied', 'SecurityError');
    const used = [...this.data].reduce((s, [k, v]) => (k === key ? s : s + k.length + v.length), 0);
    if (this.failSet === 'quota' || used + key.length + value.length > this.quota) {
      throw new DOMException('full', 'QuotaExceededError');
    }
    this.data.set(key, value);
  }
  removeItem(key: string): void {
    this.data.delete(key);
  }
}

const run = (stageId: string, time: number): RunResult => ({
  stageId,
  cleared: true,
  reason: null,
  time,
  parts: 12,
  cost: 120,
  energy: 40,
  distance: 3,
  medals: { time: 'gold', parts: null, cost: 'bronze', energy: 'silver' },
});

describe('persistence (MOD-5, U-01)', () => {
  it('uses namespaced, versioned keys', () => {
    expect(STORAGE_PREFIX).toBe('ashikumi/v1/');
    expect(storageKeys.design('c1-s1')).toBe('ashikumi/v1/design/c1-s1');
    expect(storageKeys.design(SANDBOX_SLOT)).toBe('ashikumi/v1/design/sandbox');
    expect(storageKeys.progress).toBe('ashikumi/v1/progress');
    expect(storageKeys.settings).toBe('ashikumi/v1/settings');
    const s = new FakeStorage();
    const p = createPersistence(s);
    p.saveDesign('c1-s1', fourBar());
    p.saveProgress(createDefaultProgress());
    p.saveSettings({ volume: 0.5 });
    expect([...s.data.keys()].every((k) => k.startsWith(STORAGE_PREFIX))).toBe(true);
  });

  it('saves and loads designs per slot', () => {
    const s = new FakeStorage();
    const p = createPersistence(s);
    expect(p.persistent).toBe(true);
    expect(p.loadDesign('c1-s1')).toBeNull();
    expect(p.saveDesign('c1-s1', jansenLeg())).toEqual({ ok: true });
    expect(p.saveDesign(SANDBOX_SLOT, jansenWalker()).ok).toBe(true);
    // 別のインスタンス(再読み込み後)でも読める
    const q = createPersistence(s);
    expect(q.loadDesign('c1-s1')).toEqual(jansenLeg());
    expect(q.loadDesign(SANDBOX_SLOT)).toEqual(jansenWalker());
    q.removeDesign('c1-s1');
    expect(q.loadDesign('c1-s1')).toBeNull();
  });

  it('reads design files written by an older format through migrate', () => {
    const s = new FakeStorage();
    s.data.set(
      storageKeys.design(SANDBOX_SLOT),
      JSON.stringify({
        app: 'ashikumi',
        version: 0,
        design: {
          joints: [
            { id: 'a', x: 0, y: 0 },
            { id: 'b', x: 3, y: 4 },
          ],
          fixed: ['a'],
          links: [{ id: 'l', joints: ['a', 'b'] }],
          cranks: [],
        },
      }),
    );
    const d = createPersistence(s).loadDesign(SANDBOX_SLOT);
    expect(d?.joints[0]?.fixed).toBe(true);
  });

  it('falls back to memory when localStorage is unavailable', () => {
    const p = createPersistence(null);
    expect(p.persistent).toBe(false);
    expect(p.saveDesign(SANDBOX_SLOT, fourBar()).ok).toBe(true);
    expect(p.loadDesign(SANDBOX_SLOT)).toEqual(fourBar());
    expect(p.loadProgress()).toEqual(createDefaultProgress());
  });

  it('never throws when the storage throws', () => {
    const s = new FakeStorage();
    s.failGet = true;
    s.failSet = 'security';
    const p = createPersistence(s);
    expect(p.loadDesign('x')).toBeNull();
    expect(p.loadProgress()).toEqual(createDefaultProgress());
    expect(p.loadSettings((v): v is { a: number } => typeof v === 'object', { a: 1 })).toEqual({
      a: 1,
    });
    expect(p.saveDesign('x', fourBar())).toEqual({ ok: false, reason: 'unavailable' });
    expect(() => p.removeDesign('x')).not.toThrow();
  });

  it('reports quota errors and keeps the latest value for this session', () => {
    const s = new FakeStorage();
    const p = createPersistence(s);
    expect(p.saveDesign('a', fourBar()).ok).toBe(true);
    s.quota = 10;
    const r = p.saveDesign('a', jansenWalker());
    expect(r).toEqual({ ok: false, reason: 'quota' });
    // この画面ではまだ最新の設計を読める(再読み込みすると前に保存できた版に戻る)
    expect(p.loadDesign('a')).toEqual(jansenWalker());
    expect(createPersistence(s).loadDesign('a')).toEqual(fourBar());
    // 空きができれば書ける
    s.quota = Infinity;
    expect(p.saveDesign('a', jansenLeg()).ok).toBe(true);
    expect(createPersistence(s).loadDesign('a')).toEqual(jansenLeg());
  });

  it('returns defaults for corrupted data', () => {
    const s = new FakeStorage();
    s.data.set(storageKeys.design('a'), '{"app": "ashikumi", "design": ');
    s.data.set(storageKeys.design('b'), JSON.stringify({ app: 'ashikumi', version: 1, design: 5 }));
    s.data.set(storageKeys.progress, 'not json at all');
    s.data.set(storageKeys.settings, '[[[');
    const p = createPersistence(s);
    expect(p.loadDesign('a')).toBeNull();
    expect(p.loadDesign('b')).toBeNull();
    expect(p.loadProgress()).toEqual(createDefaultProgress());
    const isVolume = (v: unknown): v is { volume: number } =>
      typeof v === 'object' && v !== null && typeof (v as { volume?: unknown }).volume === 'number';
    expect(p.loadSettings(isVolume, { volume: 1 })).toEqual({ volume: 1 });
    s.data.set(storageKeys.settings, JSON.stringify({ volume: 'loud' }));
    expect(p.loadSettings(isVolume, { volume: 1 })).toEqual({ volume: 1 });
    s.data.set(storageKeys.settings, JSON.stringify({ volume: 0.3 }));
    expect(p.loadSettings(isVolume, { volume: 1 })).toEqual({ volume: 0.3 });
  });

  it('does not overwrite data written by a newer version of the app', () => {
    const s = new FakeStorage();
    const newer = JSON.stringify({ app: 'ashikumi', kind: 'design', version: 99, design: {} });
    s.data.set(storageKeys.design('a'), newer);
    s.data.set(storageKeys.progress, JSON.stringify({ version: 2, best: {} }));
    const p = createPersistence(s);
    expect(p.loadDesign('a')).toBeNull();
    expect(p.saveDesign('a', fourBar())).toEqual({ ok: false, reason: 'newer' });
    expect(s.data.get(storageKeys.design('a'))).toBe(newer);
    expect(p.loadProgress()).toEqual(createDefaultProgress());
    expect(p.saveProgress(createDefaultProgress())).toEqual({ ok: false, reason: 'newer' });
    // 他のスロットは書ける
    expect(p.saveDesign('b', fourBar()).ok).toBe(true);
  });

  it('round-trips progress and settings', () => {
    const s = new FakeStorage();
    const p = createPersistence(s);
    const progress: Progress = {
      version: 1,
      best: { 'c1-s1': run('c1-s1', 12.5), 'c1-s2': run('c1-s2', 30) },
      unlockedChapters: [1, 2],
      zukan: ['jansen'],
      seenTransitions: ['home->design'],
    };
    expect(p.saveProgress(progress).ok).toBe(true);
    expect(createPersistence(s).loadProgress()).toEqual(progress);
    const settings = { volume: 0.4, reducedMotion: true };
    expect(p.saveSettings(settings).ok).toBe(true);
    const isObj = (v: unknown): v is typeof settings => typeof v === 'object' && v !== null;
    expect(createPersistence(s).loadSettings(isObj, { volume: 1, reducedMotion: false })).toEqual(
      settings,
    );
    const cyclic: Record<string, unknown> = {};
    cyclic.self = cyclic;
    expect(p.saveSettings(cyclic)).toEqual({ ok: false, reason: 'serialize' });
  });

  it('stores the design as the same versioned envelope as files', () => {
    const s = new FakeStorage();
    createPersistence(s).saveDesign('a', fourBar());
    const stored = JSON.parse(s.data.get(storageKeys.design('a'))!) as Record<string, unknown>;
    expect(stored).toEqual(JSON.parse(designToJSONText(fourBar())));
  });
});

describe('validateProgress', () => {
  it('keeps valid entries and drops broken ones', () => {
    const p = validateProgress({
      version: 1,
      best: {
        'c1-s1': run('c1-s1', 10),
        'c1-s2': { ...run('c1-s2', 10), time: 'fast' },
        'c1-s3': { ...run('c1-s3', 10), medals: { time: 'platinum' } },
        'c1-s4': run('other', 10),
      },
      unlockedChapters: [1, 'two', 3, 3, -1, 1.5],
      zukan: ['a', 3],
      seenTransitions: 'all',
    });
    expect(p).not.toBeNull();
    expect(Object.keys(p!.best)).toEqual(['c1-s1']);
    expect(p!.unlockedChapters).toEqual([1, 3]);
    expect(p!.zukan).toEqual(['a']);
    expect(p!.seenTransitions).toEqual([]);
  });

  it('rejects non-objects and other versions', () => {
    for (const v of [null, 1, 'x', [], { version: 2 }, { best: {} }]) {
      expect(validateProgress(v)).toBeNull();
    }
    expect(validateProgress({ version: 1 })).toEqual(createDefaultProgress());
  });
});

describe('createAutosaver', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it('debounces saves per slot and reports failures', () => {
    const s = new FakeStorage();
    const p = createPersistence(s);
    const results: [string, boolean][] = [];
    const saver = createAutosaver(p, {
      waitMs: 500,
      onResult: (slot, r) => results.push([slot, r.ok]),
    });
    const a = fourBar();
    saver.schedule('a', a);
    a.motor.rpm = 10;
    saver.schedule('a', { ...a, name: '途中' });
    saver.schedule(SANDBOX_SLOT, jansenLeg());
    expect(s.data.size).toBe(0);
    vi.advanceTimersByTime(600);
    expect(createPersistence(s).loadDesign('a')?.name).toBe('途中');
    expect(createPersistence(s).loadDesign(SANDBOX_SLOT)).toEqual(jansenLeg());
    expect(results).toEqual([
      ['a', true],
      [SANDBOX_SLOT, true],
    ]);
    s.failSet = 'quota';
    saver.schedule('a', jansenWalker());
    saver.flush();
    expect(results.at(-1)).toEqual(['a', false]);
    saver.schedule('a', jansenLeg());
    saver.cancel();
    vi.advanceTimersByTime(1000);
    expect(results.length).toBe(3);
  });
});
