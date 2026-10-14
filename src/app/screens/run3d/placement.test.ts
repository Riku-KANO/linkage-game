import { describe, expect, it } from 'vitest';
import { sandboxStage } from '@/app/flow';
import { jansenLeg } from '@/core/model/presets';
import { getStage, initialProgress, preflight, sameLegLayout, stageLegs, STAGES } from '@/game';
import { TEST_TRACK } from '@/scene/layout';
import {
  courseViewTerrain,
  freeDesignForStage,
  lowestTerrainY,
  toWorld,
  TRACK_SURFACE_Y,
  trackPlacement,
} from './placement';

describe('trackPlacement (INT-2: the stage course on the outdoor test track)', () => {
  it('puts the stage start on the track start line and the course centre on the track', () => {
    for (const stage of STAGES) {
      const { offset } = trackPlacement(stage);
      const start = toWorld({ x: stage.start.x, y: 0, z: stage.start.z }, offset);
      expect(start.x).toBeCloseTo(TEST_TRACK.xStart, 12);
      expect(start.z).toBeCloseTo(TEST_TRACK.z, 12);
      // ゴールも試走コースの帯の上(スタートから右へ)
      const goal = stage.goal.x + offset[0];
      expect(goal).toBeGreaterThan(TEST_TRACK.xStart);
      expect(goal).toBeLessThan(TEST_TRACK.xGoal);
    }
  });

  it('rests the lowest part of the terrain on the track surface (flat ground, ditch floors)', () => {
    const flat = getStage('c1-s1')!;
    expect(lowestTerrainY(flat.terrain)).toBe(0);
    expect(trackPlacement(flat).offset[1]).toBeCloseTo(TRACK_SURFACE_Y, 12);
    const ditch = getStage('c2-s4')!;
    expect(lowestTerrainY(ditch.terrain)).toBeCloseTo(-0.2, 12);
    // 溝の底が帯の上面、歩く台はその上に立つ
    expect(-0.2 + trackPlacement(ditch).offset[1]).toBeCloseTo(TRACK_SURFACE_Y, 12);
    expect(lowestTerrainY({ ground: null, shapes: [] })).toBe(0);
  });

  it('draws no infinite ground plane (the track is the ground) but keeps the shapes', () => {
    const ditch = getStage('c2-s4')!;
    const view = courseViewTerrain(ditch.terrain);
    expect(view.ground).toBeNull();
    expect(view.shapes).toBe(ditch.terrain.shapes);
    const noGround = { ground: null, shapes: [] };
    expect(courseViewTerrain(noGround)).toBe(noGround);
  });
});

describe('freeDesignForStage', () => {
  it('gives a free design the standard leg array while the leg array is locked', () => {
    const sandbox = sandboxStage(initialProgress());
    const design = jansenLeg();
    expect(preflight(sandbox, design).problems.some((p) => p.code === 'legArrayLocked')).toBe(true);
    const fixed = freeDesignForStage(design, sandbox);
    expect(sameLegLayout(fixed.legs, stageLegs(sandbox))).toBe(true);
    expect(fixed.joints).toBe(design.joints);
    expect(preflight(sandbox, fixed).ok).toBe(true);
    // もう合っていれば同じもの
    expect(freeDesignForStage(fixed, sandbox)).toBe(fixed);
  });

  it('leaves the design alone once the leg array is unlocked', () => {
    const c2 = getStage('c2-s1')!;
    const design = jansenLeg();
    expect(freeDesignForStage(design, c2)).toBe(design);
  });
});
