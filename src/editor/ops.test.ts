import { describe, expect, it } from 'vitest';
import { createEmptyDesign, type DesignDoc } from '@/core/model/types';
import { fourBar, jansenLeg } from '@/core/model/presets';
import { analyzeMechanism, compileMechanism, grublerDof, sampleCycle } from '@/core/kinematics';
import {
  addJoint,
  addLink,
  attachToLink,
  copyItems,
  deleteItems,
  linkLength,
  mergeJoints,
  mirrorJoints,
  mirrorSelection,
  moveJoints,
  pasteItems,
  setCrank,
  setFoot,
  setLegs,
  setLinkLength,
  setMotorRpm,
  toggleCrank,
  toggleFixed,
} from './ops';

function footPath(d: DesignDoc, steps = 90) {
  const m = compileMechanism(d);
  const cyc = sampleCycle(m, steps);
  return cyc.positions.map((p) => ({ x: p[m.footIndex * 2]!, y: p[m.footIndex * 2 + 1]! }));
}

function allIdsUnique(d: DesignDoc) {
  const ids = [...d.joints, ...d.links, ...d.cranks].map((x) => x.id);
  return new Set(ids).size === ids.length;
}

/** 白紙から四節リンクを組む(プリセット fourBar() と同じ寸法) */
function buildFourBar(): DesignDoc {
  const ref = fourBar();
  const P = new Map(ref.joints.map((j) => [j.id, j]));
  let d = createEmptyDesign();
  const o2 = addJoint(d, P.get('O2')!, true);
  d = o2.design;
  const o4 = addJoint(d, P.get('O4')!, true);
  d = o4.design;
  // クランク:固定点 O2 から A へ棒を引く
  const crank = addLink(d, { joint: o2.id }, P.get('A')!);
  d = crank.design;
  const A = crank.joints[1]!;
  // カップラー:A から B へ
  const coupler = addLink(d, { joint: A }, P.get('B')!);
  d = coupler.design;
  const B = coupler.joints[1]!;
  // 揺動節:B と O4 をつなぐ(両端が既存のジョイント → ピン)
  const rocker = addLink(d, { joint: B }, { joint: o4.id });
  d = rocker.design;
  // カップラーに脚先の点を足して三角リンクにする
  const foot = attachToLink(d, coupler.linkId!, P.get('F')!);
  d = foot.design;
  d = setFoot(d, foot.jointId);
  const c = setCrank(d, crank.linkId!);
  expect(c.ok).toBe(true);
  return c.design;
}

describe('building a four-bar from scratch with ops', () => {
  it('produces a valid, fully rotating DOF-1 mechanism identical to the preset', () => {
    const d = buildFourBar();
    expect(allIdsUnique(d)).toBe(true);
    expect(d.joints).toHaveLength(5);
    expect(d.links).toHaveLength(3);
    expect(d.links.find((l) => l.joints.length === 3)).toBeDefined();
    expect(d.cranks).toHaveLength(1);
    expect(grublerDof(d).dof).toBe(1);
    const a = analyzeMechanism(d, { steps: 90 });
    expect(a.assemblable).toBe(true);
    expect(a.fullRotation).toBe(true);
    const mine = footPath(d);
    const ref = footPath(fourBar());
    mine.forEach((p, i) => {
      expect(p.x).toBeCloseTo(ref[i]!.x, 4);
      expect(p.y).toBeCloseTo(ref[i]!.y, 4);
    });
  });

  it('uses deterministic ids from nextId', () => {
    const d = buildFourBar();
    expect(d.joints.map((j) => j.id)).toEqual(['j1', 'j2', 'j3', 'j4', 'j5']);
    expect(d.links.map((l) => l.id)).toEqual(['l1', 'l2', 'l3']);
    expect(d.cranks[0]!.id).toBe('c1');
    expect(d.foot).toBe('j5');
  });
});

describe('addLink', () => {
  it('ignores zero-length and redundant links', () => {
    const d = fourBar();
    expect(addLink(d, { joint: 'A' }, { joint: 'A' }).linkId).toBeNull();
    // A and B already share the coupler
    expect(addLink(d, { joint: 'A' }, { joint: 'B' }).linkId).toBeNull();
    const a = d.joints.find((j) => j.id === 'A')!;
    expect(addLink(d, { joint: 'A' }, { x: a.x, y: a.y }).linkId).toBeNull();
  });
});

describe('crank / fixed / foot', () => {
  it('needs exactly one fixed joint on the link', () => {
    const d = fourBar();
    expect(setCrank(d, 'coupler')).toMatchObject({ ok: false, reason: 'no-fixed' });
    const r = setCrank(d, 'rocker');
    expect(r.ok).toBe(true);
    expect(r.design.cranks).toEqual([{ id: 'motor', link: 'rocker', pivot: 'O4', phase: 0 }]);
  });
  it('toggles the crank off when clicking the crank link again', () => {
    const d = fourBar();
    const r = toggleCrank(d, 'crank');
    expect(r.design.cranks).toHaveLength(0);
  });
  it('unfixing a pivot removes its crank; locked joints cannot be toggled', () => {
    const d = fourBar();
    expect(toggleFixed(d, 'O2').cranks).toHaveLength(0);
    expect(toggleFixed(d, 'O2', new Set(['O2']))).toBe(d);
  });
  it('sets and clears the foot', () => {
    const d = fourBar();
    expect(setFoot(d, 'B').foot).toBe('B');
    expect(setFoot(d, null).foot).toBeNull();
    expect(setFoot(d, 'nope')).toBe(d);
  });
});

describe('delete cascades', () => {
  it('deleting the crank pin removes its bars and the crank', () => {
    const d = jansenLeg();
    const r = deleteItems(d, { joints: ['A'], links: [] });
    expect(r.joints.map((j) => j.id)).not.toContain('A');
    expect(r.links.map((l) => l.id).sort()).toEqual(['bde', 'c', 'f', 'ghi']);
    expect(r.cranks).toHaveLength(0);
    expect(r.foot).toBe('G');
    // fixed points survive even when nothing is attached
    expect(r.joints.find((j) => j.id === 'O')?.fixed).toBe(true);
  });

  it('deleting a lone bar removes its now-floating endpoints', () => {
    const d0 = createEmptyDesign();
    const { design, linkId } = addLink(d0, { x: 0, y: 0 }, { x: 10, y: 0 });
    const r = deleteItems(design, { joints: [], links: [linkId!] });
    expect(r.joints).toHaveLength(0);
    expect(r.links).toHaveLength(0);
  });

  it('a ternary link that loses a corner becomes a bar; foot is cleared if deleted', () => {
    const d = fourBar();
    const r = deleteItems(d, { joints: ['F'], links: [] });
    expect(r.links.find((l) => l.id === 'coupler')!.joints).toEqual(['A', 'B']);
    expect(r.foot).toBeNull();
  });

  it('respects locked joints', () => {
    const d = fourBar();
    expect(deleteItems(d, { joints: ['A'], links: [] }, new Set(['A']))).toBe(d);
    // deleting the crank bar keeps a locked A even if it were floating
    const r = deleteItems(d, { joints: [], links: ['crank'] }, new Set(['A']));
    expect(r.joints.map((j) => j.id)).toContain('A');
    expect(r.cranks).toHaveLength(0);
  });
});

describe('merge / move / length', () => {
  it('merges a dropped endpoint onto a joint (pin)', () => {
    let d = createEmptyDesign();
    const a = addLink(d, { x: 0, y: 0 }, { x: 10, y: 0 });
    d = a.design;
    const b = addLink(d, { x: 10, y: 1 }, { x: 20, y: 5 });
    d = b.design;
    const m = mergeJoints(d, a.joints[1]!, b.joints[0]!);
    expect(m.joints).toHaveLength(3);
    expect(m.links[1]!.joints[0]).toBe(a.joints[1]);
  });

  it('moves joints except locked ones', () => {
    const d = fourBar();
    const r = moveJoints(d, ['A', 'B'], 1, 2, new Set(['B']));
    expect(r.joints.find((j) => j.id === 'A')).toMatchObject({ x: 1, y: 12 });
    expect(r.joints.find((j) => j.id === 'B')).toEqual(d.joints.find((j) => j.id === 'B'));
  });

  it('sets a bar length by moving the free endpoint along the bar', () => {
    const d = fourBar();
    const r = setLinkLength(d, 'crank', 12);
    expect(linkLength(r, 'crank')).toBeCloseTo(12, 6);
    expect(r.joints.find((j) => j.id === 'O2')).toMatchObject({ x: 0, y: 0 });
    expect(r.joints.find((j) => j.id === 'A')).toMatchObject({ x: 0, y: 12 });
    // rocker O4–B: O4 is fixed, so B moves
    const r2 = setLinkLength(d, 'rocker', 25);
    expect(linkLength(r2, 'rocker')).toBeCloseTo(25, 6);
    expect(r2.joints.find((j) => j.id === 'O4')).toEqual(d.joints.find((j) => j.id === 'O4'));
    // ternary links have no single length
    expect(setLinkLength(d, 'coupler', 10)).toBe(d);
  });
});

describe('motor and legs', () => {
  it('clamps rpm to ±120', () => {
    expect(setMotorRpm(fourBar(), 500).motor.rpm).toBe(120);
    expect(setMotorRpm(fourBar(), -500).motor.rpm).toBe(-120);
  });
  it('writes leg layout with clamping', () => {
    const d = setLegs(fourBar(), { count: 3, phaseStepDeg: 120, spacing: 22, mirrorX: true });
    expect(d.legs).toEqual({ count: 3, phaseStepDeg: 120, spacing: 22, mirrorX: true });
    expect(setLegs(d, { count: 0 }).legs.count).toBe(1);
    expect(setLegs(d, { count: 99 }).legs.count).toBe(8);
  });
});

describe('mirror', () => {
  it('mirroring twice is the identity', () => {
    const d = jansenLeg();
    const ids = d.joints.map((j) => j.id);
    const once = mirrorJoints(d, ids);
    expect(once).not.toEqual(d);
    const twice = mirrorJoints(once, ids);
    twice.joints.forEach((j, i) => expect(j.x).toBeCloseTo(d.joints[i]!.x, 6));
  });

  it('mirrors the whole mechanism about the crank axis when nothing is selected', () => {
    const d = jansenLeg();
    const m = mirrorSelection(d, { joints: [], links: [] });
    for (const j of m.joints) {
      const o = d.joints.find((k) => k.id === j.id)!;
      expect(j.x).toBeCloseTo(-o.x, 6);
      expect(j.y).toBe(o.y);
    }
    const a = analyzeMechanism(m, { steps: 90 });
    expect(a.dof).toBe(1);
    expect(a.fullRotation).toBe(true);
  });

  it('mirrors a selection about its own center', () => {
    const d = fourBar();
    const m = mirrorSelection(d, { joints: ['O2', 'O4'], links: [] });
    expect(m.joints.find((j) => j.id === 'O2')!.x).toBe(40);
    expect(m.joints.find((j) => j.id === 'O4')!.x).toBe(0);
  });
});

describe('copy / paste', () => {
  it('pastes with fresh ids and an offset, without duplicating the crank', () => {
    const d = fourBar();
    const clip = copyItems(d, { joints: [], links: d.links.map((l) => l.id) })!;
    expect(clip.joints).toHaveLength(5);
    const r = pasteItems(d, clip, { dx: 10, dy: -5 });
    expect(allIdsUnique(r.design)).toBe(true);
    expect(r.design.joints).toHaveLength(10);
    expect(r.design.links).toHaveLength(6);
    expect(r.design.cranks).toHaveLength(1);
    expect(r.design.foot).toBe('F');
    expect(r.selection.joints).toHaveLength(5);
    const newIds = new Set(r.selection.joints);
    for (const id of r.selection.links) {
      const l = r.design.links.find((x) => x.id === id)!;
      expect(l.joints.every((j) => newIds.has(j))).toBe(true);
    }
    const o2copy = r.design.joints.find((j) => newIds.has(j.id) && j.fixed && j.y === -5);
    expect(o2copy).toBeDefined();
  });

  it('pasting a whole mechanism into an empty design carries the crank and foot', () => {
    const d = jansenLeg();
    const clip = copyItems(d, { joints: d.joints.map((j) => j.id), links: [] })!;
    const r = pasteItems(createEmptyDesign(), clip, { dx: 0, dy: 0 });
    expect(r.design.cranks).toHaveLength(1);
    expect(r.design.foot).not.toBeNull();
    const a = analyzeMechanism(r.design, { steps: 60 });
    expect(a.dof).toBe(1);
    expect(a.fullRotation).toBe(true);
  });

  it('returns null for an empty selection', () => {
    expect(copyItems(fourBar(), { joints: [], links: [] })).toBeNull();
  });
});
