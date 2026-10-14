import { useEffect, useMemo, useRef, useState } from 'react';
import { playSfx } from '@/audio/sfx';
import type { DesignDoc, Ghost, ShareRun } from '@/core/model';
import type { RunResult, StageDef } from '@/game/types';
import { t } from '@/i18n';
import { LinkButton, LinkagePanel, useReducedMotion } from '@/ui/mech';
import { AXES, reasonKeyFor } from './axes';
import { AxisCard } from './AxisCard';
import { compareRuns, toShareRun } from './compare';
import { ShareRow } from './ShareRow';
import { buildResultTimeline } from './timeline';
import './result.css';

export interface ResultPanelProps {
  result: RunResult;
  stage: StageDef;
  /** 失敗理由の文言キー(game が判定したもの)。なければ result.reason から */
  reasonKey?: string;
  /** 失敗したときの次の一手(game の diagnoseFailure の adviceKey)。理由の下に出す */
  adviceKey?: string;
  /** 共有リンクに入れる設計 */
  design: DesignDoc;
  /** 共有リンクに入れるゴースト(この試走の記録) */
  ghost?: Ghost;
  /** 共有リンクで受け取った相手の記録。あれば軸ごとに比べる */
  opponent?: ShareRun;
  /** 2 回目以降の短縮版 */
  short?: boolean;
  onRetry: () => void;
  onBackToDesign: () => void;
  /** 次のステージへ(クリアしたときだけ出す) */
  onNext?: () => void;
  /** 転倒の瞬間を再生する(失敗したときだけ出す) */
  onReplayFall?: () => void;
  /** 省略時はアプリの設定(useApp)と OS の設定に従う */
  reducedMotion?: boolean;
  className?: string;
}

/** スキップに使わないキー(フォーカス移動と修飾キー) */
const PASS_KEYS = new Set(['Tab', 'Shift', 'Control', 'Alt', 'Meta', 'CapsLock']);

/**
 * 結果画面のパネル(RS-1〜RS-3)。伸縮リンクで開き、4 軸の歯車メーターが順に回って止まり、
 * メダルをプレスで刻印する。クリックかキーでいつでも最終状態へスキップできる。
 * ゲームの状態は持たない:行動はすべてコールバックで返す。
 */
export function ResultPanel({
  result,
  stage,
  reasonKey,
  adviceKey,
  design,
  ghost,
  opponent,
  short = false,
  onRetry,
  onBackToDesign,
  onNext,
  onReplayFall,
  reducedMotion,
  className,
}: ResultPanelProps) {
  const rm = useReducedMotion(reducedMotion);
  const cleared = result.cleared;
  // 演出の段取りは開いたときに 1 回だけ決める(途中で設定が変わっても組み直さない)
  const [timeline] = useState(() =>
    buildResultTimeline({ short, reducedMotion: rm, stamps: cleared }),
  );
  const [skipped, setSkipped] = useState(false);
  const [done, setDone] = useState(false);
  const comparison = useMemo(
    () => (opponent ? compareRuns(toShareRun(result), opponent) : null),
    [opponent, result],
  );

  // 演出の終わり(子の部品はそれぞれの時計で動く。ここは毎フレーム再描画しない)
  useEffect(() => {
    if (skipped) {
      setDone(true);
      return;
    }
    const id = setTimeout(() => {
      setDone(true);
      if (cleared) playSfx('success');
    }, timeline.total * 1000);
    return () => clearTimeout(id);
  }, [skipped, timeline.total, cleared]);

  // キーでスキップ(演出中だけ)
  useEffect(() => {
    if (done) return;
    const onKey = (e: KeyboardEvent) => {
      // フォーカス移動・修飾キー・ショートカット(Cmd+C など)はスキップに使わない
      if (PASS_KEYS.has(e.key) || e.metaKey || e.ctrlKey || e.altKey) return;
      setSkipped(true);
      const target = e.target instanceof Element ? e.target : null;
      const onControl = target?.closest('button, input, textarea, select, a[href]');
      if (!onControl && (e.key === ' ' || e.key === 'Enter')) e.preventDefault();
    };
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
  }, [done]);

  // 演出が終わったら主な行動にフォーカス(ほかにフォーカスがないときだけ)
  const primaryRef = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    if (!done) return;
    const active = document.activeElement;
    if (!active || active === document.body) primaryRef.current?.focus({ preventScroll: true });
  }, [done]);

  const skip = () => {
    if (!done) setSkipped(true);
  };

  const course = stage.goal.x - stage.start.x;
  const primary: 'next' | 'retry' | 'back' = cleared ? (onNext ? 'next' : 'retry') : 'back';

  const backButton = (
    <LinkButton
      key="back"
      variant={primary === 'back' ? 'primary' : 'secondary'}
      reducedMotion={rm}
      onClick={onBackToDesign}
      ref={primary === 'back' ? primaryRef : undefined}
    >
      {t('result.action.back')}
    </LinkButton>
  );
  const retryButton = (
    <LinkButton
      key="retry"
      variant={primary === 'retry' ? 'primary' : 'secondary'}
      reducedMotion={rm}
      onClick={onRetry}
      ref={primary === 'retry' ? primaryRef : undefined}
    >
      {t('result.action.retry')}
    </LinkButton>
  );
  const nextButton =
    cleared && onNext ? (
      <LinkButton key="next" variant="primary" reducedMotion={rm} onClick={onNext} ref={primaryRef}>
        {t('result.action.next')}
        <svg width="12" height="12" viewBox="0 0 12 12" aria-hidden className="rs-icon">
          <path
            d="M4 2l4 4-4 4"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.8"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      </LinkButton>
    ) : null;

  return (
    <LinkagePanel
      className={['rs-panel', className].filter(Boolean).join(' ')}
      role="region"
      aria-label={t('result.region')}
      duration={timeline.panel.duration}
      skip={skipped}
      reducedMotion={rm}
      data-cleared={cleared}
      data-done={done || undefined}
      onPointerDownCapture={skip}
    >
      <header className="rs-head">
        <h2 className="rs-headline" data-cleared={cleared}>
          {t(cleared ? 'result.headline.cleared' : 'result.headline.failed')}
        </h2>
        <div className="rs-head__meta">
          <span className="rs-stage">
            {t('result.stage', {
              chapter: stage.chapter,
              order: stage.order,
              title: t(stage.titleKey),
            })}
          </span>
          <span className="rs-skip" data-hidden={done || undefined} aria-hidden={done || undefined}>
            {t('result.skipHint')}
          </span>
        </div>
        {!cleared && (
          <div className="rs-reason">
            <span className="rs-reason__tag">{t('result.reasonLabel')}</span>
            <span className="rs-reason__body">
              <span className="rs-reason__text">{t(reasonKeyFor(reasonKey, result.reason))}</span>
              {adviceKey && <span className="rs-reason__advice">{t(adviceKey)}</span>}
              <span className="rs-reason__dist">
                {t('result.distance', {
                  distance: Math.max(0, result.distance).toFixed(2),
                  total: course.toFixed(2),
                })}
              </span>
            </span>
            {onReplayFall && (
              <LinkButton size="sm" variant="quiet" reducedMotion={rm} onClick={onReplayFall}>
                <ReplayIcon />
                {t('result.replayFall')}
              </LinkButton>
            )}
          </div>
        )}
      </header>

      <div className="rs-grid">
        {AXES.map((axis, i) => (
          <AxisCard
            key={axis.key}
            axis={axis}
            value={result[axis.key]}
            medal={result.medals[axis.key]}
            thresholds={stage.medals[axis.key]}
            meter={timeline.meters[i]!}
            stamp={timeline.stamps[i]}
            skip={skipped}
            reducedMotion={rm}
            versus={comparison?.axes[i]}
          />
        ))}
      </div>

      {comparison && (
        <div className="rs-versus" data-hidden={!done || undefined}>
          <span className="rs-versus__title">
            <i className="rs-dot rs-dot--ghost" aria-hidden />
            {t('result.versus.title')}
          </span>
          <strong className="rs-versus__score">
            {t('result.versus.score', {
              wins: comparison.wins,
              losses: comparison.losses,
              ties: comparison.ties,
            })}
          </strong>
          {comparison.note && (
            <span className="rs-versus__note">{t(`result.versus.${comparison.note}`)}</span>
          )}
          {!comparison.sameStage && (
            <span className="rs-versus__note">{t('result.versus.otherStage')}</span>
          )}
        </div>
      )}

      <ShareRow design={design} result={result} ghost={ghost} reducedMotion={rm} />

      <div className="rs-actions">
        {cleared ? [backButton, retryButton, nextButton] : [retryButton, backButton]}
      </div>
    </LinkagePanel>
  );
}

function ReplayIcon() {
  return (
    <svg width="13" height="13" viewBox="0 0 16 16" aria-hidden className="rs-icon">
      <path
        d="M3.5 8a4.5 4.5 0 104.5-4.5H5M5 1.5L3 3.5l2 2"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}
