// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { registerSfx, type SfxName } from '@/audio/sfx';
import { GearMeter } from './GearMeter';
import { LinkButton } from './LinkButton';
import { LinkagePanel } from './LinkagePanel';
import { PressStamp } from './PressStamp';

let sounds: SfxName[] = [];

beforeEach(() => {
  sounds = [];
  registerSfx((name) => sounds.push(name));
  vi.useFakeTimers({
    toFake: [
      'setTimeout',
      'clearTimeout',
      'requestAnimationFrame',
      'cancelAnimationFrame',
      'performance',
    ],
  });
});

afterEach(() => {
  cleanup();
  vi.useRealTimers();
  registerSfx(() => {});
});

/** 演出の時計を進める(rAF と React の更新を流す) */
const advance = (ms: number) =>
  act(() => {
    vi.advanceTimersByTime(ms);
  });

describe('LinkButton', () => {
  it('ポインターで押すと沈み、離すと戻る。音は press / release', () => {
    const onClick = vi.fn();
    render(<LinkButton onClick={onClick}>押す</LinkButton>);
    const btn = screen.getByRole('button', { name: '押す' });
    fireEvent.pointerDown(btn, { button: 0 });
    expect(btn.hasAttribute('data-pressed')).toBe(true);
    expect(sounds).toEqual(['press']);
    advance(100);
    const cap = btn.querySelector<HTMLElement>('.mech-btn__cap')!;
    expect(cap.style.transform).toMatch(/translateY\(4\.5px\)/);
    fireEvent.pointerUp(btn);
    fireEvent.click(btn);
    expect(btn.hasAttribute('data-pressed')).toBe(false);
    expect(sounds).toEqual(['press', 'release']);
    expect(onClick).toHaveBeenCalledTimes(1);
    advance(800);
    expect(cap.style.transform).toMatch(/translateY\(0px\)/);
  });

  it('キーボード(Space)でも沈む', () => {
    render(<LinkButton>押す</LinkButton>);
    const btn = screen.getByRole('button', { name: '押す' });
    fireEvent.keyDown(btn, { key: ' ' });
    expect(btn.hasAttribute('data-pressed')).toBe(true);
    fireEvent.keyUp(btn, { key: ' ' });
    expect(btn.hasAttribute('data-pressed')).toBe(false);
    expect(sounds).toEqual(['press', 'release']);
  });

  it('押したまま押せなくなったら戻る', () => {
    const { rerender } = render(<LinkButton>押す</LinkButton>);
    fireEvent.keyDown(screen.getByRole('button'), { key: 'Enter' });
    expect(screen.getByRole('button').hasAttribute('data-pressed')).toBe(true);
    rerender(<LinkButton disabled>押す</LinkButton>);
    expect(screen.getByRole('button').hasAttribute('data-pressed')).toBe(false);
  });

  it('押せないときは沈まず鳴らない', () => {
    render(<LinkButton disabled>押す</LinkButton>);
    fireEvent.pointerDown(screen.getByRole('button'), { button: 0 });
    expect(sounds).toEqual([]);
  });

  it('動きの軽減では即座に沈む', () => {
    render(<LinkButton reducedMotion>押す</LinkButton>);
    const btn = screen.getByRole('button');
    fireEvent.pointerDown(btn, { button: 0 });
    const cap = btn.querySelector<HTMLElement>('.mech-btn__cap')!;
    expect(cap.style.transform).toMatch(/translateY\(4\.5px\)/);
  });
});

/** 数字ドラムの帯の位置(% → 数字) */
const drumDigits = (root: HTMLElement) =>
  [...root.querySelectorAll<HTMLElement>('.mech-odo__strip')].map((el) => {
    const m = /translateY\((-?[\d.]+)%\)/.exec(el.style.transform);
    return m ? Math.round((-Number(m[1]) * 11) / 100) + 0 : NaN;
  });

describe('GearMeter', () => {
  it('回って、遅れて止まり、数字ドラムが値を示す。歯車の音が鳴る', () => {
    const onSettled = vi.fn();
    const { container } = render(
      <GearMeter
        value={12.4}
        max={25}
        decimals={1}
        unit="秒"
        delay={0.2}
        duration={1}
        onSettled={onSettled}
      />,
    );
    const root = container.querySelector<HTMLElement>('.mech-meter')!;
    expect(root.hasAttribute('data-settled')).toBe(false);
    expect(drumDigits(root)).toEqual([0, 0, 0]);
    advance(700);
    expect(root.hasAttribute('data-settled')).toBe(false);
    advance(800);
    expect(root.hasAttribute('data-settled')).toBe(true);
    expect(onSettled).toHaveBeenCalledTimes(1);
    expect(drumDigits(root)).toEqual([1, 2, 4]);
    expect(sounds.filter((s) => s === 'gear').length).toBeGreaterThan(0);
  });

  it('スキップと動きの軽減では即座に最終状態で、音は鳴らない', () => {
    for (const props of [{ skip: true }, { reducedMotion: true }]) {
      const onSettled = vi.fn();
      const { container, unmount } = render(
        <GearMeter value={7} max={10} onSettled={onSettled} {...props} />,
      );
      const root = container.querySelector<HTMLElement>('.mech-meter')!;
      expect(root.hasAttribute('data-settled')).toBe(true);
      expect(drumDigits(root)).toEqual([0, 7]);
      expect(onSettled).toHaveBeenCalledTimes(1);
      unmount();
    }
    expect(sounds).toEqual([]);
  });

  it('数字ドラムは表示の桁に丸めた値で止まる(半端な位置にならない)', () => {
    const { container } = render(<GearMeter value={236.5} max={300} decimals={0} skip />);
    expect(drumDigits(container.querySelector<HTMLElement>('.mech-meter')!)).toEqual([2, 3, 7]);
    for (const el of container.querySelectorAll<HTMLElement>('.mech-odo__strip')) {
      const m = /translateY\((-?[\d.]+)%\)/.exec(el.style.transform)!;
      const pos = (-Number(m[1]) * 11) / 100;
      expect(Math.abs(pos - Math.round(pos))).toBeLessThan(0.01);
    }
  });

  it('文字盤に金・銀・銅とメダルなしの帯、相手の針を描く', () => {
    const { container } = render(
      <GearMeter value={5} max={25} thresholds={[12, 16, 22]} ghostValue={14} skip />,
    );
    expect(container.querySelectorAll('.mech-meter__band')).toHaveLength(4);
    expect(container.querySelector('.mech-meter__ghost')).not.toBeNull();
  });
});

describe('PressStamp', () => {
  it('下りて刻印し(音は 1 回)、戻る', () => {
    const onStamp = vi.fn();
    const onDone = vi.fn();
    const { container } = render(
      <PressStamp medal="gold" glyph="金" duration={0.6} onStamp={onStamp} onDone={onDone} />,
    );
    const root = container.querySelector<HTMLElement>('.mech-press')!;
    expect(root.hasAttribute('data-stamped')).toBe(false);
    advance(100);
    expect(root.hasAttribute('data-stamped')).toBe(false);
    advance(300);
    expect(root.hasAttribute('data-stamped')).toBe(true);
    expect(sounds).toEqual(['stamp']);
    expect(onStamp).toHaveBeenCalledTimes(1);
    advance(400);
    expect(onDone).toHaveBeenCalledTimes(1);
    expect(sounds).toEqual(['stamp']);
    expect(root.textContent).toContain('金');
  });

  it('スキップでは刻印済み、armed=false では空の台座', () => {
    const { container, rerender } = render(<PressStamp medal="silver" glyph="銀" skip />);
    expect(container.querySelector('[data-stamped]')).not.toBeNull();
    rerender(<PressStamp key="b" medal={null} armed={false} />);
    expect(container.querySelector('[data-stamped]')).toBeNull();
    expect(container.querySelector('.mech-press__medal--blank')).not.toBeNull();
    expect(sounds).toEqual([]);
  });
});

describe('LinkagePanel', () => {
  it('上から開き、開ききったら onOpened', () => {
    const onOpened = vi.fn();
    const { container } = render(
      <LinkagePanel duration={0.5} onOpened={onOpened}>
        <p>中身</p>
      </LinkagePanel>,
    );
    const body = container.querySelector<HTMLElement>('.mech-panel__body')!;
    expect(body.style.clipPath).toMatch(/inset\(0(px)? 0(px)? 100%/);
    expect(screen.getByText('中身')).toBeTruthy();
    advance(700);
    expect(body.style.clipPath).toBe('');
    expect(onOpened).toHaveBeenCalledTimes(1);
    expect(container.querySelector('[data-opened]')).not.toBeNull();
  });

  it('開ききったあとにスキップしても onOpened は 1 回だけ', () => {
    const onOpened = vi.fn();
    const { rerender } = render(
      <LinkagePanel duration={0.2} onOpened={onOpened}>
        <p>中身</p>
      </LinkagePanel>,
    );
    advance(400);
    rerender(
      <LinkagePanel duration={0.2} onOpened={onOpened} skip>
        <p>中身</p>
      </LinkagePanel>,
    );
    expect(onOpened).toHaveBeenCalledTimes(1);
  });

  it('動きの軽減ではフェードだけで、最初から開いている', () => {
    const { container } = render(
      <LinkagePanel reducedMotion>
        <p>中身</p>
      </LinkagePanel>,
    );
    expect(container.querySelector('.mech-panel--fade')).not.toBeNull();
    expect(container.querySelector<HTMLElement>('.mech-panel__body')!.style.clipPath).toBe('');
  });

  it('閉じると畳まれて隠れる', () => {
    const onClosed = vi.fn();
    const { container, rerender } = render(
      <LinkagePanel skip>
        <p>中身</p>
      </LinkagePanel>,
    );
    rerender(
      <LinkagePanel open={false} duration={0.3} onClosed={onClosed}>
        <p>中身</p>
      </LinkagePanel>,
    );
    advance(500);
    expect(onClosed).toHaveBeenCalledTimes(1);
    const root = container.querySelector<HTMLElement>('.mech-panel')!;
    expect(root.getAttribute('aria-hidden')).toBe('true');
  });
});
