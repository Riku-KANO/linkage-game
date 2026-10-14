// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { registerSfx, type SfxName } from '@/audio/sfx';
import { decodeShare } from '@/core/model';
import { syntheticWalkGhost } from '@/core/model/ghostFixture';
import type { RunResult } from '@/game/types';
import { ResultPanel, type ResultPanelProps } from './index';
import {
  SAMPLE_CLEARED_MIXED,
  SAMPLE_DESIGN,
  SAMPLE_FAILED_FALL,
  SAMPLE_OPPONENT,
  SAMPLE_STAGE,
} from './samples';

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
  Reflect.deleteProperty(navigator, 'clipboard');
});

const advance = (ms: number) =>
  act(() => {
    vi.advanceTimersByTime(ms);
  });

function setup(over: Partial<ResultPanelProps> = {}, result: RunResult = SAMPLE_CLEARED_MIXED) {
  const cbs = {
    onRetry: vi.fn(),
    onBackToDesign: vi.fn(),
    onNext: vi.fn(),
    onReplayFall: vi.fn(),
  };
  const utils = render(
    <ResultPanel result={result} stage={SAMPLE_STAGE} design={SAMPLE_DESIGN} {...cbs} {...over} />,
  );
  const panel = utils.container.querySelector<HTMLElement>('.rs-panel')!;
  const meters = () => [...panel.querySelectorAll('.mech-meter')];
  const stamps = () => [...panel.querySelectorAll('.mech-press')];
  return { ...utils, ...cbs, panel, meters, stamps };
}

const settledCount = (els: Element[]) => els.filter((e) => e.hasAttribute('data-settled')).length;
const stampedCount = (els: Element[]) => els.filter((e) => e.hasAttribute('data-stamped')).length;

describe('ResultPanel(クリア)', () => {
  it('見出し・4 軸・行動のボタンが出て、ボタンはコールバックを呼ぶ', () => {
    const s = setup();
    expect(screen.getByRole('heading', { name: 'クリア!' })).toBeTruthy();
    for (const label of ['到達時間', '部品数', 'コスト', '消費エネルギー']) {
      expect(screen.getByRole('heading', { name: label })).toBeTruthy();
    }
    expect(screen.queryByRole('button', { name: /転倒の瞬間を見る/ })).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: /次のステージ/ }));
    fireEvent.click(screen.getByRole('button', { name: 'もう一度' }));
    fireEvent.click(screen.getByRole('button', { name: '設計に戻る' }));
    expect(s.onNext).toHaveBeenCalledTimes(1);
    expect(s.onRetry).toHaveBeenCalledTimes(1);
    expect(s.onBackToDesign).toHaveBeenCalledTimes(1);
  });

  it('メーターは順に止まり、そのあとメダルを刻印する', () => {
    const s = setup();
    expect(settledCount(s.meters())).toBe(0);
    advance(1700);
    const mid = settledCount(s.meters());
    expect(mid).toBeGreaterThan(0);
    expect(mid).toBeLessThan(4);
    expect(stampedCount(s.stamps())).toBe(0);
    advance(1500);
    expect(settledCount(s.meters())).toBe(4);
    advance(3000);
    expect(stampedCount(s.stamps())).toBe(4);
    expect(sounds.filter((n) => n === 'stamp')).toHaveLength(4);
    expect(sounds).toContain('gear');
    expect(sounds).toContain('success');
    // メダル:銀・金・銅・なし
    expect(s.stamps().map((e) => e.getAttribute('data-medal'))).toEqual([
      'silver',
      'gold',
      'bronze',
      'none',
    ]);
  });

  it('クリックでスキップすると最終状態に飛ぶ', () => {
    const s = setup();
    advance(100);
    fireEvent.pointerDown(s.panel);
    expect(settledCount(s.meters())).toBe(4);
    expect(stampedCount(s.stamps())).toBe(4);
    expect(s.panel.hasAttribute('data-done')).toBe(true);
  });

  it('キーでスキップできる(Tab はフォーカス移動のまま)', () => {
    const s = setup();
    fireEvent.keyDown(window, { key: 'Tab' });
    expect(settledCount(s.meters())).toBe(0);
    fireEvent.keyDown(window, { key: 'Escape' });
    expect(settledCount(s.meters())).toBe(4);
    expect(stampedCount(s.stamps())).toBe(4);
  });

  it('演出が終わると主な行動(次のステージ)にフォーカスする', () => {
    const s = setup();
    fireEvent.pointerDown(s.panel);
    expect(document.activeElement?.textContent).toContain('次のステージ');
  });

  it('動きの軽減ではすぐに最終状態で、歯車も刻印も鳴らない', () => {
    const s = setup({ reducedMotion: true });
    expect(settledCount(s.meters())).toBe(4);
    expect(stampedCount(s.stamps())).toBe(4);
    expect(s.panel.classList.contains('mech-panel--fade')).toBe(true);
    advance(400);
    expect(sounds.filter((n) => n === 'gear' || n === 'stamp')).toEqual([]);
  });

  it('短縮版は初回より早く終わる', () => {
    const s = setup({ short: true });
    advance(2400);
    expect(settledCount(s.meters())).toBe(4);
    expect(stampedCount(s.stamps())).toBe(4);
  });
});

describe('ResultPanel(失敗)', () => {
  it('失敗の見出し、原因の一言、進んだ距離、転倒の再生ボタン。次のステージはない', () => {
    const s = setup({}, SAMPLE_FAILED_FALL);
    expect(screen.getByRole('heading', { name: '失敗' })).toBeTruthy();
    expect(screen.getByText('転倒した')).toBeTruthy();
    expect(screen.getByText('進んだ距離 1.37 / 3.00 m')).toBeTruthy();
    expect(screen.queryByRole('button', { name: /次のステージ/ })).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: /転倒の瞬間を見る/ }));
    expect(s.onReplayFall).toHaveBeenCalledTimes(1);
    fireEvent.click(screen.getByRole('button', { name: '設計に戻る' }));
    expect(s.onBackToDesign).toHaveBeenCalledTimes(1);
  });

  it('原因のキーを渡せばその文言を出す', () => {
    setup({ reasonKey: 'result.reason.stalled' }, SAMPLE_FAILED_FALL);
    expect(screen.getByText('トルク不足')).toBeTruthy();
  });

  it('失敗ではメダルを刻印しない', () => {
    const s = setup({}, SAMPLE_FAILED_FALL);
    advance(8000);
    expect(settledCount(s.meters())).toBe(4);
    expect(stampedCount(s.stamps())).toBe(0);
    expect(sounds).not.toContain('stamp');
    expect(sounds).not.toContain('success');
    // 主な行動は「設計に戻る」
    expect(document.activeElement?.textContent).toBe('設計に戻る');
  });

  it('再生のコールバックがなければボタンを出さない', () => {
    setup({ onReplayFall: undefined }, SAMPLE_FAILED_FALL);
    expect(screen.queryByRole('button', { name: /転倒の瞬間を見る/ })).toBeNull();
  });
});

describe('ResultPanel(共有)', () => {
  it('共有リンクをコピーし、コピーしたことを示す。リンクには設計・記録・ゴーストが入る', async () => {
    const writeText = vi.fn<(s: string) => Promise<void>>().mockResolvedValue(undefined);
    Object.defineProperty(navigator, 'clipboard', { value: { writeText }, configurable: true });
    const ghost = syntheticWalkGhost(5);
    setup({ ghost });
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /共有リンクをコピー/ }));
    });
    expect(screen.getByText(/コピーしました/)).toBeTruthy();
    const url = writeText.mock.calls[0]![0];
    const back = decodeShare(url);
    expect(back.ok).toBe(true);
    if (!back.ok) return;
    expect(back.payload.run?.time).toBeCloseTo(SAMPLE_CLEARED_MIXED.time);
    expect(back.payload.ghost?.frames.length).toBe(ghost.frames.length);
    advance(3000);
    expect(screen.queryByText(/コピーしました/)).toBeNull();
  });

  it('コピーできないときは URL を選択できる欄に出す', async () => {
    setup();
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /共有リンクをコピー/ }));
    });
    const field = screen.getByRole<HTMLInputElement>('textbox', { name: '共有リンク' });
    expect(field.value).toMatch(/#s=/);
    expect(field.readOnly).toBe(true);
  });
});

describe('ResultPanel(相手の記録と比較)', () => {
  it('軸ごとに相手の値と勝ち負けを並べ、まとめを出す(ランキングなし)', () => {
    const s = setup({ opponent: SAMPLE_OPPONENT });
    fireEvent.pointerDown(s.panel);
    const versus = [...s.panel.querySelectorAll('.rs-card__versus')].map((e) => e.textContent);
    expect(versus).toEqual([
      '相手 12.9秒負け',
      '相手 9個勝ち',
      '相手 237引き分け',
      '相手 74.0J負け',
    ]);
    expect(screen.getByText('1勝 2敗 1分')).toBeTruthy();
    expect(s.panel.querySelectorAll('.mech-meter__ghost')).toHaveLength(4);
  });
});
