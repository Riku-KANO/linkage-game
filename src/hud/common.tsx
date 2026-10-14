import { useCallback, useState, type ReactNode } from 'react';
import { t } from '@/i18n';
import { HudIcon, type HudIconName } from './icons';

/**
 * HUD の部品で共有する小物:制御・非制御の両方に対応する値、たたむボタン、丸い小ボタン。
 */

/** value を渡せば制御、渡さなければ内部で持つ。変わるたびに onChange */
export function useControllable<T>(
  value: T | undefined,
  defaultValue: T,
  onChange?: (v: T) => void,
): [T, (v: T) => void] {
  const [inner, setInner] = useState(defaultValue);
  const controlled = value !== undefined;
  const current = controlled ? value : inner;
  const set = useCallback(
    (v: T) => {
      if (!controlled) setInner(v);
      onChange?.(v);
    },
    [controlled, onChange],
  );
  return [current, set];
}

/** たためるパネルの共通の props */
export interface CollapsibleProps {
  /** たたんでいるか(制御)。省略時は内部で持つ */
  collapsed?: boolean;
  /** 非制御のときの初期値 */
  defaultCollapsed?: boolean;
  onCollapsedChange?: (collapsed: boolean) => void;
}

export function useCollapsed({
  collapsed,
  defaultCollapsed = false,
  onCollapsedChange,
}: CollapsibleProps) {
  return useControllable(collapsed, defaultCollapsed, onCollapsedChange);
}

/** 丸い小さなボタン(たたむ・閉じる・戻る)。真鍮の縁 */
export function IconButton({
  icon,
  label,
  onClick,
  className,
  expanded,
  controls,
}: {
  icon: HudIconName;
  label: string;
  onClick: () => void;
  className?: string;
  expanded?: boolean;
  controls?: string;
}) {
  return (
    <button
      type="button"
      className={['hud-iconbtn', className].filter(Boolean).join(' ')}
      aria-label={label}
      title={label}
      aria-expanded={expanded}
      aria-controls={controls}
      onClick={onClick}
    >
      <HudIcon name={icon} size={14} />
    </button>
  );
}

/** たたむ・ひろげるボタン。山形の印が蝶番のように回る */
export function FoldButton({
  collapsed,
  onToggle,
  controls,
}: {
  collapsed: boolean;
  onToggle: () => void;
  controls?: string;
}) {
  return (
    <IconButton
      icon="chevron"
      className="hud-fold"
      label={t(collapsed ? 'hud.expand' : 'hud.collapse')}
      expanded={!collapsed}
      controls={controls}
      onClick={onToggle}
    />
  );
}

/** キーの印(ボタンの中のショートカット表示) */
export function Kbd({ children }: { children: ReactNode }) {
  return <kbd className="hud-kbd">{children}</kbd>;
}

/** class の結合 */
export const cx = (...names: (string | false | null | undefined)[]) =>
  names.filter(Boolean).join(' ');
