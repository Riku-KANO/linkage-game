import type { HintGhost, HintText, StageDef } from './types';

/**
 * 3 段階のヒント(決定事項:方針の一言 → 部品配置の影 → 完成形の一部)。
 * ヒントはいつでも順番に開ける。失敗が続いたり時間がたったりしたら、ボタンを光らせて促す。
 */

export type HintLevel = 1 | 2 | 3;

export interface RevealedHint {
  level: HintLevel;
  /** 「ヒント 1:方針」などの見出し(i18n キー) */
  labelKey: string;
  /** text はそのまま表示。ghost は design を設計ビューに半透明で重ね、key を説明に出す */
  hint: HintText | HintGhost;
}

export function hintLabelKey(level: HintLevel): string {
  return `game.hint.level.${level}`;
}

function hintAt(stage: StageDef, index: number): RevealedHint | null {
  const hint = stage.hints[index];
  if (!hint) return null;
  const level = (index + 1) as HintLevel;
  return { level, labelKey: hintLabelKey(level), hint };
}

/** revealedCount 個を開いた後に、次に開くヒント。もうなければ null */
export function nextHint(stage: StageDef, revealedCount: number): RevealedHint | null {
  return hintAt(stage, Math.max(0, Math.floor(revealedCount)));
}

/** 開いたヒント(レベル順) */
export function revealedHints(stage: StageDef, revealedCount: number): RevealedHint[] {
  const out: RevealedHint[] = [];
  const n = Math.min(stage.hints.length, Math.max(0, Math.floor(revealedCount)));
  for (let i = 0; i < n; i++) {
    const h = hintAt(stage, i);
    if (h) out.push(h);
  }
  return out;
}

/** 次のヒントを促すまでの、失敗した試走の回数と経過時間(s)。レベルごとに積み増す */
export const HINT_SUGGEST_EVERY = { failedRuns: 2, seconds: 180 } as const;

/**
 * 次のヒントを促すか(ボタンを光らせる)。revealed 個を開いた後なら、
 * 失敗が 2·(revealed+1) 回以上、または 180·(revealed+1) 秒以上たったら促す。
 */
export function suggestHint(
  stage: StageDef,
  state: { revealed: number; failedRuns: number; seconds: number },
): boolean {
  if (!nextHint(stage, state.revealed)) return false;
  const k = Math.max(0, Math.floor(state.revealed)) + 1;
  return (
    state.failedRuns >= HINT_SUGGEST_EVERY.failedRuns * k ||
    state.seconds >= HINT_SUGGEST_EVERY.seconds * k
  );
}
