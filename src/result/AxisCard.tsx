import { useState } from 'react';
import type { Medal, MedalThreshold } from '@/game/types';
import { t } from '@/i18n';
import { GearMeter, PressStamp } from '@/ui/mech';
import { dialMaxFor, formatValue, type AxisDef } from './axes';
import type { AxisComparison } from './compare';
import type { Span } from './timeline';

export interface AxisCardProps {
  axis: AxisDef;
  value: number;
  medal: Medal;
  thresholds: MedalThreshold;
  meter: Span;
  /** 刻印のタイミング。なければ刻印しない(失敗のとき) */
  stamp?: Span;
  skip: boolean;
  reducedMotion: boolean;
  /** 相手の記録との比較 */
  versus?: AxisComparison;
}

/** 基準値の表示:整数ならそのまま、そうでなければ軸の小数の桁で */
const fmtThreshold = (v: number, decimals: number) =>
  Number.isInteger(v) ? String(v) : formatValue(v, decimals);

/** スコア 1 軸のカード:歯車メーター(基準の色帯つき)、基準値、相手との比較、メダルのプレス */
export function AxisCard({
  axis,
  value,
  medal,
  thresholds,
  meter,
  stamp,
  skip,
  reducedMotion,
  versus,
}: AxisCardProps) {
  const [settled, setSettled] = useState(false);
  const label = t(axis.labelKey);
  const unit = t(axis.unitKey);
  const max = dialMaxFor(value, thresholds, versus?.them);
  const [gold, silver, bronze] = thresholds.map((v) => fmtThreshold(v, axis.decimals));
  const medalKey = medal ?? 'none';
  const medalName = stamp ? t(`result.medalName.${medalKey}`) : '';

  return (
    <section className="rs-card" data-axis={axis.key}>
      <div className="rs-card__main">
        <h3 className="rs-card__label">{label}</h3>
        <GearMeter
          value={value}
          max={max}
          decimals={axis.decimals}
          unit={unit}
          thresholds={thresholds}
          ghostValue={versus?.them}
          delay={meter.start}
          duration={meter.duration}
          skip={skip}
          reducedMotion={reducedMotion}
          onSettled={() => setSettled(true)}
          ariaLabel={[
            t('result.meterAria', { axis: label, value: formatValue(value, axis.decimals), unit }),
            medalName,
          ]
            .filter(Boolean)
            .join('、')}
        />
        <p
          className="rs-card__thresholds"
          aria-label={t('result.thresholds', { gold: gold!, silver: silver!, bronze: bronze! })}
        >
          <span aria-hidden>
            <i className="rs-dot rs-dot--gold" />
            {gold}
          </span>
          <span aria-hidden>
            <i className="rs-dot rs-dot--silver" />
            {silver}
          </span>
          <span aria-hidden>
            <i className="rs-dot rs-dot--bronze" />
            {bronze}
          </span>
        </p>
        {versus && (
          <p className="rs-card__versus" data-settled={settled || undefined}>
            <i className="rs-dot rs-dot--ghost" aria-hidden />
            <span>
              {t('result.opponentValue', {
                value: formatValue(versus.them, axis.decimals),
                unit,
              })}
            </span>
            <span className={`rs-badge rs-badge--${versus.winner}`}>
              {t(
                versus.winner === 'you'
                  ? 'result.win'
                  : versus.winner === 'them'
                    ? 'result.lose'
                    : 'result.tie',
              )}
            </span>
          </p>
        )}
      </div>
      <PressStamp
        className="rs-card__press"
        medal={medal}
        glyph={medal ? t(`result.medal.${medal}`) : undefined}
        armed={stamp !== undefined}
        delay={stamp?.start ?? 0}
        duration={stamp?.duration ?? 0}
        skip={skip}
        reducedMotion={reducedMotion}
        ariaLabel={medalName || undefined}
      />
    </section>
  );
}
