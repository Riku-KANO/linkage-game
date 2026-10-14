import { describe, expect, it } from 'vitest';
import LZString from 'lz-string';
import {
  buildShareUrl,
  decodeShare,
  encodeShare,
  extractShareToken,
  SHARE_FORMAT,
  type SharePayload,
  type ShareRun,
} from './share';
import { chebyshevLambda, fourBar, jansenLeg, jansenWalker } from './presets';
import { createEmptyDesign } from './types';
import type { DesignDoc } from './types';
import { validateDesign } from './validate';
import { ghostFrameCount, GHOST_STRIDE } from './ghost';
import { syntheticWalkGhost } from './ghostFixture';
import { APP_ID } from './migrate';

const BASE = 'https://ashikumi.pages.dev/';
const RUN: ShareRun = {
  stageId: 'c1-s3',
  time: 12.3456,
  energy: 345.678,
  parts: 23,
  cost: 412.5,
  cleared: true,
};

function decodeOk(s: string) {
  const r = decodeShare(s);
  if (!r.ok) throw new Error(`${r.reason}: ${r.errors.join('; ')}`);
  return r;
}

function expectDesignClose(a: DesignDoc, b: DesignDoc) {
  expect(a.name).toBe(b.name);
  expect(a.joints.map((j) => [j.id, j.fixed])).toEqual(b.joints.map((j) => [j.id, j.fixed]));
  a.joints.forEach((j, i) => {
    expect(Math.abs(j.x - b.joints[i]!.x)).toBeLessThanOrEqual(0.005 + 1e-9);
    expect(Math.abs(j.y - b.joints[i]!.y)).toBeLessThanOrEqual(0.005 + 1e-9);
  });
  expect(a.links).toEqual(b.links);
  expect(a.cranks.map((c) => [c.id, c.link, c.pivot])).toEqual(
    b.cranks.map((c) => [c.id, c.link, c.pivot]),
  );
  a.cranks.forEach((c, i) => expect(c.phase).toBeCloseTo(b.cranks[i]!.phase, 4));
  expect(a.foot).toBe(b.foot);
  expect(a.motor.rpm).toBeCloseTo(b.motor.rpm, 2);
  expect(a.legs).toEqual(b.legs);
}

/** 自作らしい設計:連番の id、日本語の名前、小数の座標、複数クランク */
function homemade(): DesignDoc {
  const d = createEmptyDesign('ぼくの かんがえた さいきょうの あし');
  for (let i = 1; i <= 12; i++) {
    d.joints.push({ id: `j${i}`, x: i * 7.123456 - 40, y: (i % 5) * -9.87654, fixed: i <= 2 });
  }
  for (let i = 1; i <= 10; i++) d.links.push({ id: `l${i}`, joints: [`j${i}`, `j${i + 2}`] });
  d.links.push({ id: 'plate', joints: ['j3', 'j4', 'j5'] });
  d.cranks.push({ id: 'c1', link: 'l1', pivot: 'j1', phase: 0 });
  d.cranks.push({ id: 'c2', link: 'l2', pivot: 'j2', phase: (2 * Math.PI) / 3 });
  d.foot = 'j12';
  d.motor.rpm = -37.5;
  d.legs = { count: 4, phaseStepDeg: 90, spacing: 18.5, mirrorX: false };
  return d;
}

describe('share links (MOD-3, U-02)', () => {
  it('encodes into a URL fragment, never a query', () => {
    const frag = encodeShare({ design: jansenWalker() });
    expect(frag.startsWith('#s=')).toBe(true);
    expect(frag).toMatch(/^#s=[A-Za-z0-9+\-$]+$/);
    const url = buildShareUrl(`${BASE}play?lang=ja#old`, { design: jansenWalker() });
    expect(url.startsWith(`${BASE}play?lang=ja#s=`)).toBe(true);
    expect(new URL(url).search).toBe('?lang=ja');
  });

  it('round-trips designs within the 0.01 cm rounding', () => {
    for (const d of [jansenLeg(), jansenWalker(), chebyshevLambda(), fourBar(), homemade()]) {
      const r = decodeOk(encodeShare({ design: d }));
      expectDesignClose(r.payload.design, d);
      expect(r.payload.run).toBeUndefined();
      expect(r.payload.ghost).toBeUndefined();
      expect(r.fromVersion).toBe(1);
    }
    expect(decodeOk(encodeShare({ design: createEmptyDesign() })).payload.design).toEqual(
      createEmptyDesign(),
    );
  });

  it('is idempotent after the first rounding', () => {
    const p: SharePayload = { design: homemade(), run: RUN, ghost: syntheticWalkGhost(5, 10) };
    const once = encodeShare(p);
    const twice = encodeShare(decodeOk(once).payload);
    expect(twice).toBe(once);
  });

  it('round-trips the score and the ghost', () => {
    const ghost = syntheticWalkGhost(30, 10);
    const r = decodeOk(buildShareUrl(BASE, { design: jansenWalker(), run: RUN, ghost }));
    const run = r.payload.run!;
    expect(run.stageId).toBe(RUN.stageId);
    expect(run.time).toBeCloseTo(RUN.time, 3);
    expect(run.energy).toBeCloseTo(RUN.energy, 2);
    expect(run.parts).toBe(RUN.parts);
    expect(run.cost).toBeCloseTo(RUN.cost, 1);
    expect(run.cleared).toBe(true);
    const g = r.payload.ghost!;
    expect(g.hz).toBe(10);
    expect(ghostFrameCount(g)).toBe(301);
    for (let k = 0; k < g.frames.length; k += GHOST_STRIDE) {
      expect(Math.abs(g.frames[k]! - ghost.frames[k]!)).toBeLessThanOrEqual(0.0005 + 1e-12);
    }
    // スコアなしでゴーストだけでもよい
    const onlyGhost = decodeOk(encodeShare({ design: fourBar(), ghost: syntheticWalkGhost(2) }));
    expect(onlyGhost.payload.run).toBeUndefined();
    expect(onlyGhost.payload.ghost).toBeDefined();
  });

  it('keeps share URLs short', () => {
    const plain = buildShareUrl(BASE, { design: jansenWalker(), run: RUN });
    const withGhost = buildShareUrl(BASE, {
      design: jansenWalker(),
      run: RUN,
      ghost: syntheticWalkGhost(30, 10),
    });
    const mine = buildShareUrl(BASE, { design: homemade(), run: RUN });
    console.info(
      `[share] jansenWalker+run: ${plain.length} chars, +30s ghost: ${withGhost.length} chars, homemade: ${mine.length} chars`,
    );
    expect(plain.length).toBeLessThan(2000);
    expect(withGhost.length).toBeLessThan(6000);
  });

  it('accepts a full URL, a hash, a bare param and a percent-encoded token', () => {
    const frag = encodeShare({ design: chebyshevLambda() });
    const token = frag.slice(3);
    for (const s of [
      `${BASE}#s=${token}`,
      frag,
      `s=${token}`,
      `#x=1&s=${token}&y=2`,
      `#s=${encodeURIComponent(token)}`,
      `#s=${token.replace(/\+/g, ' ')}`,
    ]) {
      expect(decodeShare(s).ok).toBe(true);
    }
    expect(extractShareToken(`${BASE}?s=${token}`)).toBeNull();
  });

  it('reports a missing share as empty', () => {
    for (const s of ['', BASE, `${BASE}#`, '#other=1', '#s=']) {
      const r = decodeShare(s);
      expect(!r.ok && r.reason).toBe('empty');
    }
  });

  it('rejects garbage and tampered links without throwing', () => {
    for (const s of [
      '#s=!!!!',
      '#s=hello',
      `#s=${LZString.compressToEncodedURIComponent('{nope')}`,
    ]) {
      const r = decodeShare(s);
      expect(r.ok).toBe(false);
      expect(!r.ok && r.reason).toBe('corrupt');
    }
    const token = encodeShare({ design: jansenWalker(), run: RUN }).slice(3);
    const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+-$';
    let rejected = 0;
    for (let i = 0; i < token.length; i += 3) {
      const c = alphabet[(alphabet.indexOf(token[i]!) + 17) % alphabet.length]!;
      const bad = `#s=${token.slice(0, i)}${c}${token.slice(i + 1)}`;
      let r: ReturnType<typeof decodeShare> | undefined;
      expect(() => (r = decodeShare(bad))).not.toThrow();
      if (r && r.ok) expect(validateDesign(r.payload.design).ok).toBe(true);
      else rejected++;
    }
    expect(rejected).toBeGreaterThan(0);
    // 切り詰められたリンク
    expect(decodeShare(`#s=${token.slice(0, token.length >> 1)}`).ok).toBe(false);
  });

  it('rejects structurally broken payloads as invalid', () => {
    const enc = (v: unknown) => `#s=${LZString.compressToEncodedURIComponent(JSON.stringify(v))}`;
    const good = JSON.parse(
      LZString.decompressFromEncodedURIComponent(encodeShare({ design: fourBar() }).slice(3)),
    ) as unknown[];
    expect(decodeShare(enc(good)).ok).toBe(true);
    const mutations: ((p: unknown[]) => void)[] = [
      (p) => (p[1] = 'design'),
      (p) => ((p[1] as unknown[])[6] = 99), // 脚先の添字が範囲外
      (p) => ((p[1] as unknown[])[4] = [['l', 0, 77]]), // リンクの添字が範囲外
      (p) => ((p[1] as unknown[])[2] = [1, 2, 3]), // 座標の数が合わない
      (p) => ((p[1] as unknown[])[1] = [1, 2, 3, 4, 5]), // id が文字列でない
      (p) => ((p[1] as unknown[])[2] = new Array(10).fill(12.5)), // 座標が整数でない
      (p) => ((p[1] as unknown[])[7] = '40'), // rpm が整数でない
      (p) => ((p[1] as unknown[])[3] = [0, 42]), // 固定点の添字が範囲外
    ];
    for (const m of mutations) {
      const p = structuredClone(good);
      m(p);
      const r = decodeShare(enc(p));
      expect(!r.ok && r.reason).toBe('invalid');
    }
    expect(decodeShare(enc('just a string')).ok).toBe(false);
    expect(decodeShare(enc([])).ok).toBe(false);
  });

  it('rejects links from a newer app version', () => {
    const p = JSON.parse(
      LZString.decompressFromEncodedURIComponent(encodeShare({ design: fourBar() }).slice(3)),
    ) as unknown[];
    p[0] = SHARE_FORMAT + 1;
    const r = decodeShare(`#s=${LZString.compressToEncodedURIComponent(JSON.stringify(p))}`);
    expect(!r.ok && r.reason).toBe('version');
  });

  it('drops an invalid score or ghost but keeps the machine', () => {
    const p = JSON.parse(
      LZString.decompressFromEncodedURIComponent(
        encodeShare({ design: fourBar(), run: RUN, ghost: syntheticWalkGhost(1) }).slice(3),
      ),
    ) as unknown[];
    p[2] = ['', -5, 0, 0, 0, 1];
    p[3] = [10, [1], []];
    const r = decodeOk(`#s=${LZString.compressToEncodedURIComponent(JSON.stringify(p))}`);
    expect(r.payload.run).toBeUndefined();
    expect(r.payload.ghost).toBeUndefined();
    expect(r.warnings.length).toBe(2);
  });

  it('reads a plain JSON payload of any known design version (legacy links)', () => {
    const v0 = {
      design: {
        name: '旧形式',
        joints: [
          { id: 'a', x: 0, y: 0 },
          { id: 'b', x: 10, y: 0 },
        ],
        fixed: ['a'],
        links: [{ id: 'l', joints: ['a', 'b'] }],
        cranks: [{ id: 'c', link: 'l', pivot: 'a' }],
      },
      run: RUN,
    };
    const r = decodeOk(`#s=${LZString.compressToEncodedURIComponent(JSON.stringify(v0))}`);
    expect(r.fromVersion).toBe(0);
    expect(r.payload.design.joints[0]!.fixed).toBe(true);
    expect(r.payload.run).toEqual(RUN);
    const foreign = { app: 'other', version: 1, design: jansenLeg() };
    const f = decodeShare(`#s=${LZString.compressToEncodedURIComponent(JSON.stringify(foreign))}`);
    expect(!f.ok && f.reason).toBe('foreign');
    const env = { app: APP_ID, kind: 'design', version: 1, design: jansenLeg() };
    expect(
      decodeShare(`#s=${LZString.compressToEncodedURIComponent(JSON.stringify(env))}`).ok,
    ).toBe(true);
  });

  it('omits a broken score or ghost when encoding', () => {
    const r = decodeOk(
      encodeShare({
        design: fourBar(),
        run: { ...RUN, energy: Number.NaN },
        ghost: { hz: 10, frames: [1, 2, 3] },
      }),
    );
    expect(r.payload.run).toBeUndefined();
    expect(r.payload.ghost).toBeUndefined();
    expect(r.warnings).toEqual([]);
  });

  it('refuses to encode an invalid design', () => {
    const d = jansenLeg();
    d.foot = 'nope';
    expect(() => encodeShare({ design: d })).toThrow();
  });
});
