import { useId } from 'react';
import { getChapter, stageTextParams } from '@/game';
import type { RunResult, StageDef } from '@/game/types';
import { t } from '@/i18n';
import { useReducedMotion } from '@/ui/mech';
import { BudgetMeter } from './BudgetMeter';
import { cx, FoldButton, IconButton, useCollapsed, type CollapsibleProps } from './common';
import { goalDistance } from './format';
import { MedalPips } from './MedalPips';
import { stageNumber } from './stageSelect';
import './hud.css';

export interface StageHeaderProps extends CollapsibleProps {
  stage: StageDef;
  /** 今の設計のコスト。予算のあるステージでは計算尺を出す */
  cost?: number;
  /** このステージの最高記録。クリアしていればメダルの粒を出す */
  best?: RunResult | null;
  /** ステージ選択へ戻る(省略時はボタンを出さない) */
  onBack?: () => void;
  /** 省略時はアプリと OS の設定に従う */
  reducedMotion?: boolean;
  className?: string;
}

/**
 * 設計画面の見出し(HUD-1):章とステージの名前、課題の文、ゴール・制限時間・予算。
 * 左上の端に置く木の銘板。たたむと名前の 1 行だけになり、機械を隠さない。
 */
export function StageHeader({
  stage,
  cost,
  best,
  onBack,
  reducedMotion,
  className,
  ...collapsible
}: StageHeaderProps) {
  const rm = useReducedMotion(reducedMotion);
  const [collapsed, setCollapsed] = useCollapsed(collapsible);
  const bodyId = useId();
  const chapter = getChapter(stage.chapter);
  const params = stageTextParams(stage);
  const title = t(stage.titleKey);
  const medals = best?.cleared ? best.medals : null;

  return (
    <section
      className={cx('hud-plate', 'hud-header', rm && 'hud-rm', className)}
      aria-label={t('hud.header.region')}
      data-collapsed={collapsed || undefined}
    >
      <div className="hud-header__top">
        {onBack && <IconButton icon="back" label={t('hud.header.back')} onClick={onBack} />}
        <span className="hud-tag">{stageNumber(stage)}</span>
        <div className="hud-header__names">
          <span className="hud-header__chapter">
            {t('hud.header.chapter', {
              chapter: stage.chapter,
              title: chapter ? t(chapter.titleKey) : '',
            })}
          </span>
          <h2 className="hud-header__title">{title}</h2>
        </div>
        <FoldButton
          collapsed={collapsed}
          onToggle={() => setCollapsed(!collapsed)}
          controls={bodyId}
        />
      </div>
      <div id={bodyId} className="hud-header__body" hidden={collapsed}>
        <p className="hud-header__task">
          <span className="hud-header__taskLabel">{t('hud.header.task')}</span>
          {t(stage.descKey, params)}
        </p>
        <dl className="hud-facts">
          <div className="hud-fact">
            <dt>{t('hud.header.goal')}</dt>
            <dd>{t('hud.header.goalValue', { value: round1(goalDistance(stage)) })}</dd>
          </div>
          <div className="hud-fact">
            <dt>{t('hud.header.timeLimit')}</dt>
            <dd>{t('hud.header.timeLimitValue', { value: stage.timeLimit })}</dd>
          </div>
          <div className="hud-fact">
            <dt>{t('hud.header.budget')}</dt>
            <dd>{stage.budget === null ? t('hud.header.noBudget') : stage.budget}</dd>
          </div>
          {medals && (
            <div className="hud-fact">
              <dt>{t('hud.header.best')}</dt>
              <dd>
                <MedalPips medals={medals} />
              </dd>
            </div>
          )}
        </dl>
        {stage.budget !== null && cost !== undefined && (
          <BudgetMeter cost={cost} budget={stage.budget} reducedMotion={rm} />
        )}
      </div>
    </section>
  );
}

const round1 = (v: number) => Math.round(v * 10) / 10;
