import { useId, useRef, type KeyboardEvent } from 'react';
import { t } from '@/i18n';
import { LinkagePanel, LinkButton, useReducedMotion } from '@/ui/mech';
import { WalkerFigure } from './figures/PageFigures';
import { useFocusReturn } from './Overlay';
import './guide.css';

/**
 * はじめての方へ(GUIDE-4)。初回のホームに出すカード。チュートリアルから始める/遊び方を見る/あとで。
 * いつ出すか(初回かどうか)は統合側が決める。Esc は「あとで」。
 */

export interface WelcomeCardProps {
  onStartTutorial: () => void;
  onHowToPlay: () => void;
  onLater: () => void;
  /** 省略時はアプリと OS の設定に従う */
  reducedMotion?: boolean;
  /** 出たときに「チュートリアルから始める」へフォーカスする(既定 true) */
  autoFocus?: boolean;
  className?: string;
}

export function WelcomeCard({
  onStartTutorial,
  onHowToPlay,
  onLater,
  reducedMotion,
  autoFocus = true,
  className,
}: WelcomeCardProps) {
  const reduced = useReducedMotion(reducedMotion);
  const titleId = useId();
  const bodyId = useId();
  const root = useRef<HTMLDivElement>(null);
  const primary = useRef<HTMLButtonElement>(null);
  useFocusReturn(root, primary, autoFocus);
  const onKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    if (e.key === 'Escape') {
      e.stopPropagation();
      onLater();
    }
  };
  return (
    <div
      ref={root}
      role="dialog"
      aria-modal="false"
      aria-labelledby={titleId}
      aria-describedby={bodyId}
      tabIndex={-1}
      className={['gd-welcome', reduced && 'gd-reduced', className].filter(Boolean).join(' ')}
      onKeyDown={onKeyDown}
    >
      <LinkagePanel reducedMotion={reduced}>
        <div className="gd-welcome__fig">
          <WalkerFigure reducedMotion={reduced} width={300} height={130} />
        </div>
        <h2 id={titleId} className="gd-title">
          {t('guide.welcome.title')}
        </h2>
        <p id={bodyId} className="gd-welcome__body">
          {t('guide.welcome.body')}
        </p>
        <div className="gd-welcome__actions">
          <LinkButton
            ref={primary}
            variant="primary"
            reducedMotion={reduced}
            onClick={onStartTutorial}
          >
            {t('guide.welcome.tutorial')}
          </LinkButton>
          <LinkButton variant="secondary" reducedMotion={reduced} onClick={onHowToPlay}>
            {t('guide.welcome.howTo')}
          </LinkButton>
          <LinkButton variant="quiet" size="sm" reducedMotion={reduced} onClick={onLater}>
            {t('guide.welcome.later')}
          </LinkButton>
        </div>
      </LinkagePanel>
    </div>
  );
}
