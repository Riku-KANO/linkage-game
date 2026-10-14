/**
 * 元に戻す・やり直しの履歴(ED-7)。純関数。
 *
 * ドラッグのように連続する編集は、同じ group キーで record するとひとつの項目にまとまる。
 * ドラッグが終わったら seal() で区切る(次の record は新しい項目になる)。
 */

export interface History<T> {
  past: T[];
  present: T;
  future: T[];
  /** 直前の record の group キー(seal で null) */
  group: string | null;
}

export const HISTORY_LIMIT = 200;

export function createHistory<T>(present: T): History<T> {
  return { past: [], present, future: [], group: null };
}

export function record<T>(
  h: History<T>,
  next: T,
  group: string | null = null,
  limit = HISTORY_LIMIT,
): History<T> {
  if (next === h.present) return group === h.group ? h : { ...h, group };
  if (group !== null && group === h.group) {
    // 同じまとまりの続き:present だけ差し替える
    return { past: h.past, present: next, future: [], group };
  }
  const past = [...h.past, h.present];
  if (past.length > limit) past.splice(0, past.length - limit);
  return { past, present: next, future: [], group };
}

export function seal<T>(h: History<T>): History<T> {
  return h.group === null ? h : { ...h, group: null };
}

export function undo<T>(h: History<T>): History<T> {
  const prev = h.past[h.past.length - 1];
  if (prev === undefined) return h;
  return {
    past: h.past.slice(0, -1),
    present: prev,
    future: [h.present, ...h.future],
    group: null,
  };
}

export function redo<T>(h: History<T>): History<T> {
  const next = h.future[0];
  if (next === undefined) return h;
  return {
    past: [...h.past, h.present],
    present: next,
    future: h.future.slice(1),
    group: null,
  };
}

export const canUndo = <T>(h: History<T>) => h.past.length > 0;
export const canRedo = <T>(h: History<T>) => h.future.length > 0;
