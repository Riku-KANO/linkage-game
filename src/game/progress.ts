import type { PartKind } from '@/core/model/types';
import { CHAPTERS, PART_ORDER } from './chapters';
import { betterMedal } from './evaluate';
import { getStage, STAGES, stagesOfChapter } from './stages';
import type { GameFeature, Progress, RunResult, StageId } from './types';

/**
 * 進行(GAME-3)。純粋な関数とリデューサーだけで、保存(U-01)は model の担当。
 * - ステージは章の中で順番に解放する(前のステージをクリアすると次が遊べる)
 * - 章のステージをすべてクリアすると次の章を解放する(遊べない章も解放の記録は残す)
 * - 部品と機能は、その章が解放されたときに使えるようになる
 */

export function initialProgress(): Progress {
  return { version: 1, best: {}, unlockedChapters: [1], zukan: [], seenTransitions: [] };
}

export function isStageCleared(p: Progress, id: StageId): boolean {
  return p.best[id]?.cleared === true;
}

/** 章のステージをすべてクリアしたか(ステージのない章は false) */
export function isChapterCleared(p: Progress, chapter: number): boolean {
  const list = stagesOfChapter(chapter);
  return list.length > 0 && list.every((s) => isStageCleared(p, s.id));
}

export function isChapterUnlocked(p: Progress, chapter: number): boolean {
  return p.unlockedChapters.includes(chapter);
}

export function isStageUnlocked(p: Progress, id: StageId): boolean {
  const stage = getStage(id);
  if (!stage || !isChapterUnlocked(p, stage.chapter)) return false;
  if (stage.order === 1) return true;
  const prev = stagesOfChapter(stage.chapter).find((s) => s.order === stage.order - 1);
  return prev ? isStageCleared(p, prev.id) : true;
}

/** 解放済みの章で使える部品(表示順) */
export function availableParts(p: Progress): PartKind[] {
  const set = new Set<PartKind>();
  for (const c of CHAPTERS) if (isChapterUnlocked(p, c.chapter)) c.parts.forEach((k) => set.add(k));
  return PART_ORDER.filter((k) => set.has(k));
}

/** 解放済みの章で使える機能(章の順) */
export function availableFeatures(p: Progress): GameFeature[] {
  const out: GameFeature[] = [];
  for (const c of CHAPTERS) {
    if (!isChapterUnlocked(p, c.chapter)) continue;
    for (const f of c.features) if (!out.includes(f)) out.push(f);
  }
  return out;
}

/**
 * 最高記録をまとめる。
 * - クリアした記録は失敗で上書きしない。失敗どうしなら遠くまで進んだ方を残す
 * - クリアどうしは軸ごとに良い方(時間・部品数・コスト・エネルギーは小さい方、距離は大きい方、
 *   メダルは良い方)を取る。軸ごとの最高なので、1 回の試走の記録とは限らない
 */
export function mergeBest(prev: RunResult | undefined, next: RunResult): RunResult {
  if (!prev) return next;
  if (prev.cleared !== next.cleared) return prev.cleared ? prev : next;
  if (!next.cleared) return next.distance > prev.distance ? next : prev;
  return {
    stageId: next.stageId,
    cleared: true,
    reason: null,
    time: Math.min(prev.time, next.time),
    parts: Math.min(prev.parts, next.parts),
    cost: Math.min(prev.cost, next.cost),
    energy: Math.min(prev.energy, next.energy),
    distance: Math.max(prev.distance, next.distance),
    medals: {
      time: betterMedal(prev.medals.time, next.medals.time),
      parts: betterMedal(prev.medals.parts, next.medals.parts),
      cost: betterMedal(prev.medals.cost, next.medals.cost),
      energy: betterMedal(prev.medals.energy, next.medals.energy),
    },
  };
}

export type ScoreAxis = 'time' | 'parts' | 'cost' | 'energy';
const AXES: ScoreAxis[] = ['time', 'parts', 'cost', 'energy'];

/** 新しい結果で記録が良くなった軸(結果画面の「最高記録」表示用)。クリアしていなければ空 */
export function improvedAxes(prev: RunResult | undefined, next: RunResult): ScoreAxis[] {
  if (!next.cleared) return [];
  if (!prev || !prev.cleared) return [...AXES];
  return AXES.filter((a) => next[a] < prev[a]);
}

/** クリア状況から章の解放を導き直す(読み込んだ進行の修復にも使う)。変化がなければ同じオブジェクト */
export function syncUnlocks(p: Progress): Progress {
  const set = new Set<number>([1, ...p.unlockedChapters]);
  for (const c of CHAPTERS) {
    const next = CHAPTERS.find((d) => d.chapter === c.chapter + 1);
    if (next && isChapterCleared(p, c.chapter)) set.add(next.chapter);
  }
  const unlocked = [...set].sort((a, b) => a - b);
  const same =
    unlocked.length === p.unlockedChapters.length &&
    unlocked.every((c, i) => c === p.unlockedChapters[i]);
  return same ? p : { ...p, unlockedChapters: unlocked };
}

/** 試走の結果を記録する。知らないステージ(サンドボックスなど)の結果は無視する */
export function recordResult(p: Progress, result: RunResult): Progress {
  if (!getStage(result.stageId)) return p;
  const best = { ...p.best, [result.stageId]: mergeBest(p.best[result.stageId], result) };
  return syncUnlocks({ ...p, best });
}

export interface Unlocks {
  stages: StageId[];
  chapters: number[];
  parts: PartKind[];
  features: GameFeature[];
}

/** before → after で新しく解放されたもの(結果画面・ステージ選択の演出用) */
export function newlyUnlocked(before: Progress, after: Progress): Unlocks {
  const partsBefore = availableParts(before);
  const featuresBefore = availableFeatures(before);
  return {
    stages: STAGES.filter(
      (s) => isStageUnlocked(after, s.id) && !isStageUnlocked(before, s.id),
    ).map((s) => s.id),
    chapters: after.unlockedChapters.filter((c) => !before.unlockedChapters.includes(c)),
    parts: availableParts(after).filter((k) => !partsBefore.includes(k)),
    features: availableFeatures(after).filter((f) => !featuresBefore.includes(f)),
  };
}

export type ProgressAction =
  | { type: 'record'; result: RunResult }
  | { type: 'seeTransition'; id: string }
  | { type: 'registerZukan'; id: string }
  | { type: 'reset' };

export function progressReducer(p: Progress, action: ProgressAction): Progress {
  switch (action.type) {
    case 'record':
      return recordResult(p, action.result);
    case 'seeTransition':
      return p.seenTransitions.includes(action.id)
        ? p
        : { ...p, seenTransitions: [...p.seenTransitions, action.id] };
    case 'registerZukan':
      return p.zukan.includes(action.id) ? p : { ...p, zukan: [...p.zukan, action.id] };
    case 'reset':
      return initialProgress();
  }
}
