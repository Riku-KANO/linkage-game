// @vitest-environment jsdom
import { Profiler, useState } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { registerSfx, type SfxName } from '@/audio/sfx';
import {
  dismissNotice,
  LiveRunHud,
  NOTICE_DURATION,
  NOTICE_EXIT_MS,
  NoticeStack,
  RunHud,
  UNLOCK_DURATION,
  type HudNotice,
  type RunHudFrame,
  type RunHudProps,
  type RunHudSource,
} from './index';

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

const advance = (ms: number) =>
  act(() => {
    vi.advanceTimersByTime(ms);
  });

/** 親が列を持つ(本番の flow と同じ形) */
function Harness({ initial, rm = false }: { initial: HudNotice[]; rm?: boolean }) {
  const [list, setList] = useState(initial);
  return (
    <NoticeStack
      notices={list}
      onDismiss={(id) => setList((l) => dismissNotice(l, id))}
      reducedMotion={rm}
    />
  );
}

const info: HudNotice = { id: 'a', key: 'model.share.copied', severity: 'info' };
const error: HudNotice = { id: 'e', key: 'model.load.corrupt', severity: 'error' };
const chapter: HudNotice = {
  id: 'u',
  key: 'game.unlock.chapter',
  params: { chapter: 2, title: '段差を越える' },
  severity: 'success',
  unlock: 'chapter',
};
const part: HudNotice = {
  id: 'p',
  key: 'game.unlock.part',
  params: { part: 'ギア' },
  severity: 'success',
  unlock: 'part',
  part: 'gear',
};

describe('NoticeStack', () => {
  it('文言を出し、時間が来たら消える(消える動きのあとで外す)', () => {
    render(<Harness initial={[info]} />);
    const region = screen.getByRole('region', { name: 'お知らせ' });
    expect(region.querySelector('[aria-live="polite"]')).toBeTruthy();
    expect(screen.getByText('共有リンクをコピーしました')).toBeTruthy();
    advance(NOTICE_DURATION.info! - 50);
    expect(screen.queryByText('共有リンクをコピーしました')).toBeTruthy();
    advance(100);
    expect(document.querySelector('.hud-notice[data-leaving]')).toBeTruthy();
    advance(NOTICE_EXIT_MS + 10);
    expect(screen.queryByText('共有リンクをコピーしました')).toBeNull();
  });

  it('マウスを乗せている間は止まり、離すと残りから数える', () => {
    render(<Harness initial={[info]} rm />);
    const card = document.querySelector('.hud-notice')!;
    advance(1000);
    fireEvent.pointerEnter(card);
    expect(card.hasAttribute('data-paused')).toBe(true);
    advance(NOTICE_DURATION.info! * 3);
    expect(screen.queryByText('共有リンクをコピーしました')).toBeTruthy();
    fireEvent.pointerLeave(card);
    advance(NOTICE_DURATION.info! - 1000 - 50);
    expect(screen.queryByText('共有リンクをコピーしました')).toBeTruthy();
    advance(100);
    // 動きの軽減ではすぐ外す
    expect(screen.queryByText('共有リンクをコピーしました')).toBeNull();
  });

  it('フォーカスがある間も止まる', () => {
    render(<Harness initial={[info]} rm />);
    const close = screen.getByRole('button', { name: '閉じる' });
    act(() => close.focus());
    advance(NOTICE_DURATION.info! * 2);
    expect(screen.queryByText('共有リンクをコピーしました')).toBeTruthy();
    act(() => close.blur());
    advance(NOTICE_DURATION.info! + 10);
    expect(screen.queryByText('共有リンクをコピーしました')).toBeNull();
  });

  it('エラーは role="alert" で、閉じるまで残る。警告音', () => {
    render(<Harness initial={[error]} rm />);
    expect(screen.getByRole('alert').textContent).toContain('ファイルが壊れているか');
    expect(sounds).toEqual(['error']);
    advance(60_000);
    expect(screen.queryByRole('alert')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: '閉じる' }));
    expect(screen.queryByRole('alert')).toBeNull();
  });

  it('解放は飾りつき(章は錠、部品はアイコン)で「カチッ」と鳴り、少し長く残る', () => {
    render(<Harness initial={[chapter, part]} rm />);
    const cards = document.querySelectorAll('.hud-notice[data-unlock]');
    expect(cards).toHaveLength(2);
    expect(cards[0]!.textContent).toContain('解放 · 新しい章');
    expect(cards[0]!.textContent).toContain('第 2 章「段差を越える」が解放されました');
    expect(cards[0]!.querySelector('.hud-icon--lock')).toBeTruthy();
    expect(cards[1]!.querySelector('.hud-part--gear')).toBeTruthy();
    expect(sounds).toEqual(['snap', 'snap']);
    advance(NOTICE_DURATION.success! + 100);
    expect(document.querySelectorAll('.hud-notice')).toHaveLength(2);
    advance(UNLOCK_DURATION - NOTICE_DURATION.success!);
    expect(document.querySelectorAll('.hud-notice')).toHaveLength(0);
  });

  it('効果音を切れる', () => {
    render(<NoticeStack notices={[chapter]} onDismiss={() => {}} sound={false} reducedMotion />);
    expect(sounds).toEqual([]);
  });
});

describe('RunHud', () => {
  const props = (over: Partial<RunHudProps> = {}): RunHudProps => ({
    elapsed: 12.34,
    timeLimit: 30,
    distance: 1.2,
    goalDistance: 3,
    motorLoad: 0.42,
    onBackToDesign: vi.fn(),
    reducedMotion: true,
    ...over,
  });

  it('時間・距離・ゴールまでの進み具合・負荷を出す', () => {
    render(<RunHud {...props()} />);
    expect(screen.getByRole('timer', { name: '時間' }).textContent).toContain('12.3/ 30');
    const bar = screen.getByRole('progressbar', { name: '距離' });
    expect(bar.getAttribute('aria-valuenow')).toBe('40');
    expect(bar.getAttribute('aria-valuetext')).toBe('ゴールまで 40%');
    expect(screen.getByText('1.20 / 3.00 m')).toBeTruthy();
    const load = screen.getByRole('meter', { name: 'モーター負荷' });
    expect(load.getAttribute('aria-valuenow')).toBe('42');
    expect(load.getAttribute('data-level')).toBe('low');
    const fill = document.querySelector<HTMLElement>('.hud-track__fill')!;
    expect(fill.style.transform).toBe('scaleX(0.4)');
  });

  it('残り時間が少ないと注意、停動の負荷、状態の札', () => {
    render(<RunHud {...props({ elapsed: 27, motorLoad: 1.3, badges: ['stalled', 'fallen'] })} />);
    expect(screen.getByRole('timer').getAttribute('data-level')).toBe('low');
    const load = screen.getByRole('meter', { name: 'モーター負荷' });
    expect(load.getAttribute('data-level')).toBe('stall');
    expect(load.getAttribute('aria-valuenow')).toBe('100');
    expect(load.getAttribute('aria-valuetext')).toBe('130%');
    const status = screen.getByRole('status');
    expect([...status.querySelectorAll('.hud-badge')].map((b) => b.textContent)).toEqual([
      '停動',
      '転倒',
    ]);
  });

  it('後退は 0%、ゴーストの印、設計に戻る', () => {
    const onBackToDesign = vi.fn();
    render(
      <RunHud
        {...props({ distance: -0.3, ghostDistance: 2.4, onBackToDesign, backShortcut: 'Esc' })}
      />,
    );
    expect(screen.getByRole('progressbar').getAttribute('aria-valuenow')).toBe('0');
    expect(screen.getByText('-0.30 / 3.00 m')).toBeTruthy();
    expect(document.querySelector('.hud-track__ghost')).toBeTruthy();
    const back = screen.getByRole('button', { name: /設計に戻る/ });
    expect(back.getAttribute('aria-keyshortcuts')).toBe('Esc');
    fireEvent.click(back);
    expect(onBackToDesign).toHaveBeenCalledTimes(1);
  });
});

describe('LiveRunHud', () => {
  /** 試走の進行役の代わり:emit で値を変えて購読者を呼ぶ */
  function fakeSource(initial: RunHudFrame) {
    let frame = initial;
    const listeners = new Set<() => void>();
    const source: RunHudSource = {
      read: () => frame,
      subscribe: (cb) => {
        listeners.add(cb);
        return () => listeners.delete(cb);
      },
    };
    const emit = (f: RunHudFrame) => {
      frame = f;
      act(() => listeners.forEach((l) => l()));
    };
    return { source, emit, listeners };
  }

  it('毎フレームの値は React を描き直さずに書き換え、札・ゴーストが変わったときだけ描き直す', () => {
    const { source, emit, listeners } = fakeSource({ elapsed: 0, distance: 0, motorLoad: 0 });
    let commits = 0;
    const r = render(
      <Profiler id="hud" onRender={() => commits++}>
        <LiveRunHud
          source={source}
          timeLimit={30}
          goalDistance={3}
          onBackToDesign={vi.fn()}
          backShortcut="Esc"
          reducedMotion
        />
      </Profiler>,
    );
    expect(screen.getByRole('timer').textContent).toContain('0.0/ 30');
    const base = commits;

    emit({ elapsed: 12.34, distance: 1.2, motorLoad: 0.42 });
    expect(commits).toBe(base);
    expect(screen.getByRole('timer', { name: '時間' }).textContent).toContain('12.3/ 30');
    const bar = screen.getByRole('progressbar', { name: '距離' });
    expect(bar.getAttribute('aria-valuenow')).toBe('40');
    expect(bar.getAttribute('aria-valuetext')).toBe('ゴールまで 40%');
    expect(screen.getByText('1.20 / 3.00 m')).toBeTruthy();
    const load = screen.getByRole('meter', { name: 'モーター負荷' });
    expect(load.getAttribute('aria-valuenow')).toBe('42');
    expect(load.textContent).toContain('42%');
    expect(document.querySelector<HTMLElement>('.hud-track__fill')!.style.transform).toBe(
      'scaleX(0.4)',
    );
    expect(document.querySelector('.hud-track__ghost')).toBeNull();

    // 残り時間・停動の負荷・札・ゴーストの印
    emit({
      elapsed: 27,
      distance: 1.5,
      motorLoad: 1.3,
      badges: ['stalled'],
      ghostDistance: 2.4,
    });
    expect(commits).toBeGreaterThan(base);
    expect(screen.getByRole('timer').getAttribute('data-level')).toBe('low');
    expect(load.getAttribute('data-level')).toBe('stall');
    expect(load.getAttribute('aria-valuenow')).toBe('100');
    expect(load.getAttribute('aria-valuetext')).toBe('130%');
    expect(screen.getByRole('status').textContent).toBe('停動');
    const ghostRail = () => document.querySelector<HTMLElement>('[data-live="ghost"]')!;
    expect(ghostRail().style.transform).toBe('translateX(80%)');

    const after = commits;
    emit({
      elapsed: 27.5,
      distance: -0.3,
      motorLoad: 0.5,
      badges: ['stalled'],
      ghostDistance: 2.7,
    });
    expect(commits).toBe(after);
    expect(ghostRail().style.transform).toBe('translateX(90%)');
    expect(bar.getAttribute('aria-valuenow')).toBe('0');
    expect(screen.getByText('-0.30 / 3.00 m')).toBeTruthy();
    expect(screen.getByRole('timer').textContent).toContain('27.5/ 30');

    fireEvent.click(screen.getByRole('button', { name: /設計に戻る/ }));
    r.unmount();
    expect(listeners.size).toBe(0);
  });
});
