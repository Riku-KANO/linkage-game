// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { registerSfx } from '@/audio/sfx';
import { createEmptyDesign } from '@/core/model/types';
import { createMemoryStorage, createPersistence } from '@/core/storage/persistence';
import { useEditor } from '@/editor/store';
import { getStage } from '@/game';
import { t } from '@/i18n';
import { useSceneUi } from '@/scene/store';
import { bootApp, disposeApp } from '../../boot';
import { useSession } from '../../flow';
import { resetSettingsSync } from '../../settings';
import { useApp, type AppState } from '../../store';
import { installRunBridge } from '../run3d/bridge';
import { runViewStore, setPreflightOpen } from '../run3d/runView';
import { DesignHudScreen } from './DesignHud';
import { designGuide, initialDesignGuide } from './guide';

const APP_INITIAL = useApp.getInitialState();
const SCENE_INITIAL = useSceneUi.getInitialState();

beforeEach(() => {
  const storage = createMemoryStorage();
  registerSfx(() => {});
  useApp.setState({ ...APP_INITIAL, seenTransitions: new Set(), history: [] } as AppState, true);
  useSceneUi.setState(SCENE_INITIAL, true);
  useEditor.getState().replaceDesign(createEmptyDesign());
  designGuide.setState(initialDesignGuide(), true);
  setPreflightOpen(false);
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
});

afterEach(() => {
  cleanup();
  disposeApp();
  resetSettingsSync();
  useSession.getState().dispose();
  useSession.setState(useSession.getInitialState(), true);
});

const stage11 = getStage('c1-s1')!;

function open11(onTestRun = vi.fn()) {
  act(() => {
    useSession.getState().startStage('c1-s1');
  });
  const r = render(<DesignHudScreen screen="design" onTestRun={onTestRun} />);
  return { ...r, onTestRun };
}

const tool = (name: string) =>
  within(screen.getByRole('toolbar', { name: '道具' })).getByRole('button', {
    name,
  }) as HTMLButtonElement;

const bubble = () => screen.getByRole('region', { name: t('hud.tutorial.region') });

describe('設計画面の HUD(INT-7a)', () => {
  it('チュートリアルの吹き出しを横の列の上に出し、道具を順に渡す', () => {
    const { container } = open11();
    expect(bubble().closest('[data-slot="guide"]')).not.toBeNull();
    expect(bubble().textContent).toContain('ステップ 1 / 6');
    expect(bubble().textContent).toContain('工房へようこそ');
    // 最初はリンクを渡していない(チュートリアルで絞った部品)
    expect(tool('リンク').disabled).toBe(true);
    fireEvent.click(within(bubble()).getByRole('button', { name: /次へ/ }));
    fireEvent.click(within(bubble()).getByRole('button', { name: /次へ/ }));
    expect(bubble().textContent).toContain('ステップ 3 / 6');
    expect(tool('リンク').disabled).toBe(false);
    // 吹き出しが「リンク」を押してと言っている間は、リンクの道具をそっと光らせる
    const root = container.querySelector('.ds-root') as HTMLElement;
    expect(root.dataset.calloutTool).toBe('link');
    expect(tool('リンク').dataset.tool).toBe('link');
    fireEvent.click(tool('リンク'));
    expect(root.dataset.calloutTool).toBeUndefined();
    // 動かせない点はエディタに渡る
    expect(container.querySelectorAll('.ed-lock').length).toBe(stage11.lockedJoints?.length ?? 0);
    // 試走ボタンは上の帯ではなく列の下
    const run = screen.getByRole('button', { name: /試走する/ });
    expect(run.closest('[data-slot="testRun"]')).not.toBeNull();
  });

  it('飛ばすと吹き出しが消え、状況の一言が出る。× で閉じた一言はもう出ない', () => {
    open11();
    fireEvent.click(within(bubble()).getByRole('button', { name: t('game.tutorial.skip') }));
    expect(screen.queryByRole('region', { name: t('hud.tutorial.region') })).toBeNull();
    const tip = document.querySelector('[data-slot="guide"] .gd-tip') as HTMLElement;
    expect(tip.dataset.tip).toBe('dofLoose');
    // 場所を示す:ぐらつく点を選ぶ
    fireEvent.click(within(tip).getByRole('button', { name: t('app.design.tip.locate') }));
    expect(useEditor.getState().selection.joints).toContain('B');
    fireEvent.click(within(tip).getByRole('button', { name: t('guide.tip.dismiss') }));
    expect(document.querySelector('[data-slot="guide"] .gd-tip')).toBeNull();
    expect(designGuide.getState().dismissed).toEqual(['dofLoose']);
  });

  it('見出しはたたんだまま番号・名前と課題の 1 行。開くとゴール・制限時間・予算', () => {
    open11();
    const header = screen.getByRole('region', { name: t('hud.header.region') });
    expect(header.closest('[data-slot="stage"]')).not.toBeNull();
    expect(header.dataset.collapsed).toBe('true');
    expect(header.textContent).toContain('1-1');
    expect(header.textContent).toContain(t(stage11.titleKey));
    expect(document.querySelector('[data-slot="stage"] .ds-sub')?.textContent).toContain(
      '1.5m 先のゴール',
    );
    fireEvent.click(within(header).getByRole('button', { name: t('hud.expand') }));
    expect(header.textContent).toContain(`${stage11.timeLimit} 秒`);
    expect(document.querySelector('[data-slot="stage"] .ds-sub')).toBeNull();
    expect(header.textContent).not.toContain(t('hud.header.best'));
    // クリア済みなら最高記録のメダル
    act(() =>
      useSession.setState((st) => ({
        progress: {
          ...st.progress,
          best: {
            ...st.progress.best,
            'c1-s1': {
              stageId: 'c1-s1',
              cleared: true,
              reason: null,
              time: 2,
              parts: 10,
              cost: 1200,
              energy: 50,
              distance: 1.5,
              medals: { time: 'gold', parts: 'gold', cost: 'silver', energy: null },
            },
          },
        },
      })),
    );
    expect(header.textContent).toContain(t('hud.header.best'));
  });

  it('ヒント:開くと中身が出て、影はエディタに重なり、切り替えで消せる', () => {
    const { container } = open11();
    const panel = screen.getByRole('region', { name: t('hud.hint.region') });
    expect(panel.closest('[data-slot="hints"]')).not.toBeNull();
    expect(panel.dataset.collapsed).toBe('true');
    fireEvent.click(within(panel).getByRole('button', { name: t('hud.expand') }));
    fireEvent.click(within(panel).getByRole('button', { name: /ヒントを見る/ }));
    expect(container.querySelector('.ed-ghost')).toBeNull();
    fireEvent.click(within(panel).getByRole('button', { name: /ヒントを見る/ }));
    expect(container.querySelector('.ed-ghost')).not.toBeNull();
    const sw = within(panel).getByRole('switch');
    expect(sw.getAttribute('aria-checked')).toBe('true');
    fireEvent.click(sw);
    expect(container.querySelector('.ed-ghost')).toBeNull();
    expect(within(panel).getByRole('switch').getAttribute('aria-checked')).toBe('false');
  });

  it('試走:直すところがあれば試走せず一覧を開いて場所を示し、直せば試走する', () => {
    // 直ったら一覧を閉じるのは試走の橋(App の useRunBridge)
    const off = installRunBridge();
    const { onTestRun } = open11();
    const run = screen.getByRole('button', { name: /試走する/ });
    // 押すまでは状態の 1 行だけ
    expect(screen.getByText('直すところが 1 つあります')).toBeTruthy();
    expect(document.querySelector('.hud-problems')).toBeNull();
    fireEvent.click(run);
    expect(onTestRun).not.toHaveBeenCalled();
    expect(runViewStore.getState().preflightOpen).toBe(true);
    const list = document.querySelector('.hud-problems') as HTMLElement;
    expect(list.textContent).toContain('自由度が 2');
    expect(useEditor.getState().selection.joints).toContain('B');
    expect(useSession.getState().preflight?.ok).toBe(false);
    // 直す(参考解)と一覧が閉じ、押せば試走する
    act(() => useEditor.getState().replaceDesign(stage11.reference!));
    expect(runViewStore.getState().preflightOpen).toBe(false);
    expect(document.querySelector('.hud-problems')).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: /試走する/ }));
    expect(onTestRun).toHaveBeenCalledTimes(1);
    off();
  });

  it('遊び方の本から用語集を開き、閉じると本に戻る。? キーで操作一覧', () => {
    open11();
    fireEvent.click(screen.getByRole('button', { name: /遊び方/ }));
    const book = screen.getByRole('dialog', { name: t('guide.book.title') });
    fireEvent.click(within(book).getByRole('button', { name: /次へ/ }));
    expect(within(book).getByText(/2 \/ 8/)).toBeTruthy();
    fireEvent.click(within(book).getByRole('button', { name: t('guide.book.glossary') }));
    const gloss = screen.getByRole('dialog', { name: t('guide.glossary.title') });
    fireEvent.keyDown(gloss, { key: 'Escape' });
    // 本は開いていたページに戻る
    const again = screen.getByRole('dialog', { name: t('guide.book.title') });
    expect(within(again).getByText(/2 \/ 8/)).toBeTruthy();
    fireEvent.keyDown(again, { key: 'Escape' });
    expect(screen.queryByRole('dialog')).toBeNull();
    fireEvent.keyDown(window, { key: '?' });
    expect(screen.getByRole('dialog', { name: t('guide.keys.title') })).toBeTruthy();
  });

  it('開いている間は右クリックで画面を戻さない', () => {
    open11();
    fireEvent.click(screen.getByRole('button', { name: /遊び方/ }));
    const e = new MouseEvent('contextmenu', { bubbles: true, cancelable: true });
    document.body.dispatchEvent(e);
    expect(e.defaultPrevented).toBe(true);
  });

  it('サンドボックスでは見出しは既定(自由に設計)、ヒントなし、チュートリアルなし', () => {
    act(() => useSession.getState().openSandbox());
    render(<DesignHudScreen screen="design" onTestRun={vi.fn()} />);
    expect(screen.queryByRole('region', { name: t('hud.header.region') })).toBeNull();
    expect(screen.queryByRole('region', { name: t('hud.hint.region') })).toBeNull();
    expect(screen.getByText(t('app.design.free'))).toBeTruthy();
    expect(screen.getByRole('button', { name: /遊び方/ })).toBeTruthy();
    expect(screen.getByRole('button', { name: /試走する/ })).toBeTruthy();
  });
});
