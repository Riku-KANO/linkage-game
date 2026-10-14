import { t } from '@/i18n';

/**
 * 用語の解説(GUIDE-2)。機構学を知らなくても遊べるが、知っていれば有利になる言葉を、
 * 短い説明と小さな図で開けるようにする。文言は guide.term.<id>.*、図は figures/GlossaryFigure。
 */

export const GLOSSARY_IDS = [
  'dof',
  'grubler',
  'grashof',
  'crankRocker',
  'deadPoint',
  'couplerCurve',
  'legPhase',
  'notAssemblable',
  'specialGeometry',
] as const;

export type GlossaryId = (typeof GLOSSARY_IDS)[number];

export interface GlossaryEntry {
  id: GlossaryId;
  /** 名前(例:自由度) */
  nameKey: string;
  /** 読み(漢字の用語だけ。なければ null) */
  readingKey: string | null;
  /** 一言の説明 */
  shortKey: string;
  /** 少し詳しい説明 */
  bodyKey: string;
  /** ゲームでの使いどころ */
  playKey: string;
  /** 関連する用語 */
  related: GlossaryId[];
}

const WITH_READING: ReadonlySet<GlossaryId> = new Set([
  'dof',
  'deadPoint',
  'legPhase',
  'notAssemblable',
  'specialGeometry',
  'crankRocker',
]);

const RELATED: Record<GlossaryId, GlossaryId[]> = {
  dof: ['grubler', 'specialGeometry'],
  grubler: ['dof'],
  grashof: ['crankRocker', 'notAssemblable'],
  crankRocker: ['grashof', 'couplerCurve'],
  deadPoint: ['grashof'],
  couplerCurve: ['crankRocker'],
  legPhase: ['couplerCurve'],
  notAssemblable: ['grashof', 'deadPoint'],
  specialGeometry: ['dof', 'grubler'],
};

export const GLOSSARY: readonly GlossaryEntry[] = GLOSSARY_IDS.map((id) => ({
  id,
  nameKey: `guide.term.${id}.name`,
  readingKey: WITH_READING.has(id) ? `guide.term.${id}.reading` : null,
  shortKey: `guide.term.${id}.short`,
  bodyKey: `guide.term.${id}.body`,
  playKey: `guide.term.${id}.play`,
  related: RELATED[id],
}));

export function isGlossaryId(id: string): id is GlossaryId {
  return (GLOSSARY_IDS as readonly string[]).includes(id);
}

export function glossaryEntry(id: string): GlossaryEntry | undefined {
  return GLOSSARY.find((e) => e.id === id);
}

/** 用語の名前(知らない id はそのまま) */
export function termName(id: string): string {
  const e = glossaryEntry(id);
  return e ? t(e.nameKey) : id;
}
