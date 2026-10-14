// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { registerSfx, type SfxName } from '@/audio/sfx';
import { getStage } from '@/game';
import type { PreflightResult } from '@/game/types';
import {
  BudgetMeter,
  HintPanel,
  HudDock,
  StageHeader,
  TestRunButton,
  TutorialBubble,
} from './index';
import { partsGivenUpTo } from './TutorialBubble';
import { SAMPLE_PREFLIGHT } from './samples';

let sounds: SfxName[] = [];
beforeEach(() => {
  sounds = [];
  registerSfx((name) => sounds.push(name));
});
afterEach(() => {
  cleanup();
  registerSfx(() => {});
});

const c1s1 = getStage('c1-s1')!;
const c2s4 = getStage('c2-s4')!; // 予算 2000 のステージ

describe('StageHeader', () => {
  it('章・ステージ名・課題(パラメータ入り)・ゴール・制限時間・予算を出す', () => {
    render(<StageHeader stage={c1s1} reducedMotion />);
    const region = screen.getByRole('region', { name: 'ステージの情報' });
    expect(within(region).getByRole('heading', { name: 'こわれた機械' })).toBeTruthy();
    expect(region.textContent).toContain('第 1 章 はじめの一歩');
    expect(region.textContent).toContain('1-1');
    expect(region.textContent).toContain('1.5m 先のゴールまで歩かせよう');
    expect(region.textContent).toContain('1.5 m 先');
    // 制限時間は実測から校正される(calibrate)ので、ステージの値から期待値を作る
    expect(region.textContent).toContain(`${c1s1.timeLimit} 秒`);
    expect(region.textContent).toContain('予算なし');
  });

  it('予算のあるステージでコストを渡すと計算尺が出る', () => {
    // 予算は実測から校正される。予算の 92.5% のコストは「近い」(90% 以上)
    const budget = c2s4.budget!;
    const cost = Math.round(budget * 0.925);
    render(<StageHeader stage={c2s4} cost={cost} reducedMotion />);
    const meter = screen.getByRole('meter', { name: 'コスト' });
    expect(meter.getAttribute('aria-valuenow')).toBe(String(cost));
    expect(meter.getAttribute('aria-valuemax')).toBe(String(budget));
    expect(meter.getAttribute('data-level')).toBe('near');
  });

  it('たたむと課題が隠れ、ひろげると戻る(非制御)', () => {
    render(<StageHeader stage={c1s1} reducedMotion />);
    const fold = screen.getByRole('button', { name: 'たたむ' });
    expect(fold.getAttribute('aria-expanded')).toBe('true');
    fireEvent.click(fold);
    const body = document.getElementById(fold.getAttribute('aria-controls')!)!;
    expect(body.hidden).toBe(true);
    fireEvent.click(screen.getByRole('button', { name: 'ひろげる' }));
    expect(body.hidden).toBe(false);
  });

  it('制御:collapsed と onCollapsedChange、戻るボタン', () => {
    const onCollapsedChange = vi.fn();
    const onBack = vi.fn();
    render(
      <StageHeader
        stage={c1s1}
        collapsed
        onCollapsedChange={onCollapsedChange}
        onBack={onBack}
        reducedMotion
      />,
    );
    fireEvent.click(screen.getByRole('button', { name: 'ひろげる' }));
    expect(onCollapsedChange).toHaveBeenCalledWith(false);
    // 制御なので親が変えるまでたたんだまま
    expect(screen.getByRole('button', { name: 'ひろげる' })).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'ステージ選択へ' }));
    expect(onBack).toHaveBeenCalledTimes(1);
  });

  it('クリア済みなら最高メダルの粒を出す', () => {
    render(
      <StageHeader
        stage={c1s1}
        best={{
          stageId: 'c1-s1',
          cleared: true,
          reason: null,
          time: 6,
          parts: 10,
          cost: 600,
          energy: 80,
          distance: 1.6,
          medals: { time: 'gold', parts: 'silver', cost: null, energy: 'bronze' },
        }}
        reducedMotion
      />,
    );
    expect(
      screen.getByRole('img', {
        name: '到達時間:金、部品数:銀、コスト:なし、消費エネルギー:銅',
      }),
    ).toBeTruthy();
  });
});

describe('BudgetMeter', () => {
  it('予算なし・超過', () => {
    const { rerender, container } = render(<BudgetMeter cost={500} budget={null} />);
    expect(container.textContent).toContain('予算なし');
    expect(screen.queryByRole('meter')).toBeNull();
    rerender(<BudgetMeter cost={2300} budget={2000} reducedMotion />);
    const meter = screen.getByRole('meter');
    expect(meter.getAttribute('data-level')).toBe('over');
    expect(meter.textContent).toContain('300 オーバー');
    expect(meter.getAttribute('aria-valuetext')).toBe('コスト 2300、予算 2000');
  });
});

describe('TestRunButton', () => {
  const setup = (preflight: PreflightResult | null, extra = {}) => {
    const onTestRun = vi.fn();
    const onHighlight = vi.fn();
    render(
      <TestRunButton
        preflight={preflight}
        onTestRun={onTestRun}
        onHighlight={onHighlight}
        reducedMotion
        {...extra}
      />,
    );
    return { onTestRun, onHighlight, button: screen.getByRole('button', { name: /試走する/ }) };
  };

  it('問題がなければ試走できる', () => {
    const s = setup(SAMPLE_PREFLIGHT.ok);
    expect(screen.getByText('準備ができました')).toBeTruthy();
    fireEvent.click(s.button);
    expect(s.onTestRun).toHaveBeenCalledTimes(1);
  });

  it('注意だけなら試走できる。一覧の行を押すと場所を示す', () => {
    const s = setup(SAMPLE_PREFLIGHT.warn);
    expect(screen.getByText('注意が 2 つ(試走はできます)')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: /脚先が決まっていません/ }));
    expect(s.onHighlight).toHaveBeenCalledWith(SAMPLE_PREFLIGHT.warn.problems[0]);
    fireEvent.click(s.button);
    expect(s.onTestRun).toHaveBeenCalledTimes(1);
  });

  it('エラーがあると試走せず、押すと最初のエラーの場所を示して警告音', () => {
    const s = setup(SAMPLE_PREFLIGHT.error);
    expect(s.button.getAttribute('aria-disabled')).toBe('true');
    expect(screen.getByText('直すところが 1 つあります')).toBeTruthy();
    expect(screen.getByText('自由度が 2 で、機構がぐらつきます', { exact: false })).toBeTruthy();
    fireEvent.click(s.button);
    expect(s.onTestRun).not.toHaveBeenCalled();
    expect(s.onHighlight).toHaveBeenCalledWith(SAMPLE_PREFLIGHT.error.problems[0]);
    expect(sounds).toContain('error');
  });

  it('多いときは 3 件まで出し、「ほか N 件」で全部開く。エラーが先', () => {
    setup(SAMPLE_PREFLIGHT.many);
    const rows = () => screen.getAllByRole('button', { name: /^(直す|注意)/ });
    expect(rows()).toHaveLength(3);
    fireEvent.click(screen.getByRole('button', { name: 'ほか 2 件' }));
    expect(rows()).toHaveLength(5);
    expect(rows()[4]!.getAttribute('data-severity')).toBe('warn');
  });

  it('チェック中は押せない。示している問題に印', () => {
    const { button } = setup(null);
    expect((button as HTMLButtonElement).disabled).toBe(true);
    expect(screen.getByText('チェック中…')).toBeTruthy();
    cleanup();
    setup(SAMPLE_PREFLIGHT.error, { highlighted: SAMPLE_PREFLIGHT.error.problems[0] });
    const active = document.querySelector('.hud-problem[data-active]');
    expect(active?.textContent).toContain('自由度が 2');
  });

  it('たたむと一覧を出さず状態の 1 行だけ。押せば止めて最初のエラーを示す', () => {
    const s = setup(SAMPLE_PREFLIGHT.error, { collapsed: true });
    expect(screen.getByText('直すところが 1 つあります')).toBeTruthy();
    expect(screen.queryByText('自由度が 2 で、機構がぐらつきます', { exact: false })).toBeNull();
    expect(document.querySelector('.hud-run-btn')?.getAttribute('data-state')).toBe('blocked');
    fireEvent.click(s.button);
    expect(s.onTestRun).not.toHaveBeenCalled();
    expect(s.onHighlight).toHaveBeenCalledWith(SAMPLE_PREFLIGHT.error.problems[0]);
    cleanup();
    const w = setup(SAMPLE_PREFLIGHT.warn, { collapsed: true });
    expect(screen.getByText('注意が 2 つ(試走はできます)')).toBeTruthy();
    fireEvent.click(w.button);
    expect(w.onTestRun).toHaveBeenCalledTimes(1);
  });

  it('ショートカットの表示', () => {
    setup(SAMPLE_PREFLIGHT.ok, { shortcut: 'T' });
    const btn = screen.getByRole('button', { name: /試走する/ });
    expect(btn.getAttribute('aria-keyshortcuts')).toBe('T');
    expect(btn.querySelector('kbd')?.textContent).toBe('T');
  });
});

describe('HintPanel', () => {
  it('はじめはヒントなし。「ヒントを見る」は次のレベルの名前つき', () => {
    const onReveal = vi.fn();
    render(<HintPanel stage={c1s1} revealed={0} onReveal={onReveal} reducedMotion />);
    expect(screen.getByText(/まだヒントを開いていません/)).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: /ヒントを見る:ヒント 1:方針/ }));
    expect(onReveal).toHaveBeenCalledTimes(1);
  });

  it('開いたヒントを出し、影のヒントは図面に重ねる切り替えを持つ', () => {
    const onToggleGhost = vi.fn();
    const { rerender } = render(
      <HintPanel
        stage={c1s1}
        revealed={2}
        onReveal={() => {}}
        onToggleGhost={onToggleGhost}
        reducedMotion
      />,
    );
    expect(screen.getByText('ヒント 1:方針')).toBeTruthy();
    expect(screen.getByText(/右上の固定点と、三角の板の右の角を棒でつなごう/)).toBeTruthy();
    expect(screen.getByText('影の 2 つの点を、リンクでつなぎます')).toBeTruthy();
    const sw = screen.getByRole('switch', { name: 'ヒント 2:部品の配置を図面に重ねる' });
    expect(sw.getAttribute('aria-checked')).toBe('false');
    fireEvent.click(sw);
    expect(onToggleGhost).toHaveBeenCalledWith(2, true);
    rerender(
      <HintPanel
        stage={c1s1}
        revealed={2}
        onReveal={() => {}}
        onToggleGhost={onToggleGhost}
        ghostsShown={[2]}
        reducedMotion
      />,
    );
    fireEvent.click(screen.getByRole('switch', { name: /ヒント 2/ }));
    expect(onToggleGhost).toHaveBeenLastCalledWith(2, false);
    expect(screen.getByRole('button', { name: /ヒント 3:完成形の一部/ })).toBeTruthy();
  });

  it('全部開くとボタンが消える。促すときはそっと光り、一言を添える', () => {
    const { rerender, container } = render(
      <HintPanel stage={c1s1} revealed={1} onReveal={() => {}} suggested reducedMotion />,
    );
    expect(container.querySelector('[data-suggested]')).toBeTruthy();
    expect(screen.getByText('行き詰まったら、ヒントをどうぞ')).toBeTruthy();
    rerender(<HintPanel stage={c1s1} revealed={3} onReveal={() => {}} suggested reducedMotion />);
    expect(screen.queryByRole('button', { name: /ヒントを見る/ })).toBeNull();
    expect(screen.getByText('ヒントはこれで全部です')).toBeTruthy();
    expect(container.querySelector('[data-suggested]')).toBeNull();
  });

  it('新しく開いた紙片だけが広がる', () => {
    const { rerender, container } = render(
      <HintPanel stage={c1s1} revealed={1} onReveal={() => {}} />,
    );
    expect(container.querySelectorAll('.hud-slip[data-fresh]')).toHaveLength(0);
    rerender(<HintPanel stage={c1s1} revealed={2} onReveal={() => {}} />);
    expect(container.querySelectorAll('.hud-slip[data-fresh]')).toHaveLength(1);
  });
});

describe('TutorialBubble', () => {
  const steps = c1s1.tutorial!;

  it('文・ステップの点・「次へ」(click のステップ)', () => {
    const onNext = vi.fn();
    render(<TutorialBubble steps={steps} index={0} onNext={onNext} reducedMotion />);
    const region = screen.getByRole('region', { name: 'チュートリアル' });
    expect(region.textContent).toContain('工房へようこそ');
    expect(region.textContent).toContain('ステップ 1 / 6');
    expect(region.querySelectorAll('.hud-tut__dot')).toHaveLength(6);
    fireEvent.click(screen.getByRole('button', { name: /次へ/ }));
    expect(onNext).toHaveBeenCalledTimes(1);
  });

  it('部品を渡すステップでは部品のアイコンに「新しい部品」、操作待ちは「次へ」なし', () => {
    render(<TutorialBubble steps={steps} index={2} onNext={() => {}} reducedMotion />);
    const parts = screen.getByRole('list', { name: '渡された部品' });
    expect(
      within(parts)
        .getAllByRole('listitem')
        .map((li) => li.textContent),
    ).toEqual(['リンク新しい部品', 'ピン新しい部品']);
    expect(screen.queryByRole('button', { name: /次へ/ })).toBeNull();
    expect(screen.getByText('図面で操作すると進みます')).toBeTruthy();
  });

  it('試走のステップは試走を促す。飛ばすボタン。終わったら出さない', () => {
    const onSkip = vi.fn();
    const { rerender, container } = render(
      <TutorialBubble steps={steps} index={5} onNext={() => {}} onSkip={onSkip} reducedMotion />,
    );
    expect(screen.getByText('「試走する」を押すと進みます')).toBeTruthy();
    // 前に渡した部品は残る(新しい印はない)
    expect(container.querySelectorAll('.hud-tut__part')).toHaveLength(2);
    expect(container.querySelectorAll('.hud-tut__part[data-new]')).toHaveLength(0);
    fireEvent.click(screen.getByRole('button', { name: 'チュートリアルを飛ばす' }));
    expect(onSkip).toHaveBeenCalledTimes(1);
    rerender(<TutorialBubble steps={steps} index={6} onNext={() => {}} reducedMotion />);
    expect(container.innerHTML).toBe('');
  });

  it('「次へ」のステップに来たらボタンにフォーカス(ほかにフォーカスがないとき)', () => {
    render(<TutorialBubble steps={steps} index={1} onNext={() => {}} reducedMotion />);
    expect(document.activeElement).toBe(screen.getByRole('button', { name: /次へ/ }));
  });

  it('partsGivenUpTo:前のステップの分と合わせ、表示順', () => {
    const c1s3 = getStage('c1-s3')!.tutorial!;
    expect(partsGivenUpTo(c1s3, 0)).toEqual([]);
    expect(partsGivenUpTo(c1s3, 2)).toEqual(['link', 'pin', 'fixed']);
    expect(partsGivenUpTo(c1s3, 7)).toEqual(['link', 'pin', 'fixed', 'crank']);
  });
});

describe('HudDock', () => {
  it('部品を端の置き場に入れ、空の置き場は作らない。余白を変えられる', () => {
    const { container } = render(
      <HudDock
        topLeft={<p>見出し</p>}
        left={<p>ヒント</p>}
        topRight={<p>通知</p>}
        bottomRight={<p>試走</p>}
        inset={24}
      />,
    );
    const dock = container.querySelector<HTMLElement>('.hud-dock')!;
    expect(dock.style.getPropertyValue('--hud-inset')).toBe('24px');
    const left = dock.querySelector('.hud-dock__col--left')!;
    expect([...left.children].map((c) => c.textContent)).toEqual(['見出し', 'ヒント']);
    expect(dock.querySelector('.hud-dock__col--right')?.textContent).toBe('通知');
    expect(dock.querySelector('.hud-dock__slot--br')?.textContent).toBe('試走');
    expect(dock.querySelector('.hud-dock__slot--bc')).toBeNull();
    expect(dock.querySelector('.hud-dock__slot--top')).toBeNull();
  });
});
