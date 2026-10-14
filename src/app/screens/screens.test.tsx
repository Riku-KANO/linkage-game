// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { registerSfx } from '@/audio/sfx';
import { createEmptyDesign } from '@/core/model/types';
import {
  createMemoryStorage,
  createPersistence,
  type StorageLike,
} from '@/core/storage/persistence';
import { useEditor } from '@/editor/store';
import { useSceneUi } from '@/scene/store';
import { bootApp, disposeApp } from '../boot';
import { useSession } from '../flow';
import { loadPrefs } from '../prefs';
import { resetSettingsSync } from '../settings';
import { useApp, type AppState } from '../store';
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
  disposeApp();
  resetSettingsSync();
  useSession.getState().dispose();
  useSession.setState(useSession.getInitialState(), true);
});

describe('HomeScreen', () => {
  it('lists the five workshop items; zukan keeps its coming-soon badge but can be chosen', () => {
    const items = homeItems(true);
    expect(items.map((i) => i.id)).toEqual([
      'continue',
      'stageSelect',
      'zukan',
      'sandbox',
      'settings',
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
