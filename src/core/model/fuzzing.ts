/**
 * テスト用:シード付きのファズ(乱数で壊した入力)の道具。外部ライブラリなし、決定論的。
 * アプリ本体からは読み込まない(テストだけが使う)。
 */

export interface Rng {
  /** [0, 1) */
  next(): number;
  /** [0, n) の整数 */
  int(n: number): number;
  pick<T>(xs: readonly T[]): T;
  bool(p?: number): boolean;
}

/** mulberry32。同じシードなら同じ列 */
export function createRng(seed: number): Rng {
  let s = seed >>> 0;
  const next = () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  const int = (n: number) => Math.floor(next() * n);
  return {
    next,
    int,
    pick: <T>(xs: readonly T[]) => xs[int(xs.length)]!,
    bool: (p = 0.5) => next() < p,
  };
}

/** 意地の悪い文字列(プロトタイプのキー、制御文字、双方向の制御、壊れたサロゲート、長い文字列など) */
export const NASTY_STRINGS: readonly string[] = [
  '',
  ' ',
  '__proto__',
  'constructor',
  'prototype',
  'toString',
  'hasOwnProperty',
  'valueOf',
  '__defineGetter__',
  '<script>alert(1)</script>',
  '"><img src=x onerror=alert(1)>',
  'javascript:alert(1)',
  '\u0000',
  '‮exe.json',
  '⁦x⁩',
  '\uD800',
  '\uDFFF\uD800',
  '  ',
  '%00',
  '../../etc/passwd',
  'j1',
  'l1',
  'c1',
  'A',
  'あいうえお',
  '👨‍👩‍👧',
  'x'.repeat(65),
  'y'.repeat(5000),
];

/** 意地の悪い数(JSON で表せないものは JSON.stringify で null になる) */
export const NASTY_NUMBERS: readonly number[] = [
  0,
  -0,
  1,
  -1,
  0.5,
  1e-320,
  -5e-324,
  Number.MIN_VALUE,
  Number.EPSILON,
  1e-9,
  9999.999,
  10000,
  10000.0001,
  -10000.0001,
  65535,
  2 ** 31,
  2 ** 53,
  2 ** 53 + 2,
  1e21,
  1e300,
  Number.MAX_VALUE,
  -Number.MAX_VALUE,
  Number.NaN,
  Number.POSITIVE_INFINITY,
  Number.NEGATIVE_INFINITY,
];

/** 任意の JSON 値(深さ・幅を制限)。プロトタイプのキーを含むオブジェクトも作る */
export function randomJson(rng: Rng, depth = 4): unknown {
  const k = rng.int(depth <= 0 ? 4 : 7);
  switch (k) {
    case 0:
      return null;
    case 1:
      return rng.bool();
    case 2:
      return rng.bool(0.5) ? rng.pick(NASTY_NUMBERS) : (rng.next() - 0.5) * 10 ** rng.int(12);
    case 3:
      return rng.bool(0.5) ? rng.pick(NASTY_STRINGS) : randomString(rng, rng.int(12));
    case 4:
    case 5: {
      const n = rng.int(6);
      return Array.from({ length: n }, () => randomJson(rng, depth - 1));
    }
    default: {
      const n = rng.int(6);
      const o: Record<string, unknown> = {};
      for (let i = 0; i < n; i++) {
        // JSON.parse と同じく自前のプロパティとして定義する(__proto__ の setter を通さない)
        Object.defineProperty(o, rng.bool(0.3) ? rng.pick(NASTY_STRINGS) : randomString(rng, 3), {
          value: randomJson(rng, depth - 1),
          enumerable: true,
          writable: true,
          configurable: true,
        });
      }
      return o;
    }
  }
}

export function randomString(rng: Rng, n: number): string {
  let s = '';
  for (let i = 0; i < n; i++) {
    const r = rng.next();
    s += String.fromCharCode(
      r < 0.7 ? 32 + rng.int(95) : r < 0.9 ? 0x3040 + rng.int(0x60) : rng.int(0x10000),
    );
  }
  return s;
}

/** 文字列を 1〜数か所壊す(置換・挿入・削除・切り詰め・区間の複製・入れ替え) */
export function mutateString(rng: Rng, s: string, alphabet?: string): string {
  const chars = alphabet ?? s;
  const randChar = () =>
    chars.length > 0 && rng.bool(0.8)
      ? chars.charAt(rng.int(chars.length))
      : String.fromCharCode(rng.int(0x10000));
  let out = s;
  const times = 1 + rng.int(3);
  for (let t = 0; t < times; t++) {
    const i = rng.int(out.length + 1);
    switch (rng.int(6)) {
      case 0:
        out = out.slice(0, i) + randChar() + out.slice(i + 1);
        break;
      case 1:
        out = out.slice(0, i) + randChar() + out.slice(i);
        break;
      case 2:
        out = out.slice(0, i) + out.slice(i + 1 + rng.int(4));
        break;
      case 3:
        out = out.slice(0, i);
        break;
      case 4: {
        const j = Math.min(out.length, i + 1 + rng.int(40));
        out = out.slice(0, j) + out.slice(i, j) + out.slice(j);
        break;
      }
      default: {
        const j = rng.int(out.length + 1);
        const [a, b] = i < j ? [i, j] : [j, i];
        out = out.slice(0, a) + out.slice(b) + out.slice(a, b);
      }
    }
  }
  return out;
}

/**
 * JSON 値の木を構造的に壊す:ランダムな節を別の値に置き換える、配列の要素・オブジェクトのキーを
 * 消す・増やす、数を極端な値にする、文字列を意地の悪い文字列にする。入力は変更しない。
 */
export function mutateJson(rng: Rng, v: unknown, rate = 0.08): unknown {
  if (rng.bool(rate)) {
    switch (rng.int(4)) {
      case 0:
        return randomJson(rng, 2);
      case 1:
        return typeof v === 'number' ? rng.pick(NASTY_NUMBERS) : rng.pick(NASTY_STRINGS);
      case 2:
        return Array.isArray(v) ? [] : null;
      default:
        return typeof v === 'string' ? rng.pick(NASTY_STRINGS) : v;
    }
  }
  if (Array.isArray(v)) {
    const out = v.map((x: unknown) => mutateJson(rng, x, rate));
    if (rng.bool(rate) && out.length > 0) out.splice(rng.int(out.length), 1);
    if (rng.bool(rate)) out.splice(rng.int(out.length + 1), 0, randomJson(rng, 2));
    if (rng.bool(rate / 4) && out.length > 0) {
      // 巨大な配列(上限の検査を試す)。中身は小さな値にして、テストの圧縮・展開を重くしない
      const first: unknown = out[0];
      const big = new Array<unknown>(300 + rng.int(3000)).fill(
        typeof first === 'object' && first !== null ? 0 : first,
      );
      out.splice(rng.int(out.length), 0, ...big);
    }
    return out;
  }
  if (typeof v === 'object' && v !== null) {
    const out: Record<string, unknown> = {};
    for (const [k, x] of Object.entries(v)) {
      if (rng.bool(rate / 2)) continue;
      Object.defineProperty(out, k, {
        value: mutateJson(rng, x, rate),
        enumerable: true,
        writable: true,
        configurable: true,
      });
    }
    if (rng.bool(rate)) {
      Object.defineProperty(out, rng.pick(['__proto__', 'constructor', 'prototype', 'extra']), {
        value: randomJson(rng, 2),
        enumerable: true,
        writable: true,
        configurable: true,
      });
    }
    return out;
  }
  if (typeof v === 'number' && rng.bool(rate)) return rng.pick(NASTY_NUMBERS);
  return v;
}

/** 深く入れ子にした配列・オブジェクト(再帰する処理のスタックあふれを試す) */
export function deeplyNested(depth: number, kind: 'array' | 'object'): string {
  return kind === 'array'
    ? `${'['.repeat(depth)}${']'.repeat(depth)}`
    : `${'{"a":'.repeat(depth)}1${'}'.repeat(depth)}`;
}

/** 経過時間(ms)を測って返す */
export function timed<T>(f: () => T): { value: T; ms: number } {
  const t0 = performance.now();
  const value = f();
  return { value, ms: performance.now() - t0 };
}
