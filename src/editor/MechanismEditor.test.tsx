// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { createEmptyDesign } from '@/core/model/types';
import { fourBar, jansenLeg } from '@/core/model/presets';
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

  it('shows the Grashof type, stride/lift dimensions and the walking direction', () => {
    const { container } = render(<MechanismEditor />);
    expect(container.querySelector('.ed-chip')?.textContent).toBe(t('editor.grashof.crank-rocker'));
    expect(container.querySelector('.ed-contact')).not.toBeNull();
    const labels = [...container.querySelectorAll('.ed-dim-label')].map((e) => e.textContent);
    expect(labels.some((l) => l?.startsWith(t('analysis.metric.stride')))).toBe(true);
    expect(labels.some((l) => l?.startsWith(t('analysis.metric.lift')))).toBe(true);
    // Jansen preset (rpm < 0) walks toward +x
    expect(container.querySelector('.ed-walk-label')?.textContent).toBe(
      t('analysis.metric.direction.forward'),
    );
  });

  it('marks problem links red and draws the unreachable part of the curve', () => {
    act(() => S().replaceDesign(fourBar(28, 35, 30, 40)));
    const { container } = render(<MechanismEditor />);
    expect(container.querySelector('.ed-link.is-problem')).not.toBeNull();
    expect(container.querySelector('.ed-traj-fail')).not.toBeNull();
    expect(screen.getAllByText(/一回転できません/).length).toBeGreaterThan(0);
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

  it('writes the leg layout into the design and previews every leg', () => {
    const { container } = render(<MechanismEditor />);
    const count = screen.getByLabelText(t('editor.legs.count')) as HTMLInputElement;
    fireEvent.change(count, { target: { value: '3' } });
    expect(S().design.legs.count).toBe(3);
    const mirror = screen.getByLabelText(t('editor.legs.mirror')) as HTMLInputElement;
    fireEvent.click(mirror);
    expect(S().design.legs.mirrorX).toBe(true);
    expect(container.querySelectorAll('.ed-legs-preview circle').length).toBe(6);
  });

  it('sets a bar length from the numeric input', () => {
    act(() => S().setSelection({ joints: [], links: ['crank'] }));
    render(<MechanismEditor />);
    const input = screen.getByLabelText(t('editor.sel.length')) as HTMLInputElement;
    fireEvent.change(input, { target: { value: '12' } });
    fireEvent.keyDown(input, { key: 'Enter' });
    const d = S().design;
    const o = d.joints.find((j) => j.id === 'O')!;
    const a = d.joints.find((j) => j.id === 'A')!;
    expect(Math.hypot(a.x - o.x, a.y - o.y)).toBeCloseTo(12, 6);
  });
});
