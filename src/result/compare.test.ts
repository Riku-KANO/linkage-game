import { describe, expect, it } from 'vitest';
import type { RunResult } from '@/game/types';
import type { ShareRun } from '@/core/model';
import { buildShareUrl, decodeShare, jansenWalker } from '@/core/model';
import { compareRuns, quantizeRun, toShareRun } from './compare';

const run = (p: Partial<ShareRun> = {}): ShareRun => ({
  stageId: 'c1-s1',
  time: 12.4,
  parts: 9,
  cost: 180,
  energy: 40,
  cleared: true,
  ...p,
});

describe('toShareRun', () => {
  it('RunResult から共有に要る項目だけを取り出す', () => {
    const r: RunResult = {
      stageId: 'c1-s2',
      cleared: false,
      reason: 'fallen',
      time: 30,
      parts: 7,
      cost: 120.5,
      energy: 12.25,
      distance: 1.2,
      medals: { time: null, parts: null, cost: null, energy: null },
    };
    expect(toShareRun(r)).toEqual({
      stageId: 'c1-s2',
      time: 30,
      parts: 7,
      cost: 120.5,
      energy: 12.25,
      cleared: false,
    });
  });
});

describe('quantizeRun', () => {
  it('共有リンクと同じ精度にそろえる(往復した値と一致する)', () => {
    const mine = run({ time: 12.34567, energy: 40.1234, cost: 180.26 });
    const url = buildShareUrl('https://example.test/', { design: jansenWalker(), run: mine });
    const back = decodeShare(url);
    expect(back.ok).toBe(true);
    if (!back.ok) return;
    expect(quantizeRun(mine)).toEqual(back.payload.run);
  });
});

describe('compareRuns', () => {
  it('軸ごとに小さい方が勝ち、同じなら引き分け', () => {
    const c = compareRuns(run(), run({ time: 13, parts: 9, cost: 150, energy: 50 }));
    expect(c.axes.map((a) => [a.axis, a.winner])).toEqual([
      ['time', 'you'],
      ['parts', 'tie'],
      ['cost', 'them'],
      ['energy', 'you'],
    ]);
    expect([c.wins, c.losses, c.ties]).toEqual([2, 1, 1]);
    expect(c.sameStage).toBe(true);
    expect(c.note).toBeNull();
  });

  it('リンクの量子化より細かい差は引き分け', () => {
    const c = compareRuns(run({ time: 12.4001 }), run({ time: 12.4 }));
    expect(c.axes[0]!.winner).toBe('tie');
  });

  it('片方だけクリアしたときは、クリアした方がすべての軸で勝つ', () => {
    const c = compareRuns(run({ cleared: false, energy: 5 }), run());
    expect(c.axes.every((a) => a.winner === 'them')).toBe(true);
    expect(c.note).toBe('youNotCleared');
    const d = compareRuns(run(), run({ cleared: false, parts: 2 }));
    expect(d.axes.every((a) => a.winner === 'you')).toBe(true);
    expect(d.note).toBe('themNotCleared');
  });

  it('別のステージの記録は印を付ける', () => {
    expect(compareRuns(run(), run({ stageId: 'c2-s1' })).sameStage).toBe(false);
  });
});
