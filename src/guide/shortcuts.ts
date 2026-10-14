import { SHORTCUTS, type KeyLike, type ShortcutBinding } from '@/editor/keyboard';
import { t } from '@/i18n';

/**
 * 操作一覧(GUIDE-3)の中身。エディタのショートカット表(SHORTCUTS)から作るので、
 * エディタのキー割り当てを変えれば一覧も変わる。文言は guide.keys.<id>。
 */

export type SheetGroup = 'tool' | 'edit' | 'view' | 'pointer' | 'help';

export const SHEET_GROUPS: readonly SheetGroup[] = ['tool', 'edit', 'view', 'pointer', 'help'];

export interface SheetRow {
  id: string;
  group: SheetGroup;
  /** 説明の文言キー */
  labelKey: string;
  /** どれか 1 つを押せばよい組み合わせ。1 つの組み合わせはキーキャップの並び */
  combos: string[][];
}

/** 一覧を開くキー(どの画面でも ? で開く) */
export const HELP_KEY = '?';

/** ? キーか(入力欄の中かどうかは呼ぶ側が見る) */
export function isHelpKey(e: Pick<KeyLike, 'key' | 'metaKey' | 'ctrlKey' | 'altKey'>): boolean {
  return e.key === HELP_KEY && !e.metaKey && !e.ctrlKey && !e.altKey;
}

const NAMED: Record<string, string> = {
  ArrowLeft: '←',
  ArrowRight: '→',
  ArrowUp: '↑',
  ArrowDown: '↓',
  Escape: 'Esc',
  Delete: 'Delete',
  Backspace: 'Backspace',
  ' ': 'Space',
};

/** キーキャップに書く文字 */
export function keyLabel(key: string): string {
  return NAMED[key] ?? (key.length === 1 ? key.toUpperCase() : key);
}

export function modLabel(isMac: boolean): string {
  return isMac ? '⌘' : 'Ctrl';
}

/** 割り当て 1 つ → キーキャップの並び(修飾キーが先) */
export function bindingCombo(b: ShortcutBinding, isMac: boolean): string[] {
  const caps: string[] = [];
  if (b.mod) caps.push(modLabel(isMac));
  if (b.shift) caps.push('Shift');
  caps.push(keyLabel(b.key));
  return caps;
}

/** マウス操作(エディタのヒントと同じ内容)。キー表にはないので、ここで並べる */
const cap = (name: string) => t(`guide.keys.cap.${name}`);
const POINTER_ROWS: { id: string; combos: (isMac: boolean) => string[][] }[] = [
  {
    id: 'pointer.pan',
    combos: () => [[cap('rightDrag')], [cap('middleDrag')], ['Space', cap('drag')]],
  },
  { id: 'pointer.zoom', combos: () => [[cap('wheel')]] },
  { id: 'pointer.addSelect', combos: () => [['Shift', cap('click')]] },
  { id: 'pointer.noSnap', combos: (isMac) => [[isMac ? 'Option' : 'Alt', cap('drag')]] },
];

/** 操作一覧の行(SHEET_GROUPS の順、同じ id の割り当ては 1 行にまとめる) */
export function shortcutRows(isMac: boolean): SheetRow[] {
  const rows: SheetRow[] = [];
  const byId = new Map<string, SheetRow>();
  for (const b of SHORTCUTS) {
    let row = byId.get(b.id);
    if (!row) {
      row = { id: b.id, group: b.group, labelKey: `guide.keys.${b.id}`, combos: [] };
      byId.set(b.id, row);
      rows.push(row);
    }
    row.combos.push(bindingCombo(b, isMac));
  }
  for (const p of POINTER_ROWS) {
    rows.push({
      id: p.id,
      group: 'pointer',
      labelKey: `guide.keys.${p.id}`,
      combos: p.combos(isMac),
    });
  }
  rows.push({ id: 'help', group: 'help', labelKey: 'guide.keys.help', combos: [[HELP_KEY]] });
  return SHEET_GROUPS.flatMap((g) => rows.filter((r) => r.group === g));
}

/** 遊び方の本の最後のページに出す、よく使う操作 */
export const ESSENTIAL_SHORTCUTS: readonly string[] = [
  'tool.link',
  'tool.fixed',
  'tool.crank',
  'tool.foot',
  'undo',
  'togglePlay',
  'help',
];

export function detectMac(): boolean {
  return typeof navigator !== 'undefined' && /Mac|iP(hone|ad|od)/.test(navigator.platform);
}
