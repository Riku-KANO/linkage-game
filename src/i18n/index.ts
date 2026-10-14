import { ja } from './ja';

/**
 * 文言(U-07)。日本語のみ。モジュールごとに src/i18n/ja/<module>.ts に分けて書き、
 * ここで 1 つの辞書にまとめる。英語を足すときは src/i18n/en/ を同じ形で作る。
 */
export type Locale = 'ja';
type Dict = Record<string, string>;

const dictionaries: Record<Locale, Dict> = { ja };
let current: Locale = 'ja';

export function setLocale(locale: Locale) {
  current = locale;
}

/** `{name}` 形式のパラメータを埋める。キーが無ければキーそのものを返す */
export function t(key: string, params?: Record<string, string | number>): string {
  const s = dictionaries[current][key] ?? key;
  if (!params) return s;
  return s.replace(/\{(\w+)\}/g, (_, k: string) => String(params[k] ?? `{${k}}`));
}

export function hasKey(key: string): boolean {
  return key in dictionaries[current];
}
