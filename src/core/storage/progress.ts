import type { FailReason, Medal, Progress, RunResult } from '@/game/types';
import { isBoolean, isFiniteNumber, isRecord, isString } from '@/core/model/guards';

/**
 * クリア状況(Progress)の既定値と検査(U-01)。localStorage から読んだものは必ずここを通す。
 * 壊れた記録は 1 件ずつ捨て、全体はなるべく残す。
 */

export const PROGRESS_VERSION = 1;

export function createDefaultProgress(): Progress {
  return { version: 1, best: {}, unlockedChapters: [1], zukan: [], seenTransitions: [] };
}

// Record にしておくと、FailReason・Medal が増えたときに型検査でここの更新漏れが分かる
const FAIL_REASONS: Record<FailReason, true> = {
  fallen: true,
  timeout: true,
  stalled: true,
  jammed: true,
  overBudget: true,
  invalid: true,
};
const MEDALS: Record<Exclude<Medal, null>, true> = { gold: true, silver: true, bronze: true };

// `in` だとプロトタイプのキー(toString など)も通るので hasOwn を使う
const isMedal = (v: unknown): v is Medal => v === null || (isString(v) && Object.hasOwn(MEDALS, v));
const isFailReason = (v: unknown): v is FailReason | null =>
  v === null || (isString(v) && Object.hasOwn(FAIL_REASONS, v));

export function validateRunResult(v: unknown): RunResult | null {
  if (!isRecord(v)) return null;
  const { stageId, cleared, reason, time, parts, cost, energy, distance, medals } = v;
  if (!isString(stageId) || !isBoolean(cleared) || !isFailReason(reason)) return null;
  if (![time, parts, cost, energy, distance].every(isFiniteNumber)) return null;
  if (!isRecord(medals)) return null;
  const m = { time: medals.time, parts: medals.parts, cost: medals.cost, energy: medals.energy };
  if (!isMedal(m.time) || !isMedal(m.parts) || !isMedal(m.cost) || !isMedal(m.energy)) return null;
  return {
    stageId,
    cleared,
    reason,
    time: time as number,
    parts: parts as number,
    cost: cost as number,
    energy: energy as number,
    distance: distance as number,
    medals: { time: m.time, parts: m.parts, cost: m.cost, energy: m.energy },
  };
}

/**
 * 版が PROGRESS_VERSION でなければ null。中身の壊れた項目は捨てる
 * (記録はキーと stageId が一致するものだけ、章は正の整数だけ)。
 */
export function validateProgress(v: unknown): Progress | null {
  try {
    if (!isRecord(v) || v.version !== PROGRESS_VERSION) return null;
    const def = createDefaultProgress();
    const best: Record<string, RunResult> = {};
    if (isRecord(v.best)) {
      for (const [k, r] of Object.entries(v.best)) {
        const run = validateRunResult(r);
        if (run && run.stageId === k) best[k] = run;
      }
    }
    const chapters = Array.isArray(v.unlockedChapters)
      ? [
          ...new Set(
            v.unlockedChapters.filter((c): c is number => Number.isInteger(c) && (c as number) > 0),
          ),
        ]
      : def.unlockedChapters;
    const strings = (x: unknown): string[] => (Array.isArray(x) ? x.filter(isString) : []);
    return {
      version: 1,
      best,
      unlockedChapters: chapters,
      zukan: strings(v.zukan),
      seenTransitions: strings(v.seenTransitions),
    };
  } catch {
    return null;
  }
}
