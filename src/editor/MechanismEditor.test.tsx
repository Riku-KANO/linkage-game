// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { createEmptyDesign } from '@/core/model/types';
import { jansenLeg } from '@/core/model/presets';
import { t } from '@/i18n';
import { MechanismEditor, useEditor } from './index';

const S = () => useEditor.getState();

function svg(container: HTMLElement) {
  return container.querySelector('svg.ed-svg') as SVGSVGElement;
}

function drag(el: Element, from: [number, number], to: [number, number]) {
  fireEvent.pointerDown(el, { clientX: from[0], clientY: from[1], button: 0, pointerId: 1 });
  fireEvent.pointerMove(el, {
    clientX: (from[0] + to[0]) / 2,
    clientY: (from[1] + to[1]) / 2,
    pointerId: 1,
  });
  fireEvent.pointerMove(el, { clientX: to[0], clientY: to[1], pointerId: 1 });
  fireEvent.pointerUp(el, { clientX: to[0], clientY: to[1], button: 0, pointerId: 1 });
}

describe('MechanismEditor (smoke)', () => {
  beforeEach(() => {
    act(() => {
      S().replaceDesign(jansenLeg());
      S().setTool('select');
    });
  });
  afterEach(cleanup);

  it('renders the Jansen leg with a DOF-1 badge, trajectories and panels', () => {
    const { container } = render(<MechanismEditor budget={100} />);
    expect(screen.getAllByText(/自由度 1/).length).toBeGreaterThan(0);
    expect(container.querySelectorAll('.ed-link').length).toBe(7);
    expect(container.querySelector('.ed-traj-foot')).not.toBeNull();
    expect(container.querySelectorAll('.ed-live-link').length).toBe(7);
    expect(screen.getByText(t('editor.bill.title'))).toBeTruthy();
    // budget 100 is below the Jansen leg cost → warning
    expect(screen.getByRole('alert').textContent).toMatch(/予算/);
  });

  it('draws a bar with the link tool and undoes it with Ctrl+Z', () => {
    act(() => S().replaceDesign(createEmptyDesign()));
    const { container } = render(<MechanismEditor />);
    act(() => S().setTool('link'));
    const el = svg(container);
    // blank design → camera centered on the origin at (400, 300) in the 800×600 fallback
    drag(el, [400, 300], [500, 300]);
    expect(S().design.links).toHaveLength(1);
    expect(S().design.joints).toHaveLength(2);
    // second bar from the end of the first one is pinned to it
    drag(el, [500, 300], [500, 200]);
    expect(S().design.links).toHaveLength(2);
    expect(S().design.joints).toHaveLength(3);
    const root = container.querySelector('.ed-root') as HTMLElement;
    fireEvent.keyDown(root, { key: 'z', ctrlKey: true });
    expect(S().design.links).toHaveLength(1);
    fireEvent.keyDown(root, { key: 'z', ctrlKey: true, shiftKey: true });
    expect(S().design.links).toHaveLength(2);
  });

  it('switches tools with hotkeys and respects allowedParts', () => {
    const { container } = render(<MechanismEditor allowedParts={['link', 'pin']} />);
    const root = container.querySelector('.ed-root') as HTMLElement;
    fireEvent.keyDown(root, { key: 'l' });
    expect(S().tool).toBe('link');
    fireEvent.keyDown(root, { key: 'c' });
    expect(S().tool).toBe('link');
    fireEvent.keyDown(root, { key: 'v' });
    expect(S().tool).toBe('select');
  });

  it('drags a joint and coalesces the drag into one undo step', () => {
    const { container } = render(<MechanismEditor />);
    const before = S().design;
    const crankPin = before.joints.find((j) => j.id === 'A')!;
    // find where A is drawn
    const pins = [...container.querySelectorAll('.ed-joint .ed-pin')] as SVGCircleElement[];
    const idx = before.joints.findIndex((j) => j.id === 'A');
    const cx = Number(pins[idx]!.getAttribute('cx'));
    const cy = Number(pins[idx]!.getAttribute('cy'));
    drag(svg(container), [cx, cy], [cx + 30, cy - 30]);
    const after = S().design.joints.find((j) => j.id === 'A')!;
    expect(after.x).toBeGreaterThan(crankPin.x);
    expect(S().history.past).toHaveLength(1);
    act(() => S().undo());
    expect(S().design).toBe(before);
  });
});
