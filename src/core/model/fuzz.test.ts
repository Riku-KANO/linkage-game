import { describe, expect, it } from 'vitest';
import LZString from 'lz-string';
import {
  decodeShare,
  encodeShare,
  MAX_SHARE_TOKEN_LENGTH,
  validateRun,
  type SharePayload,
  type ShareRun,
} from './share';
import { MAX_CRANKS, MAX_JOINTS, MAX_LINK_JOINTS, MAX_LINKS, validateDesign } from './validate';
import { migrate, readDesign } from './migrate';
import { designToJSONText, parseDesignFile } from './file';
import {
  decodeGhostCompact,
  GHOST_STRIDE,
  MAX_GHOST_FRAMES,
  validateGhost,
  type Ghost,
} from './ghost';
import { chebyshevLambda, fourBar, jansenWalker } from './presets';
import { createEmptyDesign, type DesignDoc } from './types';
import { syntheticWalkGhost } from './ghostFixture';
import { validateProgress } from '@/core/storage/progress';
import {
  createRng,
  deeplyNested,
  mutateJson,
  mutateString,
  randomJson,
  timed,
  type Rng,
} from './fuzzing';

/**
 * 外から来るデータのファズテスト(SEC-3)。シード付きの乱数で壊した共有リンク・JSON ファイル・
 * 任意の JSON を、すべての読み込み口に通す。確かめること:
 *  1. 例外を投げない
 *  2. 有限の時間で終わる(1 件あたりの時間の上限)
 *  3. 拒否するか、検査を通った設計を返し、その設計は書き出し → 読み込みで変わらない
 * 失敗したときはシードと番号で再現できる(乱数は決定論的)。
 */

/** 1 件の読み込みにかかってよい時間(ms)。普通は 1ms 未満。CI の揺れを見込んで緩め */
const BUDGET_MS = 250;
const ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+-';

const RUN: ShareRun = {
  stageId: 'c1-s3',
  time: 12.345,
  energy: 345.67,
  parts: 23,
  cost: 412.5,
  cleared: true,
};

function homemade(): DesignDoc {
  const d = createEmptyDesign('ぼくの さいきょうの あし');
  for (let i = 1; i <= 12; i++) {
    d.joints.push({ id: `j${i}`, x: i * 7.12 - 40, y: (i % 5) * -9.87, fixed: i <= 2 });
  }
  for (let i = 1; i <= 10; i++) d.links.push({ id: `l${i}`, joints: [`j${i}`, `j${i + 2}`] });
  d.links.push({ id: 'plate', joints: ['j3', 'j4', 'j5'] });
  d.cranks.push({ id: 'c1', link: 'l1', pivot: 'j1', phase: 0 });
  d.cranks.push({ id: 'c2', link: 'l2', pivot: 'j2', phase: (2 * Math.PI) / 3 });
  d.foot = 'j12';
  d.motor.rpm = -37.5;
  d.legs = { count: 4, phaseStepDeg: 90, spacing: 18.5, mirrorX: true };
  return d;
}

const PAYLOADS: SharePayload[] = [
  { design: jansenWalker(), run: RUN, ghost: syntheticWalkGhost(5) },
  { design: fourBar() },
  { design: chebyshevLambda(), run: { ...RUN, cleared: false } },
  { design: homemade(), ghost: syntheticWalkGhost(2, 20, 7) },
  { design: createEmptyDesign() },
];

/** 共有リンクのトークン(#s= の後ろ) */
const tokens = PAYLOADS.map((p) => encodeShare(p).slice(3));
/** 短縮形式の JSON(構造を壊す元) */
const compacts = tokens.map(
  (t) => JSON.parse(LZString.decompressFromEncodedURIComponent(t)) as unknown,
);
const pack = (v: unknown) => `#s=${LZString.compressToEncodedURIComponent(JSON.stringify(v))}`;

function expectFinite(d: DesignDoc) {
  for (const j of d.joints) expect(Number.isFinite(j.x) && Number.isFinite(j.y)).toBe(true);
  for (const c of d.cranks) expect(Number.isFinite(c.phase)).toBe(true);
  expect(Number.isFinite(d.motor.rpm)).toBe(true);
  expect(d.joints.length).toBeLessThanOrEqual(MAX_JOINTS);
  expect(d.links.length).toBeLessThanOrEqual(MAX_LINKS);
  expect(d.cranks.length).toBeLessThanOrEqual(MAX_CRANKS);
  for (const l of d.links) expect(l.joints.length).toBeLessThanOrEqual(MAX_LINK_JOINTS);
}

function expectValidGhost(g: Ghost) {
  expect(g.frames.length % GHOST_STRIDE).toBe(0);
  expect(g.frames.length / GHOST_STRIDE).toBeLessThanOrEqual(MAX_GHOST_FRAMES);
  expect(g.frames.every(Number.isFinite)).toBe(true);
  expect(validateGhost(g)).toEqual(g);
}

/** 共有リンクを読み、読めたら不変条件を確かめる。読めたかを返す */
function checkShare(input: string, label: string): boolean {
  let r: ReturnType<typeof decodeShare> | undefined;
  const { ms } = timed(() => {
    expect(() => (r = decodeShare(input)), label).not.toThrow();
  });
  expect(ms, label).toBeLessThan(BUDGET_MS);
  if (!r || !r.ok) {
    if (r) expect(['empty', 'corrupt', 'foreign', 'version', 'invalid']).toContain(r.reason);
    return false;
  }
  const { design, run, ghost } = r.payload;
  // 検査を通った設計で、もう一度検査しても変わらない
  const again = validateDesign(design);
  expect(again.ok, label).toBe(true);
  if (again.ok) expect(again.design, label).toEqual(design);
  expectFinite(design);
  if (run) expect(validateRun(run)).toEqual(run);
  if (ghost) expectValidGhost(ghost);
  // 書き出し → 読み込み:1 回目の丸めの後は変わらない
  const once = decodeShare(encodeShare({ design }));
  expect(once.ok, label).toBe(true);
  if (once.ok) {
    const twice = decodeShare(encodeShare({ design: once.payload.design }));
    expect(twice.ok && twice.payload.design, label).toEqual(once.payload.design);
  }
  return true;
}

function checkFile(text: string, label: string): boolean {
  let r: ReturnType<typeof parseDesignFile> | undefined;
  const { ms } = timed(() => {
    expect(() => (r = parseDesignFile(text)), label).not.toThrow();
  });
  expect(ms, label).toBeLessThan(BUDGET_MS);
  if (!r || !r.ok) return false;
  expectFinite(r.design);
  // ファイルは丸めないので、書き出し → 読み込みでそのまま戻る
  const back = parseDesignFile(designToJSONText(r.design));
  expect(back.ok && back.design, label).toEqual(r.design);
  return true;
}

/** どの読み込み口も例外を投げない */
function everyEntryPoint(v: unknown, label: string) {
  const text = JSON.stringify(v) ?? 'null';
  const calls: [string, () => unknown][] = [
    ['validateDesign', () => validateDesign(v)],
    ['readDesign', () => readDesign(v)],
    ['migrate', () => migrate(v)],
    ['validateGhost', () => validateGhost(v)],
    ['decodeGhostCompact', () => decodeGhostCompact(v)],
    ['validateRun', () => validateRun(v)],
    ['validateProgress', () => validateProgress(v)],
    ['parseDesignFile', () => parseDesignFile(text)],
    ['decodeShare', () => decodeShare(pack(v))],
  ];
  for (const [name, call] of calls) {
    const { ms } = timed(() => expect(call, `${name} ${label}`).not.toThrow());
    expect(ms, `${name} ${label}`).toBeLessThan(BUDGET_MS);
  }
}

describe('fuzz: share links (SEC-3)', () => {
  it('survives random byte mutations of valid tokens', () => {
    const rng = createRng(101);
    let accepted = 0;
    for (let i = 0; i < 3000; i++) {
      const k = rng.int(tokens.length);
      const bad = mutateString(rng, tokens[k]!, rng.bool(0.9) ? ALPHABET : undefined);
      if (checkShare(`#s=${bad}`, `seed 101 #${i} (token ${k})`)) accepted++;
    }
    // ほとんどは展開・検査で拒否されるが、一部は読める(壊れた部分が意味を持たない場所だった)
    expect(accepted).toBeGreaterThan(0);
  });

  it('survives structural mutations of the compact JSON', () => {
    const rng = createRng(102);
    let accepted = 0;
    for (let i = 0; i < 1200; i++) {
      const k = rng.int(compacts.length);
      const v = mutateJson(rng, compacts[k], 0.04 + rng.next() * 0.1);
      if (checkShare(pack(v), `seed 102 #${i} (payload ${k})`)) accepted++;
    }
    expect(accepted).toBeGreaterThan(50);
  });

  it('survives structural mutations of plain-JSON (legacy) payloads', () => {
    const rng = createRng(103);
    const plain = PAYLOADS.map((p) => JSON.parse(JSON.stringify(p)) as unknown);
    let accepted = 0;
    for (let i = 0; i < 600; i++) {
      const k = rng.int(plain.length);
      const v = mutateJson(rng, plain[k], 0.03 + rng.next() * 0.08);
      if (checkShare(pack(v), `seed 103 #${i} (payload ${k})`)) accepted++;
    }
    expect(accepted).toBeGreaterThan(50);
  });

  it('survives mutated ghosts (extreme residuals, wrong lengths)', () => {
    const rng = createRng(104);
    const base = compacts[0] as unknown[];
    for (let i = 0; i < 800; i++) {
      const v = [...base];
      v[3] = mutateJson(rng, base[3], 0.02 + rng.next() * 0.05);
      checkShare(pack(v), `seed 104 #${i}`);
      const g = decodeGhostCompact(v[3]);
      if (g) expectValidGhost(g);
    }
  });

  it('handles odd fragments and URL shapes', () => {
    const odd = [
      '',
      '#',
      '#s',
      '#s=',
      '#=x',
      '#s=%',
      '#s=%E0%A4%A',
      '#s=%00',
      `#s=${'%25'.repeat(1000)}`,
      `#a=1&s=${tokens[1]}&s=garbage`,
      `https://x/?s=${tokens[1]}`,
      `#s=${tokens[1]}#s=x`,
      `#s=${tokens[1]!.replace(/\+/g, ' ')}`,
      `#s=${'A'.repeat(MAX_SHARE_TOKEN_LENGTH)}`,
      `#s=${'$'.repeat(5000)}`,
      `#s=${'-'.repeat(5000)}`,
      '#s=__proto__',
      '#__proto__=1&constructor=2',
    ];
    for (const s of odd) checkShare(s, JSON.stringify(s.slice(0, 40)));
  });

  it('reads the largest valid payload within the budget', () => {
    // 上限いっぱいの設計(64 ジョイント、96 リンク × 16 点)と 6000 フレームのゴースト
    const d = createEmptyDesign('x'.repeat(40));
    for (let i = 0; i < MAX_JOINTS; i++) {
      d.joints.push({
        id: `joint-${i}-${'q'.repeat(50)}`,
        x: i * 1.37,
        y: -i * 0.71,
        fixed: i < 2,
      });
    }
    for (let i = 0; i < MAX_LINKS; i++) {
      d.links.push({
        id: `link-${i}-${'r'.repeat(50)}`,
        joints: Array.from({ length: MAX_LINK_JOINTS }, (_, k) => d.joints[(i + k * 3) % 64]!.id),
      });
    }
    for (let i = 0; i < MAX_CRANKS; i++) {
      d.cranks.push({ id: `c${i}`, link: d.links[i]!.id, pivot: d.joints[0]!.id, phase: i / 3 });
    }
    expect(validateDesign(d).ok).toBe(true);
    const frames: number[] = [];
    const rng = createRng(105);
    for (let k = 0; k < MAX_GHOST_FRAMES; k++) {
      frames.push(k * 0.01, 0.3 + rng.next() * 0.01, rng.next() * 0.01, 0, 0, 0, 1, -k * 0.4);
    }
    const url = encodeShare({ design: d, run: RUN, ghost: { hz: 10, frames } });
    // 大きすぎてトークンの上限を超えるなら、設計とゴーストを分けて試す
    for (const s of url.length - 3 <= MAX_SHARE_TOKEN_LENGTH
      ? [url]
      : [
          encodeShare({ design: d }),
          encodeShare({ design: fourBar(), ghost: { hz: 10, frames } }),
        ]) {
      expect(checkShare(s, 'largest')).toBe(true);
    }
  });
});

describe('fuzz: design files (SEC-3)', () => {
  const texts = PAYLOADS.map((p) =>
    designToJSONText(p.design, { savedAt: '2026-01-01T00:00:00Z' }),
  );

  it('survives random byte mutations of valid files', () => {
    const rng = createRng(201);
    let accepted = 0;
    for (let i = 0; i < 3000; i++) {
      const k = rng.int(texts.length);
      if (checkFile(mutateString(rng, texts[k]!), `seed 201 #${i}`)) accepted++;
    }
    expect(accepted).toBeGreaterThan(0);
  });

  it('survives structural mutations of valid files', () => {
    const rng = createRng(202);
    const values = texts.map((t) => JSON.parse(t) as unknown);
    let accepted = 0;
    for (let i = 0; i < 2500; i++) {
      const v = mutateJson(rng, rng.pick(values), 0.03 + rng.next() * 0.1);
      if (checkFile(JSON.stringify(v), `seed 202 #${i}`)) accepted++;
    }
    expect(accepted).toBeGreaterThan(100);
  });
});

describe('fuzz: arbitrary values at every entry point (SEC-3)', () => {
  it('never throws on random JSON values', () => {
    const rng: Rng = createRng(301);
    for (let i = 0; i < 1500; i++) everyEntryPoint(randomJson(rng, 5), `seed 301 #${i}`);
  });

  it('never throws on deeply nested input', () => {
    for (const kind of ['array', 'object'] as const) {
      const text = deeplyNested(100_000, kind);
      const v = JSON.parse(text) as unknown;
      everyEntryPoint(v, `nested ${kind}`);
      expect(checkFile(text, `nested file ${kind}`)).toBe(false);
      expect(checkShare(`#s=${LZString.compressToEncodedURIComponent(text)}`, kind)).toBe(false);
      // 設計の中の深い入れ子
      const d = JSON.parse(JSON.stringify(fourBar())) as Record<string, unknown>;
      d.name = v;
      (d.joints as unknown[])[0] = v;
      d.legs = v;
      everyEntryPoint(d, `nested in design ${kind}`);
    }
  });

  it('never throws on hostile objects that JSON cannot produce', () => {
    const throwing = new Proxy(
      {},
      {
        get() {
          throw new Error('get');
        },
        has() {
          throw new Error('has');
        },
        ownKeys() {
          throw new Error('ownKeys');
        },
        getOwnPropertyDescriptor() {
          throw new Error('gopd');
        },
        getPrototypeOf() {
          throw new Error('proto');
        },
      },
    );
    const throwingArray = new Proxy([1, 2, 3], {
      get(_t, k) {
        if (k === 'length') return 3;
        throw new Error('get');
      },
    });
    const cyclic: Record<string, unknown> = { version: 1, name: 'c' };
    cyclic.joints = [cyclic];
    cyclic.legs = cyclic;
    cyclic.motor = cyclic;
    const getter = Object.defineProperty({}, 'version', {
      get() {
        throw new Error('boom');
      },
      enumerable: true,
    });
    const hugeSparse = { ...fourBar(), joints: new Array(2 ** 32 - 1) };
    const values: unknown[] = [
      throwing,
      throwingArray,
      cyclic,
      getter,
      hugeSparse,
      Object.create(null),
      Object.freeze({ ...fourBar() }),
      { ...fourBar(), joints: new Float64Array(4) },
      { ...fourBar(), [Symbol('x')]: 1 },
      [throwing, throwing, throwingArray, throwingArray],
      { hz: 10, frames: throwingArray },
      { hz: 10, frames: new Array(8 * 7000) },
      [10, [1, 1, 1, 1, 1, 1, 1, 1], throwingArray],
      { version: 1, best: throwing },
      { version: 1, best: { 'c1-s1': throwing } },
      () => 1,
      Symbol('s'),
      10n,
      undefined,
    ];
    for (const [i, v] of values.entries()) {
      for (const [name, call] of [
        ['validateDesign', () => validateDesign(v)],
        ['readDesign', () => readDesign(v)],
        ['migrate', () => migrate(v)],
        ['validateGhost', () => validateGhost(v)],
        ['decodeGhostCompact', () => decodeGhostCompact(v)],
        ['validateRun', () => validateRun(v)],
        ['validateProgress', () => validateProgress(v)],
      ] as const) {
        const { ms } = timed(() => expect(call, `${name} value #${i}`).not.toThrow());
        expect(ms).toBeLessThan(BUDGET_MS);
      }
    }
  });
});
