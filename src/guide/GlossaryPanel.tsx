import { useId, useLayoutEffect, useRef, useState, type KeyboardEvent } from 'react';
import { t } from '@/i18n';
import { LinkagePanel, LinkButton, useReducedMotion } from '@/ui/mech';
import { TermFigure } from './figures/TermFigures';
import { GLOSSARY, glossaryEntry, type GlossaryId } from './glossary';
import { GuideOverlay, isTypingTarget } from './Overlay';
import './guide.css';

/**
 * 用語集(GUIDE-2)。左に用語の一覧、右に選んだ用語の説明と動く図。↑ ↓ で用語を選ぶ
 * (パネルのどこにフォーカスがあっても効く)。
 * 埋め込み用のパネル。重ねて出すときは GuideOverlay で包む。
 */

export interface GlossaryPanelProps {
  /** 最初に選ぶ用語 */
  initialTerm?: GlossaryId;
  /** 渡すと × ボタンを出し、Esc でも呼ぶ */
  onClose?: () => void;
  onSelect?: (id: GlossaryId) => void;
  /** 省略時はアプリと OS の設定に従う */
  reducedMotion?: boolean;
  className?: string;
  /** 見出しの id(GuideOverlay の labelledBy に渡す) */
  titleId?: string;
  /** 出たときに選んでいる用語へフォーカスする(↑ ↓ がすぐ効く) */
  autoFocus?: boolean;
}

export function GlossaryPanel({
  initialTerm,
  onClose,
  onSelect,
  reducedMotion,
  className,
  titleId,
  autoFocus = false,
}: GlossaryPanelProps) {
  const reduced = useReducedMotion(reducedMotion);
  const [current, setCurrent] = useState<GlossaryId>(initialTerm ?? GLOSSARY[0]!.id);
  const ownTitle = useId();
  const headingId = titleId ?? ownTitle;
  const detailId = useId();
  const items = useRef(new Map<GlossaryId, HTMLButtonElement>());
  const entry = glossaryEntry(current)!;
  // 出たときだけ(選び直したときのフォーカスは select が動かす)
  const focusOnMount = useRef(autoFocus);
  useLayoutEffect(() => {
    if (focusOnMount.current) items.current.get(current)?.focus({ preventScroll: true });
    focusOnMount.current = false;
  }, [current]);

  const select = (id: GlossaryId, focus = false) => {
    setCurrent(id);
    onSelect?.(id);
    if (focus) items.current.get(id)?.focus();
  };

  /** ↑ ↓ Home End で用語を選ぶ(パネルのどこにフォーカスがあっても)。Esc で閉じる */
  const onKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    if (e.key === 'Escape' && onClose) {
      e.stopPropagation();
      onClose();
      return;
    }
    if (e.altKey || e.metaKey || e.ctrlKey || isTypingTarget(e.target)) return;
    const i = GLOSSARY.findIndex((g) => g.id === current);
    const to =
      e.key === 'ArrowDown'
        ? i + 1
        : e.key === 'ArrowUp'
          ? i - 1
          : e.key === 'Home'
            ? 0
            : e.key === 'End'
              ? GLOSSARY.length - 1
              : null;
    if (to === null) return;
    e.preventDefault();
    const next = GLOSSARY[(to + GLOSSARY.length) % GLOSSARY.length]!;
    select(next.id, true);
  };

  return (
    <LinkagePanel
      className={['gd-gloss', className].filter(Boolean).join(' ')}
      reducedMotion={reduced}
      onKeyDown={onKeyDown}
    >
      <header className="gd-head">
        <h2 id={headingId} className="gd-title">
          {t('guide.glossary.title')}
        </h2>
        <span className="gd-head__note">{t('guide.glossary.intro')}</span>
        {onClose && (
          <LinkButton
            size="sm"
            variant="quiet"
            reducedMotion={reduced}
            onClick={onClose}
            aria-label={t('guide.close')}
          >
            ×
          </LinkButton>
        )}
      </header>
      <div className="gd-gloss__body">
        <ul className="gd-gloss__list" aria-label={t('guide.glossary.list')}>
          {GLOSSARY.map((g) => (
            <li key={g.id}>
              <button
                ref={(el) => {
                  if (el) items.current.set(g.id, el);
                  else items.current.delete(g.id);
                }}
                type="button"
                className="gd-gloss__item"
                aria-current={g.id === current ? 'true' : undefined}
                aria-controls={detailId}
                tabIndex={g.id === current ? 0 : -1}
                onClick={() => select(g.id)}
              >
                {t(g.nameKey)}
              </button>
            </li>
          ))}
        </ul>
        <article
          id={detailId}
          key={current}
          className={`gd-gloss__detail${reduced ? '' : ' gd-turn-in gd-turn-in--next'}`}
          aria-live="polite"
          data-term={current}
        >
          <h3 className="gd-gloss__name">
            {t(entry.nameKey)}
            {entry.readingKey && <span className="gd-pop__reading">{t(entry.readingKey)}</span>}
          </h3>
          <p className="gd-pop__short">{t(entry.shortKey)}</p>
          <div className="gd-gloss__fig">
            <TermFigure id={current} reducedMotion={reduced} />
          </div>
          <p>{t(entry.bodyKey)}</p>
          <p className="gd-pop__play">
            <span className="gd-pop__tag">{t('guide.glossary.inGame')}</span>
            {t(entry.playKey)}
          </p>
          {entry.related.length > 0 && (
            <p className="gd-gloss__related">
              <span className="gd-pop__tag">{t('guide.glossary.related')}</span>
              {entry.related.map((r) => (
                <button key={r} type="button" className="gd-term" onClick={() => select(r, true)}>
                  {t(`guide.term.${r}.name`)}
                </button>
              ))}
            </p>
          )}
        </article>
      </div>
    </LinkagePanel>
  );
}

export interface GlossaryDialogProps {
  onClose: () => void;
  initialTerm?: GlossaryId;
  onSelect?: (id: GlossaryId) => void;
  /** 省略時はアプリと OS の設定に従う */
  reducedMotion?: boolean;
}

/** 用語集を重ねて出す(GuideOverlay+GlossaryPanel)。開くと選んでいる用語にフォーカス */
export function GlossaryDialog({
  onClose,
  initialTerm,
  onSelect,
  reducedMotion,
}: GlossaryDialogProps) {
  const reduced = useReducedMotion(reducedMotion);
  const titleId = useId();
  return (
    <GuideOverlay onClose={onClose} labelledBy={titleId} reducedMotion={reduced}>
      <GlossaryPanel
        titleId={titleId}
        onClose={onClose}
        initialTerm={initialTerm}
        onSelect={onSelect}
        reducedMotion={reduced}
        autoFocus
      />
    </GuideOverlay>
  );
}
