import type { PartKind } from '@/core/model/types';
import type { ChapterDef } from './types';

/**
 * 章の一覧(要件定義書「ステージ・評価・進行」)。章ごとに機構学の考え方を 1 つ学ぶ。
 * 部品と機能は「その章が解放されたとき」に使えるようになる。MVP で遊べるのは章 1・2 だけで、
 * 章 3〜5 は解放の流れを確かめるために並べてある(ステージはまだない)。
 */
export const CHAPTERS: readonly ChapterDef[] = [
  {
    chapter: 1,
    titleKey: 'game.chapter.1.title',
    descKey: 'game.chapter.1.desc',
    playable: true,
    parts: ['link', 'pin', 'fixed', 'crank'],
    features: [],
  },
  {
    chapter: 2,
    titleKey: 'game.chapter.2.title',
    descKey: 'game.chapter.2.desc',
    playable: true,
    parts: [],
    features: ['legArray'],
  },
  {
    chapter: 3,
    titleKey: 'game.chapter.3.title',
    descKey: 'game.chapter.3.desc',
    playable: false,
    parts: [],
    features: ['bodyPreset'],
  },
  {
    chapter: 4,
    titleKey: 'game.chapter.4.title',
    descKey: 'game.chapter.4.desc',
    playable: false,
    parts: ['gear'],
    features: [],
  },
  {
    chapter: 5,
    titleKey: 'game.chapter.5.title',
    descKey: 'game.chapter.5.desc',
    playable: false,
    parts: ['slider', 'spring'],
    features: [],
  },
];

/** 部品の表示順 */
export const PART_ORDER: readonly PartKind[] = [
  'link',
  'pin',
  'fixed',
  'crank',
  'gear',
  'slider',
  'spring',
];

export function getChapter(chapter: number): ChapterDef | undefined {
  return CHAPTERS.find((c) => c.chapter === chapter);
}

/** 章 chapter までに解放される部品(表示順) */
export function partsUpToChapter(chapter: number): PartKind[] {
  const set = new Set<PartKind>();
  for (const c of CHAPTERS) if (c.chapter <= chapter) c.parts.forEach((p) => set.add(p));
  return PART_ORDER.filter((p) => set.has(p));
}
