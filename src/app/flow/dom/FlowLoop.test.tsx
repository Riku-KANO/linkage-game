// @vitest-environment jsdom
import { afterEach, beforeAll, describe, expect, it } from 'vitest';
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { createFlatTerrain } from '@/core/sim';
import { createEmptyDesign } from '@/core/model/types';
import { createPersistence, createMemoryStorage } from '@/core/storage/persistence';
import { useEditor } from '@/editor/store';
import { getStage, nextStageId } from '@/game';
import { t } from '@/i18n';
import { createSessionStore, type SessionDeps } from '../session';
import { FlowLoop } from './FlowLoop';

/** どんな描画命令も受け付ける 2D コンテキストの代役(jsdom には canvas がない) */
function fakeContext(): CanvasRenderingContext2D {
  const target: Record<string | symbol, unknown> = {};
  return new Proxy(target, {
    get(o, key) {
      if (key in o) return o[key];
      return () => {};
    },
    set(o, key, value) {
      o[key] = value;
      return true;
    },
  }) as unknown as CanvasRenderingContext2D;
}

beforeAll(() => {
  Object.defineProperty(HTMLCanvasElement.prototype, 'getContext', {
    configurable: true,
    value: () => fakeContext(),
  });
});

let store = createSessionStore();
afterEach(() => {
  cleanup();
  store.getState().dispose();
});

const c1s1 = getStage('c1-s1')!;
const c1s2 = getStage(nextStageId('c1-s1')!)!;

describe('FlowLoop (?dev=flow, FLOW-6)', () => {
  it('plays stage select → design → test run → result → next stage', async () => {
    act(() => useEditor.getState().replaceDesign(createEmptyDesign()));
    store = createSessionStore();
    const deps: SessionDeps = {
      persistence: createPersistence(createMemoryStorage()),
      // 章 1 は平地なので Rapier の代わりに解析的な平面で速く回す
      createTerrain: async () => createFlatTerrain(0),
      readShare: () => ({ ok: false, reason: 'empty', errors: [] }),
    };
    render(<FlowLoop store={store} deps={deps} />);

    // ステージ選択:最初のステージだけ遊べる
    const first = await screen.findByRole('button', { name: new RegExp(t(c1s1.titleKey)) });
    const second = screen.getByRole('button', { name: new RegExp(t(c1s2.titleKey)) });
    expect((second as HTMLButtonElement).disabled).toBe(true);
    fireEvent.click(first);

    // 設計:チュートリアルの吹き出しと試走ボタン
    expect(await screen.findByText(t(c1s1.tutorial![0]!.key))).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: t('game.tutorial.next') }));
    fireEvent.click(screen.getByRole('button', { name: t('game.tutorial.next') }));
    expect(screen.getByText(t(c1s1.tutorial![2]!.key))).toBeTruthy();

    // 壊れたままでは試走できない(チェックの一覧が出る)
    fireEvent.click(screen.getByRole('button', { name: t('flow.ui.testRun') }));
    expect(await screen.findByText(t('flow.ui.preflight.title'))).toBeTruthy();
    expect(document.querySelector('.fl-preflight li[data-severity="error"]')).not.toBeNull();

    // ヒント
    fireEvent.click(screen.getByRole('button', { name: t('game.hint.show') }));
    expect(screen.getByText(t('game.hint.level.1'))).toBeTruthy();

    // 直すとチェックが通る
    act(() => useEditor.getState().commit(c1s1.reference!));
    expect(screen.getByText(t('flow.ui.preflight.ok'))).toBeTruthy();

    // 試走:2D の側面図が動く
    fireEvent.click(screen.getByRole('button', { name: t('flow.ui.testRun') }));
    const skip = await screen.findByRole('button', { name: t('flow.ui.skip') });
    await waitFor(() => expect(store.getState().run.phase).toBe('running'));
    await waitFor(
      () => {
        const r = store.getState().run;
        expect(r.phase === 'running' && r.live.time > 0.05).toBe(true);
      },
      { timeout: 4000 },
    );
    fireEvent.click(screen.getByRole('button', { name: t('flow.ui.pause') }));
    fireEvent.click(screen.getByRole('button', { name: t('flow.ui.play') }));
    fireEvent.click(screen.getByRole('button', { name: t('flow.ui.speed', { speed: 2 }) }));
    fireEvent.click(skip);

    // 結果:クリアして次のステージが解放される
    expect(await screen.findByRole('region', { name: t('result.region') })).toBeTruthy();
    expect(store.getState().lastOutcome?.result.cleared).toBe(true);
    expect(screen.getByText(t('game.unlock.stage', { title: t(c1s2.titleKey) }))).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: new RegExp(t('result.action.next')) }));
    await waitFor(() => expect(store.getState().slot).toBe(c1s2.id));
    expect(screen.getAllByText(new RegExp(t(c1s2.titleKey))).length).toBeGreaterThan(0);

    // ステージ選択へ戻ると 2 つ目が遊べる
    fireEvent.click(screen.getByRole('button', { name: new RegExp(t('flow.ui.backToStages')) }));
    const again = await screen.findByRole('button', { name: new RegExp(t(c1s2.titleKey)) });
    expect((again as HTMLButtonElement).disabled).toBe(false);
  });
});
