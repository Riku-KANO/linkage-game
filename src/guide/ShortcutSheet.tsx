import { Fragment, useEffect, useId, useMemo, useRef } from 'react';
import { t } from '@/i18n';
import { LinkagePanel, LinkButton, useReducedMotion } from '@/ui/mech';
import { GuideOverlay, isTypingTarget } from './Overlay';
import { detectMac, isHelpKey, SHEET_GROUPS, shortcutRows, type SheetRow } from './shortcuts';
import './guide.css';

/**
 * 操作一覧(GUIDE-3)。? キーで開く。中身はエディタのショートカット表(SHORTCUTS)から作る。
 */

export interface ShortcutSheetProps {
  onClose: () => void;
  /** ⌘ と Ctrl の書き分け(省略時は実行環境から判断) */
  isMac?: boolean;
  /** 省略時はアプリと OS の設定に従う */
  reducedMotion?: boolean;
}

export function ShortcutSheet({ onClose, isMac, reducedMotion }: ShortcutSheetProps) {
  const reduced = useReducedMotion(reducedMotion);
  const mac = isMac ?? detectMac();
  const titleId = useId();
  const closeRef = useRef<HTMLButtonElement>(null);
  const rows = useMemo(() => shortcutRows(mac), [mac]);
  return (
    <GuideOverlay
      onClose={onClose}
      labelledBy={titleId}
      reducedMotion={reduced}
      className="gd-sheet-dialog"
      initialFocus={closeRef}
    >
      <LinkagePanel className="gd-sheet" reducedMotion={reduced} duration={0.45}>
        <header className="gd-head">
          <h2 id={titleId} className="gd-title">
            {t('guide.keys.title')}
          </h2>
          <span className="gd-head__note">{t('guide.keys.note')}</span>
          <LinkButton
            ref={closeRef}
            size="sm"
            variant="quiet"
            reducedMotion={reduced}
            onClick={onClose}
            aria-label={t('guide.close')}
          >
            ×
          </LinkButton>
        </header>
        <div className="gd-sheet__groups">
          {SHEET_GROUPS.map((g) => {
            const inGroup = rows.filter((r) => r.group === g);
            if (inGroup.length === 0) return null;
            return (
              <section key={g} className={`gd-sheet__group gd-sheet__group--${g}`}>
                <h3>{t(`guide.keys.group.${g}`)}</h3>
                <ShortcutTable rows={inGroup} />
              </section>
            );
          })}
        </div>
      </LinkagePanel>
    </GuideOverlay>
  );
}

/**
 * 修飾キーが同じ組み合わせをまとめる:[[Shift, ←], [Shift, →]] → { prefix: [Shift], keys: [←, →] }。
 * 一覧で「Shift + ← / →」のように短く書くため
 */
export function groupCombos(combos: readonly string[][]): { prefix: string[]; keys: string[] }[] {
  const out: { prefix: string[]; keys: string[] }[] = [];
  for (const combo of combos) {
    const prefix = combo.slice(0, -1);
    const key = combo[combo.length - 1] ?? '';
    const last = out[out.length - 1];
    if (last && last.prefix.join('+') === prefix.join('+')) last.keys.push(key);
    else out.push({ prefix, keys: [key] });
  }
  return out;
}

/** ショートカットの表(キーキャップと説明) */
export function ShortcutTable({ rows }: { rows: readonly SheetRow[] }) {
  return (
    <dl className="gd-keys">
      {rows.map((row) => (
        <div key={row.id} className="gd-keys__row" data-shortcut={row.id}>
          <dt>
            {groupCombos(row.combos).map((g, i) => (
              <Fragment key={i}>
                {i > 0 && <span className="gd-keys__or">/</span>}
                <span className="gd-keys__combo">
                  {g.prefix.map((cap, k) => (
                    <Fragment key={k}>
                      <kbd>{cap}</kbd>
                      <span className="gd-keys__plus">+</span>
                    </Fragment>
                  ))}
                  {g.keys.map((cap, k) => (
                    <Fragment key={`k${k}`}>
                      {k > 0 && <span className="gd-keys__alt">/</span>}
                      <kbd>{cap}</kbd>
                    </Fragment>
                  ))}
                </span>
              </Fragment>
            ))}
          </dt>
          <dd>{t(row.labelKey)}</dd>
        </div>
      ))}
    </dl>
  );
}

/**
 * どこにいても ? キーで操作一覧を開く(入力欄の中と、修飾キーつきは除く)。
 * enabled が false の間は何もしない(一覧が開いているときなど)。
 */
export function useShortcutSheetHotkey(onOpen: () => void, enabled = true) {
  const cb = useRef(onOpen);
  useEffect(() => {
    cb.current = onOpen;
  });
  useEffect(() => {
    if (!enabled) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.defaultPrevented || isTypingTarget(e.target) || !isHelpKey(e)) return;
      e.preventDefault();
      cb.current();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [enabled]);
}
