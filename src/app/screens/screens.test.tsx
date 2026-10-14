// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { registerSfx } from '@/audio/sfx';
import { createEmptyDesign } from '@/core/model/types';
import {
  createMemoryStorage,
  createPersistence,
  type StorageLike,
} from '@/core/storage/persistence';
import { useEditor } from '@/editor/store';
import { initialProgress, recordResult } from '@/game';
import { t } from '@/i18n';
import { useSceneUi } from '@/scene/store';
import { bootApp, disposeApp } from '../boot';
import { useSession } from '../flow';
import { loadPrefs } from '../prefs';
import { resetSettingsSync } from '../settings';
import { useApp, type AppState } from '../store';
import { resetWelcomeSession } from '../welcome';
import { HomeScreen, homeItems } from './HomeScreen';
import { NoticeLayer } from './NoticeLayer';
import { SettingsScreen } from './SettingsScreen';
import { StageSelectScreen } from './StageSelectScreen';
import { ZukanScreen } from './ZukanScreen';

const APP_INITIAL = useApp.getInitialState();
let storage: StorageLike;

beforeEach(() => {
  storage = createMemoryStorage();
  registerSfx(() => {});
  useApp.setState({ ...APP_INITIAL, seenTransitions: new Set(), history: [] } as AppState, true);
  useEditor.getState().replaceDesign(createEmptyDesign());
  useSceneUi.getState().setHovered(null);
  bootApp({
    session: { persistence: createPersistence(storage) },
    settings: {
      storage,
      osReducedMotion: () => false,
      perfDecision: () => null,
      setMuted: () => {},
    },
    markDocument: false,
  });
  // ロゴ(T-00)の後のホーム
  useApp.getState().go('home');
  useApp.getState().finishTransition();
});

afterEach(() => {
  cleanup();
  resetWelcomeSession();
  disposeApp();
  resetSettingsSync();
  useSession.getState().dispose();
  useSession.setState(useSession.getInitialState(), true);
});

describe('HomeScreen', () => {
  it('lists the five workshop items and how to play; zukan keeps its coming-soon badge', () => {
    const items = homeItems(true);
    expect(items.map((i) => i.id)).toEqual([
      'continue',
      'stageSelect',
      'zukan',
      'sandbox',
      'settings',
      'howToPlay',
    ]);
    expect(items.find((i) => i.id === 'zukan')).toMatchObject({
      disabled: false,
      badgeKey: 'hud.menu.soon',
    });
    expect(items.find((i) => i.id === 'sandbox')?.badgeKey).toBeUndefined();
    expect(homeItems(false)[0]?.disabled).toBe(true);
  });

  it('shares the hovered item with the 3D objects both ways', () => {
    render(<HomeScreen />);
    const settings = screen.getByRole('menuitem', { name: /^設定/ });
    fireEvent.pointerEnter(settings);
    expect(useSceneUi.getState().hovered).toBe('settings');
    act(() => useSceneUi.getState().setHovered('stageSelect'));
    expect(
      screen.getByRole('menuitem', { name: /ステージ選択/ }).getAttribute('data-active'),
    ).not.toBeNull();
  });

  it('continue starts the first stage and moves to the design screen', () => {
    render(<HomeScreen />);
    fireEvent.click(screen.getByRole('menuitem', { name: /続きから/ }));
    expect(useApp.getState().screen).toBe('design');
    expect(useSession.getState().slot).toBe('c1-s1');
  });

  it('arrow keys from outside bring the focus into the menu', () => {
    render(<HomeScreen />);
    fireEvent.keyDown(window, { key: 'ArrowDown' });
    expect(document.activeElement).toBe(screen.getByRole('menuitem', { name: /続きから/ }));
  });
});

const book = () => screen.queryByRole('dialog', { name: t('guide.book.title') });
const welcomeCard = () => screen.queryByRole('dialog', { name: 'はじめての方へ' });
const pageTitle = () => book()?.querySelector('.gd-book__page-title')?.textContent ?? '';

describe('HomeScreen: how to play (INT-7b)', () => {
  it('opens the book from the menu, turns pages, and keeps the page across the glossary', () => {
    render(<HomeScreen />);
    const item = screen.getByRole('menuitem', { name: /遊び方/ });
    act(() => item.focus());
    expect(item.getAttribute('data-active')).not.toBeNull();
    // 工房の物体はないので、3D のホバーは消す
    expect(useSceneUi.getState().hovered).toBeNull();
    fireEvent.click(item);
    expect(book()).not.toBeNull();
    expect(pageTitle()).toContain(t('guide.page.about.title'));
    fireEvent.keyDown(book()!, { key: 'ArrowRight' });
    expect(pageTitle()).toContain(t('guide.page.link.title'));
    // ↓ は本のもの(メニューへフォーカスを奪わない)
    fireEvent.keyDown(book()!, { key: 'ArrowDown' });
    expect(book()!.contains(document.activeElement)).toBe(true);

    // 用語集は本の上に開き、閉じると同じページに戻る
    fireEvent.click(within(book()!).getByRole('button', { name: '用語集' }));
    expect(screen.getByRole('dialog', { name: t('guide.glossary.title') })).toBeTruthy();
    expect(book()).toBeNull();
    fireEvent.keyDown(document.activeElement!, { key: 'Escape' });
    expect(pageTitle()).toContain(t('guide.page.link.title'));
    fireEvent.keyDown(book()!, { key: 'Escape' });
    expect(book()).toBeNull();
    // 閉じたら開く前の項目へフォーカスが戻る
    expect(document.activeElement).toBe(screen.getByRole('menuitem', { name: /遊び方/ }));
    // 開き直すと 1 ページ目から
    fireEvent.click(screen.getByRole('menuitem', { name: /遊び方/ }));
    expect(pageTitle()).toContain(t('guide.page.about.title'));
  });

  it('opens the shortcut sheet from the last page of the book', () => {
    render(<HomeScreen />);
    fireEvent.click(screen.getByRole('menuitem', { name: /遊び方/ }));
    fireEvent.keyDown(book()!, { key: 'End' });
    fireEvent.click(within(book()!).getByRole('button', { name: t('guide.book.openShortcuts') }));
    expect(screen.getByRole('dialog', { name: t('guide.keys.title') })).toBeTruthy();
    fireEvent.keyDown(document.activeElement!, { key: 'Escape' });
    expect(pageTitle()).toContain(t('guide.page.keys.title'));
  });
});

describe('HomeScreen: welcome card (INT-7b)', () => {
  it('greets a first-time player; the tutorial button opens 1-1 and is remembered', () => {
    render(<HomeScreen />);
    const card = welcomeCard()!;
    expect(card).not.toBeNull();
    // 「チュートリアルから始める」にフォーカス(Enter ですぐ始められる)
    expect(document.activeElement?.textContent).toContain('チュートリアルから始める');
    fireEvent.click(within(card).getByRole('button', { name: 'チュートリアルから始める' }));
    expect(useApp.getState().screen).toBe('design');
    expect(useSession.getState().slot).toBe('c1-s1');
    expect(loadPrefs(storage).welcomed).toBe(true);
  });

  it('「遊び方を見る」 opens the book; 「あとで」 just puts it away; both are remembered', () => {
    const r = render(<HomeScreen />);
    fireEvent.click(within(welcomeCard()!).getByRole('button', { name: '遊び方を見る' }));
    expect(welcomeCard()).toBeNull();
    expect(book()).not.toBeNull();
    expect(loadPrefs(storage).welcomed).toBe(true);
    r.unmount();
    // このセッションでしまったことを忘れても、選んだことは覚えている
    resetWelcomeSession();
    render(<HomeScreen />);
    expect(welcomeCard()).toBeNull();
  });

  it('「あとで」 and Esc dismiss it for good', () => {
    render(<HomeScreen />);
    fireEvent.keyDown(welcomeCard()!, { key: 'Escape' });
    expect(welcomeCard()).toBeNull();
    expect(useApp.getState().screen).toBe('home');
    expect(loadPrefs(storage).welcomed).toBe(true);
  });

  it('leaving home without choosing hides it for this session only (not saved)', () => {
    const r = render(<HomeScreen />);
    expect(welcomeCard()).not.toBeNull();
    r.unmount();
    render(<HomeScreen />);
    expect(welcomeCard()).toBeNull();
    expect(loadPrefs(storage).welcomed).toBeUndefined();
  });

  it('is not shown to a player who has cleared a stage', () => {
    const progress = recordResult(initialProgress(), {
      stageId: 'c1-s1',
      cleared: true,
      reason: null,
      time: 4,
      parts: 10,
      cost: 500,
      energy: 50,
      distance: 1.6,
      medals: { time: 'gold', parts: 'gold', cost: 'gold', energy: 'gold' },
    });
    act(() => useSession.setState({ progress }));
    render(<HomeScreen />);
    expect(welcomeCard()).toBeNull();
    expect(screen.getByRole('menuitem', { name: /遊び方/ })).toBeTruthy();
  });
});

describe('StageSelectScreen', () => {
  it('starts an unlocked stage (T-02) and closes back home', () => {
    useApp.getState().go('stageSelect');
    render(<StageSelectScreen />);
    expect(document.activeElement?.getAttribute('aria-label')).toMatch(/^1-1/);
    fireEvent.keyDown(document.activeElement!, { key: 'Enter' });
    expect(useApp.getState().screen).toBe('design');
    expect(useApp.getState().stageId).toBe('c1-s1');
    expect(useApp.getState().transition?.id).toBe('T-02');
    cleanup();

    useApp.getState().back();
    render(<StageSelectScreen />);
    fireEvent.click(screen.getByRole('button', { name: '閉じる' }));
    expect(useApp.getState().screen).toBe('home');
  });
});

describe('SettingsScreen', () => {
  it('saves reduced motion and mute as explicit choices', () => {
    useApp.getState().go('settings');
    render(<SettingsScreen />);
    fireEvent.click(screen.getByRole('switch', { name: '動きを減らす' }));
    fireEvent.click(screen.getByRole('switch', { name: 'ミュート' }));
    expect(useApp.getState().settings).toMatchObject({
      reducedMotion: true,
      muted: true,
      sources: { reducedMotion: 'user' },
    });
    expect(loadPrefs(storage)).toMatchObject({ reducedMotion: true, muted: true });
    expect(screen.getByRole('switch', { name: '動きを減らす' }).getAttribute('aria-checked')).toBe(
      'true',
    );
  });

  it('opens the how-to-play book (INT-7b)', () => {
    useApp.getState().go('settings');
    render(<SettingsScreen />);
    fireEvent.click(screen.getByRole('button', { name: /遊び方を見る/ }));
    expect(book()).not.toBeNull();
    fireEvent.keyDown(book()!, { key: 'Escape' });
    expect(book()).toBeNull();
    expect(useApp.getState().screen).toBe('settings');
  });

  it('resets the progress after the two-step confirmation', () => {
    useApp.getState().go('settings');
    render(<SettingsScreen />);
    fireEvent.click(screen.getByRole('button', { name: /進行をリセット/ }));
    fireEvent.click(screen.getByRole('button', { name: '消す' }));
    expect(useSession.getState().notices.map((n) => n.key)).toContain('flow.progress.reset');
  });
});

describe('ZukanScreen', () => {
  it('shows the coming-soon card and goes back', () => {
    useApp.getState().go('zukan');
    render(<ZukanScreen />);
    expect(screen.getByRole('region', { name: '機構図鑑' }).textContent).toContain('準備中');
    fireEvent.click(screen.getByRole('button', { name: /戻る/ }));
    expect(useApp.getState().screen).toBe('home');
  });
});

describe('NoticeLayer', () => {
  it('shows the session notices and removes a closed one from the session', () => {
    act(() =>
      useSession
        .getState()
        .pushNotice({ kind: 'save', severity: 'error', key: 'model.save.quota' }),
    );
    render(<NoticeLayer />);
    const alert = screen.getByRole('alert');
    expect(alert).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: '閉じる' }));
    // 閉じる動き(220ms)の後に列から外れる
    return new Promise<void>((resolve) =>
      setTimeout(() => {
        expect(useSession.getState().notices).toEqual([]);
        resolve();
      }, 400),
    );
  });
});
