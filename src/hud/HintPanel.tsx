import { useId, useState } from 'react';
import { nextHint, revealedHints, stageTextParams, type HintLevel } from '@/game';
import type { StageDef } from '@/game/types';
import { t } from '@/i18n';
import { LinkButton, useReducedMotion } from '@/ui/mech';
import { cx, FoldButton, useCollapsed, type CollapsibleProps } from './common';
import { HudIcon } from './icons';
import './hud.css';

export interface HintPanelProps extends CollapsibleProps {
  stage: StageDef;
  /** 開いたヒントの数(0..3) */
  revealed: number;
  /** 次のヒントを開く */
  onReveal: () => void;
  /** 次のヒントを促す(game の suggestHint)。ボタンがそっと光る */
  suggested?: boolean;
  /** 図面に重ねている影のヒント(レベル 2・3) */
  ghostsShown?: readonly HintLevel[];
  /** 影を図面に重ねる・やめる。省略時は切り替えを出さない */
  onToggleGhost?: (level: HintLevel, show: boolean) => void;
  /** 省略時はアプリと OS の設定に従う */
  reducedMotion?: boolean;
  className?: string;
}

/**
 * 3 段階のヒント(HUD-1、決定事項):方針の一言 → 部品配置の影 → 完成形の一部。
 * 開いたヒントは紙片で並び、影のヒントは図面に重ねるかを切り替えられる。
 * 失敗が続いたら(suggested)「ヒントを見る」がそっと光って促す。左の端に置き、たためる。
 */
export function HintPanel({
  stage,
  revealed,
  onReveal,
  suggested = false,
  ghostsShown = [],
  onToggleGhost,
  reducedMotion,
  className,
  ...collapsible
}: HintPanelProps) {
  const rm = useReducedMotion(reducedMotion);
  const [collapsed, setCollapsed] = useCollapsed(collapsible);
  const bodyId = useId();
  const shown = revealedHints(stage, revealed);
  const next = nextHint(stage, revealed);
  const total = stage.hints.length;
  // 開いたときにすでにあった紙片は広げる動きをしない(新しく開いたものだけ)
  const [initialCount] = useState(shown.length);
  const params = stageTextParams(stage);
  const nudge = suggested && next !== null;

  return (
    <section
      className={cx('hud-plate', 'hud-hints', rm && 'hud-rm', className)}
      aria-label={t('hud.hint.region')}
      data-collapsed={collapsed || undefined}
      data-suggested={nudge || undefined}
    >
      <div className="hud-hints__top">
        <span className="hud-hints__lamp" aria-hidden>
          <HudIcon name="bulb" size={16} />
        </span>
        <h2 className="hud-hints__title">{t('hud.hint.title')}</h2>
        <span
          className="hud-hints__count"
          aria-label={t('hud.hint.count', { revealed: shown.length, total })}
        >
          {Array.from({ length: total }, (_, i) => (
            <i key={i} className="hud-hints__dot" data-on={i < shown.length || undefined} />
          ))}
        </span>
        <FoldButton
          collapsed={collapsed}
          onToggle={() => setCollapsed(!collapsed)}
          controls={bodyId}
        />
      </div>
      <div id={bodyId} className="hud-hints__body" hidden={collapsed}>
        {shown.length === 0 && <p className="hud-hints__empty">{t('hud.hint.empty')}</p>}
        <ol className="hud-hints__list">
          {shown.map((h, i) => {
            const label = t(h.labelKey);
            const on = ghostsShown.includes(h.level);
            return (
              <li
                key={h.level}
                className="hud-slip"
                data-kind={h.hint.kind}
                data-fresh={i >= initialCount || undefined}
              >
                <div className="hud-slip__head">
                  <span className="hud-slip__label">{label}</span>
                  {h.hint.kind === 'ghost' && onToggleGhost && (
                    <button
                      type="button"
                      className="hud-switch hud-switch--sm"
                      role="switch"
                      aria-checked={on}
                      aria-label={t('hud.hint.ghostAria', { label })}
                      onClick={() => onToggleGhost(h.level, !on)}
                    >
                      <span className="hud-switch__lever" aria-hidden>
                        <i />
                      </span>
                      <span className="hud-switch__text">{t('hud.hint.ghostOn')}</span>
                    </button>
                  )}
                </div>
                <p className="hud-slip__text">{t(h.hint.key, params)}</p>
              </li>
            );
          })}
        </ol>
        {next ? (
          <div className="hud-hints__action">
            <LinkButton
              size="sm"
              variant={nudge ? 'primary' : 'secondary'}
              reducedMotion={rm}
              className="hud-hints__reveal"
              onClick={onReveal}
              aria-describedby={nudge ? `${bodyId}-nudge` : undefined}
            >
              <HudIcon name="bulb" size={14} />
              {t('hud.hint.showLevel', { label: t(next.labelKey) })}
            </LinkButton>
            {nudge && (
              <p id={`${bodyId}-nudge`} className="hud-hints__nudge">
                {t('hud.hint.nudge')}
              </p>
            )}
          </div>
        ) : (
          <p className="hud-hints__done">{t('hud.hint.allShown')}</p>
        )}
      </div>
    </section>
  );
}
