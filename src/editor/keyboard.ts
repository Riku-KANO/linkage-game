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
      return { kind: 'stepAngle', deg: e.shiftKey ? -15 : -5 };
    case '.':
      return { kind: 'stepAngle', deg: e.shiftKey ? 15 : 5 };
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
