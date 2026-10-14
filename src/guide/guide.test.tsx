// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { registerSfx } from '@/audio/sfx';
import { SHORTCUTS } from '@/editor/keyboard';
import { t } from '@/i18n';
import { TermFigure } from './figures/TermFigures';
import { GLOSSARY, GLOSSARY_IDS } from './glossary';
import { GlossaryDialog, GlossaryPanel } from './GlossaryPanel';
import { HowToPlay } from './HowToPlay';
import { HOW_TO_PLAY_PAGES } from './pages';
import { ShortcutSheet, useShortcutSheetHotkey } from './ShortcutSheet';
import { bindingCombo } from './shortcuts';
import { Term } from './Term';
import { TipBubble } from './TipBubble';
import type { Tip } from './tips';
import { WelcomeCard } from './WelcomeCard';

beforeEach(() => {
  registerSfx(() => {});
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
});

const advance = (ms: number) =>
  act(() => {
    vi.advanceTimersByTime(ms);
  });

const dialog = () => screen.getByRole('dialog', { name: t('guide.book.title') });
const pageTitle = () => dialog().querySelector('.gd-book__page-title')?.textContent ?? '';
const figureMarkup = () => dialog().querySelector('figure svg')?.innerHTML ?? '';

describe('遊び方の本(GUIDE-1)', () => {
  it('← → でページをめくり、全ページが表示できる。Esc で閉じる', () => {
    const onClose = vi.fn();
    const onPageChange = vi.fn();
    render(<HowToPlay onClose={onClose} onPageChange={onPageChange} isMac={false} />);
    HOW_TO_PLAY_PAGES.forEach((p, i) => {
      expect(pageTitle()).toContain(t(p.titleKey));
      expect(dialog().querySelector('figure svg[role="img"]')).not.toBeNull();
      if (i < HOW_TO_PLAY_PAGES.length - 1) fireEvent.keyDown(dialog(), { key: 'ArrowRight' });
    });
    expect(onPageChange).toHaveBeenLastCalledWith(7, 'keys');
    // 最後のページでさらに → を押しても進まない
    fireEvent.keyDown(dialog(), { key: 'ArrowRight' });
    expect(pageTitle()).toContain(t('guide.page.keys.title'));
    fireEvent.keyDown(dialog(), { key: 'ArrowLeft' });
    expect(pageTitle()).toContain(t('guide.page.run.title'));
    fireEvent.keyDown(dialog(), { key: 'Escape' });
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('ページの点で移動でき、今のページに aria-current が付く', () => {
    render(<HowToPlay onClose={() => {}} />);
    const nav = screen.getByRole('navigation', { name: t('guide.book.pages') });
    const dots = within(nav).getAllByRole('button');
    expect(dots).toHaveLength(8);
    fireEvent.click(dots[4]!);
    expect(pageTitle()).toContain(t('guide.page.path.title'));
    expect(dots[4]!.getAttribute('aria-current')).toBe('step');
    expect(dots[0]!.getAttribute('aria-current')).toBeNull();
  });

  it('最後のページの「さっそく作る」で閉じ、「操作一覧を開く」を呼べる', () => {
    const onClose = vi.fn();
    const onOpenShortcuts = vi.fn();
    render(<HowToPlay onClose={onClose} initialPage="keys" onOpenShortcuts={onOpenShortcuts} />);
    fireEvent.click(screen.getByRole('button', { name: t('guide.book.openShortcuts') }));
    expect(onOpenShortcuts).toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: t('guide.book.done') }));
    expect(onClose).toHaveBeenCalled();
  });

  it('開くと「次へ」にフォーカスし、閉じると元の場所へ戻す', () => {
    const outside = document.createElement('button');
    document.body.appendChild(outside);
    outside.focus();
    const { unmount } = render(<HowToPlay onClose={() => {}} />);
    expect(document.activeElement?.textContent).toContain(t('guide.book.next'));
    unmount();
    expect(document.activeElement).toBe(outside);
    outside.remove();
  });

  it('どのページの図も、本物のソルバーの姿勢で動く(動きを減らすと止まる)', () => {
    HOW_TO_PLAY_PAGES.forEach((_, i) => {
      const { unmount } = render(
        <HowToPlay onClose={() => {}} initialPage={i} reducedMotion={false} />,
      );
      advance(50);
      const a = figureMarkup();
      advance(700);
      expect(figureMarkup(), `page ${i + 1}`).not.toBe(a);
      unmount();
    });
    HOW_TO_PLAY_PAGES.forEach((_, i) => {
      const { unmount } = render(<HowToPlay onClose={() => {}} initialPage={i} reducedMotion />);
      advance(50);
      const a = figureMarkup();
      advance(700);
      expect(figureMarkup(), `page ${i + 1}`).toBe(a);
      unmount();
    });
  });

  it('本文の用語は、クリックで小窓が開く', () => {
    render(<HowToPlay onClose={() => {}} initialPage="dof" />);
    const term = screen.getByRole('button', { name: '自由度' });
    fireEvent.click(term);
    expect(screen.getByRole('dialog', { name: /自由度/ })).toBeTruthy();
  });
});

describe('用語の小窓と用語集(GUIDE-2)', () => {
  it('すべての用語に文言と図がある', () => {
    expect(GLOSSARY.map((g) => g.id)).toEqual([...GLOSSARY_IDS]);
    for (const g of GLOSSARY) {
      for (const k of [g.nameKey, g.shortKey, g.bodyKey, g.playKey, g.readingKey]) {
        if (k) expect(t(k), k).not.toBe(k);
      }
      const { container, unmount } = render(<TermFigure id={g.id} reducedMotion />);
      expect(container.querySelector('svg[role="img"]'), g.id).not.toBeNull();
      expect(container.querySelectorAll('path, line, circle').length, g.id).toBeGreaterThan(3);
      unmount();
    }
  });

  it('Term:クリックで開き、Esc で閉じてフォーカスを用語へ戻す', () => {
    render(
      <p>
        まず<Term id="grashof">グラスホフの条件</Term>を見る
      </p>,
    );
    const btn = screen.getByRole('button', { name: 'グラスホフの条件' });
    expect(btn.getAttribute('aria-expanded')).toBe('false');
    fireEvent.click(btn);
    expect(btn.getAttribute('aria-expanded')).toBe('true');
    const pop = screen.getByRole('dialog', { name: /グラスホフの条件/ });
    expect(pop.textContent).toContain(t('guide.term.grashof.short'));
    expect(document.activeElement).toBe(pop);
    expect(btn.getAttribute('aria-controls')).toBe(pop.id);
    fireEvent.keyDown(pop, { key: 'Escape' });
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(document.activeElement).toBe(btn);
  });

  it('Term:外側のクリックと × で閉じる。知らない用語はただの文字', () => {
    render(
      <div>
        <Term id="deadPoint" />
        <span data-testid="out">外</span>
        <Term id="nope">知らない言葉</Term>
      </div>,
    );
    expect(screen.queryByRole('button', { name: '知らない言葉' })).toBeNull();
    expect(screen.getByText('知らない言葉')).toBeTruthy();
    const btn = screen.getByRole('button', { name: t('guide.term.deadPoint.name') });
    fireEvent.click(btn);
    fireEvent.pointerDown(screen.getByTestId('out'));
    expect(screen.queryByRole('dialog')).toBeNull();
    fireEvent.click(btn);
    fireEvent.click(screen.getByRole('button', { name: t('guide.close') }));
    expect(screen.queryByRole('dialog')).toBeNull();
  });

  it('小窓の中の ← → は本のページ送りに伝わらない', () => {
    render(<HowToPlay onClose={() => {}} initialPage="dof" />);
    fireEvent.click(screen.getByRole('button', { name: '自由度' }));
    const pop = screen.getByRole('dialog', { name: /自由度/ });
    fireEvent.keyDown(pop, { key: 'ArrowRight' });
    expect(pageTitle()).toContain(t('guide.page.dof.title'));
  });

  it('用語集:全用語の一覧、↑ ↓ で選ぶ、関連の用語へ移る、Esc で閉じる', () => {
    const onClose = vi.fn();
    const onSelect = vi.fn();
    render(<GlossaryPanel onClose={onClose} onSelect={onSelect} reducedMotion />);
    const list = screen.getByRole('list', { name: t('guide.glossary.list') });
    const items = within(list).getAllByRole('button');
    expect(items.map((b) => b.textContent)).toEqual(GLOSSARY.map((g) => t(g.nameKey)));
    expect(items[0]!.getAttribute('aria-current')).toBe('true');
    // フォーカスが一覧の外(パネルの見出しなど)にあっても ↓ で次の用語へ
    fireEvent.keyDown(screen.getByRole('heading', { name: t('guide.glossary.title') }), {
      key: 'ArrowDown',
    });
    expect(onSelect).toHaveBeenLastCalledWith('grubler');
    expect(document.activeElement).toBe(items[1]);
    fireEvent.keyDown(items[1]!, { key: 'End' });
    expect(onSelect).toHaveBeenLastCalledWith('specialGeometry');
    fireEvent.keyDown(items[8]!, { key: 'ArrowDown' });
    expect(onSelect).toHaveBeenLastCalledWith('dof');
    fireEvent.keyDown(items[0]!, { key: 'ArrowDown' });
    const detail = document.querySelector('[data-term="grubler"]')!;
    fireEvent.click(
      within(detail as HTMLElement).getByRole('button', { name: t('guide.term.dof.name') }),
    );
    expect(onSelect).toHaveBeenLastCalledWith('dof');
    fireEvent.keyDown(items[0]!, { key: 'Escape' });
    expect(onClose).toHaveBeenCalled();
  });

  it('用語集のダイアログ:開くと選んでいる用語にフォーカスし、すぐ ↓ が効く。閉じたらフォーカスを戻す', () => {
    const outside = document.createElement('button');
    document.body.appendChild(outside);
    outside.focus();
    const onSelect = vi.fn();
    const { unmount } = render(
      <GlossaryDialog onClose={() => {}} onSelect={onSelect} initialTerm="grashof" reducedMotion />,
    );
    expect(document.activeElement?.textContent).toBe(t('guide.term.grashof.name'));
    fireEvent.keyDown(document.activeElement!, { key: 'ArrowDown' });
    expect(onSelect).toHaveBeenLastCalledWith('crankRocker');
    unmount();
    expect(document.activeElement).toBe(outside);
    outside.remove();
  });
});

describe('操作一覧(GUIDE-3)', () => {
  it('エディタのショートカット表のすべてが一覧に載る', () => {
    render(<ShortcutSheet onClose={() => {}} isMac={false} reducedMotion />);
    const sheet = screen.getByRole('dialog', { name: t('guide.keys.title') });
    for (const b of SHORTCUTS) {
      const row = sheet.querySelector(`[data-shortcut="${b.id}"]`);
      expect(row, b.id).not.toBeNull();
      const caps = Array.from(row!.querySelectorAll('kbd')).map((k) => k.textContent);
      for (const cap of bindingCombo(b, false)) expect(caps, b.id).toContain(cap);
      expect(row!.textContent).toContain(t(`guide.keys.${b.id}`));
    }
  });

  it('Esc で閉じる', () => {
    const onClose = vi.fn();
    render(<ShortcutSheet onClose={onClose} reducedMotion />);
    fireEvent.keyDown(screen.getByRole('dialog'), { key: 'Escape' });
    expect(onClose).toHaveBeenCalled();
  });

  it('? キーで開く(入力欄の中では開かない)', () => {
    const onOpen = vi.fn();
    function Host() {
      useShortcutSheetHotkey(onOpen);
      return <input aria-label="名前" />;
    }
    render(<Host />);
    fireEvent.keyDown(screen.getByRole('textbox'), { key: '?' });
    expect(onOpen).not.toHaveBeenCalled();
    fireEvent.keyDown(window, { key: '?', shiftKey: true });
    expect(onOpen).toHaveBeenCalledTimes(1);
    fireEvent.keyDown(window, { key: '?', ctrlKey: true });
    expect(onOpen).toHaveBeenCalledTimes(1);
  });
});

describe('一言の吹き出しと、はじめての方へ(GUIDE-4)', () => {
  const tip: Tip = {
    id: 'dofLoose',
    key: 'guide.tip.dofLoose',
    params: { dof: 2, need: 1 },
    severity: 'error',
  };

  it('tip がなければ何も出さず、あれば文言と用語のリンクを出す。× で閉じる', () => {
    const onDismiss = vi.fn();
    const { rerender, container } = render(<TipBubble tip={null} onDismiss={onDismiss} />);
    expect(container.querySelector('.gd-tip')).toBeNull();
    expect(container.querySelector('[aria-live="polite"]')).not.toBeNull();
    rerender(<TipBubble tip={tip} onDismiss={onDismiss} />);
    const note = screen.getByRole('note');
    expect(note.className).toContain('gd-tip--error');
    expect(note.textContent).toContain('ぐらつきます');
    expect(note.textContent).not.toContain('[[');
    expect(within(note).getByRole('button', { name: '自由度' })).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: t('guide.tip.dismiss') }));
    expect(onDismiss).toHaveBeenCalledWith(tip);
  });

  it('添えるボタン', () => {
    const onAction = vi.fn();
    const back: Tip = { id: 'walksBackward', key: 'guide.tip.walksBackward', severity: 'warn' };
    render(<TipBubble tip={back} actionLabel="逆にする" onAction={onAction} />);
    fireEvent.click(screen.getByRole('button', { name: '逆にする' }));
    expect(onAction).toHaveBeenCalledWith(back);
  });

  it('はじめての方へ:3 つの選択肢と Esc(あとで)。開くとチュートリアルにフォーカス', () => {
    const cb = { onStartTutorial: vi.fn(), onHowToPlay: vi.fn(), onLater: vi.fn() };
    render(<WelcomeCard {...cb} reducedMotion />);
    const card = screen.getByRole('dialog', { name: t('guide.welcome.title') });
    expect(document.activeElement?.textContent).toContain(t('guide.welcome.tutorial'));
    fireEvent.click(screen.getByRole('button', { name: t('guide.welcome.tutorial') }));
    fireEvent.click(screen.getByRole('button', { name: t('guide.welcome.howTo') }));
    fireEvent.click(screen.getByRole('button', { name: t('guide.welcome.later') }));
    fireEvent.keyDown(card, { key: 'Escape' });
    expect(cb.onStartTutorial).toHaveBeenCalledTimes(1);
    expect(cb.onHowToPlay).toHaveBeenCalledTimes(1);
    expect(cb.onLater).toHaveBeenCalledTimes(2);
  });
});
