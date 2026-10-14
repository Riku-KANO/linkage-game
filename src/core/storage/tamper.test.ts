import { describe, expect, it } from 'vitest';
import {
  createPersistence,
  MAX_STORED_ITEM_LENGTH,
  SANDBOX_SLOT,
  storageKeys,
  type StorageLike,
} from './persistence';
import { createDefaultProgress, MAX_PROGRESS_LIST, validateProgress } from './progress';
import { fourBar, jansenWalker } from '@/core/model/presets';
import { validateDesign } from '@/core/model/validate';
import { createRng, mutateJson, mutateString, randomJson, timed } from '@/core/model/fuzzing';
import type { RunResult } from '@/game/types';

/**
 * localStorage の改ざん・破損に強いこと(SEC-3)。localStorage は同じオリジンの誰か(拡張機能、
 * 手で編集する人、古い・新しい版のアプリ)が書き換えられるので、共有リンクと同じく信用しない。
 * どんな中身でも起動(読み込み)が例外を投げず、既定値か検査を通った値を返す。
 */

class MapStorage implements StorageLike {
  data = new Map<string, string>();
  getItem(key: string): string | null {
    return this.data.get(key) ?? null;
  }
  setItem(key: string, value: string): void {
    this.data.set(key, value);
  }
  removeItem(key: string): void {
    this.data.delete(key);
  }
}

const run = (stageId: string): RunResult => ({
  stageId,
  cleared: true,
  reason: null,
  time: 10,
  parts: 12,
  cost: 120,
  energy: 40,
  distance: 3,
  medals: { time: 'gold', parts: null, cost: 'bronze', energy: 'silver' },
});

/** 起動時に読むものを全部読む。例外を投げないこと */
function startup(s: StorageLike) {
  const p = createPersistence(s);
  const isObj = (v: unknown): v is object => typeof v === 'object' && v !== null;
  return {
    design: p.loadDesign(SANDBOX_SLOT),
    stage: p.loadDesign('c1-s1'),
    progress: p.loadProgress(),
    settings: p.loadSettings(isObj, {}),
    p,
  };
}

describe('progress from a tampered localStorage', () => {
  it('cannot replace the prototype of the records with a __proto__ key', () => {
    const text =
      '{"version":1,"best":{"__proto__":' +
      JSON.stringify(run('__proto__')) +
      ',"c1-s1":' +
      JSON.stringify(run('c1-s1')) +
      '},"unlockedChapters":[1]}';
    const p = validateProgress(JSON.parse(text));
    expect(p).not.toBeNull();
    expect(Object.getPrototypeOf(p!.best)).toBe(Object.prototype);
    expect(Object.keys(p!.best)).toEqual(['c1-s1']);
    // 以前は best のプロトタイプが記録に置き換わり、best.stageId などが読めてしまっていた
    expect((p!.best as Record<string, unknown>).stageId).toBeUndefined();
  });

  it('drops records whose key is an Object.prototype member or not a stage id', () => {
    const best: Record<string, RunResult> = {};
    for (const k of ['constructor', 'toString', 'hasOwnProperty', 'a b', '', 'x'.repeat(65)]) {
      Object.defineProperty(best, k, { value: run(k), enumerable: true });
    }
    best['c1-s2'] = run('c1-s2');
    const p = validateProgress({ version: 1, best, unlockedChapters: [1] });
    expect(Object.keys(p!.best)).toEqual(['c1-s2']);
  });

  it('caps the lists so a huge entry cannot blow up memory on every load', () => {
    const p = validateProgress({
      version: 1,
      best: {},
      unlockedChapters: Array.from({ length: 100_000 }, (_, i) => i + 1),
      zukan: Array.from({ length: 100_000 }, (_, i) => `z${i}`),
      seenTransitions: ['ok', 'y'.repeat(10_000), 5, null],
    });
    expect(p!.unlockedChapters.length).toBeLessThanOrEqual(MAX_PROGRESS_LIST);
    expect(p!.zukan.length).toBeLessThanOrEqual(MAX_PROGRESS_LIST);
    expect(p!.seenTransitions).toEqual(['ok']);
  });

  it('is idempotent on its own output', () => {
    const rng = createRng(11);
    const base = {
      version: 1,
      best: { 'c1-s1': run('c1-s1'), 'c2-s3': run('c2-s3') },
      unlockedChapters: [1, 2],
      zukan: ['jansen'],
      seenTransitions: ['T-01'],
    };
    for (let i = 0; i < 500; i++) {
      const v = mutateJson(rng, base, 0.15);
      const p = validateProgress(v);
      if (p) expect(validateProgress(JSON.parse(JSON.stringify(p)))).toEqual(p);
    }
  });
});

describe('startup with corrupted, oversized or foreign entries', () => {
  it('ignores entries larger than the limit without parsing them', () => {
    const s = new MapStorage();
    const huge = `{"version":1,"best":{},"zukan":[${'"x",'.repeat(MAX_STORED_ITEM_LENGTH / 4)}"x"]}`;
    expect(huge.length).toBeGreaterThan(MAX_STORED_ITEM_LENGTH);
    s.data.set(storageKeys.progress, huge);
    s.data.set(storageKeys.design(SANDBOX_SLOT), huge);
    s.data.set(storageKeys.settings, huge);
    const { value, ms } = timed(() => startup(s));
    expect(value.progress).toEqual(createDefaultProgress());
    expect(value.design).toBeNull();
    expect(value.settings).toEqual({});
    expect(ms).toBeLessThan(200);
    // 壊れた大きな値は上書きして直せる
    expect(value.p.saveProgress(createDefaultProgress()).ok).toBe(true);
  });

  it('survives random garbage in every key', () => {
    const rng = createRng(12);
    const goodDesign = JSON.stringify({
      app: 'ashikumi',
      kind: 'design',
      version: 1,
      design: jansenWalker(),
    });
    const keys = [
      storageKeys.design(SANDBOX_SLOT),
      storageKeys.design('c1-s1'),
      storageKeys.progress,
      storageKeys.settings,
    ];
    for (let i = 0; i < 400; i++) {
      const s = new MapStorage();
      for (const k of keys) {
        const r = rng.int(4);
        const text =
          r === 0
            ? JSON.stringify(randomJson(rng, 4))
            : r === 1
              ? mutateString(rng, goodDesign)
              : r === 2
                ? JSON.stringify(mutateJson(rng, JSON.parse(goodDesign), 0.1))
                : '{"version":1,"best":' + JSON.stringify(randomJson(rng, 3)) + '}';
        s.data.set(k, text);
      }
      let out: ReturnType<typeof startup> | undefined;
      expect(() => (out = startup(s))).not.toThrow();
      for (const d of [out!.design, out!.stage]) {
        if (d) expect(validateDesign(d).ok).toBe(true);
      }
      expect(validateProgress(out!.progress)).toEqual(out!.progress);
    }
  });

  it('never throws for odd slot names (lone surrogates cannot be URI-encoded)', () => {
    const p = createPersistence(new MapStorage());
    for (const slot of ['\uD800', 'a/b', '__proto__', '']) {
      expect(() => p.saveDesign(slot, fourBar())).not.toThrow();
      expect(() => p.loadDesign(slot)).not.toThrow();
      expect(() => p.removeDesign(slot)).not.toThrow();
    }
    expect(p.saveDesign('\uD800', fourBar()).ok).toBe(true);
    expect(p.loadDesign('\uD800')).toEqual(fourBar());
  });

  it('keeps data written by a newer app (foreign version) untouched', () => {
    const s = new MapStorage();
    s.data.set(storageKeys.progress, JSON.stringify({ version: 7, best: { x: 1 } }));
    const newer = JSON.stringify({ app: 'ashikumi', kind: 'design', version: 9, design: {} });
    s.data.set(storageKeys.design(SANDBOX_SLOT), newer);
    const { progress, design, p } = startup(s);
    expect(progress).toEqual(createDefaultProgress());
    expect(design).toBeNull();
    expect(p.saveDesign(SANDBOX_SLOT, fourBar())).toEqual({ ok: false, reason: 'newer' });
    expect(s.data.get(storageKeys.design(SANDBOX_SLOT))).toBe(newer);
    // 他のアプリのデータ(app が違う)は設計として読まない
    s.data.set(storageKeys.design('c1-s1'), JSON.stringify({ app: 'other', design: fourBar() }));
    expect(createPersistence(s).loadDesign('c1-s1')).toBeNull();
  });
});
