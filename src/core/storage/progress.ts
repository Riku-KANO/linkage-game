import type { FailReason, Medal, Progress, RunResult } from '@/game/types';
import { isBoolean, isFiniteNumber, isRecord, isString } from '@/core/model/guards';
import { RESERVED_IDS } from '@/core/model/validate';

/**
 * クリア状況(Progress)の既定値と検査(U-01)。localStorage から読んだものは必ずここを通す。
 * 壊れた記録は 1 件ずつ捨て、全体はなるべく残す。
 */

export const PROGRESS_VERSION = 1;
/** 章・図鑑・見た遷移の一覧の長さの上限(改ざんされた巨大な一覧を毎回読まないように) */
export const MAX_PROGRESS_LIST = 256;
/** 一覧の文字列・ステージ id の長さの上限 */
const MAX_PROGRESS_STRING = 64;
/** 章の番号の上限 */
const MAX_CHAPTER = 1000;
/**
 * 記録のキー(ステージ id)。'c1-s1' のような英数字と - _ だけ。`__proto__` などの
 * Object.prototype のメンバー名は、best[k] = … でプロトタイプを書き換えるので必ず拒否する
 */
const STAGE_ID = /^[A-Za-z0-9_-]{1,64}$/;
const isStageKey = (k: string) => STAGE_ID.test(k) && !RESERVED_IDS.has(k);

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
  // -0(JSON.parse('-0') で作れる)は 0 にそろえる
  const n = (x: unknown) => (x as number) || 0;
  return {
    stageId,
    cleared,
    reason,
    time: n(time),
    parts: n(parts),
    cost: n(cost),
    energy: n(energy),
    distance: n(distance),
    medals: { time: m.time, parts: m.parts, cost: m.cost, energy: m.energy },
  };
}

/**
 * 版が PROGRESS_VERSION でなければ null。中身の壊れた項目は捨てる
 * (記録はキーがステージ id の形でキーと stageId が一致するものだけ、章は正の整数だけ、
 * 一覧は MAX_PROGRESS_LIST 件まで)。結果は新しく作ったオブジェクトで、入力を共有しない。
 */
export function validateProgress(v: unknown): Progress | null {
  try {
    if (!isRecord(v) || v.version !== PROGRESS_VERSION) return null;
    const def = createDefaultProgress();
    const best: Record<string, RunResult> = {};
    if (isRecord(v.best)) {
      let n = 0;
      for (const [k, r] of Object.entries(v.best)) {
        if (n >= MAX_PROGRESS_LIST) break;
        if (!isStageKey(k)) continue;
        const run = validateRunResult(r);
        if (run && run.stageId === k) {
          best[k] = run;
          n++;
        }
      }
    }
    const chapters = Array.isArray(v.unlockedChapters)
      ? [
          ...new Set(
            v.unlockedChapters
              .slice(0, MAX_PROGRESS_LIST)
              .filter(
                (c): c is number =>
                  Number.isInteger(c) && (c as number) > 0 && (c as number) <= MAX_CHAPTER,
              ),
          ),
        ]
      : def.unlockedChapters;
    /** 文字列だけ、短いものだけ、重複なし、上限まで */
    const strings = (x: unknown): string[] =>
      Array.isArray(x)
        ? [
            ...new Set(
              x
                .slice(0, MAX_PROGRESS_LIST)
                .filter(
                  (s): s is string =>
                    isString(s) && s.length > 0 && s.length <= MAX_PROGRESS_STRING,
                ),
            ),
          ]
        : [];
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
