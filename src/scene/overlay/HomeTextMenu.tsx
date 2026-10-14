import { useEffect, useRef } from 'react';
import { t } from '@/i18n';
import { useSceneUi } from '../store';
import { MENU_ITEMS, activateMenu } from '../home/menu';

/**
 * 画面端のテキストメニュー(3D を操作しなくても使える)。↑↓ で選び Enter で決定。
 * フォーカス・ホバーした項目は工房の物体も光る(3D のホバーと同じ状態を共有)。
 */
export function HomeTextMenu() {
  const hovered = useSceneUi((s) => s.hovered);
  const refs = useRef<(HTMLButtonElement | null)[]>([]);

  // メニューの外にフォーカスがあるときも、↑↓ でメニューへ入れる
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.defaultPrevented || (e.key !== 'ArrowDown' && e.key !== 'ArrowUp')) return;
      const inside = refs.current.some((b) => b === document.activeElement);
      if (inside) return;
      e.preventDefault();
      const i = e.key === 'ArrowDown' ? 0 : MENU_ITEMS.length - 1;
      refs.current[i]?.focus();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  const move = (from: number, delta: number) => {
    const n = MENU_ITEMS.length;
    refs.current[(from + delta + n) % n]?.focus();
  };

  return (
    <nav className="ak-menu ak-enter-left" aria-label={t('scene.menu.label')}>
      <ul role="menu" aria-orientation="vertical">
        {MENU_ITEMS.map((m, i) => (
          <li key={m.id} role="none">
            <button
              ref={(el) => {
                refs.current[i] = el;
              }}
              role="menuitem"
              type="button"
              className={`ak-menu__item${hovered === m.id ? ' is-hot' : ''}`}
              tabIndex={i === 0 ? 0 : -1}
              onMouseEnter={() => useSceneUi.getState().setHovered(m.id)}
              onMouseLeave={() => {
                if (useSceneUi.getState().hovered === m.id) useSceneUi.getState().setHovered(null);
              }}
              onFocus={() => useSceneUi.getState().setHovered(m.id)}
              onBlur={() => {
                if (useSceneUi.getState().hovered === m.id) useSceneUi.getState().setHovered(null);
              }}
              onKeyDown={(e) => {
                if (e.key === 'ArrowDown') {
                  e.preventDefault();
                  move(i, 1);
                } else if (e.key === 'ArrowUp') {
                  e.preventDefault();
                  move(i, -1);
                } else if (e.key === 'Home') {
                  e.preventDefault();
                  move(0, 0);
                } else if (e.key === 'End') {
                  e.preventDefault();
                  move(MENU_ITEMS.length - 1, 0);
                }
              }}
              onClick={() => activateMenu(m.id)}
            >
              <span className="ak-menu__name">{t(m.labelKey)}</span>
              <span className="ak-menu__sub">{t(m.objectKey)}</span>
            </button>
          </li>
        ))}
      </ul>
      <p className="ak-menu__hint">{t('scene.menu.keyHint')}</p>
    </nav>
  );
}
