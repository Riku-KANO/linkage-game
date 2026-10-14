import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { jansenWalker } from '@/core/model/presets';
import { createMemoryStorage, MAX_STORED_ITEM_LENGTH } from '@/core/storage/persistence';
import { basicLeg } from '@/game/designs';
import {
  emptyWorldSave,
  loadWorldSave,
  parseWorldSave,
  saveWorldSave,
  WORLD_SAVE_KEY,
} from './save';
import { installWorldSave, useWorld } from './store';

describe('機械の保存', () => {
  it('最新の機械と章の機械が往復する', () => {
    const st = createMemoryStorage();
    const data = { machineDesign: basicLeg(), chapterMachines: { 1: jansenWalker() } };
    expect(saveWorldSave(st, data)).toEqual({ ok: true });
    const back = loadWorldSave(st);
    expect(back.machineDesign?.joints.length).toBe(data.machineDesign.joints.length);
    expect(back.chapterMachines[1]?.links.length).toBe(jansenWalker().links.length);
  });

  it('壊れた設計・知らない章・違う版は捨てる(全体は捨てない)', () => {
    const good = jansenWalker();
    const out = parseWorldSave({
      version: 1,
      machineDesign: { nope: true },
      chapterMachines: { 1: good, 2: 'broken', 99: good },
    });
    expect(out.machineDesign).toBeNull();
    expect(Object.keys(out.chapterMachines)).toEqual(['1']);
    expect(parseWorldSave({ version: 2, machineDesign: good })).toEqual(emptyWorldSave());
    expect(parseWorldSave('x')).toEqual(emptyWorldSave());
  });

  it('読めない値・巨大な値・保存先がないときは空で、例外を投げない', () => {
    const st = createMemoryStorage();
    st.setItem(WORLD_SAVE_KEY, '{not json');
    expect(loadWorldSave(st)).toEqual(emptyWorldSave());
    st.setItem(WORLD_SAVE_KEY, 'x'.repeat(MAX_STORED_ITEM_LENGTH + 1));
    expect(loadWorldSave(st)).toEqual(emptyWorldSave());
    expect(loadWorldSave(null)).toEqual(emptyWorldSave());
    expect(saveWorldSave(null, emptyWorldSave())).toEqual({ ok: false, reason: 'unavailable' });
  });
});

describe('保存の同期(installWorldSave)', () => {
  beforeEach(() => {
    useWorld.getState().reset();
    vi.useFakeTimers();
  });
  afterEach(() => vi.useRealTimers());

  it('起動時に戻し、変わったら少し待ってまとめて保存する', () => {
    const st = createMemoryStorage();
    saveWorldSave(st, { machineDesign: basicLeg(), chapterMachines: { 1: jansenWalker() } });
    const stop = installWorldSave(st, { delayMs: 100 });
    expect(useWorld.getState().machineDesign?.name).toBe(basicLeg().name);
    expect(useWorld.getState().chapterMachines[1]).toBeDefined();

    const next = jansenWalker();
    next.name = 'つぎの機械';
    useWorld.getState().setMachineDesign(next);
    useWorld.getState().setChapterMachine(2, next);
    expect(loadWorldSave(st).machineDesign?.name).toBe(basicLeg().name);
    vi.advanceTimersByTime(150);
    const saved = loadWorldSave(st);
    expect(saved.machineDesign?.name).toBe('つぎの機械');
    expect(Object.keys(saved.chapterMachines).sort()).toEqual(['1', '2']);
    stop();
  });

  it('止めるときに残っている保存を書き出す', () => {
    const st = createMemoryStorage();
    const stop = installWorldSave(st, { delayMs: 1000 });
    useWorld.getState().setMachineDesign(basicLeg());
    stop();
    expect(loadWorldSave(st).machineDesign).not.toBeNull();
  });

  it('保存に失敗したら知らせる', () => {
    const st = createMemoryStorage();
    const failing = {
      ...st,
      setItem: () => {
        throw new Error('nope');
      },
    };
    const reasons: string[] = [];
    const stop = installWorldSave(failing, { delayMs: 10, onSaveFail: (r) => reasons.push(r) });
    useWorld.getState().setMachineDesign(basicLeg());
    vi.advanceTimersByTime(20);
    expect(reasons).toEqual(['unavailable']);
    stop();
  });
});
