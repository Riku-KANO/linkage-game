/**
 * 見た遷移(設計原則 5「二度目は短く」)の突き合わせ。useApp.seenTransitions(メモリの Set、遷移の
 * 短縮版を決める)と progress.seenTransitions(保存される)を同じにして、再読み込みしても 2 回目以降は短くする。
 *  - 起動時・保存側が増えたとき:保存側にあるものをメモリに足す
 *  - メモリ側が増えたとき(go で遷移した):保存側にないものを markTransitionSeen で記録する
 *  - 保存側から消えたとき(進行のリセット):メモリも保存側に合わせる(初回の演出に戻る)
 */

/** メモリにあって保存側にない(記録すべき)遷移 */
export function seenToRecord(app: ReadonlySet<string>, stored: readonly string[]): string[] {
  const have = new Set(stored);
  return [...app].filter((id) => !have.has(id));
}

/**
 * 保存側が prev から next に変わったときのメモリの新しい Set。変えなくてよければ null。
 * 何かが消えていればリセットとみなして next に合わせ、そうでなければ next の分を足す。
 */
export function seenAfterStoredChange(
  prev: readonly string[] | null,
  next: readonly string[],
  app: ReadonlySet<string>,
): Set<string> | null {
  const nextSet = new Set(next);
  const removed = prev !== null && prev.some((id) => !nextSet.has(id));
  if (removed) {
    const same = app.size === nextSet.size && [...app].every((id) => nextSet.has(id));
    return same ? null : nextSet;
  }
  const missing = next.filter((id) => !app.has(id));
  return missing.length > 0 ? new Set([...app, ...missing]) : null;
}
