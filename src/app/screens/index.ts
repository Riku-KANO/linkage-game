import type { ScreenOverlay } from '@/scene/overlay/placeholders';
import type { Screen } from '@/ui/tokens';
import { DesignScreen } from './design/DesignScreen';

/**
 * 画面ごとの DOM(GameShell の overlays)。ここにない画面は scene の仮のオーバーレイのまま。
 * 統合が進んだ画面からここに足していく(INT-2 試走、INT-3 結果、INT-4 ステージ選択 …)。
 */
export const APP_OVERLAYS: Partial<Record<Screen, ScreenOverlay>> = {
  design: DesignScreen,
};

export { DesignScreen, useDesignPaperInsets, type DesignScreenProps } from './design/DesignScreen';
export { PaperInk } from './design/PaperInk';
export { designSignals } from './design/signals';
