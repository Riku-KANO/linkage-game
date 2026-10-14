import type { ScreenOverlay } from '@/scene';
import type { Screen } from '@/ui/tokens';
import { HomeScreen } from './HomeScreen';
import { SettingsScreen } from './SettingsScreen';
import { StageSelectScreen } from './StageSelectScreen';
import { SandboxScreen } from './SandboxScreen';
import { ZukanScreen } from './ZukanScreen';

/**
 * ホーム側の画面(stream int-home:INT-4 ステージ選択、INT-5 ホーム・設定・図鑑・サンドボックス)。
 * GameShell の overlays に渡す。設計・試走・結果の画面は別のストリームが足す。
 */
export const HOME_OVERLAYS: Partial<Record<Screen, ScreenOverlay>> = {
  home: HomeScreen,
  stageSelect: StageSelectScreen,
  settings: SettingsScreen,
  zukan: ZukanScreen,
  sandbox: SandboxScreen,
};

export { HomeScreen, homeItems } from './HomeScreen';
export { StageSelectScreen } from './StageSelectScreen';
export { SettingsScreen } from './SettingsScreen';
export { ZukanScreen } from './ZukanScreen';
export { SandboxScreen } from './SandboxScreen';
export { NoticeLayer } from './NoticeLayer';
