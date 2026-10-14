import {
  CHAPTERS,
  isChapterCleared,
  isChapterUnlocked,
  isStageCleared,
  isStageUnlocked,
  stagesOfChapter,
} from '@/game';
import type { Medal, Progress, RunResult, StageId } from '@/game/types';
import { t } from '@/i18n';

/**
 * ステージ選択(HUD-2)の表示用のモデル(純粋な関数)。進行(Progress)から、章ごとの
 * 解放・クリア・最高メダルと「次に遊ぶステージ」を組み立てる。規則は game の関数に任せる。
 */

export type MedalSet = RunResult['medals'];

export interface StageCell {
  id: StageId;
  chapter: number;
  order: number;
  titleKey: string;
  descKey: string;
  unlocked: boolean;
  cleared: boolean;
  /** 軸ごとの最高メダル(クリアしていなければ null) */
  medals: MedalSet | null;
  /** 最高記録(失敗の記録も含む) */
  best: RunResult | null;
  /** 次に遊ぶステージ(全体で 1 つ) */
  isNext: boolean;
}

export interface ChapterRow {
  chapter: number;
  titleKey: string;
  descKey: string;
  unlocked: boolean;
  /** ステージがあって遊べるか(MVP は章 1・2) */
  playable: boolean;
  cleared: boolean;
  stages: StageCell[];
}

export function buildStageSelect(progress: Progress): ChapterRow[] {
  let nextFound = false;
  return CHAPTERS.map((c) => {
    const stages = stagesOfChapter(c.chapter).map((s): StageCell => {
      const unlocked = isStageUnlocked(progress, s.id);
      const cleared = isStageCleared(progress, s.id);
      const isNext = !nextFound && unlocked && !cleared;
      if (isNext) nextFound = true;
      const best = progress.best[s.id] ?? null;
      return {
        id: s.id,
        chapter: s.chapter,
        order: s.order,
        titleKey: s.titleKey,
        descKey: s.descKey,
        unlocked,
        cleared,
        medals: cleared && best ? best.medals : null,
        best,
        isNext,
      };
    });
    return {
      chapter: c.chapter,
      titleKey: c.titleKey,
      descKey: c.descKey,
      unlocked: isChapterUnlocked(progress, c.chapter),
      playable: c.playable && stages.length > 0,
      cleared: isChapterCleared(progress, c.chapter),
      stages,
    };
  });
}

/** 次に遊ぶステージ。全部クリアしていれば null */
export function nextPlayableStage(rows: readonly ChapterRow[]): StageId | null {
  for (const r of rows) for (const s of r.stages) if (s.isNext) return s.id;
  return null;
}

export interface MedalTally {
  gold: number;
  silver: number;
  bronze: number;
}

export function medalTally(medals: MedalSet | null): MedalTally {
  const out: MedalTally = { gold: 0, silver: 0, bronze: 0 };
  if (!medals) return out;
  for (const m of Object.values(medals) as Medal[]) if (m) out[m] += 1;
  return out;
}

/** ステージ番号「1-2」 */
export function stageNumber(cell: Pick<StageCell, 'chapter' | 'order'>): string {
  return t('hud.stage.number', { chapter: cell.chapter, order: cell.order });
}

/** 読み上げ用:番号・題・状態・メダル */
export function stageAriaLabel(cell: StageCell): string {
  const head = `${stageNumber(cell)} ${t(cell.titleKey)}`;
  if (!cell.unlocked) return `${head}、${t('hud.stage.aria.locked')}`;
  if (cell.cleared) {
    const m = medalTally(cell.medals);
    const medals =
      m.gold + m.silver + m.bronze > 0
        ? t('hud.stage.aria.medals', { ...m })
        : t('hud.stage.aria.noMedals');
    return `${head}、${t('hud.stage.aria.cleared')}、${medals}`;
  }
  return `${head}、${t(cell.isNext ? 'hud.stage.aria.next' : 'hud.stage.aria.open')}`;
}
