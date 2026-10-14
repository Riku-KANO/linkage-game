// @vitest-environment jsdom
import { afterEach, describe, expect, it } from 'vitest';
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { useApp } from '@/app/store';
import HudPlayground from './HudPlayground';

afterEach(() => {
  cleanup();
  useApp.getState().setSettings({ reducedMotion: false, lowPerf: false, volume: 0.8 });
});

const tab = (name: string) => fireEvent.click(screen.getByRole('tab', { name }));

describe('HudPlayground(?dev=hud)', () => {
  it('設計画面:見出し・ヒント・チュートリアル・試走ボタン(試走前チェックは設計から)', () => {
    render(<HudPlayground />);
    expect(screen.getByRole('region', { name: 'ステージの情報' })).toBeTruthy();
    expect(screen.getByRole('region', { name: 'ヒント' })).toBeTruthy();
    expect(screen.getByRole('region', { name: 'チュートリアル' })).toBeTruthy();
    // 章 1-1 の最初の設計は自由度 2 → 試走できない
    expect(screen.getByText(/自由度が 2 で、機構がぐらつきます/)).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: /ヒントを見る/ }));
    expect(screen.getByText('ヒント 1:方針')).toBeTruthy();
  });

  it('通知を出せ、画面を切り替えても落ちない', () => {
    render(<HudPlayground />);
    for (const name of [
      'お知らせ',
      '共有リンク',
      '保存の失敗',
      '読み込みの失敗',
      '章の解放',
      '部品の解放',
    ]) {
      fireEvent.click(screen.getByRole('button', { name }));
    }
    expect(document.querySelectorAll('.hud-notice').length).toBeGreaterThanOrEqual(4);
    tab('試走中');
    expect(screen.getByRole('timer', { name: '時間' })).toBeTruthy();
    tab('ステージ選択');
    expect(screen.getByRole('region', { name: 'ステージ選択' })).toBeTruthy();
    tab('ホーム');
    expect(screen.getByRole('menu')).toBeTruthy();
    tab('設定');
    expect(screen.getByRole('region', { name: '設定' })).toBeTruthy();
  });

  it('動きを減らすはアプリの設定を切り替える', () => {
    render(<HudPlayground />);
    act(() => {
      fireEvent.click(screen.getByRole('checkbox', { name: '動きを減らす' }));
    });
    expect(useApp.getState().settings.reducedMotion).toBe(true);
    expect(document.querySelector('.hud-header.hud-rm')).toBeTruthy();
  });
});
