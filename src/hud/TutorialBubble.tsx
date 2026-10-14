import { useEffect, useRef } from 'react';
import { PART_ORDER } from '@/game';
import type { TutorialStep } from '@/game/types';
import type { PartKind } from '@/core/model/types';
import { t } from '@/i18n';
import { LinkButton, useReducedMotion } from '@/ui/mech';
import { cx } from './common';
import { HudIcon, PartIcon } from './icons';
import './hud.css';

export interface TutorialBubbleProps {
  /** ステージのチュートリアル(stage.tutorial) */
  steps: readonly TutorialStep[];
  /** 今のステップ(game の TutorialState.index)。steps.length 以上なら何も出さない */
  index: number;
  /** 文言に埋める値(stageTextParams など) */
  params?: Record<string, string | number>;
  /** 「次へ」(完了条件が click のステップだけボタンを出す) */
  onNext: () => void;
  /** チュートリアルを飛ばす(省略時はボタンを出さない) */
  onSkip?: () => void;
  /** 省略時はアプリと OS の設定に従う */
  reducedMotion?: boolean;
  className?: string;
}

/** ここまでに渡した部品(今のステップまでの give の和、表示順) */
export function partsGivenUpTo(steps: readonly TutorialStep[], index: number): PartKind[] {
  const set = new Set<PartKind>();
  steps
    .slice(0, Math.min(steps.length, index + 1))
    .forEach((s) => s.give?.forEach((p) => set.add(p)));
  return PART_ORDER.filter((p) => set.has(p));
}

/**
 * チュートリアルの吹き出し(HUD-1、U-05)。製図用紙の切れ端に、今のステップの文、
 * 進み具合の点、渡された部品のアイコンを出す。「次へ」で進むステップだけボタンを出し、
 * ほかは図面での操作を待つ。下の端の中央に置き、尾は上(図面)を指す。
 */
export function TutorialBubble({
  steps,
  index,
  params,
  onNext,
  onSkip,
  reducedMotion,
  className,
}: TutorialBubbleProps) {
  const rm = useReducedMotion(reducedMotion);
  const step = steps[index];
  const nextRef = useRef<HTMLButtonElement>(null);
  const needsClick = step?.until.kind === 'click';

  // 「次へ」のステップに来たら、ほかにフォーカスがなければボタンへ(キーボードで続けて進める)
  useEffect(() => {
    if (!needsClick) return;
    const active = document.activeElement;
    if (!active || active === document.body) nextRef.current?.focus({ preventScroll: true });
  }, [needsClick, index]);

  if (!step) return null;
  const given = partsGivenUpTo(steps, index);
  const fresh = new Set(step.give ?? []);

  return (
    <section
      className={cx('hud-tut', rm && 'hud-rm', className)}
      aria-label={t('hud.tutorial.region')}
      data-step={index}
    >
      <i className="hud-tut__pin" aria-hidden />
      <div className="hud-tut__head">
        <span className="hud-tut__step">
          {t('hud.tutorial.step', { index: index + 1, count: steps.length })}
        </span>
        <span className="hud-tut__dots" aria-hidden>
          {steps.map((_, i) => (
            <i
              key={i}
              className="hud-tut__dot"
              data-state={i < index ? 'done' : i === index ? 'now' : undefined}
            />
          ))}
        </span>
        {onSkip && (
          <button
            type="button"
            className="hud-tut__skip"
            aria-label={t('game.tutorial.skip')}
            onClick={onSkip}
          >
            {t('hud.tutorial.skip')}
          </button>
        )}
      </div>
      {/* 読み上げの領域は残し、中の文だけをステップごとに作り直して紙をめくるように差し替える */}
      <div className="hud-tut__textwrap" aria-live="polite">
        <p key={index} className="hud-tut__text">
          {t(step.key, params)}
        </p>
      </div>
      <div className="hud-tut__foot">
        {given.length > 0 ? (
          <ul className="hud-tut__parts" aria-label={t('hud.tutorial.given')}>
            {given.map((p) => (
              <li key={p} className="hud-tut__part" data-new={fresh.has(p) || undefined}>
                <PartIcon part={p} size={18} />
                <span>{t(`game.part.${p}`)}</span>
                {fresh.has(p) && <em className="hud-tut__new">{t('hud.tutorial.new')}</em>}
              </li>
            ))}
          </ul>
        ) : (
          <span />
        )}
        {needsClick ? (
          <LinkButton ref={nextRef} size="sm" variant="primary" reducedMotion={rm} onClick={onNext}>
            {t('game.tutorial.next')}
            <HudIcon name="next" size={13} />
          </LinkButton>
        ) : (
          <span className="hud-tut__wait">
            {t(step.until.kind === 'testRun' ? 'hud.tutorial.doTestRun' : 'hud.tutorial.doIt')}
          </span>
        )}
      </div>
    </section>
  );
}
