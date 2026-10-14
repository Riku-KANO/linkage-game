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
