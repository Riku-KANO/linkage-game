/**
 * 文言の中の用語リンク。`[[dof|自由度]]` は「自由度」と表示して用語 dof の説明を開く。
 * `[[dof]]` は用語の名前をそのまま表示する。文言は i18n に置いたまま、用語の小窓を差し込める。
 */
export type RichSegment =
  { kind: 'text'; text: string } | { kind: 'term'; id: string; label?: string };

const TERM = /\[\[([A-Za-z][\w-]*)(?:\|([^\]]+))?\]\]/g;

export function parseRich(text: string): RichSegment[] {
  const out: RichSegment[] = [];
  let last = 0;
  for (const m of text.matchAll(TERM)) {
    const at = m.index ?? 0;
    if (at > last) out.push({ kind: 'text', text: text.slice(last, at) });
    out.push(m[2] ? { kind: 'term', id: m[1]!, label: m[2] } : { kind: 'term', id: m[1]! });
    last = at + m[0].length;
  }
  if (last < text.length) out.push({ kind: 'text', text: text.slice(last) });
  return out;
}

/** 用語リンクを外した素の文(読み上げ・小窓の中などで使う) */
export function plainRich(text: string, nameOf: (id: string) => string = (id) => id): string {
  return parseRich(text)
    .map((s) => (s.kind === 'text' ? s.text : (s.label ?? nameOf(s.id))))
    .join('');
}
