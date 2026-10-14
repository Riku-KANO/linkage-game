// @vitest-environment jsdom
import { afterEach, beforeAll, describe, expect, it } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import SimPlayground from './SimPlayground';

/** どんな描画命令も受け付ける 2D コンテキストの代役(jsdom には canvas がない) */
function fakeContext(): CanvasRenderingContext2D {
  const calls = { count: 0 };
  const target: Record<string | symbol, unknown> = {};
  return new Proxy(target, {
    get(t, key) {
      if (key in t) return t[key];
      return () => {
        calls.count++;
      };
    },
    set(t, key, value) {
      t[key] = value;
      return true;
    },
  }) as unknown as CanvasRenderingContext2D;
}

beforeAll(() => {
  Object.defineProperty(HTMLCanvasElement.prototype, 'getContext', {
    configurable: true,
    value: () => fakeContext(),
  });
});
afterEach(() => cleanup());

const timeText = () => {
  const cell = screen.getByText('時刻').nextElementSibling;
  return Number.parseFloat(cell?.textContent ?? 'NaN');
};

describe('SimPlayground(?dev=sim)', () => {
  it('runs the simulation, draws, and survives every control', async () => {
    render(<SimPlayground />);
    await waitFor(() => expect(timeText()).toBeGreaterThan(0.05), { timeout: 5000 });
    expect(screen.getByText(/トルク計/)).toBeTruthy();

    for (const b of screen.getAllByRole('button')) fireEvent.click(b);
    const [preset, terrain] = screen.getAllByRole('combobox') as HTMLSelectElement[];
    for (const opt of Array.from(preset!.options)) {
      fireEvent.change(preset!, { target: { value: opt.value } });
    }
    for (const opt of Array.from(terrain!.options)) {
      fireEvent.change(terrain!, { target: { value: opt.value } });
    }
    const [rpm, stall] = screen.getAllByRole('spinbutton') as HTMLInputElement[];
    fireEvent.change(rpm!, { target: { value: '80' } });
    fireEvent.change(stall!, { target: { value: '5' } });
    // after the last terrain is ready the machine runs again from t = 0
    fireEvent.click(screen.getByText('再生'));
    await waitFor(() => expect(timeText()).toBeGreaterThan(0.05), { timeout: 5000 });
    expect(Number.isFinite(timeText())).toBe(true);
  });
});
