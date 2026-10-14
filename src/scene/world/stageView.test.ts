import { describe, expect, it } from 'vitest';
import { initialProgress, recordResult } from '@/game/progress';
import { STAGES } from '@/game/stages';
import { frontierStage, markerMedals, markerState, planWalk, restingStage } from './stageView';
import { clearResult, progressWithCleared } from './testing';

describe('目印の状態', () => {
  it('最初は 1-1 だけ遊べて、他は未解放', () => {
    const p = initialProgress();
    expect(markerState(p, 'c1-s1')).toBe('playable');
    for (const s of STAGES.slice(1)) expect(markerState(p, s.id)).toBe('locked');
  });

  it('クリアするとクリアになり、次が遊べる', () => {
    const p = progressWithCleared(1);
    expect(markerState(p, 'c1-s1')).toBe('cleared');
    expect(markerState(p, 'c1-s2')).toBe('playable');
    expect(markerState(p, 'c1-s3')).toBe('locked');
  });

  it('章 1 を全部クリアすると章 2 の最初が遊べる', () => {
    const p = progressWithCleared(5);
    expect(markerState(p, 'c2-s1')).toBe('playable');
    expect(markerState(p, 'c2-s2')).toBe('locked');
  });

  it('メダルは軸の順(時間・部品・コスト・エネルギー)。クリアしていなければすべて null', () => {
    const p = progressWithCleared(1, ['gold', 'bronze', null, 'silver']);
    expect(markerMedals(p, 'c1-s1')).toEqual(['gold', 'bronze', null, 'silver']);
    expect(markerMedals(p, 'c1-s2')).toEqual([null, null, null, null]);
  });

  it('メダルは軸ごとの最高記録', () => {
    let p = progressWithCleared(1, ['bronze', 'gold', null, null]);
    p = recordResult(p, clearResult('c1-s1', ['gold', 'silver', 'bronze', null]));
    expect(markerMedals(p, 'c1-s1')).toEqual(['gold', 'gold', 'bronze', null]);
  });
});

describe('機械の立つ場所と T-06 の歩行', () => {
  it('最前線は遊べてまだクリアしていない最初のステージ。全部クリアなら最後', () => {
    expect(frontierStage(initialProgress())).toBe('c1-s1');
    expect(frontierStage(progressWithCleared(3))).toBe('c1-s4');
    expect(frontierStage(progressWithCleared(STAGES.length))).toBe('c2-s5');
  });

  it('クリアしたステージから次のステージへ歩く(章をまたいでも)', () => {
    expect(planWalk(progressWithCleared(1), 'c1-s1')).toEqual({ from: 'c1-s1', to: 'c1-s2' });
    expect(planWalk(progressWithCleared(5), 'c1-s5')).toEqual({ from: 'c1-s5', to: 'c2-s1' });
  });

  it('次がない・解放されていない・クリアしていない・知らないステージなら歩かない', () => {
    expect(planWalk(progressWithCleared(STAGES.length), 'c2-s5')).toBeNull();
    expect(planWalk(initialProgress(), 'c1-s1')).toBeNull();
    expect(planWalk(progressWithCleared(1), null)).toBeNull();
    expect(planWalk(progressWithCleared(1), 'sandbox')).toBeNull();
  });

  it('歩行が残っていれば行き先、なければ今のステージ、それもなければ最前線に立つ', () => {
    const p = progressWithCleared(2);
    expect(restingStage(p, 'c1-s2', 'c1-s2')).toBe('c1-s3');
    expect(restingStage(p, 'c1-s1', null)).toBe('c1-s1');
    expect(restingStage(p, null, null)).toBe('c1-s3');
    // 未解放のステージにはいない
    expect(restingStage(p, 'c2-s3', null)).toBe('c1-s3');
  });
});
