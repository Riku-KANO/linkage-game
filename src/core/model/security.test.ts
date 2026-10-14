import { describe, expect, it } from 'vitest';
import LZString from 'lz-string';
import { decodeShare, encodeShare, MAX_SHARE_JSON_LENGTH, MAX_SHARE_TOKEN_LENGTH } from './share';
import {
  MAX_CRANKS,
  MAX_JOINTS,
  MAX_LINK_JOINTS,
  MAX_LINK_MEMBERSHIPS,
  MAX_LINKS,
  RESERVED_IDS,
  validateDesign,
} from './validate';
import { migrate, readDesign } from './migrate';
import { designFileName, parseDesignFile } from './file';
import { fourBar, jansenWalker } from './presets';
import { createEmptyDesign, type DesignDoc } from './types';
import { syntheticWalkGhost } from './ghostFixture';
import { timed } from './fuzzing';
import { safeJsonParse } from './guards';

/**
 * 外から来るデータの点検(SEC-3)で見つけた問題の回帰テスト。1 つの問題に 1 つ以上。
 */

const enc = (v: unknown) => `#s=${LZString.compressToEncodedURIComponent(JSON.stringify(v))}`;
const compact = (d: DesignDoc) =>
  JSON.parse(LZString.decompressFromEncodedURIComponent(encodeShare({ design: d }).slice(3))) as [
    number,
    unknown[],
  ];

/** 1 本の鎖(各ジョイントが次とリンクでつながる)。自由度が大きく、全部がニュートン法に回る */
function chain(n: number): DesignDoc {
  const d = createEmptyDesign('chain');
  for (let i = 0; i < n; i++) d.joints.push({ id: `j${i}`, x: i * 2, y: 0, fixed: i === 0 });
  for (let i = 0; i + 1 < n; i++) d.links.push({ id: `l${i}`, joints: [`j${i}`, `j${i + 1}`] });
  d.cranks.push({ id: 'c', link: 'l0', pivot: 'j0', phase: 0 });
  return d;
}

/** 名前を付け替えた四節(参照もすべて付け替える) */
function renamed(map: Record<string, string>): DesignDoc {
  const d = fourBar();
  const r = (id: string) => (Object.hasOwn(map, id) ? map[id]! : id);
  return {
    ...d,
    joints: d.joints.map((j) => ({ ...j, id: r(j.id) })),
    links: d.links.map((l) => ({ id: r(l.id), joints: l.joints.map(r) })),
    cranks: d.cranks.map((c) => ({ ...c, id: r(c.id), link: r(c.link), pivot: r(c.pivot) })),
    foot: d.foot === null ? null : r(d.foot),
  };
}

describe('decompression bombs and huge inputs', () => {
  it('rejects a share link whose JSON expands beyond the limit (even if it is valid JSON)', () => {
    // 正しい共有リンクの JSON に大量の空白を足すと、トークンは短いまま展開後が巨大になる
    const json = JSON.stringify(compact(fourBar()));
    const padded = `${json.slice(0, -1)}${' '.repeat(MAX_SHARE_JSON_LENGTH * 2)}]`;
    const token = LZString.compressToEncodedURIComponent(padded);
    expect(token.length).toBeLessThan(MAX_SHARE_TOKEN_LENGTH);
    const { value, ms } = timed(() => decodeShare(`#s=${token}`));
    expect(!value.ok && value.reason).toBe('corrupt');
    expect(ms).toBeLessThan(300);
    // 同じ JSON を空白なしで送れば読める
    expect(decodeShare(enc(JSON.parse(json))).ok).toBe(true);
  });

  it('rejects an over-long token before percent-decoding or decompressing it', () => {
    const r = decodeShare(`#s=${'%41'.repeat(MAX_SHARE_TOKEN_LENGTH * 2)}`);
    expect(!r.ok && r.reason).toBe('corrupt');
    const r2 = decodeShare(`#s=${'A'.repeat(MAX_SHARE_TOKEN_LENGTH + 1)}`);
    expect(!r2.ok && r2.reason).toBe('corrupt');
  });

  it('rejects oversized arrays in the compact share format before building objects', () => {
    const p = compact(fourBar());
    const d = p[1];
    // 同じ値の繰り返しはよく縮むので、トークンの長さの上限には届かない。展開後の JSON は上限
    // (MAX_SHARE_JSON_LENGTH)の内側にして、配列の長さの検査そのものを試す
    const n = 100_000;
    d[1] = new Array<string>(n).fill('j');
    d[2] = new Array<number>(n * 2).fill(0);
    const { value, ms } = timed(() => decodeShare(enc(p)));
    expect(!value.ok && value.reason).toBe('invalid');
    expect(!value.ok && value.errors.join()).toMatch(/多すぎ/);
    // 検査は配列の長さだけで決まる(10 万個のジョイントを作らない)
    expect(ms).toBeLessThan(400);
    // 1 つのリンクの点、固定点の添字、クランクも同じ
    const m = 50_000;
    for (const mutate of [
      (q: unknown[]) => ((q[4] as unknown[])[0] = ['l', ...new Array<number>(m).fill(0)]),
      (q: unknown[]) => (q[3] = new Array<number>(m).fill(0)),
      (q: unknown[]) => (q[5] = new Array(m).fill(['c', 0, 0, 0])),
      (q: unknown[]) => (q[4] = new Array(m).fill(['l', 0, 1])),
    ]) {
      const q = compact(fourBar());
      mutate(q[1]);
      const r = decodeShare(enc(q));
      expect(!r.ok && r.reason).toBe('invalid');
    }
  });

  it('caps the number of collected errors', () => {
    const d = createEmptyDesign();
    const bad = d as unknown as { joints: unknown[] };
    bad.joints = new Array(MAX_JOINTS).fill({ id: 1, x: 'x', y: null, fixed: 0 });
    const r = validateDesign(d);
    expect(r.ok).toBe(false);
    expect(!r.ok && r.errors.length).toBeLessThanOrEqual(51);
  });
});

describe('limits that keep the solver and the simulation bounded', () => {
  it('rejects more joints, links, cranks or points per link than the limits', () => {
    expect(validateDesign(chain(MAX_JOINTS)).ok).toBe(true);
    expect(validateDesign(chain(MAX_JOINTS + 1)).ok).toBe(false);

    const links = fourBar();
    for (let i = links.links.length; i <= MAX_LINKS; i++) {
      links.links.push({ id: `x${i}`, joints: ['A', 'B'] });
    }
    expect(validateDesign(links).ok).toBe(false);

    const cranks = fourBar();
    for (let i = 0; i <= MAX_CRANKS; i++) {
      cranks.cranks.push({ ...cranks.cranks[0]!, id: `c${i}` });
    }
    expect(validateDesign(cranks).ok).toBe(false);

    const plate = createEmptyDesign();
    for (let i = 0; i <= MAX_LINK_JOINTS; i++) {
      plate.joints.push({ id: `p${i}`, x: Math.cos(i), y: Math.sin(i), fixed: false });
    }
    plate.links.push({ id: 'plate', joints: plate.joints.map((j) => j.id) });
    expect(validateDesign(plate).ok).toBe(false);
    plate.links[0]!.joints.pop();
    expect(validateDesign(plate).ok).toBe(true);

    // 点の合計:上限ちょうどは通り、1 つでも超えると拒否
    const many = createEmptyDesign();
    for (let i = 0; i < MAX_LINK_JOINTS; i++) {
      many.joints.push({ id: `p${i}`, x: i, y: i * i, fixed: false });
    }
    const all = many.joints.map((j) => j.id);
    for (let k = 0; k < MAX_LINK_MEMBERSHIPS / MAX_LINK_JOINTS; k++) {
      many.links.push({ id: `L${k}`, joints: all });
    }
    expect(validateDesign(many).ok).toBe(true);
    many.links.push({ id: 'one-more', joints: ['p0'] });
    expect(validateDesign(many).ok).toBe(false);
  });

  it('keeps every shipped design within the limits', () => {
    for (const d of [jansenWalker(), fourBar(), createEmptyDesign()]) {
      expect(validateDesign(d).ok).toBe(true);
    }
  });
});

describe('prototype pollution and type confusion', () => {
  it('rejects ids that collide with Object.prototype members', () => {
    for (const bad of ['__proto__', 'constructor', 'toString', 'hasOwnProperty', 'prototype']) {
      expect(RESERVED_IDS.has(bad)).toBe(true);
      for (const which of ['A', 'crank', 'motor']) {
        const r = validateDesign(JSON.parse(JSON.stringify(renamed({ [which]: bad }))));
        expect(r.ok, `${which} → ${bad}`).toBe(false);
        expect(!r.ok && r.errors.join()).toMatch(/予約/);
      }
    }
  });

  it('rejects ids with control, bidi or broken unicode characters', () => {
    for (const bad of ['a\u0000', 'a\nb', '‮abc', 'x⁦', '\uD800', 'a\u0085']) {
      expect(validateDesign(renamed({ A: bad })).ok, JSON.stringify(bad)).toBe(false);
    }
    // 普通の日本語や絵文字は使える
    expect(validateDesign(renamed({ A: 'あ', B: '👨‍👩‍👧' })).ok).toBe(true);
  });

  it('never lets __proto__ keys in the input reach the output', () => {
    const before = Object.getOwnPropertyNames(Object.prototype).sort();
    const text = JSON.stringify(JSON.parse(JSON.stringify(fourBar())))
      .replace(
        '{"version"',
        '{"__proto__":{"polluted":1},"constructor":{"prototype":{"p":1}},"version"',
      )
      .replace('{"id":"A"', '{"__proto__":{"fixed":true,"x":1},"id":"A"');
    for (const r of [parseDesignFile(text), readDesign(JSON.parse(text))]) {
      expect(r.ok).toBe(true);
      if (!r.ok) continue;
      const d = r.design;
      for (const o of [d, d.motor, d.legs, ...d.joints, ...d.links, ...d.cranks]) {
        expect(Object.getPrototypeOf(o)).toBe(Object.prototype);
        expect(Object.hasOwn(o, '__proto__')).toBe(false);
        expect(Object.hasOwn(o, 'constructor')).toBe(false);
      }
    }
    expect(({} as Record<string, unknown>).polluted).toBeUndefined();
    expect(Object.getOwnPropertyNames(Object.prototype).sort()).toEqual(before);
  });

  it('drops prototype keys when parsing untrusted JSON (also when \\u-escaped)', () => {
    const text =
      '{"__proto__":{"polluted":1},"a":{"constructor":{"prototype":{"p":1}},"b":[{"__pro\\u0074o__":2}]}}';
    const r = safeJsonParse(text);
    expect(r.ok).toBe(true);
    const v = (r.ok ? r.value : null) as Record<string, Record<string, unknown>>;
    expect(Object.keys(v)).toEqual(['a']);
    expect(Object.keys(v.a!)).toEqual(['b']);
    expect(Object.keys((v.a!.b as object[])[0]!)).toEqual([]);
    // Object.assign しても汚染されない
    const target: Record<string, unknown> = {};
    Object.assign(target, v);
    expect(Object.getPrototypeOf(target)).toBe(Object.prototype);
    // 普通の JSON はそのまま
    expect(safeJsonParse('{"x":[1,"constructor-like"]}')).toEqual({
      ok: true,
      value: { x: [1, 'constructor-like'] },
    });
  });

  it('migrates v0 data without copying unknown keys of the input', () => {
    const v0 = JSON.parse(
      '{"joints":[{"id":"a","x":0,"y":0},{"id":"b","x":5,"y":0}],"fixed":["a"],' +
        '"links":[{"id":"l","joints":["a","b"]}],' +
        '"cranks":[{"__proto__":{"phase":1},"id":"c","link":"l","pivot":"a","evil":"x"}]}',
    ) as unknown;
    const m = migrate(v0);
    expect(m.ok).toBe(true);
    const crank = (m.ok ? (m.data as { cranks: object[] }).cranks[0] : null)!;
    expect(Object.keys(crank).sort()).toEqual(['id', 'link', 'phase', 'pivot']);
    expect(Object.getPrototypeOf(crank)).toBe(Object.prototype);
    const r = readDesign(v0);
    expect(r.ok && r.design.cranks[0]!.phase).toBe(0);
  });

  it('treats an envelope by its own keys only', () => {
    // design を持たない普通の設計(prototype 上の design に騙されない)
    const r = readDesign(JSON.parse(JSON.stringify(fourBar())));
    expect(r.ok).toBe(true);
  });
});

describe('numbers', () => {
  it('normalizes -0 and subnormal numbers to 0, and wraps a huge crank phase', () => {
    const d = fourBar();
    d.joints[1]!.x = 1e-320;
    d.joints[1]!.y = -0;
    d.cranks[0]!.phase = 1e300;
    const r = validateDesign(d);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(Object.is(r.design.joints[1]!.x, 0)).toBe(true);
    expect(Object.is(r.design.joints[1]!.y, 0)).toBe(true);
    expect(Math.abs(r.design.cranks[0]!.phase)).toBeLessThanOrEqual(2 * Math.PI);
    // 位相を丸めた設計は共有リンクで往復できる(巨大な位相は量子化で Infinity → null になっていた)
    const back = decodeShare(encodeShare({ design: r.design }));
    expect(back.ok).toBe(true);
  });

  it('rejects Infinity written as 1e999 in JSON files', () => {
    const text = JSON.stringify(fourBar()).replace('"x":0', '"x":1e999');
    expect(text).toContain('1e999');
    const r = parseDesignFile(text);
    expect(!r.ok && r.reason).toBe('invalid');
  });
});

describe('strings shown to the user', () => {
  it('removes control and bidi override characters from the name', () => {
    const d = fourBar();
    d.name = 'abc‮gnp.exe\u0000\u0007 x\uD800';
    const r = validateDesign(d);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.design.name).toBe('abcgnp.exex�');
    expect(r.warnings.join()).toMatch(/name/);
  });

  it('keeps emoji sequences and Japanese in the name', () => {
    const d = fourBar();
    d.name = 'ぼくの👨‍👩‍👧マシン';
    const r = validateDesign(d);
    expect(r.ok && r.design.name).toBe('ぼくの👨‍👩‍👧マシン');
    expect(r.ok && r.warnings).toEqual([]);
  });

  it('builds download file names without path, control or bidi characters', () => {
    const d = fourBar();
    for (const name of ['../../etc/passwd', 'a‮gnp.exe', 'CON', '...', '\u0000']) {
      d.name = name;
      const f = designFileName(d);
      expect(f.endsWith('.ashikumi.json')).toBe(true);
      expect(f).not.toMatch(/[\\/:*?"<>|\u0000-\u001f‪-‮⁦-⁩]/);
      expect(f.startsWith('.')).toBe(false);
    }
  });
});

describe('ghosts and runs in share links', () => {
  it('drops a ghost with too many frames quickly', () => {
    const g = syntheticWalkGhost(1);
    const p = JSON.parse(
      LZString.decompressFromEncodedURIComponent(
        encodeShare({ design: fourBar(), ghost: g }).slice(3),
      ),
    ) as unknown[];
    const ghost = p[3] as [number, number[], number[]];
    // 5 万フレーム(上限 6000)。展開後の JSON は上限の内側
    ghost[2] = new Array<number>(8 * 50_000).fill(0);
    const { value, ms } = timed(() => decodeShare(enc(p)));
    expect(value.ok && value.payload.ghost).toBeUndefined();
    expect(ms).toBeLessThan(300);
  });
});
