import { describe, expect, it } from 'vitest';
import { analyzeMechanism, compileMechanism, solvePose } from '@/core/kinematics';
import { createFlatTerrain, Walker } from '@/core/sim';
import { computeBill } from './parts';
import { chebyshevLambda, fourBar, jansenWalker } from './presets';
import { createEmptyDesign, type DesignDoc, type LegLayout } from './types';
import {
  MAX_CRANKS,
  MAX_JOINTS,
  MAX_LINK_JOINTS,
  MAX_LINK_MEMBERSHIPS,
  MAX_LINKS,
  validateDesign,
} from './validate';
import { createRng, mutateJson, timed } from './fuzzing';

/**
 * 検査を通るが意地の悪い設計(SEC-3):共有リンクやファイルで届いた設計を、設計ビューの解析
 * (analyzeMechanism)と試走(Walker)にそのまま渡しても、例外・NaN・終わらない計算にならないこと。
 *
 * 上限いっぱいの鎖(64 ジョイント)が計算量の最悪ケース:解けない点がすべてニュートン法
 * (密行列、点の数の 3 乗)に回る。上限を 256 から 64 に下げた理由(validate.ts)。
 * 時間の上限は CI の揺れを見込んで、手元の計測の数倍にしてある。
 */

const ONE_LEG: LegLayout = { count: 1, phaseStepDeg: 0, spacing: 20, mirrorX: false };
const MAX_LEGS: LegLayout = { count: 8, phaseStepDeg: 45, spacing: 10, mirrorX: true };

function valid(d: DesignDoc): DesignDoc {
  const r = validateDesign(JSON.parse(JSON.stringify(d)));
  if (!r.ok) throw new Error(r.errors.join('; '));
  return r.design;
}

function chain(n: number, legs = ONE_LEG): DesignDoc {
  const d = createEmptyDesign('chain');
  for (let i = 0; i < n; i++) d.joints.push({ id: `j${i}`, x: i * 2, y: -i, fixed: i === 0 });
  for (let i = 0; i + 1 < n; i++) d.links.push({ id: `l${i}`, joints: [`j${i}`, `j${i + 1}`] });
  d.cranks.push({ id: 'c', link: 'l0', pivot: 'j0', phase: 0 });
  d.foot = `j${n - 1}`;
  d.legs = legs;
  return d;
}

/** 上限いっぱいのプレート:16 点のリンクを点の合計の上限まで重ねて、ニュートン法の拘束の数を最大にする */
function plates(): DesignDoc {
  const d = createEmptyDesign('plates');
  for (let i = 0; i < MAX_JOINTS; i++) {
    d.joints.push({ id: `j${i}`, x: Math.cos(i) * 30, y: Math.sin(i) * 30 - 40, fixed: i === 0 });
  }
  d.links.push({ id: 'cr', joints: ['j0', 'j1'] });
  const count = Math.min(MAX_LINKS, Math.floor((MAX_LINK_MEMBERSHIPS - 2) / MAX_LINK_JOINTS) + 1);
  for (let k = 1; k < count; k++) {
    d.links.push({
      id: `p${k}`,
      joints: Array.from({ length: MAX_LINK_JOINTS }, (_, m) => `j${1 + ((k * 5 + m * 4) % 63)}`),
    });
  }
  for (let c = 0; c < MAX_CRANKS; c++)
    d.cranks.push({ id: `c${c}`, link: 'cr', pivot: 'j0', phase: c });
  d.foot = 'j5';
  return d;
}

/** 解析・試走を一通り回し、数が有限で時間が有界なことを確かめる */
function exercise(design: DesignDoc, budget: { analyzeMs: number; simMs: number }, label: string) {
  const mech = compileMechanism(design);
  const pose = solvePose(mech, 0.7);
  expect(pose.positions.every(Number.isFinite), `${label} pose`).toBe(true);
  const analysis = timed(() => analyzeMechanism(design));
  expect(analysis.ms, `${label} analyze`).toBeLessThan(budget.analyzeMs);
  expect(['ok', 'locked', 'loose']).toContain(analysis.value.dofStatus);
  expect(Number.isFinite(computeBill(design).cost), `${label} bill`).toBe(true);
  const sim = timed(() => {
    const w = new Walker({ design, terrain: createFlatTerrain(0), start: { x: 0, z: 0 } });
    for (let i = 0; i < 24; i++) w.step();
    return w;
  });
  expect(sim.ms, `${label} sim`).toBeLessThan(budget.simMs);
  const w = sim.value;
  for (const v of [...w.com, ...w.vel, ...w.omega, ...w.quat, w.theta, w.energy]) {
    expect(Number.isFinite(v), `${label} sim state`).toBe(true);
  }
}

describe('validated but hostile designs stay bounded in the solver and the simulation', () => {
  it('a chain at the joint limit (worst case for the Newton block)', () => {
    exercise(valid(chain(MAX_JOINTS)), { analyzeMs: 8000, simMs: 8000 }, 'chain64');
  });

  it('the same chain replicated into the maximum leg layout', () => {
    exercise(valid(chain(MAX_JOINTS, MAX_LEGS)), { analyzeMs: 8000, simMs: 30000 }, 'chain64x16');
  }, 60_000);

  it('overlapping plates at the link limits', () => {
    exercise(valid(plates()), { analyzeMs: 8000, simMs: 8000 }, 'plates');
  });

  it('degenerate geometry: coincident joints, zero-length links, huge and tiny sizes', () => {
    const cases: [string, DesignDoc][] = [];
    const add = (label: string, f: (d: DesignDoc) => void, base = fourBar()) => {
      f(base);
      base.legs = MAX_LEGS;
      cases.push([label, base]);
    };
    add('all coincident', (d) => d.joints.forEach((j) => ((j.x = 0), (j.y = 0))));
    add('zero-length crank', (d) => ((d.joints[2]!.x = 0), (d.joints[2]!.y = 0)));
    add(
      'zero-length coupler',
      (d) => ((d.joints[3]!.x = d.joints[2]!.x), (d.joints[3]!.y = d.joints[2]!.y)),
    );
    add('huge (±100 m)', (d) => d.joints.forEach((j) => ((j.x *= 240), (j.y *= 240))));
    add('tiny (1e-9 cm)', (d) => d.joints.forEach((j) => ((j.x *= 1e-11), (j.y *= 1e-11))));
    add('self link', (d) => d.links.push({ id: 'self', joints: ['A', 'A'] }));
    add('single-joint link', (d) => d.links.push({ id: 'one', joints: ['B'] }));
    add('all fixed', (d) => d.joints.forEach((j) => (j.fixed = true)));
    add('nothing fixed', (d) => d.joints.forEach((j) => (j.fixed = false)));
    add('pivot not on the crank link', (d) => (d.cranks[0]!.pivot = 'O4'));
    add('many cranks on one link', (d) => {
      for (let c = 1; c < MAX_CRANKS; c++)
        d.cranks.push({ ...d.cranks[0]!, id: `m${c}`, phase: c });
    });
    add('duplicate links', (d) => {
      for (let k = 0; k < 40; k++) d.links.push({ id: `dup${k}`, joints: ['A', 'B', 'F'] });
    });
    add('max rpm reversed', (d) => (d.motor.rpm = -1e9));
    add('foot on a fixed joint', (d) => (d.foot = 'O2'));
    add('empty', (d) => Object.assign(d, createEmptyDesign()));
    add('joints only', (d) => ((d.links = []), (d.cranks = [])));
    for (const [label, d] of cases) exercise(valid(d), { analyzeMs: 3000, simMs: 5000 }, label);
  });

  it('random designs accepted by the validator', () => {
    const rng = createRng(401);
    const bases = [fourBar(), jansenWalker(), chebyshevLambda()].map(
      (d) => JSON.parse(JSON.stringify(d)) as unknown,
    );
    let tried = 0;
    for (let i = 0; i < 2000 && tried < 40; i++) {
      const r = validateDesign(mutateJson(rng, rng.pick(bases), 0.03));
      if (!r.ok) continue;
      tried++;
      exercise(r.design, { analyzeMs: 3000, simMs: 5000 }, `seed 401 #${i}`);
    }
    expect(tried).toBeGreaterThan(10);
  });
});
