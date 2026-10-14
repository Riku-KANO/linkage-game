/**
 * 外から来たデータ(JSON・共有リンク・localStorage)を調べるための小さな型ガード。
 * zod などのライブラリは使わない。
 */

export type UnknownRecord = Record<string, unknown>;

/** 配列でない普通のオブジェクト */
export function isRecord(v: unknown): v is UnknownRecord {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

export function isFiniteNumber(v: unknown): v is number {
  return typeof v === 'number' && Number.isFinite(v);
}

export function isInteger(v: unknown): v is number {
  return typeof v === 'number' && Number.isInteger(v);
}

export function isString(v: unknown): v is string {
  return typeof v === 'string';
}

export function isBoolean(v: unknown): v is boolean {
  return typeof v === 'boolean';
}

export function isStringArray(v: unknown): v is string[] {
  return Array.isArray(v) && v.every((x) => typeof x === 'string');
}

/**
 * 画面・ファイル名に出すと危ない、または見えない文字:C0・C1 制御文字、DEL、行・段落の区切り、
 * 双方向テキストの埋め込み・上書き・分離(RLO などで表示の順序をごまかせる)、BOM。
 * 絵文字の結合に使う ZWJ(U+200D)は残す
 */
const UNSAFE_CHARS = /[\u0000-\u001f\u007f-\u009f\u2028\u2029\u202a-\u202e\u2066-\u2069\ufeff]/;
const UNSAFE_CHARS_G = new RegExp(UNSAFE_CHARS.source, 'g');
/** 対になっていないサロゲート(壊れた UTF-16) */
const LONE_SURROGATE = /[\ud800-\udbff](?![\udc00-\udfff])|(?<![\ud800-\udbff])[\udc00-\udfff]/;
const LONE_SURROGATE_G = new RegExp(LONE_SURROGATE.source, 'g');

/** 危ない文字・壊れたサロゲートを含むか */
export function hasUnsafeChars(s: string): boolean {
  return UNSAFE_CHARS.test(s) || LONE_SURROGATE.test(s);
}

/** 危ない文字を取り除き、壊れたサロゲートを U+FFFD にする */
export function sanitizeText(s: string): string {
  return s.replace(UNSAFE_CHARS_G, '').replace(LONE_SURROGATE_G, '\ufffd');
}

/** JSON.parse の例外を結果に変える */
export function safeJsonParse(text: string): { ok: true; value: unknown } | { ok: false } {
  try {
    return { ok: true, value: JSON.parse(text) as unknown };
  } catch {
    return { ok: false };
  }
}

/** エラーメッセージ用に値を短く表示する */
export function show(v: unknown): string {
  if (typeof v === 'string') return JSON.stringify(v.length > 24 ? `${v.slice(0, 24)}…` : v);
  if (v === null) return 'null';
  if (Array.isArray(v)) return '配列';
  if (typeof v === 'object') return 'オブジェクト';
  return String(v);
}
