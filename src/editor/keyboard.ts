/**
 * キーボードショートカット(ED-7)。キー入力 → コマンドの対応だけを純関数で決める。
 */

export type ToolId = 'select' | 'link' | 'fixed' | 'crank' | 'foot' | 'delete';

export const TOOL_KEYS: Record<ToolId, string> = {
  select: 'V',
  link: 'L',
  fixed: 'F',
  crank: 'C',
  foot: 'A',
  delete: 'X',
};

export type Command =
  | { kind: 'undo' }
  | { kind: 'redo' }
  | { kind: 'copy' }
  | { kind: 'cut' }
  | { kind: 'paste' }
  | { kind: 'selectAll' }
  | { kind: 'delete' }
  | { kind: 'escape' }
  | { kind: 'mirror' }
  | { kind: 'fit' }
  | { kind: 'togglePlay' }
  | { kind: 'stepAngle'; deg: number }
  | { kind: 'nudge'; dx: number; dy: number }
  | { kind: 'tool'; tool: ToolId };

export interface KeyLike {
  key: string;
  metaKey: boolean;
  ctrlKey: boolean;
  shiftKey: boolean;
  altKey: boolean;
}

export function resolveShortcut(e: KeyLike): Command | null {
  const mod = e.metaKey || e.ctrlKey;
  const k = e.key.length === 1 ? e.key.toLowerCase() : e.key;
  if (mod) {
    if (k === 'z') return e.shiftKey ? { kind: 'redo' } : { kind: 'undo' };
    if (k === 'y') return { kind: 'redo' };
    if (k === 'c') return { kind: 'copy' };
    if (k === 'x') return { kind: 'cut' };
    if (k === 'v') return { kind: 'paste' };
    if (k === 'a') return { kind: 'selectAll' };
    return null;
  }
  if (e.altKey) return null;
  switch (k) {
    case 'Delete':
    case 'Backspace':
      return { kind: 'delete' };
    case 'Escape':
      return { kind: 'escape' };
    case 'm':
      return { kind: 'mirror' };
    case '0':
      return { kind: 'fit' };
    case 'p':
      return { kind: 'togglePlay' };
    case ',':
      return { kind: 'stepAngle', deg: -5 };
    case '.':
      return { kind: 'stepAngle', deg: 5 };
    // Shift+, / Shift+. は多くのキー配列(US・JIS)で < / > として届く
    case '<':
      return { kind: 'stepAngle', deg: -15 };
    case '>':
      return { kind: 'stepAngle', deg: 15 };
    case 'ArrowLeft':
      return { kind: 'nudge', dx: e.shiftKey ? -10 : -1, dy: 0 };
    case 'ArrowRight':
      return { kind: 'nudge', dx: e.shiftKey ? 10 : 1, dy: 0 };
    case 'ArrowUp':
      return { kind: 'nudge', dx: 0, dy: e.shiftKey ? 10 : 1 };
    case 'ArrowDown':
      return { kind: 'nudge', dx: 0, dy: e.shiftKey ? -10 : -1 };
  }
  for (const [tool, key] of Object.entries(TOOL_KEYS) as [ToolId, string][]) {
    if (k === key.toLowerCase()) return { kind: 'tool', tool };
  }
  return null;
}

/* ------------------------------------------------------------------------------------------------
 * (追加:guide ストリーム)ショートカットの一覧表。操作一覧(? キー)はこの表から作る。
 * resolveShortcut は変えていない。表と resolveShortcut が食い違わないことは
 * src/guide/shortcuts.test.ts が、すべてのキーと修飾キーの組み合わせで確かめる。
 * ---------------------------------------------------------------------------------------------- */

/** 一覧での見出しのまとまり */
export type ShortcutGroup = 'tool' | 'edit' | 'view';

/**
 * キーの割り当て 1 つ。同じ id の割り当ては一覧で 1 行にまとめる(id は文言のキーにも使う)。
 * key は KeyboardEvent.key(1 文字のキーは大文字小文字を区別しない)。
 * mod は ⌘(Mac)または Ctrl。shift を省略したものは Shift の有無を問わない。
 */
export interface ShortcutBinding {
  id: string;
  group: ShortcutGroup;
  key: string;
  mod?: boolean;
  shift?: boolean;
  command: Command;
}

const TOOL_ORDER: ToolId[] = ['select', 'link', 'fixed', 'crank', 'foot', 'delete'];

export const SHORTCUTS: readonly ShortcutBinding[] = [
  ...TOOL_ORDER.map((tool): ShortcutBinding => ({
    id: `tool.${tool}`,
    group: 'tool',
    key: TOOL_KEYS[tool],
    command: { kind: 'tool', tool },
  })),
  { id: 'undo', group: 'edit', key: 'z', mod: true, shift: false, command: { kind: 'undo' } },
  { id: 'redo', group: 'edit', key: 'z', mod: true, shift: true, command: { kind: 'redo' } },
  { id: 'redo', group: 'edit', key: 'y', mod: true, command: { kind: 'redo' } },
  { id: 'copy', group: 'edit', key: 'c', mod: true, command: { kind: 'copy' } },
  { id: 'cut', group: 'edit', key: 'x', mod: true, command: { kind: 'cut' } },
  { id: 'paste', group: 'edit', key: 'v', mod: true, command: { kind: 'paste' } },
  { id: 'selectAll', group: 'edit', key: 'a', mod: true, command: { kind: 'selectAll' } },
  { id: 'delete', group: 'edit', key: 'Delete', command: { kind: 'delete' } },
  { id: 'delete', group: 'edit', key: 'Backspace', command: { kind: 'delete' } },
  { id: 'mirror', group: 'edit', key: 'm', command: { kind: 'mirror' } },
  { id: 'escape', group: 'edit', key: 'Escape', command: { kind: 'escape' } },
  ...(
    [
      ['ArrowLeft', -1, 0],
      ['ArrowRight', 1, 0],
      ['ArrowUp', 0, 1],
      ['ArrowDown', 0, -1],
    ] as const
  ).flatMap(([key, dx, dy]): ShortcutBinding[] => [
    { id: 'nudge', group: 'edit', key, shift: false, command: { kind: 'nudge', dx, dy } },
    {
      id: 'nudgeFar',
      group: 'edit',
      key,
      shift: true,
      command: { kind: 'nudge', dx: dx * 10, dy: dy * 10 },
    },
  ]),
  { id: 'togglePlay', group: 'view', key: 'p', command: { kind: 'togglePlay' } },
  { id: 'step', group: 'view', key: ',', command: { kind: 'stepAngle', deg: -5 } },
  { id: 'step', group: 'view', key: '.', command: { kind: 'stepAngle', deg: 5 } },
  { id: 'stepFar', group: 'view', key: '<', command: { kind: 'stepAngle', deg: -15 } },
  { id: 'stepFar', group: 'view', key: '>', command: { kind: 'stepAngle', deg: 15 } },
  { id: 'fit', group: 'view', key: '0', command: { kind: 'fit' } },
];
