/**
 * 上限つきの lz-string 展開(共有リンクの展開爆弾対策、SEC-3)。
 *
 * lz-string の `decompressFromEncodedURIComponent` と同じ形式を読むが、展開後の長さが maxLength を
 * 超えた時点で打ち切る。lz-string の辞書は 1 符号ごとに 1 文字ずつ長くなれるので、展開後の長さは
 * 入力の長さの 2 乗まで膨らむ(24000 文字のトークンが約 6000 万文字になる)。本家には上限がないため、
 * 展開そのもの(メモリと時間)を有限にするためにこちらを使う。圧縮は本家(lz-string)のまま。
 *
 * 計算量:入力 1 文字(6 ビット)あたり定数回の操作 + 出力の長さ。どちらも有界。
 * 形式は lz-string 1.5.0(MIT License)の `_decompress` と同じ。差分テスト(lz.test.ts)で一致を確かめる。
 */

/** compressToEncodedURIComponent の 64 文字(URL で安全な文字) */
const ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+-$';
const REVERSE = (() => {
  const t = new Int8Array(128).fill(-1);
  for (let i = 0; i < ALPHABET.length; i++) t[ALPHABET.charCodeAt(i)] = i;
  return t;
})();

export type LzDecodeResult =
  | { ok: true; text: string }
  /** invalid:符号が壊れている / too-large:展開後が maxLength を超える */
  | { ok: false; reason: 'invalid' | 'too-large' };

/**
 * `LZString.decompressFromEncodedURIComponent` と同じ結果を返す(null は invalid)。
 * 展開後の文字数が maxLength を超えたら too-large。例外は投げない。
 */
export function decompressFromEncodedURIComponentBounded(
  input: string,
  maxLength: number,
): LzDecodeResult {
  if (input === '') return { ok: false, reason: 'invalid' };
  const s = input.replace(/ /g, '+');
  const length = s.length;
  // 本家と同じく、アルファベット外の文字や範囲外の位置は 0 として読む
  const valueAt = (i: number): number => {
    const c = s.charCodeAt(i);
    return c < 128 ? Math.max(0, REVERSE[c]!) : 0;
  };
  const RESET = 32;
  let val = valueAt(0);
  let position = RESET;
  let index = 1;
  const readBits = (n: number): number => {
    let bits = 0;
    for (let k = 0; k < n; k++) {
      const b = val & position;
      position >>= 1;
      if (position === 0) {
        position = RESET;
        val = valueAt(index++);
      }
      if (b > 0) bits |= 1 << k;
    }
    // n は最大 16(文字)か、辞書の大きさのビット数(入力の長さで有界、30 未満)
    return bits >>> 0;
  };

  const dictionary: string[] = [];
  let dictSize = 4;
  let enlargeIn = 4;
  let numBits = 3;
  const result: string[] = [];
  let total = 0;

  let c: string;
  switch (readBits(2)) {
    case 0:
      c = String.fromCharCode(readBits(8));
      break;
    case 1:
      c = String.fromCharCode(readBits(16));
      break;
    case 2:
      return { ok: true, text: '' };
    default:
      return { ok: false, reason: 'invalid' };
  }
  dictionary[3] = c;
  let w = c;
  result.push(c);
  total = 1;
  if (total > maxLength) return { ok: false, reason: 'too-large' };

  for (;;) {
    if (index > length) return { ok: true, text: '' };
    // 辞書の大きさは入力のビット数で有界なので、numBits は 30 を超えない(超えたら壊れた入力)
    if (numBits > 30) return { ok: false, reason: 'invalid' };
    let code = readBits(numBits);
    switch (code) {
      case 0:
        dictionary[dictSize++] = String.fromCharCode(readBits(8));
        code = dictSize - 1;
        enlargeIn--;
        break;
      case 1:
        dictionary[dictSize++] = String.fromCharCode(readBits(16));
        code = dictSize - 1;
        enlargeIn--;
        break;
      case 2:
        return { ok: true, text: result.join('') };
    }
    if (enlargeIn === 0) {
      enlargeIn = 2 ** numBits;
      numBits++;
    }
    let entry: string;
    const known = code >= 3 ? dictionary[code] : undefined;
    if (known !== undefined) entry = known;
    else if (code === dictSize) entry = w + w.charAt(0);
    else return { ok: false, reason: 'invalid' };
    total += entry.length;
    if (total > maxLength) return { ok: false, reason: 'too-large' };
    result.push(entry);
    dictionary[dictSize++] = w + entry.charAt(0);
    enlargeIn--;
    w = entry;
    if (enlargeIn === 0) {
      enlargeIn = 2 ** numBits;
      numBits++;
    }
  }
}
