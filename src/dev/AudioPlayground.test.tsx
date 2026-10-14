// @vitest-environment jsdom
import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { getAudioStatus, uninstallAudio } from '@/audio';
import { useApp } from '@/app/store';
import AudioPlayground from './AudioPlayground';

afterEach(() => {
  cleanup();
  uninstallAudio();
  useApp.getState().setSettings({ volume: 0.8 });
});

describe('AudioPlayground(?dev=audio)', () => {
  it('Web Audio の無い環境でも描画でき、どのボタンを押しても落ちない', () => {
    render(<AudioPlayground />);
    const buttons = screen.getAllByRole('button');
    expect(buttons.length).toBeGreaterThanOrEqual(9);
    for (const b of buttons) {
      fireEvent.pointerDown(b);
      fireEvent.click(b);
      fireEvent.pointerUp(b);
    }
    fireEvent.keyDown(window, { key: '1' });
    expect(getAudioStatus()).toBe('unavailable');
  });

  it('音量スライダーは設定(useApp)の音量を動かす', () => {
    render(<AudioPlayground />);
    const sliders = screen.getAllByRole('slider');
    const master = sliders[sliders.length - 1]!;
    fireEvent.change(master, { target: { value: '0.3' } });
    expect(useApp.getState().settings.volume).toBeCloseTo(0.3);
  });
});
