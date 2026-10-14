import { describe, expect, it } from 'vitest';
import { sampleGhost } from '@/core/model/ghost';
import { createFlatTerrain } from '@/core/sim';
import { getStage } from '@/game';
import { t } from '@/i18n';
import { LiveRun } from '../run';
import { convexHull, drawSideView, sideViewCamera } from './sideView';

/** 呼ばれた描画命令と書いた文字を記録する 2D コンテキストの代役 */
function recordingContext() {
  const calls: string[] = [];
  const texts: string[] = [];
  const target: Record<string | symbol, unknown> = {
    fillText: (s: string) => texts.push(s),
  };
  const ctx = new Proxy(target, {
    get(o, key) {
      if (key in o) return o[key];
      return () => calls.push(String(key));
    },
    set(o, key, value) {
      o[key] = value;
      return true;
    },
  }) as unknown as CanvasRenderingContext2D;
  return { ctx, calls, texts };
}

const stage = getStage('c1-s1')!;

describe('2D side view', () => {
  it('keeps the whole course in view when it fits, and follows the machine otherwise', () => {
    const wide = sideViewCamera(1600, 500, stage, 0.3, 0);
    expect(wide.ppm).toBeGreaterThanOrEqual(90);
    // コース全体(スタート −0.8m 〜 ゴール +0.8m)が入るので、機体が動いてもカメラは動かない
    expect(sideViewCamera(1600, 500, stage, 1.2, 0).cx).toBe(wide.cx);
    const narrow = sideViewCamera(200, 500, stage, 0.9, 0);
    expect(narrow.ppm).toBe(90);
    expect(narrow.cx).toBeCloseTo(0.9, 9);
  });

  it('computes convex outlines', () => {
    const hull = convexHull([
      [0, 0],
      [1, 0],
      [1, 1],
      [0, 1],
      [0.5, 0.5],
    ]);
    expect(hull).toHaveLength(4);
    expect(hull).not.toContainEqual([0.5, 0.5]);
  });

  it('draws the course, the machine and the ghosts', () => {
    const run = new LiveRun(stage, stage.reference!, createFlatTerrain(0));
    for (let k = 0; k < 30; k++) run.advance(1 / 60);
    const ghost = run.ghost();
    const { ctx, calls, texts } = recordingContext();
    drawSideView(ctx, 900, 400, {
      snapshot: run.snapshot(),
      design: run.design,
      terrain: run.terrain,
      stage,
      chassis: run.chassis,
      ghosts: [{ pose: sampleGhost(ghost, 0.2)!, kind: 'previous' }],
    });
    expect(calls).toContain('clearRect');
    expect(calls.filter((c) => c === 'stroke').length).toBeGreaterThan(20);
    expect(texts).toContain(t('flow.ui.goal', { distance: stage.goal.x - stage.start.x }));
    expect(texts).toContain(t('flow.ui.ghost.previous'));
  });
});
