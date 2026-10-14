import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { useApp } from '@/app/store';
import { jansenWalker } from '@/core/model/presets';
import { basicLeg } from '@/game/designs';
import { initialProgress } from '@/game/progress';
import {
  activateStage,
  applyRun,
  initialWorldData,
  setStageSelectHandler,
  useWorld,
} from './store';
import { progressWithCleared } from './testing';

beforeEach(() => {
  useWorld.getState().reset();
  useApp.setState({ screen: 'stageSelect', transition: null, history: ['home'], stageId: null });
});
afterEach(() => setStageSelectHandler(null));

describe('useWorld の既定値', () => {
  it('最初の進行で、機械は未設定(ヤンセン型の見本機を使う)', () => {
    const s = useWorld.getState();
    expect(s.progress).toEqual(initialProgress());
    expect(s.machineDesign).toBeNull();
    expect(s.currentStageId).toBeNull();
    expect(s.lastClearedStageId).toBeNull();
    expect(s.chapterMachines).toEqual({});
    expect(s.walking).toBeNull();
  });
});

describe('試走の結果', () => {
  it('クリアすると直前のクリア・今のステージ・最新の機械が変わる', () => {
    const d = basicLeg();
    const patch = applyRun(initialWorldData(), {
      stageId: 'c1-s1',
      cleared: true,
      progress: progressWithCleared(1),
      design: d,
    });
    expect(patch.lastClearedStageId).toBe('c1-s1');
    expect(patch.currentStageId).toBe('c1-s1');
    expect(patch.machineDesign).toBe(d);
    expect(patch.chapterMachines).toBeUndefined();
  });

  it('失敗では歩かないが、最新の機械は変わる', () => {
    const d = basicLeg();
    const patch = applyRun(initialWorldData(), {
      stageId: 'c1-s1',
      cleared: false,
      progress: initialProgress(),
      design: d,
    });
    expect(patch.lastClearedStageId).toBeUndefined();
    expect(patch.machineDesign).toBe(d);
  });

  it('章を全部クリアした機械が棚に並び、後のクリアでは上書きしない', () => {
    const first = basicLeg();
    useWorld.getState().noteRun({
      stageId: 'c1-s5',
      cleared: true,
      progress: progressWithCleared(5),
      design: first,
    });
    expect(useWorld.getState().chapterMachines[1]).toBe(first);
    useWorld.getState().noteRun({
      stageId: 'c1-s5',
      cleared: true,
      progress: progressWithCleared(5),
      design: jansenWalker(),
    });
    expect(useWorld.getState().chapterMachines[1]).toBe(first);
    expect(useWorld.getState().chapterMachines[2]).toBeUndefined();
  });

  it('ステージに入ると残っていた歩行は捨てる', () => {
    useWorld.setState({ lastClearedStageId: 'c1-s1' });
    useWorld.getState().enterStage('c1-s1');
    expect(useWorld.getState().lastClearedStageId).toBeNull();
    expect(useWorld.getState().currentStageId).toBe('c1-s1');
  });

  it('歩き終えると今のステージが行き先になり、行き先を選ぶ', () => {
    useWorld.setState({ progress: progressWithCleared(1), lastClearedStageId: 'c1-s1' });
    useWorld.getState().beginWalk({ from: 'c1-s1', to: 'c1-s2' });
    expect(useWorld.getState().walking).toEqual({ from: 'c1-s1', to: 'c1-s2' });
    useWorld.getState().finishWalk();
    const s = useWorld.getState();
    expect(s.walking).toBeNull();
    expect(s.currentStageId).toBe('c1-s2');
    expect(s.selectedStageId).toBe('c1-s2');
    expect(s.lastClearedStageId).toBeNull();
  });
});

describe('目印を選ぶ', () => {
  it('未解放は選べない', () => {
    expect(activateStage('c1-s3')).toBe(false);
    expect(useApp.getState().screen).toBe('stageSelect');
    expect(useWorld.getState().selectedStageId).toBeNull();
  });

  it('既定では設計画面へ(T-02)、そのステージで', () => {
    expect(activateStage('c1-s1')).toBe(true);
    expect(useApp.getState().screen).toBe('design');
    expect(useApp.getState().stageId).toBe('c1-s1');
    expect(useWorld.getState().currentStageId).toBe('c1-s1');
  });

  it('差し替えた処理があればそれだけを呼ぶ', () => {
    const got: string[] = [];
    setStageSelectHandler((id) => got.push(id));
    expect(activateStage('c1-s1')).toBe(true);
    expect(got).toEqual(['c1-s1']);
    expect(useApp.getState().screen).toBe('stageSelect');
    expect(useWorld.getState().selectedStageId).toBe('c1-s1');
  });

  it('ホバー・選択の setter は同じ値なら通知しない', () => {
    let calls = 0;
    const unsub = useWorld.subscribe(() => calls++);
    useWorld.getState().hoverStage('c1-s1');
    useWorld.getState().hoverStage('c1-s1');
    useWorld.getState().selectStage(null);
    unsub();
    expect(calls).toBe(1);
  });
});
