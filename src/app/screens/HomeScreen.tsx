import { useEffect, useMemo, useRef } from 'react';
import { homeMenuItems, TextMenu, type TextMenuItem } from '@/hud';
import { t } from '@/i18n';
import { MENU_ITEMS } from '@/scene/home/menu';
import { useSceneUi, type MenuItemId } from '@/scene/store';
import { activateHomeItem, currentContinueTarget } from '../actions';
import { useSession } from '../flow';
import './screens.css';

/**
 * ホームの端のテキストメニュー(INT-5、3D を操作しなくても使える)。HUD の TextMenu を使い、
 * 光っている項目は scene のホバー(useSceneUi.hovered)と共有する:工房の物体にマウスを乗せると
 * この項目が光り、この項目にマウス・フォーカスを当てると工房の物体の輪郭が光る。
 * 選んだときの処理は工房の物体のクリックと同じ activateHomeItem(scene の setMenuHandler 経由)。
 */
export function HomeScreen() {
  const hovered = useSceneUi((s) => s.hovered);
  const progress = useSession((s) => s.progress);
  // 続きの先は進行と最後のスロットで決まる(ホームにいる間にスロットは変わらない)
  const canContinue = useMemo(() => currentContinueTarget() !== null, [progress]);
  const items = useMemo(() => homeItems(canContinue), [canContinue]);
  const root = useRef<HTMLDivElement>(null);

  // メニューの外にフォーカスがあるときも、↑↓ でメニューへ入れる(戻ってきた直後など)
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.defaultPrevented || (e.key !== 'ArrowDown' && e.key !== 'ArrowUp')) return;
      const el = root.current;
      if (!el || el.contains(document.activeElement)) return;
      const buttons = el.querySelectorAll<HTMLButtonElement>('[role="menuitem"]');
      const target = e.key === 'ArrowDown' ? buttons[0] : buttons[buttons.length - 1];
      if (!target) return;
      e.preventDefault();
      target.focus();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  return (
    <div ref={root} className="app-home">
      <TextMenu
        items={items}
        activeId={hovered}
        onActiveChange={(id) => useSceneUi.getState().setHovered(isMenuItemId(id) ? id : null)}
        onSelect={(id) => {
          if (isMenuItemId(id)) activateHomeItem(id);
        }}
      />
      <p className="app-home__hint">{t('home.menu.keyHint')}</p>
    </div>
  );
}

/**
 * ホームの項目(工房の物体と同じ並び)。HUD の既定では図鑑とサンドボックスは選べないが、
 * アプリでは図鑑は「準備中」の札を付けたまま小さなパネルを開き、サンドボックスは設計画面を開く。
 */
export function homeItems(canContinue: boolean): TextMenuItem[] {
  return homeMenuItems({ canContinue }).map((item) => {
    if (item.id === 'zukan') return { ...item, disabled: false };
    if (item.id === 'sandbox') return { ...item, disabled: false, badgeKey: undefined };
    return item;
  });
}

function isMenuItemId(id: string | null): id is MenuItemId {
  return id !== null && MENU_ITEMS.some((m) => m.id === id);
}
