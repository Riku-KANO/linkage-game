import { useMemo, useState } from 'react';
import { SettingsPanel, type HudSettings } from '@/hud';
import { t } from '@/i18n';
import { perfStatus } from '@/scene/perf/PerfProbe';
import { usePrefersReducedMotion } from '@/ui/mech/useReducedMotion';
import { version } from '../../../package.json';
import { designForExport, exportDesignFile, importDesignFile, resetProgress } from '../actions';
import { setUserSettings } from '../settings';
import { useApp } from '../store';
import { useGuideBook } from './GuideBook';
import './screens.css';

/**
 * 設定(INT-5、T-08 で工具箱へ寄った後)。HUD の SettingsPanel を useApp の設定と保存につなぐ。
 *  - 音量(flow が保存)・ミュート・動きを減らす・低性能モード(利用者の選択として prefs に保存)
 *  - 低性能モードを自動で選んでいるときは、その理由を添える(出どころ:自動 / 利用者)
 *  - 設計の書き出し・読み込み(U-03)、進行のリセット(2 段階)
 *  - 遊び方の本(INT-7b。用語集・操作一覧へも)
 */
export function SettingsScreen() {
  const settings = useApp((s) => s.settings);
  const osReducedMotion = usePrefersReducedMotion();
  // 書き出せる設計があるか(開いた時点で決める。ホームにいる間は変わらない)
  const [canExport] = useState(() => designForExport() !== null);
  const value: HudSettings = useMemo(
    () => ({
      volume: settings.volume,
      muted: settings.muted ?? false,
      reducedMotion: settings.reducedMotion,
      lowPerf: settings.lowPerf,
    }),
    [settings],
  );
  const guide = useGuideBook();
  const reason = perfStatus.decision?.reason;
  const autoNote =
    settings.sources?.lowPerf !== 'user' &&
    settings.lowPerf &&
    (reason === 'software' || reason === 'slow')
      ? t('home.settings.lowPerfAuto', { reason: t(`scene.settings.reason.${reason}`) })
      : null;

  return (
    <div className="app-dock app-dock--left app-settings">
      <SettingsPanel
        settings={value}
        osReducedMotion={osReducedMotion}
        onChange={(patch) => setUserSettings(patch)}
        onExportDesign={canExport ? () => void exportDesignFile() : undefined}
        onImportDesign={(file) => void importDesignFile(file)}
        onHowToPlay={() => guide.open('book')}
        onResetProgress={resetProgress}
        onClose={() => useApp.getState().back()}
        version={`v${version}`}
      />
      {autoNote && <p className="app-note">{autoNote}</p>}
      {guide.element}
    </div>
  );
}
