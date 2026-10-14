import type { ButtonHTMLAttributes, ReactNode } from 'react';
import { useApp } from '@/app/store';
import { playSfx } from '@/audio/sfx';
import { t } from '@/i18n';

/**
 * 画面ごとの UI パネルの入れ物。機械を隠さないよう画面の端に寄せる。
 * 出てくるときは短く滑り込む(prefers-reduced-motion では CSS 側で動きを消す)。
 */
export function Panel({
  side,
  title,
  children,
  className = '',
}: {
  side: 'left' | 'right' | 'top' | 'bottom';
  title?: string;
  children: ReactNode;
  className?: string;
}) {
  return (
    <section className={`ak-panel ak-panel--${side} ak-enter-${side} ${className}`}>
      {title && <h2 className="ak-panel__title">{title}</h2>}
      {children}
    </section>
  );
}

export function Button({
  variant = 'normal',
  onClick,
  children,
  ...rest
}: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: 'normal' | 'primary' | 'ghost' }) {
  return (
    <button
      type="button"
      className={`ak-btn ak-btn--${variant}`}
      onPointerDown={() => playSfx('press')}
      onClick={onClick}
      {...rest}
    >
      {children}
    </button>
  );
}

/** 戻るボタン(Esc・右クリックと同じ) */
export function BackButton() {
  return (
    <Button variant="ghost" onClick={() => useApp.getState().back()}>
      ← {t('scene.back')}
    </Button>
  );
}
