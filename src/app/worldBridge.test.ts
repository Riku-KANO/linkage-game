import { afterEach, describe, expect, it } from 'vitest';
import { jansenWalker } from '@/core/model/presets';
import { createMemoryStorage } from '@/core/storage/persistence';
import { activateStage, useWorld } from '@/scene/world';
import { loadWorldSave, saveWorldSave } from '@/scene/world/save';
import { installWorldBridge, worldAvailable } from './worldBridge';

let stop: (() => void) | null = null;
afterEach(() => {
  stop?.();
  stop = null;
  useWorld.getState().reset();
});

describe('ジオラマ(world)への流し込み', () => {
  it('world があれば、保存した機械を戻し、目印のクリックを渡す', () => {
    expect(worldAvailable).toBe(true);
    const storage = createMemoryStorage();
    const saved = jansenWalker();
    saved.name = '保存した機械';
    saveWorldSave(storage, { machineDesign: saved, chapterMachines: {} });
    const opened: string[] = [];
    stop = installWorldBridge((id) => opened.push(id), storage);
    expect(useWorld.getState().machineDesign?.name).toBe('保存した機械');
    expect(activateStage('c1-s1')).toBe(true);
    expect(opened).toEqual(['c1-s1']);
  });

  it('止めると、残っている機械の保存を書き出す', () => {
    const storage = createMemoryStorage();
    stop = installWorldBridge(() => {}, storage);
    useWorld.getState().setMachineDesign(jansenWalker());
    stop();
    stop = null;
    expect(loadWorldSave(storage).machineDesign).not.toBeNull();
  });
});
