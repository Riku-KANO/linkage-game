import { useEffect, useId, useMemo, useRef, useState, type KeyboardEvent } from 'react';
import { t } from '@/i18n';
import { LinkagePanel, LinkButton, useReducedMotion } from '@/ui/mech';
import {
  BuildFigure,
  CrankFigure,
  DofTrioFigure,
  FootPathFigure,
  KeysFigure,
  LegArrayFigure,
  RunFigure,
  WalkerFigure,
} from './figures/PageFigures';
import { GuideOverlay, isTypingTarget } from './Overlay';
import { HOW_TO_PLAY_PAGES, pageIndex, type HowToPlayPageId } from './pages';
import { ShortcutTable } from './ShortcutSheet';
import { detectMac, ESSENTIAL_SHORTCUTS, shortcutRows } from './shortcuts';
import { RichText } from './Term';
import './guide.css';

/**
 * 遊び方の本(GUIDE-1)。8 ページ。前へ・次へ、← → キー、ページの点、Esc で閉じる。
 * 各ページの図は本物のソルバーで動く機構。
 */

export interface HowToPlayProps {
  /** 閉じる(Esc・×・背景のクリック・最後のページの「さっそく作る」) */
  onClose: () => void;
  /** 最初に開くページ(0 始まりの番号か id) */
  initialPage?: number | HowToPlayPageId;
  /** 最後のページの「操作一覧を開く」。省略するとボタンを出さない */
  onOpenShortcuts?: () => void;
  /** 見出しの「用語集」。省略するとボタンを出さない */
  onOpenGlossary?: () => void;
  onPageChange?: (index: number, id: HowToPlayPageId) => void;
  /** 省略時はアプリと OS の設定に従う */
  reducedMotion?: boolean;
  /** ⌘ と Ctrl の書き分け(省略時は実行環境から判断) */
  isMac?: boolean;
}

export function HowToPlay({
  onClose,
  initialPage,
  onOpenShortcuts,
  onOpenGlossary,
  onPageChange,
  reducedMotion,
  isMac,
}: HowToPlayProps) {
  const reduced = useReducedMotion(reducedMotion);
  const [index, setIndex] = useState(() => pageIndex(initialPage));
  const [dir, setDir] = useState<1 | -1>(1);
  const titleId = useId();
  const pageTitleId = useId();
  const nextRef = useRef<HTMLButtonElement>(null);
  const total = HOW_TO_PLAY_PAGES.length;
  const page = HOW_TO_PLAY_PAGES[index]!;
  const last = index === total - 1;

  const changed = useRef(onPageChange);
  useEffect(() => {
    changed.current = onPageChange;
  });
  // ページが変わったときだけ知らせる(開いたときは知らせない。StrictMode の二重実行でも同じ)
  const shown = useRef(index);
  useEffect(() => {
    if (shown.current === index) return;
    shown.current = index;
    changed.current?.(index, HOW_TO_PLAY_PAGES[index]!.id);
  }, [index]);

  const go = (to: number) => {
    const next = Math.min(total - 1, Math.max(0, to));
    if (next === index) return;
    setDir(next > index ? 1 : -1);
    setIndex(next);
  };

  const onKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    if (isTypingTarget(e.target) || e.altKey || e.metaKey || e.ctrlKey) return;
    if (e.key === 'ArrowRight' || e.key === 'PageDown') {
      e.preventDefault();
      go(index + 1);
    } else if (e.key === 'ArrowLeft' || e.key === 'PageUp') {
      e.preventDefault();
      go(index - 1);
    } else if (e.key === 'Home') {
      e.preventDefault();
      go(0);
    } else if (e.key === 'End') {
      e.preventDefault();
      go(total - 1);
    }
  };

  return (
    <GuideOverlay
      onClose={onClose}
      labelledBy={titleId}
      onKeyDown={onKeyDown}
      reducedMotion={reduced}
      className="gd-book-dialog"
      initialFocus={nextRef}
    >
      <LinkagePanel className="gd-book" reducedMotion={reduced}>
        <header className="gd-head">
          <h2 id={titleId} className="gd-title">
            {t('guide.book.title')}
          </h2>
          <span className="gd-book__count" aria-hidden>
            {t('guide.book.page', { n: index + 1, total })}
          </span>
          {onOpenGlossary && (
            <LinkButton size="sm" variant="quiet" reducedMotion={reduced} onClick={onOpenGlossary}>
              {t('guide.book.glossary')}
            </LinkButton>
          )}
          <LinkButton
            size="sm"
            variant="quiet"
            reducedMotion={reduced}
            onClick={onClose}
            aria-label={t('guide.close')}
          >
            ×
          </LinkButton>
        </header>

        <div
          key={page.id}
          className={`gd-book__spread${reduced ? '' : ` gd-turn-in gd-turn-in--${dir > 0 ? 'next' : 'prev'}`}`}
          data-page={page.id}
          role="group"
          aria-labelledby={pageTitleId}
        >
          <figure className="gd-book__figure">
            <PageFigure id={page.id} reducedMotion={reduced} />
          </figure>
          <section className="gd-book__text">
            <h3 id={pageTitleId} className="gd-book__page-title">
              <span className="gd-book__no">{index + 1}</span>
              {t(page.titleKey)}
            </h3>
            {page.paragraphKeys.map((k) => (
              <p key={k}>
                <RichText text={t(k)} reducedMotion={reduced} />
              </p>
            ))}
            <PageExtra
              id={page.id}
              isMac={isMac ?? detectMac()}
              onOpenShortcuts={onOpenShortcuts}
              reducedMotion={reduced}
            />
          </section>
        </div>
        <div className="gd-sr" aria-live="polite">
          {t('guide.book.goto', { n: index + 1, title: t(page.titleKey) })}
        </div>

        <footer className="gd-book__foot">
          <LinkButton
            size="sm"
            variant="secondary"
            reducedMotion={reduced}
            disabled={index === 0}
            onClick={() => go(index - 1)}
          >
            ← {t('guide.book.prev')}
          </LinkButton>
          <nav className="gd-dots" aria-label={t('guide.book.pages')}>
            <span className="gd-dots__bar" aria-hidden />
            {HOW_TO_PLAY_PAGES.map((p, i) => (
              <button
                key={p.id}
                type="button"
                className="gd-dots__pin"
                aria-label={t('guide.book.goto', { n: i + 1, title: t(p.titleKey) })}
                aria-current={i === index ? 'step' : undefined}
                onClick={() => go(i)}
              />
            ))}
          </nav>
          <LinkButton
            ref={nextRef}
            size="sm"
            variant="primary"
            reducedMotion={reduced}
            onClick={() => (last ? onClose() : go(index + 1))}
          >
            {last ? t('guide.book.done') : `${t('guide.book.next')} →`}
          </LinkButton>
        </footer>
        <p className="gd-book__hint">{t('guide.book.keyHint')}</p>
      </LinkagePanel>
    </GuideOverlay>
  );
}

function PageFigure({ id, reducedMotion }: { id: HowToPlayPageId; reducedMotion: boolean }) {
  switch (id) {
    case 'about':
      return <WalkerFigure reducedMotion={reducedMotion} />;
    case 'link':
      return <BuildFigure reducedMotion={reducedMotion} />;
    case 'crank':
      return <CrankFigure reducedMotion={reducedMotion} />;
    case 'dof':
      return <DofTrioFigure reducedMotion={reducedMotion} />;
    case 'path':
      return <FootPathFigure reducedMotion={reducedMotion} />;
    case 'legs':
      return <LegArrayFigure reducedMotion={reducedMotion} />;
    case 'run':
      return <RunFigure reducedMotion={reducedMotion} />;
    case 'keys':
      return <KeysFigure reducedMotion={reducedMotion} />;
  }
}

const MEDALS = ['gold', 'silver', 'bronze'] as const;
const AXES = ['time', 'parts', 'cost', 'energy'] as const;
const LOOP = ['build', 'watch', 'run', 'improve'] as const;

function PageExtra({
  id,
  isMac,
  onOpenShortcuts,
  reducedMotion,
}: {
  id: HowToPlayPageId;
  isMac: boolean;
  onOpenShortcuts?: () => void;
  reducedMotion: boolean;
}) {
  const essentials = useMemo(
    () => shortcutRows(isMac).filter((r) => ESSENTIAL_SHORTCUTS.includes(r.id)),
    [isMac],
  );
  if (id === 'about') {
    return (
      <ol className="gd-loop">
        {LOOP.map((k) => (
          <li key={k}>{t(`guide.page.about.loop.${k}`)}</li>
        ))}
      </ol>
    );
  }
  if (id === 'run') {
    return (
      <ul className="gd-axes">
        {AXES.map((a) => (
          <li key={a}>
            <span className="gd-medals" aria-hidden>
              {MEDALS.map((m) => (
                <span
                  key={m}
                  className={`gd-medal gd-medal--${m}`}
                  title={t(`guide.fig.medal.${m}`)}
                />
              ))}
            </span>
            {t(`guide.page.run.axis.${a}`)}
          </li>
        ))}
      </ul>
    );
  }
  if (id === 'keys') {
    return (
      <>
        <ShortcutTable rows={essentials} />
        {onOpenShortcuts ? (
          <LinkButton
            size="sm"
            variant="secondary"
            reducedMotion={reducedMotion}
            onClick={onOpenShortcuts}
          >
            {t('guide.book.openShortcuts')}
          </LinkButton>
        ) : (
          <p className="gd-muted">{t('guide.book.allShortcuts')}</p>
        )}
      </>
    );
  }
  return null;
}
