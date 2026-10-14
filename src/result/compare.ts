import type { RunResult } from '@/game/types';
import type { ShareRun } from '@/core/model';

/**
 * 相手の記録との比較(RS-3、決定事項「ランキングは作らない」)。サーバーなしで、共有リンクに
 * 埋め込まれた送り主の記録と自分の記録を軸ごとに並べ、どちらが勝ったかを出すだけ。
 */

export type AxisKey = 'time' | 'parts' | 'cost' | 'energy';
export const AXIS_KEYS: readonly AxisKey[] = ['time', 'parts', 'cost', 'energy'];

export type Winner = 'you' | 'them' | 'tie';

export interface AxisComparison {
  axis: AxisKey;
  you: number;
  them: number;
  winner: Winner;
}

export interface RunComparison {
  axes: AxisComparison[];
  wins: number;
  losses: number;
  ties: number;
  /** 同じステージの記録か */
  sameStage: boolean;
  /** 片方だけが未クリアのとき */
  note: 'youNotCleared' | 'themNotCleared' | null;
}

/** 結果を共有リンクに入れる記録にする(必要な項目だけ) */
export function toShareRun(r: RunResult): ShareRun {
  return {
    stageId: r.stageId,
    time: r.time,
    parts: r.parts,
    cost: r.cost,
    energy: r.energy,
    cleared: r.cleared,
  };
}

/** 共有リンクの短縮形式と同じ精度(時間 1ms、エネルギー 0.01J、コスト 0.1)にそろえる */
export function quantizeRun(r: ShareRun): ShareRun {
  const q = (v: number, s: number) => (Math.round(v * s) || 0) / s;
  return {
    ...r,
    time: q(r.time, 1000),
    energy: q(r.energy, 100),
    cost: q(r.cost, 10),
    parts: Math.round(r.parts),
  };
}

/**
 * 軸ごとに比べる。どの軸も小さいほど良い。相手の値はリンクを通って量子化されているので、
 * 自分の値も同じ精度にそろえてから比べる(リンクの精度より細かい差は引き分け)。
 * 片方だけがクリアしたときは、クリアした方がすべての軸で勝つ(転んで早く止まった機械が
 * 「省エネ」で勝つようなことを避ける)。
 */
export function compareRuns(you: ShareRun, them: ShareRun): RunComparison {
  const a = quantizeRun(you);
  const b = quantizeRun(them);
  const note = a.cleared === b.cleared ? null : a.cleared ? 'themNotCleared' : 'youNotCleared';
  const axes = AXIS_KEYS.map((axis): AxisComparison => {
    const x = a[axis];
    const y = b[axis];
    let winner: Winner;
    if (note === 'themNotCleared') winner = 'you';
    else if (note === 'youNotCleared') winner = 'them';
    else winner = x < y ? 'you' : x > y ? 'them' : 'tie';
    return { axis, you: you[axis], them: them[axis], winner };
  });
  const count = (w: Winner) => axes.filter((c) => c.winner === w).length;
  return {
    axes,
    wins: count('you'),
    losses: count('them'),
    ties: count('tie'),
    sameStage: you.stageId === them.stageId,
    note,
  };
}
