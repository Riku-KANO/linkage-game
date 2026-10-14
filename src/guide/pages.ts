/**
 * 遊び方の本のページ(GUIDE-1)。文言は guide.page.<id>.*、図は HowToPlay がページ id で選ぶ。
 */
export const HOW_TO_PLAY_PAGE_IDS = [
  'about',
  'link',
  'crank',
  'dof',
  'path',
  'legs',
  'run',
  'keys',
] as const;

export type HowToPlayPageId = (typeof HOW_TO_PLAY_PAGE_IDS)[number];

export interface HowToPlayPage {
  id: HowToPlayPageId;
  titleKey: string;
  /** 本文の段落(`[[term|表示]]` で用語のリンクを入れられる) */
  paragraphKeys: string[];
}

const PARAGRAPHS: Record<HowToPlayPageId, number> = {
  about: 4,
  link: 4,
  crank: 3,
  dof: 4,
  path: 4,
  legs: 4,
  run: 4,
  keys: 1,
};

export const HOW_TO_PLAY_PAGES: readonly HowToPlayPage[] = HOW_TO_PLAY_PAGE_IDS.map((id) => ({
  id,
  titleKey: `guide.page.${id}.title`,
  paragraphKeys: Array.from({ length: PARAGRAPHS[id] }, (_, i) => `guide.page.${id}.p${i + 1}`),
}));

/** ページ番号(0 始まり)か id から、範囲内のページ番号へ */
export function pageIndex(page: number | HowToPlayPageId | undefined): number {
  if (page === undefined) return 0;
  if (typeof page === 'number') {
    if (!Number.isFinite(page)) return 0;
    return Math.min(HOW_TO_PLAY_PAGES.length - 1, Math.max(0, Math.floor(page)));
  }
  return Math.max(0, HOW_TO_PLAY_PAGE_IDS.indexOf(page));
}
