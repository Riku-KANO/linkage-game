import { useStore } from 'zustand';
import type { DesignDoc } from '@/core/model/types';
import { t } from '@/i18n';
import { ControlBar, VisualTogglePanel } from './ControlBar';
import type { TestRunController } from './controller';
import { MiniDesignView } from './MiniDesignView';
import { TorqueGauge } from './TorqueGauge';
import './hud.css';

/**
 * 試走ビューの DOM の操作盤一式(Canvas の上に重ねる)。
 * 下:時間操作、右上:トルク、右:表示の切り替え、左下:設計図の縮小版。
 * 親は position: relative にしておくこと(このコンテナは inset: 0 で全面に広がる)。
 */
export interface TestRunHudProps {
  controller: TestRunController;
  design: DesignDoc;
  /** キーボード操作(既定 false。ほかの画面と衝突しないよう、使う側で有効にする) */
  keyboard?: boolean;
  /** 表示の切り替えパネル(既定 true) */
  toggles?: boolean;
  highlightLinks?: readonly string[];
}

export function TestRunHud({
  controller,
  design,
  keyboard = false,
  toggles = true,
  highlightLinks,
}: TestRunHudProps) {
  const show = useStore(controller.store, (s) => s.show);
  return (
    <div className="tr-hud">
      {show.torque && <TorqueGauge controller={controller} />}
      {toggles && <VisualTogglePanel controller={controller} />}
      {show.design && (
        <MiniDesignView design={design} controller={controller} highlightLinks={highlightLinks} />
      )}
      {keyboard && <div className="tr-keys">{t('testrun.keys')}</div>}
      <ControlBar controller={controller} keyboard={keyboard} />
    </div>
  );
}
