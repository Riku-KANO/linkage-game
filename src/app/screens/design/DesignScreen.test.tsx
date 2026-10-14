// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, renderHook, screen } from '@testing-library/react';
import { registerSfx } from '@/audio/sfx';
import { createEmptyDesign } from '@/core/model/types';
import { createMemoryStorage, createPersistence } from '@/core/storage/persistence';
import { useEditor } from '@/editor/store';
import { getStage } from '@/game';
import { t } from '@/i18n';
import { PAPER_DESIGN } from '@/scene/layout';
import { useSceneUi } from '@/scene/store';
import { bootApp, disposeApp } from '../../boot';
import { useSession } from '../../flow';
import { resetSettingsSync } from '../../settings';
import { useApp, type AppState } from '../../store';
import { DesignScreen, useDesignPaperInsets } from './DesignScreen';
import { designLayout, predictPaperRect } from './layout';
import { designSignals } from './signals';

const APP_INITIAL = useApp.getInitialState();
const SCENE_INITIAL = useSceneUi.getInitialState();

beforeEach(() => {
  const storage = createMemoryStorage();
  registerSfx(() => {});
  useApp.setState({ ...APP_INITIAL, seenTransitions: new Set(), history: [] } as AppState, true);
  useSceneUi.setState(SCENE_INITIAL, true);
  useEditor.getState().replaceDesign(createEmptyDesign());
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

/** カメラが紙の上に降りきった(scene の CameraRig が書く値の代わり) */
function settle(rect = { left: 101.5, top: 130.25, width: 700, height: 494.4 }) {
  act(() =>
    useSceneUi.getState().setPaper({
      ready: true,
      screen: rect,
      design: { ...PAPER_DESIGN },
      pxPerCm: rect.width / (PAPER_DESIGN.xMax - PAPER_DESIGN.xMin),
    }),
  );
  return rect;
}

const root = (c: HTMLElement) => c.querySelector('.ds-root') as HTMLElement;
const px = (el: HTMLElement, name: string) => parseFloat(el.style.getPropertyValue(name));

describe('DesignScreen', () => {
  it('waits hidden at the predicted paper rect until the camera has settled', () => {
    const { container } = render(<DesignScreen screen="design" />);
    const r = root(container);
    expect(r.dataset.live).toBe('false');
    expect(designSignals.editorLive).toBe(false);
    // エディタ・上の帯はもうある(パネルは遷移の終わりに滑り込む)
    expect(container.querySelector('.ds-editor svg.ed-svg')).not.toBeNull();
    expect(screen.getByRole('button', { name: t('app.design.testRun') })).toBeTruthy();
    expect(screen.getByRole('button', { name: new RegExp(t('scene.back')) })).toBeTruthy();
    const lay = designLayout(window.innerWidth, window.innerHeight);
    const predicted = predictPaperRect(window.innerWidth, window.innerHeight, lay.insets);
    expect(px(r, '--ds-paper-left')).toBeCloseTo(predicted.left, 6);
    expect(px(r, '--ds-paper-w')).toBeCloseTo(predicted.width, 6);
  });

  it('puts the drawing surface exactly on the paper once settled, and hides the 3D ink meanwhile', () => {
    const { container, unmount } = render(<DesignScreen screen="design" />);
    const rect = settle();
    const r = root(container);
    expect(r.dataset.live).toBe('true');
    expect(r.classList.contains('is-live')).toBe(true);
    expect(px(r, '--ds-paper-left')).toBeCloseTo(rect.left, 6);
    expect(px(r, '--ds-paper-top')).toBeCloseTo(rect.top, 6);
    expect(px(r, '--ds-paper-w')).toBeCloseTo(rect.width, 6);
    expect(px(r, '--ds-paper-h')).toBeCloseTo(rect.height, 6);
    expect(r.dataset.paperRect).toBe('101.50,130.25,700.00,494.40');
    expect(designSignals.editorLive).toBe(true);
    // キー操作がすぐ効くよう、エディタにフォーカスが渡る
    expect(document.activeElement?.classList.contains('ed-root')).toBe(true);
    unmount();
    expect(designSignals.editorLive).toBe(false);
  });

  it('shows the open stage in the header and passes its locks and budget to the editor', () => {
    act(() => {
      useSession.getState().startStage('c1-s1');
    });
    const stage = getStage('c1-s1')!;
    const { container } = render(<DesignScreen screen="design" />);
    const header = container.querySelector('.ds-header') as HTMLElement;
    expect(header.textContent).toContain('1-1');
    expect(header.textContent).toContain(t(stage.titleKey));
    if (stage.lockedJoints?.length) {
      expect(container.querySelectorAll('.ed-lock').length).toBe(stage.lockedJoints.length);
    }
    // スロットの中身を渡せば既定の見出しの代わりに出る
    cleanup();
    render(<DesignScreen screen="design" stageHeader={<span>HUD</span>} hints={<b>ヒント</b>} />);
    expect(screen.getByText('HUD').closest('[data-slot="stage"]')).not.toBeNull();
    expect(screen.getByText('ヒント').closest('[data-slot="hints"]')).not.toBeNull();
  });

  it('test run goes to the test run screen by default, or calls the given handler', () => {
    act(() => useApp.getState().go('design'));
    act(() => useApp.getState().finishTransition());
    const { unmount } = render(<DesignScreen screen="design" />);
    fireEvent.click(screen.getByRole('button', { name: t('app.design.testRun') }));
    expect(useApp.getState().screen).toBe('testRun');
    unmount();
    const onTestRun = vi.fn();
    render(<DesignScreen screen="design" onTestRun={onTestRun} />);
    fireEvent.click(screen.getByRole('button', { name: t('app.design.testRun') }));
    expect(onTestRun).toHaveBeenCalledTimes(1);
  });
});

describe('useDesignPaperInsets', () => {
  it('reserves the room for the bars and panels around the paper, and follows the window size', () => {
    renderHook(() => useDesignPaperInsets());
    expect(useSceneUi.getState().paperInsets).toEqual(
      designLayout(window.innerWidth, window.innerHeight).insets,
    );
    const w = window.innerWidth;
    act(() => {
      Object.defineProperty(window, 'innerWidth', { configurable: true, value: 800 });
      window.dispatchEvent(new Event('resize'));
    });
    expect(useSceneUi.getState().paperInsets).toEqual(designLayout(800, window.innerHeight).insets);
    Object.defineProperty(window, 'innerWidth', { configurable: true, value: w });
  });
});
