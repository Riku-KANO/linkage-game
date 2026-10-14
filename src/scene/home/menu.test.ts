import { beforeEach, describe, expect, it } from 'vitest';
import { useApp } from '@/app/store';
import { findTransition } from '@/ui/tokens';
import { hasKey } from '@/i18n';
import { MENU_ITEMS, activateMenu, setMenuHandler } from './menu';

beforeEach(() => {
  useApp.setState({ screen: 'home', transition: null, history: [], seenTransitions: new Set() });
});

describe('ホームのメニュー', () => {
  it('5 項目:続きから・ステージ選択・機構図鑑・サンドボックス・設定', () => {
    expect(MENU_ITEMS.map((m) => m.id)).toEqual([
      'continue',
      'stageSelect',
      'zukan',
      'sandbox',
      'settings',
    ]);
  });

  it('各項目は要件の遷移で開く(続きから = T-07、ステージ選択 = T-01、他は T-08)', () => {
    const expected = {
      continue: 'T-07',
      stageSelect: 'T-01',
      zukan: 'T-08',
      sandbox: 'T-08',
      settings: 'T-08',
    };
    for (const m of MENU_ITEMS) {
      expect(findTransition('home', m.screen)?.id).toBe(expected[m.id]);
    }
  });

  it('選ぶとその画面へ遷移する。ホーム以外では何もしない', () => {
    activateMenu('stageSelect');
    expect(useApp.getState().screen).toBe('stageSelect');
    expect(useApp.getState().transition?.id).toBe('T-01');
    activateMenu('zukan');
    expect(useApp.getState().screen).toBe('stageSelect');
  });

  it('差し替えた処理があれば(アプリ)、遷移せずにそれを呼ぶ。ホーム以外では呼ばない', () => {
    const got: string[] = [];
    setMenuHandler((id) => got.push(id));
    try {
      activateMenu('continue');
      expect(got).toEqual(['continue']);
      expect(useApp.getState().screen).toBe('home');
      useApp.setState({ screen: 'design' });
      activateMenu('settings');
      expect(got).toEqual(['continue']);
    } finally {
      setMenuHandler(null);
    }
    useApp.setState({ screen: 'home' });
    activateMenu('settings');
    expect(useApp.getState().screen).toBe('settings');
  });

  it('文言キーがある', () => {
    for (const m of MENU_ITEMS) {
      expect(hasKey(m.labelKey)).toBe(true);
      expect(hasKey(m.objectKey)).toBe(true);
    }
  });
});
