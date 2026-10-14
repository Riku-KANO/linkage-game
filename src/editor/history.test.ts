import { describe, expect, it } from 'vitest';
import { canRedo, canUndo, createHistory, record, redo, seal, undo } from './history';

describe('history', () => {
  it('undoes and redoes single edits', () => {
    let h = createHistory('a');
    h = record(h, 'b');
    h = record(h, 'c');
    expect(h.present).toBe('c');
    h = undo(h);
    expect(h.present).toBe('b');
    h = undo(h);
    expect(h.present).toBe('a');
    expect(canUndo(h)).toBe(false);
    h = undo(h);
    expect(h.present).toBe('a');
    h = redo(h);
    expect(h.present).toBe('b');
    h = redo(h);
    expect(h.present).toBe('c');
    expect(canRedo(h)).toBe(false);
  });

  it('a new edit clears the redo stack', () => {
    let h = createHistory(1);
    h = record(h, 2);
    h = undo(h);
    h = record(h, 3);
    expect(canRedo(h)).toBe(false);
    expect(h.past).toEqual([1]);
  });

  it('coalesces a drag into one entry', () => {
    let h = createHistory({ x: 0 });
    const g = 'drag-1';
    for (let x = 1; x <= 10; x++) h = record(h, { x }, g);
    h = seal(h);
    expect(h.past).toHaveLength(1);
    expect(h.present).toEqual({ x: 10 });
    h = undo(h);
    expect(h.present).toEqual({ x: 0 });
  });

  it('two drags in a row are two entries once sealed', () => {
    let h = createHistory(0);
    h = record(h, 1, 'drag');
    h = record(h, 2, 'drag');
    h = seal(h);
    h = record(h, 3, 'drag');
    h = seal(h);
    expect(h.past).toEqual([0, 2]);
  });

  it('ignores no-op edits', () => {
    const v = { a: 1 };
    let h = createHistory(v);
    h = record(h, v);
    expect(h.past).toHaveLength(0);
  });

  it('caps the history length', () => {
    let h = createHistory(0);
    for (let i = 1; i <= 50; i++) h = record(h, i, null, 10);
    expect(h.past).toHaveLength(10);
    expect(h.past[0]).toBe(40);
  });
});
