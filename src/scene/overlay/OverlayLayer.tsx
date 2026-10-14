import type { ReactNode } from 'react';
import { useApp } from '@/app/store';
import { t } from '@/i18n';
import type { Screen } from '@/ui/tokens';
import { useSceneUi } from '../store';
import { HomeTextMenu } from './HomeTextMenu';
import type { ScreenOverlay } from './placeholders';

/**
 * DOM のオーバーレイ層(Canvas の上に全画面で重なる。座標は Canvas と同じ CSS px)。
 * 層そのものはマウスを素通しし(pointer-events: none)、パネルだけが受け取る。
 * 今の画面のオーバーレイは、カメラが行き先に着く頃(遷移が revealAt を過ぎたとき)に現れる。
 */
export function OverlayLayer({
  overlays,
  children,
}: {
  overlays: Partial<Record<Screen, ScreenOverlay>>;
  children?: ReactNode;
}) {
  const screen = useApp((s) => s.screen);
  const canGoBack = useApp((s) => s.history.length > 0);
  const revealed = useSceneUi((s) => s.revealed);
  const visible = revealed === screen;
  const Overlay = overlays[screen];
  return (
    <div className="ak-overlay">
      {screen === 'boot' && <p className="ak-hint ak-hint--boot">{t('scene.boot.skipHint')}</p>}
      {/* ホームのオーバーレイを渡されたら(アプリの HUD のメニュー)、仮のテキストメニューは出さない */}
      {screen === 'home' && visible && !overlays.home && <HomeTextMenu />}
      {Overlay && visible && <Overlay key={screen} screen={screen} />}
      {visible && canGoBack && <p className="ak-hint ak-hint--back">{t('scene.backHint')}</p>}
      {children}
    </div>
  );
}
