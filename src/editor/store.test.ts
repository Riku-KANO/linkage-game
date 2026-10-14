import { beforeEach, describe, expect, it } from 'vitest';
import { fourBar, jansenLeg } from '@/core/model/presets';
import { useEditor } from './store';
import { moveJoints, setMotorRpm } from './ops';
import {
  copySelection,
  cutSelection,
  deleteSelection,
  mirrorCurrent,
  nudgeSelection,
  pasteClipboard,
  selectAll,
} from './commands';

const S = () => useEditor.getState();

describe('editor store', () => {
  beforeEach(() => {
    S().replaceDesign(fourBar());
    S().setClipboard(null);
  });

  it('keeps the design/replaceDesign contract', () => {
    const j = jansenLeg();
    S().replaceDesign(j);
    expect(S().design).toBe(j);
    expect(S().history.past).toHaveLength(0);
  });

  it('commits, undoes and redoes', () => {
    const d0 = S().design;
    S().commit(setMotorRpm(d0, 60));
    expect(S().design.motor.rpm).toBe(60);
    S().undo();
    expect(S().design).toBe(d0);
    S().redo();
    expect(S().design.motor.rpm).toBe(60);
  });

  it('coalesces a drag (many commits with one group) into one undo step', () => {
    const d0 = S().design;
    for (let i = 1; i <= 20; i++)
      S().commit(moveJoints(d0, ['A'], i * 0.5, 0), { group: 'drag:1' });
    S().seal();
    expect(S().history.past).toHaveLength(1);
    S().undo();
    expect(S().design).toBe(d0);
  });

  it('survives an external setState of design (treated as an undoable edit)', () => {
    const d0 = S().design;
    const ext = setMotorRpm(d0, 10);
    useEditor.setState({ design: ext });
    S().commit(setMotorRpm(ext, 20));
    S().undo();
    expect(S().design).toBe(ext);
    S().undo();
    expect(S().design).toBe(d0);
  });

  it('drops stale ids from the selection after undo', () => {
    const d0 = S().design;
    S().setSelection({ joints: ['A'], links: ['crank'] });
    expect(S().selection.joints).toEqual(['A']);
    S().setSelection({ joints: ['nope'], links: [] });
    expect(S().selection.joints).toEqual([]);
    S().setSelection({ joints: ['F'], links: [] });
    deleteSelection();
    expect(S().design.joints.find((j) => j.id === 'F')).toBeUndefined();
    S().undo();
    expect(S().design).toBe(d0);
  });

  it('copy / paste remaps ids and offsets', () => {
    selectAll();
    expect(copySelection()).toBe(true);
    expect(pasteClipboard()).toBe(true);
    const d = S().design;
    expect(d.joints).toHaveLength(10);
    expect(S().selection.joints).toHaveLength(5);
    expect(new Set(d.joints.map((j) => j.id)).size).toBe(10);
    // second paste lands further away
    pasteClipboard();
    expect(S().design.joints).toHaveLength(15);
    const xs = S().selection.joints.map((id) => S().design.joints.find((j) => j.id === id)!.x);
    expect(Math.min(...xs)).toBe(10);
  });

  it('cut removes the selection and keeps it on the clipboard', () => {
    S().setSelection({ joints: ['F'], links: [] });
    expect(cutSelection()).toBe(true);
    expect(S().clipboard?.joints).toHaveLength(1);
    expect(S().design.joints).toHaveLength(4);
  });

  it('mirror and nudge are undoable', () => {
    const d0 = S().design;
    mirrorCurrent();
    expect(S().design).not.toBe(d0);
    S().undo();
    expect(S().design).toBe(d0);
    S().setSelection({ joints: ['A'], links: [] });
    nudgeSelection(1, 0);
    nudgeSelection(1, 0);
    S().seal();
    expect(S().design.joints.find((j) => j.id === 'A')!.x).toBe(2);
    S().undo();
    expect(S().design).toBe(d0);
  });
});
