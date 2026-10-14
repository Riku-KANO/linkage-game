import { t } from '@/i18n';
import { useReducedMotion } from '@/ui/mech';
import { cx } from './common';
import { budgetState } from './format';
import './hud.css';

export interface BudgetMeterProps {
  /** 今の設計のコスト(E-07 の computeBill) */
  cost: number;
  /** 予算。null なら「予算なし」とだけ出す */
  budget: number | null;
  /** 省略時はアプリと OS の設定に従う */
  reducedMotion?: boolean;
  className?: string;
}

const TICKS = Array.from({ length: 11 }, (_, i) => i);

/**
 * 予算の計算尺。目盛りの上を真鍮の指針が滑り、9 割を超えると琥珀色、超えると赤く震える。
 * 動かすのは transform だけ(幅は固定でレイアウトがずれない)。
 */
export function BudgetMeter({ cost, budget, reducedMotion, className }: BudgetMeterProps) {
  const rm = useReducedMotion(reducedMotion);
  const s = budgetState(cost, budget);
  const shownCost = Math.round(cost);
  if (s.level === 'none' || budget === null) {
    return (
      <div className={cx('hud-budget', 'hud-budget--none', className)}>
        <span className="hud-budget__label">{t('hud.budget.label')}</span>
        <span className="hud-budget__value">{shownCost}</span>
        <span className="hud-budget__note">{t('hud.budget.none')}</span>
      </div>
    );
  }
  const remaining = s.remaining ?? 0;
  return (
    <div
      className={cx('hud-budget', rm && 'hud-rm', className)}
      data-level={s.level}
      role="meter"
      aria-label={t('hud.budget.label')}
      aria-valuemin={0}
      aria-valuemax={budget}
      aria-valuenow={Math.min(shownCost, budget)}
      aria-valuetext={t('hud.budget.aria', { cost: shownCost, budget })}
    >
      <div className="hud-budget__row">
        <span className="hud-budget__label">{t('hud.budget.label')}</span>
        <span className="hud-budget__value">
          {t('hud.budget.value', { cost: shownCost, budget })}
        </span>
        <span className="hud-budget__note">
          {remaining >= 0
            ? t('hud.budget.left', { value: Math.round(remaining) })
            : t('hud.budget.over', { value: Math.round(-remaining) })}
        </span>
      </div>
      <div className="hud-budget__track" aria-hidden>
        <div className="hud-budget__fill" style={{ transform: `scaleX(${s.ratio})` }} />
        {TICKS.map((i) => (
          <i
            key={i}
            className={cx('hud-budget__tick', i % 5 === 0 && 'hud-budget__tick--major')}
            style={{ left: `${i * 10}%` }}
          />
        ))}
        <div className="hud-budget__rail" style={{ transform: `translateX(${s.ratio * 100}%)` }}>
          <i className="hud-budget__pointer" />
        </div>
      </div>
    </div>
  );
}
