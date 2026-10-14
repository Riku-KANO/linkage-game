import { describe, expect, it } from 'vitest';
import {
  resolveShortcut,
  SHORTCUTS,
  TOOL_KEYS,
  type Command,
  type KeyLike,
  type ShortcutBinding,
} from '@/editor/keyboard';
import { hasKey } from '@/i18n';
import { bindingCombo, isHelpKey, keyLabel, shortcutRows, SHEET_GROUPS } from './shortcuts';

const press = (key: string, mods: Partial<KeyLike> = {}): KeyLike => ({
  key,
  metaKey: false,
  ctrlKey: false,
  shiftKey: false,
  altKey: false,
  ...mods,
});

/** 割り当てどおりに押したときの KeyboardEvent(mod は ⌘ と Ctrl、shift 省略は有無の両方) */
function eventsFor(b: ShortcutBinding): KeyLike[] {
  const mods: Partial<KeyLike>[] = b.mod ? [{ metaKey: true }, { ctrlKey: true }] : [{}];
  const shifts = b.shift === undefined ? [false, true] : [b.shift];
  const keys = b.key.length === 1 ? [b.key.toLowerCase(), b.key.toUpperCase()] : [b.key];
  return mods.flatMap((m) =>
    shifts.flatMap((shiftKey) => keys.map((k) => press(k, { ...m, shiftKey }))),
  );
}

const norm = (k: string) => (k.length === 1 ? k.toLowerCase() : k);

/** キーボードで起こりうるキー(1 文字のキーと名前つきのキー) */
const UNIVERSE: string[] = [
  ...'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789',
  ...',./;\'[]\\-=`<>?:"{}|_+~!@#$%^&*() ',
  'Delete',
  'Backspace',
  'Escape',
  'Enter',
  'Tab',
  'ArrowLeft',
  'ArrowRight',
  'ArrowUp',
  'ArrowDown',
  'Home',
  'End',
  'PageUp',
  'PageDown',
  'F1',
  'F5',
];

describe('操作一覧はエディタのショートカット表から作る(GUIDE-3)', () => {
  it('表の割り当てはどれも、エディタがそのコマンドとして解釈する', () => {
    for (const b of SHORTCUTS) {
      for (const e of eventsFor(b)) {
        expect(resolveShortcut(e), `${b.id} ${JSON.stringify(e)}`).toEqual(b.command);
      }
    }
  });

  it('エディタが反応するキーの組み合わせは、すべて一覧に載っている', () => {
    let handled = 0;
    for (const key of UNIVERSE) {
      for (let m = 0; m < 16; m++) {
        const e = press(key, {
          metaKey: !!(m & 1),
          ctrlKey: !!(m & 2),
          shiftKey: !!(m & 4),
          altKey: !!(m & 8),
        });
        const cmd: Command | null = resolveShortcut(e);
        if (!cmd) continue;
        handled++;
        const mod = e.metaKey || e.ctrlKey;
        const listed = SHORTCUTS.some(
          (b) =>
            norm(b.key) === norm(key) &&
            !!b.mod === mod &&
            (b.shift === undefined || b.shift === e.shiftKey) &&
            JSON.stringify(b.command) === JSON.stringify(cmd),
        );
        expect(listed, `一覧にない: ${JSON.stringify(e)} → ${JSON.stringify(cmd)}`).toBe(true);
      }
    }
    expect(handled).toBeGreaterThan(50);
  });

  it('道具のキーはすべて一覧の「道具」にある', () => {
    const rows = shortcutRows(false).filter((r) => r.group === 'tool');
    const caps = rows.flatMap((r) => r.combos.flat());
    for (const k of Object.values(TOOL_KEYS)) expect(caps).toContain(k);
  });

  it('すべての行と見出しに文言がある', () => {
    for (const row of shortcutRows(true)) expect(hasKey(row.labelKey), row.labelKey).toBe(true);
    for (const g of SHEET_GROUPS) expect(hasKey(`guide.keys.group.${g}`), g).toBe(true);
  });

  it('同じ id の割り当ては 1 行にまとまり、修飾キーは Mac とそれ以外で書き分ける', () => {
    const redo = shortcutRows(true).find((r) => r.id === 'redo')!;
    expect(redo.combos).toEqual([
      ['⌘', 'Shift', 'Z'],
      ['⌘', 'Y'],
    ]);
    const undo = shortcutRows(false).find((r) => r.id === 'undo')!;
    expect(undo.combos).toEqual([['Ctrl', 'Z']]);
    const nudge = shortcutRows(false).find((r) => r.id === 'nudge')!;
    expect(nudge.combos).toEqual([['←'], ['→'], ['↑'], ['↓']]);
    const ids = shortcutRows(false).map((r) => r.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('キーキャップの表記', () => {
    expect(keyLabel('Escape')).toBe('Esc');
    expect(keyLabel('m')).toBe('M');
    expect(keyLabel(',')).toBe(',');
    expect(
      bindingCombo(
        { id: 'x', group: 'edit', key: 'c', mod: true, command: { kind: 'copy' } },
        false,
      ),
    ).toEqual(['Ctrl', 'C']);
  });

  it('? キーで一覧を開く(修飾キーつきは除く)', () => {
    expect(isHelpKey(press('?', { shiftKey: true }))).toBe(true);
    expect(isHelpKey(press('?', { ctrlKey: true }))).toBe(false);
    expect(isHelpKey(press('/'))).toBe(false);
    expect(resolveShortcut(press('?', { shiftKey: true }))).toBeNull();
  });
});
