import { describe, expect, it } from 'vitest';
import { initialProgress, recordResult, STAGES, stagesOfChapter } from '@/game';
import type { Progress, RunResult } from '@/game/types';
import { buildStageSelect, medalTally, nextPlayableStage, stageAriaLabel } from './stageSelect';

const cleared = (stageId: string, medals: Partial<RunResult['medals']> = {}): RunResult => ({
  stageId,
  cleared: true,
  reason: null,
  time: 8,
  parts: 10,
  cost: 600,
  energy: 90,
  distance: 1.6,
  medals: { time: 'gold', parts: 'silver', cost: 'bronze', energy: null, ...medals },
});

const progressWith = (...ids: string[]): Progress =>
  ids.reduce((p, id) => recordResult(p, cleared(id)), initialProgress());

describe('buildStageSelect', () => {
  it('はじめは章 1 の 1 面だけが遊べ、それが「次」', () => {
    const rows = buildStageSelect(initialProgress());
    expect(rows.map((r) => r.chapter)).toEqual([1, 2, 3, 4, 5]);
    const [c1, c2, c3] = rows;
    expect(c1!.unlocked).toBe(true);
    expect(c1!.stages.map((s) => s.unlocked)).toEqual([true, false, false, false, false]);
    expect(c1!.stages[0]!.isNext).toBe(true);
    expect(c2!.unlocked).toBe(false);
    expect(c2!.stages.every((s) => !s.unlocked)).toBe(true);
    expect(c3!.playable).toBe(false);
    expect(c3!.stages).toHaveLength(0);
    expect(nextPlayableStage(rows)).toBe('c1-s1');
  });

  it('クリアした面は記録とメダルを持ち、次の面が「次」になる', () => {
    const rows = buildStageSelect(progressWith('c1-s1', 'c1-s2'));
    const c1 = rows[0]!;
    expect(c1.stages[0]!.cleared).toBe(true);
    expect(c1.stages[0]!.medals).toEqual({
      time: 'gold',
      parts: 'silver',
      cost: 'bronze',
      energy: null,
    });
    expect(c1.stages[2]!.unlocked).toBe(true);
    expect(c1.stages[2]!.cleared).toBe(false);
    expect(c1.stages[2]!.isNext).toBe(true);
    expect(c1.stages.filter((s) => s.isNext)).toHaveLength(1);
    expect(c1.cleared).toBe(false);
    expect(nextPlayableStage(rows)).toBe('c1-s3');
  });

  it('章 1 を全部クリアすると章 2 が開き、その最初の面が「次」', () => {
    const rows = buildStageSelect(progressWith(...stagesOfChapter(1).map((s) => s.id)));
    expect(rows[0]!.cleared).toBe(true);
    expect(rows[1]!.unlocked).toBe(true);
    expect(rows[1]!.stages[0]!.isNext).toBe(true);
    expect(nextPlayableStage(rows)).toBe('c2-s1');
  });

  it('全部クリアしたら「次」はない', () => {
    const rows = buildStageSelect(progressWith(...STAGES.map((s) => s.id)));
    expect(nextPlayableStage(rows)).toBeNull();
    expect(rows.flatMap((r) => r.stages).some((s) => s.isNext)).toBe(false);
  });
});

describe('medalTally', () => {
  it('金・銀・銅の数', () => {
    expect(medalTally({ time: 'gold', parts: 'gold', cost: 'bronze', energy: null })).toEqual({
      gold: 2,
      silver: 0,
      bronze: 1,
    });
    expect(medalTally(null)).toEqual({ gold: 0, silver: 0, bronze: 0 });
  });
});

describe('stageAriaLabel', () => {
  it('番号・題・状態・メダルを読み上げる', () => {
    const rows = buildStageSelect(progressWith('c1-s1'));
    const [s1, s2, s3] = rows[0]!.stages;
    expect(stageAriaLabel(s1!)).toBe('1-1 こわれた機械、クリア済み、金 1・銀 1・銅 1');
    expect(stageAriaLabel(s2!)).toBe('1-2 回らないクランク、次に遊ぶステージ');
    expect(stageAriaLabel(s3!)).toBe('1-3 はじめての脚、ロック中');
  });
});
