import { useEditor } from './store';
import {
  copyItems,
  deleteItems,
  mirrorSelection,
  moveJoints,
  pasteItems,
  selectionJoints,
  type Locked,
} from './ops';

/**
 * 選択に対する編集コマンド(ED-7)。ストアの状態を読み、純関数の ops で編集して commit する。
 * キーボードとツールバーの両方から呼ぶ。
 */

const NONE: Locked = new Set();

/** 貼り付けのずらし量(cm)。続けて貼るたびに同じだけずれる */
export const PASTE_OFFSET = 5;

export function copySelection(): boolean {
  const { design, selection, setClipboard } = useEditor.getState();
  const clip = copyItems(design, selection);
  if (!clip) return false;
  setClipboard(clip);
  return true;
}

export function pasteClipboard(): boolean {
  const s = useEditor.getState();
  if (!s.clipboard) return false;
  const n = s.bumpPaste();
  const r = pasteItems(s.design, s.clipboard, { dx: PASTE_OFFSET * n, dy: -PASTE_OFFSET * n });
  s.commit(r.design);
  s.seal();
  useEditor.getState().setSelection(r.selection);
  return true;
}

export function deleteSelection(locked: Locked = NONE): boolean {
  const s = useEditor.getState();
  const next = deleteItems(s.design, s.selection, locked);
  if (next === s.design) return false;
  s.commit(next);
  s.seal();
  useEditor.getState().setSelection({ joints: [], links: [] });
  return true;
}

export function cutSelection(locked: Locked = NONE): boolean {
  return copySelection() && deleteSelection(locked);
}

export function mirrorCurrent(locked: Locked = NONE): boolean {
  const s = useEditor.getState();
  const next = mirrorSelection(s.design, s.selection, locked);
  if (next === s.design) return false;
  s.commit(next);
  s.seal();
  return true;
}

export function selectAll(): void {
  const s = useEditor.getState();
  s.setSelection({
    joints: s.design.joints.map((j) => j.id),
    links: s.design.links.map((l) => l.id),
  });
}

/** 矢印キーで選択を動かす。連打はひとつの履歴にまとめる */
export function nudgeSelection(dx: number, dy: number, locked: Locked = NONE): boolean {
  const s = useEditor.getState();
  const ids = selectionJoints(s.design, s.selection);
  const next = moveJoints(s.design, ids, dx, dy, locked);
  if (next === s.design) return false;
  s.commit(next, { group: 'nudge' });
  return true;
}
