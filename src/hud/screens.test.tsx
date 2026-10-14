// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { registerSfx, type SfxName } from '@/audio/sfx';
import {
  homeMenuItems,
  RESET_CONFIRM_MS,
  SettingsPanel,
  StageSelectPanel,
  TextMenu,
  type HudSettings,
} from './index';
import { sampleProgress } from './samples';

let sounds: SfxName[] = [];
beforeEach(() => {
  sounds = [];
  registerSfx((name) => sounds.push(name));
});
afterEach(() => {
  cleanup();
  vi.useRealTimers();
  registerSfx(() => {});
});

const tile = (name: RegExp) => screen.getByRole('button', { name });
const key = (k: string) => fireEvent.keyDown(document.activeElement!, { key: k });

describe('StageSelectPanel', () => {
  const setup = (progress = sampleProgress('mid'), extra = {}) => {
    const cbs = { onSelectStage: vi.fn(), onFocusStage: vi.fn(), onClose: vi.fn() };
    render(<StageSelectPanel progress={progress} reducedMotion {...cbs} {...extra} />);
    return cbs;
  };

  it('章とステージ、解放・クリア・メダルを読み上げ用の名前で出す', () => {
    setup();
    expect(screen.getByRole('region', { name: 'ステージ選択' })).toBeTruthy();
    expect(screen.getByRole('group', { name: /第 1 章 はじめの一歩/ })).toBeTruthy();
    expect(screen.getByRole('group', { name: /第 2 章 段差を越える/ })).toBeTruthy();
    expect(tile(/^1-1 こわれた機械、クリア済み、金 1・銀 1・銅 1/)).toBeTruthy();
    expect(tile(/^1-3 はじめての脚、次に遊ぶステージ/)).toBeTruthy();
    expect(tile(/^1-4 .*、ロック中/).getAttribute('aria-disabled')).toBe('true');
    expect(tile(/^2-1 .*、ロック中/)).toBeTruthy();
    // 章 3〜5 は準備中(札はない)
    expect(screen.getAllByText('準備中')).toHaveLength(3);
  });

  it('開くと「次」のステージにフォーカスし、下の欄にその課題と記録', () => {
    setup();
    const next = tile(/^1-3/);
    expect(document.activeElement).toBe(next);
    expect(next.getAttribute('tabindex')).toBe('0');
    expect(tile(/^1-1/).getAttribute('tabindex')).toBe('-1');
    const desc = document.getElementById(next.getAttribute('aria-describedby')!)!;
    expect(desc.textContent).toContain('白紙から四節リンクの脚を組み立てよう');
    // 失敗の記録だけなら「最高 x m まで」
    expect(screen.getByText('最高 0.82 m まで')).toBeTruthy();
  });

  it('矢印キーで移り(onFocusStage)、Enter で始める。ロック中は始めない', () => {
    const cbs = setup();
    key('ArrowLeft');
    expect(document.activeElement).toBe(tile(/^1-2/));
    expect(cbs.onFocusStage).toHaveBeenLastCalledWith('c1-s2');
    key('Enter');
    expect(cbs.onSelectStage).toHaveBeenCalledWith('c1-s2');
    key('ArrowDown');
    expect(document.activeElement).toBe(tile(/^2-2/));
    key('Enter');
    expect(cbs.onSelectStage).toHaveBeenCalledTimes(1);
    expect(sounds).toContain('error');
    key('Home');
    expect(document.activeElement).toBe(tile(/^2-1/));
    key('ArrowUp');
    expect(document.activeElement).toBe(tile(/^1-1/));
  });

  it('クリックで選び、ダブルクリック・「遊ぶ」で始める。Esc で戻る', () => {
    const cbs = setup();
    fireEvent.click(tile(/^1-1/));
    expect(cbs.onFocusStage).toHaveBeenLastCalledWith('c1-s1');
    expect(cbs.onSelectStage).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: /もう一度遊ぶ/ }));
    expect(cbs.onSelectStage).toHaveBeenLastCalledWith('c1-s1');
    fireEvent.doubleClick(tile(/^1-2/));
    expect(cbs.onSelectStage).toHaveBeenLastCalledWith('c1-s2');
    key('Escape');
    expect(cbs.onClose).toHaveBeenCalledTimes(1);
    fireEvent.click(screen.getByRole('button', { name: '閉じる' }));
    expect(cbs.onClose).toHaveBeenCalledTimes(2);
  });

  it('ロック中のステージを選ぶと「遊ぶ」は押せず、理由を添える', () => {
    setup(sampleProgress('new'), { focusedStageId: 'c1-s4', autoFocus: false });
    const play = screen.getByRole('button', { name: /このステージで遊ぶ/ }) as HTMLButtonElement;
    expect(play.disabled).toBe(true);
    expect(screen.getByText('前のステージをクリアすると遊べます')).toBeTruthy();
  });

  it('章 1 をクリアすると章クリアの印、全部クリアなら「次」はない', () => {
    setup(sampleProgress('ch1'), { autoFocus: false });
    expect(screen.getByText('章クリア')).toBeTruthy();
    expect(tile(/^2-1 .*、次に遊ぶステージ/)).toBeTruthy();
    cleanup();
    setup(sampleProgress('all'), { autoFocus: false });
    expect(screen.queryByText('つぎ')).toBeNull();
    expect(screen.getAllByText('章クリア')).toHaveLength(2);
  });
});

describe('TextMenu', () => {
  const setup = (extra = {}) => {
    const onSelect = vi.fn();
    const onActiveChange = vi.fn();
    render(
      <TextMenu
        items={homeMenuItems({ canContinue: true })}
        onSelect={onSelect}
        onActiveChange={onActiveChange}
        reducedMotion
        {...extra}
      />,
    );
    return { onSelect, onActiveChange, items: () => screen.getAllByRole('menuitem') };
  };

  it('項目と説明、準備中の項目は選べない', () => {
    const s = setup();
    expect(s.items().map((i) => i.textContent)).toEqual([
      '続きから作業台で、最後の設計の続きを',
      'ステージ選択壁のコース模型から課題を選ぶ',
      '機構図鑑準備中組めた有名な機構を眺める',
      'サンドボックス準備中窓の外の荒野で自由に試す',
      '設定音・動き・データの書き出し',
    ]);
    fireEvent.click(s.items()[2]!);
    expect(s.onSelect).not.toHaveBeenCalled();
    expect(sounds).toContain('error');
    fireEvent.click(s.items()[1]!);
    expect(s.onSelect).toHaveBeenCalledWith('stageSelect');
  });

  it('上下・Home・End で移り、Enter で選ぶ。光る項目を知らせる', () => {
    const s = setup({ autoFocus: true });
    expect(document.activeElement).toBe(s.items()[0]);
    key('ArrowDown');
    expect(document.activeElement).toBe(s.items()[1]);
    expect(s.onActiveChange).toHaveBeenLastCalledWith('stageSelect');
    key('End');
    expect(document.activeElement).toBe(s.items()[4]);
    key('ArrowDown');
    expect(document.activeElement).toBe(s.items()[0]);
    key('ArrowUp');
    key('Enter');
    expect(s.onSelect).toHaveBeenCalledWith('settings');
  });

  it('3D の物体に合わせて光らせる(activeId)。マウスを乗せても知らせる', () => {
    const s = setup({ activeId: 'settings' });
    expect(s.items()[4]!.hasAttribute('data-active')).toBe(true);
    expect(s.items()[4]!.getAttribute('tabindex')).toBe('0');
    fireEvent.pointerEnter(s.items()[1]!);
    expect(s.onActiveChange).toHaveBeenLastCalledWith('stageSelect');
  });

  it('続きがなければ「続きから」は選べない', () => {
    const items = homeMenuItems({ canContinue: false });
    expect(items[0]!.disabled).toBe(true);
  });
});

describe('SettingsPanel', () => {
  const base: HudSettings = { volume: 0.8, muted: false, reducedMotion: false, lowPerf: false };
  const setup = (extra = {}) => {
    const cbs = {
      onChange: vi.fn(),
      onResetProgress: vi.fn(),
      onExportDesign: vi.fn(),
      onImportDesign: vi.fn(),
      onClose: vi.fn(),
    };
    render(<SettingsPanel settings={base} version="v0.1.0" reducedMotion {...cbs} {...extra} />);
    return cbs;
  };

  it('音量・ミュート・動きを減らす・低性能モードを変える', () => {
    const cbs = setup();
    const vol = screen.getByRole('slider', { name: '音量' });
    expect(vol.getAttribute('aria-valuetext')).toBe('80%');
    fireEvent.change(vol, { target: { value: '35' } });
    expect(cbs.onChange).toHaveBeenLastCalledWith({ volume: 0.35 });
    fireEvent.click(screen.getByRole('switch', { name: /ミュート/ }));
    expect(cbs.onChange).toHaveBeenLastCalledWith({ muted: true });
    fireEvent.click(screen.getByRole('switch', { name: '動きを減らす' }));
    expect(cbs.onChange).toHaveBeenLastCalledWith({ reducedMotion: true });
    const lp = screen.getByRole('switch', { name: '低性能モード' });
    expect(lp.getAttribute('aria-checked')).toBe('false');
    fireEvent.click(lp);
    expect(cbs.onChange).toHaveBeenLastCalledWith({ lowPerf: true });
  });

  it('OS で動きを減らしているときは、オンのまま変えられない', () => {
    setup({ osReducedMotion: true });
    const sw = screen.getByRole('switch', { name: '動きを減らす' }) as HTMLButtonElement;
    expect(sw.getAttribute('aria-checked')).toBe('true');
    expect(sw.disabled).toBe(true);
    expect(screen.getByText('OS の設定で動きを減らしています')).toBeTruthy();
  });

  it('設計の書き出し・読み込み(ファイルを選ぶ)', () => {
    const cbs = setup();
    fireEvent.click(screen.getByRole('button', { name: /設計を書き出す/ }));
    expect(cbs.onExportDesign).toHaveBeenCalledTimes(1);
    const input = screen.getByTestId('hud-import-file') as HTMLInputElement;
    const click = vi.spyOn(input, 'click');
    fireEvent.click(screen.getByRole('button', { name: /設計を読み込む/ }));
    expect(click).toHaveBeenCalled();
    const file = new File(['{}'], 'machine.json', { type: 'application/json' });
    fireEvent.change(input, { target: { files: [file] } });
    expect(cbs.onImportDesign).toHaveBeenCalledWith(file);
  });

  it('進行のリセットは 2 段階。「やめる」・Esc・時間切れで戻る', () => {
    vi.useFakeTimers();
    const cbs = setup();
    fireEvent.click(screen.getByRole('button', { name: /進行をリセット/ }));
    expect(screen.getByRole('alert').textContent).toContain('本当に消しますか');
    expect(document.activeElement).toBe(screen.getByRole('button', { name: 'やめる' }));
    fireEvent.click(screen.getByRole('button', { name: 'やめる' }));
    expect(cbs.onResetProgress).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: /進行をリセット/ }));
    key('Escape');
    expect(screen.queryByRole('alert')).toBeNull();
    expect(cbs.onClose).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: /進行をリセット/ }));
    act(() => {
      vi.advanceTimersByTime(RESET_CONFIRM_MS + 10);
    });
    expect(screen.queryByRole('alert')).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: /進行をリセット/ }));
    fireEvent.click(screen.getByRole('button', { name: '消す' }));
    expect(cbs.onResetProgress).toHaveBeenCalledTimes(1);
  });

  it('Esc・閉じるボタンで閉じる。クレジットに版', () => {
    const cbs = setup();
    fireEvent.keyDown(screen.getByRole('slider'), { key: 'Escape' });
    expect(cbs.onClose).toHaveBeenCalledTimes(1);
    fireEvent.click(screen.getByRole('button', { name: '閉じる' }));
    expect(cbs.onClose).toHaveBeenCalledTimes(2);
    expect(screen.getByText(/アシクミ v0\.1\.0/)).toBeTruthy();
  });

  it('書き出し・読み込みがなければその欄を出さない', () => {
    render(
      <SettingsPanel
        settings={base}
        onChange={() => {}}
        onResetProgress={() => {}}
        reducedMotion
      />,
    );
    const region = screen.getAllByRole('region', { name: '設定' }).at(-1)!;
    expect(within(region).queryByText('設計データ')).toBeNull();
  });
});
