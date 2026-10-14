import { useApp } from '@/app/store';
import { playSfx } from '@/audio/sfx';
import type { Screen } from '@/ui/tokens';
import type { MenuItemId } from '../store';

/**
 * ホームのメニュー項目。工房の物体と画面端のテキストメニューは同じ一覧を使う。
 * 並び順はテキストメニューの上から下。
 */
export interface MenuItem {
  id: MenuItemId;
  screen: Screen;
  /** メニューの名前 */
  labelKey: string;
  /** 工房の中の物体の名前 */
  objectKey: string;
}

export const MENU_ITEMS: readonly MenuItem[] = [
  {
    id: 'continue',
    screen: 'design',
    labelKey: 'scene.menu.continue',
    objectKey: 'scene.object.continue',
  },
  {
    id: 'stageSelect',
    screen: 'stageSelect',
    labelKey: 'scene.menu.stageSelect',
    objectKey: 'scene.object.stageSelect',
  },
  { id: 'zukan', screen: 'zukan', labelKey: 'scene.menu.zukan', objectKey: 'scene.object.zukan' },
  {
    id: 'sandbox',
    screen: 'sandbox',
    labelKey: 'scene.menu.sandbox',
    objectKey: 'scene.object.sandbox',
  },
  {
    id: 'settings',
    screen: 'settings',
    labelKey: 'scene.menu.settings',
    objectKey: 'scene.object.settings',
  },
];

export function menuItem(id: MenuItemId): MenuItem {
  return MENU_ITEMS.find((m) => m.id === id)!;
}

type MenuHandler = (id: MenuItemId) => void;
let handler: MenuHandler | null = null;

/**
 * (int-home で追加)メニュー項目を選んだときの処理を差し替える(アプリが設定する。null で既定に戻す)。
 * 工房の物体のクリックと端のテキストメニューの両方がここを通る(「続きから」でステージを開くなど)。
 */
export function setMenuHandler(fn: MenuHandler | null): void {
  handler = fn;
}

/** メニュー項目を選ぶ:ホームにいるときだけ、その画面へ遷移する(差し替えた処理があればそれを呼ぶ) */
export function activateMenu(id: MenuItemId): void {
  const app = useApp.getState();
  if (app.screen !== 'home') return;
  if (handler) {
    handler(id);
    return;
  }
  playSfx('press');
  app.go(menuItem(id).screen);
}
