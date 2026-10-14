import { useRef, type KeyboardEvent } from 'react';
import { playSfx } from '@/audio/sfx';
import { t } from '@/i18n';
import { useReducedMotion } from '@/ui/mech';
import { cx, useControllable } from './common';
import { MiniGear } from './MiniGear';
import { listMove } from './nav';
import './hud.css';

export interface TextMenuItem {
  id: string;
  /** 項目名の i18n キー */
  labelKey: string;
  /** 説明の i18n キー */
  descKey?: string;
  /** 選べない(準備中など)。フォーカスはできる */
  disabled?: boolean;
  /** 選べない理由などの添え書き(i18n キー) */
  badgeKey?: string;
}

export interface TextMenuProps {
  items: readonly TextMenuItem[];
  /** 項目を選んだ(Enter・Space・クリック) */
  onSelect: (id: string) => void;
  /** 光っている項目(制御)。3D の工房で物体にマウスを乗せたときに合わせる */
  activeId?: string | null;
  /** マウスやキーボードで光る項目が変わった(3D の物体の輪郭を光らせるのに使う) */
  onActiveChange?: (id: string | null) => void;
  /** 読み上げ用の名前(既定「メニュー」) */
  ariaLabel?: string;
  /** 最初の項目にフォーカスを移す */
  autoFocus?: boolean;
  /** 省略時はアプリと OS の設定に従う */
  reducedMotion?: boolean;
  className?: string;
}

/**
 * テキストのメニュー(HUD-2、ホームの端のメニュー)。3D を操作しなくても同じ項目を
 * キーボードで選べる。上下で移り、Enter で選ぶ。光っている項目には小さな歯車が回る。
 */
export function TextMenu({
  items,
  onSelect,
  activeId,
  onActiveChange,
  ariaLabel,
  autoFocus = false,
  reducedMotion,
  className,
}: TextMenuProps) {
  const rm = useReducedMotion(reducedMotion);
  const [active, setActive] = useControllable<string | null>(activeId, null, onActiveChange);
  const refs = useRef(new Map<string, HTMLButtonElement>());
  const firstEnabled = items.find((i) => !i.disabled) ?? items[0];
  // キーボードの入口(Tab で入ってくる項目)は光っている項目、なければ最初の選べる項目
  const tabStop = items.find((i) => i.id === active)?.id ?? firstEnabled?.id;

  const select = (item: TextMenuItem) => {
    if (item.disabled) {
      playSfx('error', { volume: 0.4 });
      return;
    }
    onSelect(item.id);
  };

  const onKeyDown = (e: KeyboardEvent<HTMLUListElement>) => {
    // 今フォーカスのある項目から動く(なければ光っている項目)
    const target = e.target instanceof Element ? e.target.closest('[data-id]') : null;
    const from = target?.getAttribute('data-id') ?? active ?? tabStop;
    const index = Math.max(
      0,
      items.findIndex((i) => i.id === from),
    );
    if (e.key === 'Enter' || e.key === ' ') {
      const item = items[index];
      if (!item) return;
      e.preventDefault();
      select(item);
      return;
    }
    const next = listMove(index, e.key, items.length);
    if (next === null) return;
    e.preventDefault();
    const item = items[next];
    if (!item) return;
    setActive(item.id);
    refs.current.get(item.id)?.focus({ preventScroll: true });
  };

  return (
    <nav
      className={cx('hud-plate', 'hud-menu', rm && 'hud-rm', className)}
      aria-label={ariaLabel ?? t('hud.menu.region')}
    >
      <ul className="hud-menu__list" role="menu" aria-orientation="vertical" onKeyDown={onKeyDown}>
        {items.map((item) => {
          const on = item.id === active;
          return (
            <li key={item.id} role="none">
              <button
                ref={(el) => {
                  if (el) refs.current.set(item.id, el);
                  else refs.current.delete(item.id);
                }}
                type="button"
                role="menuitem"
                data-id={item.id}
                className="hud-menu__item"
                data-active={on || undefined}
                aria-disabled={item.disabled || undefined}
                tabIndex={item.id === tabStop ? 0 : -1}
                autoFocus={autoFocus && item.id === tabStop}
                onClick={() => select(item)}
                onPointerEnter={() => setActive(item.id)}
                onPointerLeave={() => {
                  if (on) setActive(null);
                }}
                onFocus={() => {
                  if (!on) setActive(item.id);
                }}
              >
                <MiniGear spin={on && !rm} size={16} className="hud-menu__gear" />
                <span className="hud-menu__text">
                  <span className="hud-menu__label">
                    {t(item.labelKey)}
                    {item.badgeKey && <em className="hud-menu__badge">{t(item.badgeKey)}</em>}
                  </span>
                  {item.descKey && <span className="hud-menu__desc">{t(item.descKey)}</span>}
                </span>
              </button>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}

/** ホームのテキストメニューの項目(工房の物体と同じ並び)。図鑑とサンドボックスは MVP では準備中 */
export function homeMenuItems({ canContinue }: { canContinue: boolean }): TextMenuItem[] {
  const soon = { disabled: true, badgeKey: 'hud.menu.soon' };
  return [
    {
      id: 'continue',
      labelKey: 'hud.menu.continue',
      descKey: 'hud.menu.continue.desc',
      disabled: !canContinue,
    },
    { id: 'stageSelect', labelKey: 'hud.menu.stageSelect', descKey: 'hud.menu.stageSelect.desc' },
    { id: 'zukan', labelKey: 'hud.menu.zukan', descKey: 'hud.menu.zukan.desc', ...soon },
    { id: 'sandbox', labelKey: 'hud.menu.sandbox', descKey: 'hud.menu.sandbox.desc', ...soon },
    { id: 'settings', labelKey: 'hud.menu.settings', descKey: 'hud.menu.settings.desc' },
  ];
}
