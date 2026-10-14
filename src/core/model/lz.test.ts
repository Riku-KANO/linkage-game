import { describe, expect, it } from 'vitest';
import LZString from 'lz-string';
import { decompressFromEncodedURIComponentBounded as bounded } from './lz';
import { createRng, mutateString, randomString, timed } from './fuzzing';

const ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+-$';
const BIG = 50_000_000;

/** 本家の結果を、こちらの戻り値の形にそろえる */
function reference(token: string) {
  const r = LZString.decompressFromEncodedURIComponent(token);
  return r === null ? { ok: false, reason: 'invalid' } : { ok: true, text: r };
}

/**
 * 先頭の符号が 3(本家の switch にない値)のトークンは、本家は undefined を辞書に入れたまま進み、
 * "undefined" を含むごみを返すか例外を投げる。lz-string の圧縮はこの値を書かないので、こちらは壊れた入力として拒否する
 */
const firstCodeIsThree = (token: string) => {
  const v = ALPHABET.indexOf(token.replace(/ /g, '+').charAt(0));
  // 先頭の 2 ビット(6 ビットのうち上から 2 つ)が両方 1。'$' は 64 で、6 ビットに収まらない
  return v >= 48 && v < 64;
};

/** 本家と同じ結果か(本家が未定義の動作をする入力は、こちらが拒否すること) */
function expectSameAsReference(token: string) {
  const got = bounded(token, BIG);
  if (firstCodeIsThree(token)) {
    expect(got, token).toEqual({ ok: false, reason: 'invalid' });
    return;
  }
  const ref = reference(token);
  // 本家は壊れた入力で巨大な文字列を作ることもあるので、上限内に収まるものだけを比べる
  if (ref.ok && ref.text !== undefined && ref.text.length > BIG) return;
  expect(got, token).toEqual(ref);
}

describe('bounded lz-string decompression (SEC-3)', () => {
  it('reads everything lz-string writes (random text, JSON and unicode)', () => {
    const rng = createRng(1);
    for (let i = 0; i < 400; i++) {
      const s =
        i % 3 === 0
          ? JSON.stringify([i, randomString(rng, rng.int(200)), [1, 2, 3].map(() => rng.next())])
          : randomString(rng, rng.int(i < 200 ? 40 : 3000));
      const token = LZString.compressToEncodedURIComponent(s);
      expect(bounded(token, BIG)).toEqual({ ok: true, text: s });
    }
  });

  it('agrees with lz-string on corrupted tokens', () => {
    const rng = createRng(2);
    const seeds = [
      '[1,["Jansen",["A","B"],[0,0,100,200],[0],[["l1",0,1]],[],-1,3000,[1,0,2000,0]]]',
      JSON.stringify({ hello: 'world', n: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10] }),
      'あいうえお'.repeat(20),
    ].map((s) => LZString.compressToEncodedURIComponent(s));
    for (let i = 0; i < 3000; i++) {
      expectSameAsReference(mutateString(rng, rng.pick(seeds), i % 4 === 0 ? undefined : ALPHABET));
    }
  });

  it('agrees with lz-string on random tokens and edge cases', () => {
    const rng = createRng(3);
    const edge = ['', ' ', 'A', '$', '-', '+', 'AAAA', 'Q', '%', 'é', '\uD800', 'B'.repeat(100)];
    for (const token of edge) expectSameAsReference(token);
    for (let i = 0; i < 2000; i++) {
      let token = '';
      const n = rng.int(60);
      for (let k = 0; k < n; k++) token += ALPHABET.charAt(rng.int(64));
      expectSameAsReference(token);
    }
  });

  it('stops a decompression bomb at the limit, quickly', () => {
    // 300 万文字の空白は 4000 文字ほどのトークンになる(本家はそのまま 300 万文字に展開する)
    const bomb = LZString.compressToEncodedURIComponent(`[${' '.repeat(3_000_000)}]`);
    expect(bomb.length).toBeLessThan(5000);
    const { value, ms } = timed(() => bounded(bomb, 100_000));
    expect(value).toEqual({ ok: false, reason: 'too-large' });
    expect(ms).toBeLessThan(200);
    // 上限が十分なら本家と同じ
    expect(bounded(bomb, 4_000_000)).toEqual({ ok: true, text: `[${' '.repeat(3_000_000)}]` });
  });

  it('counts the limit exactly', () => {
    const token = LZString.compressToEncodedURIComponent('abcdefghij');
    expect(bounded(token, 10)).toEqual({ ok: true, text: 'abcdefghij' });
    expect(bounded(token, 9)).toEqual({ ok: false, reason: 'too-large' });
    expect(bounded(LZString.compressToEncodedURIComponent('a'), 0)).toEqual({
      ok: false,
      reason: 'too-large',
    });
  });

  it('treats + written as a space like lz-string does', () => {
    const s = JSON.stringify({ k: 'x'.repeat(50), v: [1, 2, 3, 4, 5, 6, 7, 8] });
    for (let seed = 0; seed < 200; seed++) {
      const token = LZString.compressToEncodedURIComponent(`${s}${seed}`);
      if (!token.includes('+')) continue;
      expect(bounded(token.replace(/\+/g, ' '), BIG)).toEqual({ ok: true, text: `${s}${seed}` });
      return;
    }
    throw new Error('no token with + found');
  });
});
