import {
  useCallback,
  useEffect,
  useId,
  useLayoutEffect,
  useRef,
  useState,
  type KeyboardEvent,
  type ReactNode,
  type RefObject,
} from 'react';
import { createPortal } from 'react-dom';
import { t } from '@/i18n';
import { useReducedMotion } from '@/ui/mech';
import { TermFigure } from './figures/TermFigures';
import { glossaryEntry, isGlossaryId, termName, type GlossaryId } from './glossary';
import { trapTab } from './Overlay';
import { parseRich, plainRich } from './rich';
import './guide.css';

/**
 * 用語のリンク(GUIDE-2)。`<Term id="dof">自由度</Term>` をクリック(または Enter)すると、
 * 用語の小窓(説明と小さな図)が開く。Esc・閉じるボタン・外側のクリックで閉じ、
 * キーボードで閉じたときはフォーカスを用語へ戻す。
 */

export interface TermProps {
  id: GlossaryId | string;
  /** 表示する文字(省略時は用語の名前) */
  children?: ReactNode;
  /** 省略時はアプリと OS の設定に従う */
  reducedMotion?: boolean;
}

const POP_W = 320;
const MARGIN = 8;

export function Term({ id, children, reducedMotion }: TermProps) {
  const entry = isGlossaryId(id) ? glossaryEntry(id) : undefined;
  const [open, setOpen] = useState(false);
  const trigger = useRef<HTMLButtonElement>(null);
  const popId = useId();
  const label = children ?? termName(id);
  const close = useCallback((refocus: boolean) => {
    setOpen(false);
    if (refocus) trigger.current?.focus({ preventScroll: true });
  }, []);
  if (!entry) return <>{label}</>;
  return (
    <>
      <button
        ref={trigger}
        type="button"
        className="gd-term"
        aria-haspopup="dialog"
        aria-expanded={open}
        aria-controls={open ? popId : undefined}
        onClick={() => setOpen((o) => !o)}
      >
        {label}
      </button>
      {open && (
        <TermPopover
          id={entry.id}
          domId={popId}
          anchor={trigger}
          reducedMotion={reducedMotion}
          onClose={close}
        />
      )}
    </>
  );
}

function TermPopover({
  id,
  domId,
  anchor,
  reducedMotion,
  onClose,
}: {
  id: GlossaryId;
  domId: string;
  anchor: RefObject<HTMLButtonElement | null>;
  reducedMotion?: boolean;
  onClose: (refocus: boolean) => void;
}) {
  const entry = glossaryEntry(id)!;
  const reduced = useReducedMotion(reducedMotion);
  const box = useRef<HTMLDivElement>(null);
  const titleId = `${domId}-title`;
  const [pos, setPos] = useState<{ left: number; top: number } | null>(null);

  const place = useCallback(() => {
    const a = anchor.current?.getBoundingClientRect();
    const el = box.current;
    if (!a || !el) return;
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    const w = Math.min(POP_W, vw - 2 * MARGIN);
    const h = el.offsetHeight;
    const left = Math.min(Math.max(MARGIN, a.left + a.width / 2 - w / 2), vw - w - MARGIN);
    const below = a.bottom + 6;
    const top = below + h <= vh - MARGIN ? below : Math.max(MARGIN, a.top - 6 - h);
    setPos({ left, top });
  }, [anchor]);

  useLayoutEffect(() => {
    place();
    box.current?.focus({ preventScroll: true });
  }, [place]);

  useEffect(() => {
    const outside = (e: PointerEvent) => {
      const target = e.target as Node;
      if (box.current?.contains(target) || anchor.current?.contains(target)) return;
      onClose(false);
    };
    window.addEventListener('resize', place);
    document.addEventListener('pointerdown', outside, true);
    return () => {
      window.removeEventListener('resize', place);
      document.removeEventListener('pointerdown', outside, true);
    };
  }, [anchor, onClose, place]);

  const onKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    // 小窓の中のキーは外(本のページ送りなど)へ伝えない
    e.stopPropagation();
    if (e.key === 'Escape') {
      e.preventDefault();
      onClose(true);
      return;
    }
    if (box.current) trapTab(e, box.current);
  };

  const node = (
    <div
      ref={box}
      id={domId}
      role="dialog"
      aria-modal="false"
      aria-labelledby={titleId}
      tabIndex={-1}
      className={['gd-pop', reduced && 'gd-reduced'].filter(Boolean).join(' ')}
      style={{
        width: `min(${POP_W}px, calc(100vw - ${2 * MARGIN}px))`,
        left: pos?.left ?? -9999,
        top: pos?.top ?? 0,
      }}
      onKeyDown={onKeyDown}
    >
      <div className="gd-pop__head">
        <h3 id={titleId} className="gd-pop__title">
          {t(entry.nameKey)}
          {entry.readingKey && <span className="gd-pop__reading">{t(entry.readingKey)}</span>}
        </h3>
        <button
          type="button"
          className="gd-x"
          aria-label={t('guide.close')}
          onClick={() => onClose(true)}
        >
          ×
        </button>
      </div>
      <p className="gd-pop__short">{t(entry.shortKey)}</p>
      <div className="gd-pop__fig">
        <TermFigure id={id} reducedMotion={reduced} />
      </div>
      <p className="gd-pop__body">{t(entry.bodyKey)}</p>
      <p className="gd-pop__play">
        <span className="gd-pop__tag">{t('guide.glossary.inGame')}</span>
        {t(entry.playKey)}
      </p>
    </div>
  );
  return createPortal(node, document.body);
}

export interface RichTextProps {
  text: string;
  /** false なら用語をリンクにせず、ただの文字にする */
  terms?: boolean;
  reducedMotion?: boolean;
}

/** `[[id|表示]]` を用語のリンクにして文を描く */
export function RichText({ text, terms = true, reducedMotion }: RichTextProps) {
  if (!terms) return <>{plainRich(text, termName)}</>;
  return (
    <>
      {parseRich(text).map((seg, i) =>
        seg.kind === 'text' ? (
          <span key={i}>{seg.text}</span>
        ) : (
          <Term key={i} id={seg.id} reducedMotion={reducedMotion}>
            {seg.label}
          </Term>
        ),
      )}
    </>
  );
}
