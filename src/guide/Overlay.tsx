import {
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type KeyboardEvent,
  type ReactNode,
  type RefObject,
} from 'react';
import { createPortal } from 'react-dom';
import './guide.css';

/**
 * 遊び方の本・操作一覧・用語集を重ねて出す枠。背景を暗くし、フォーカスを中に閉じ込め、
 * Esc か背景のクリックで閉じる。閉じたら開く前の場所へフォーカスを戻す。
 */

const FOCUSABLE =
  'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

export function focusableIn(root: HTMLElement): HTMLElement[] {
  return Array.from(root.querySelectorAll<HTMLElement>(FOCUSABLE)).filter(
    (el) => !el.closest('[aria-hidden="true"]') && !el.hasAttribute('inert'),
  );
}

/** Tab / Shift+Tab を root の中で回す。動かしたら true */
export function trapTab(e: KeyboardEvent<HTMLElement>, root: HTMLElement): boolean {
  if (e.key !== 'Tab') return false;
  const items = focusableIn(root);
  if (items.length === 0) {
    e.preventDefault();
    root.focus();
    return true;
  }
  const first = items[0]!;
  const last = items[items.length - 1]!;
  const active = document.activeElement;
  if (e.shiftKey && (active === first || active === root || !root.contains(active))) {
    e.preventDefault();
    last.focus();
    return true;
  }
  if (!e.shiftKey && (active === last || active === root || !root.contains(active))) {
    e.preventDefault();
    first.focus();
    return true;
  }
  return false;
}

/**
 * マウントしたら中へフォーカスを移し(enabled のとき)、アンマウントで元へ戻す。
 * initial があればそこへ、なければ root へ。中の部品がもうフォーカスを取っていれば動かさない。
 * 戻す先は最初の描画の時点でフォーカスがあった要素。
 */
export function useFocusReturn(
  root: RefObject<HTMLElement | null>,
  initial?: RefObject<HTMLElement | null>,
  enabled = true,
) {
  const [prev] = useState(() =>
    typeof document === 'undefined' ? null : (document.activeElement as HTMLElement | null),
  );
  useLayoutEffect(() => {
    if (!enabled) return;
    const el = root.current;
    if (!el?.contains(document.activeElement)) {
      (initial?.current ?? el)?.focus({ preventScroll: true });
    }
    return () => {
      if (prev && prev.isConnected && typeof prev.focus === 'function') {
        prev.focus({ preventScroll: true });
      }
    };
    // マウント時だけ(initial・root は ref なので作り直さない)
  }, [root, initial, enabled, prev]);
}

export interface GuideOverlayProps {
  onClose: () => void;
  /** ダイアログの名前(見出しの id) */
  labelledBy?: string;
  /** 見出しがないときの名前 */
  label?: string;
  children: ReactNode;
  className?: string;
  /** Esc と Tab 以外のキー(本の ← → など) */
  onKeyDown?: (e: KeyboardEvent<HTMLDivElement>) => void;
  /** 開いたときにフォーカスする要素(省略時はダイアログそのもの) */
  initialFocus?: RefObject<HTMLElement | null>;
  /** 動きを減らす(背景のフェードを省く) */
  reducedMotion?: boolean;
}

export function GuideOverlay({
  onClose,
  labelledBy,
  label,
  children,
  className,
  onKeyDown,
  initialFocus,
  reducedMotion = false,
}: GuideOverlayProps) {
  const dialog = useRef<HTMLDivElement>(null);
  useFocusReturn(dialog, initialFocus);
  const close = useRef(onClose);
  useEffect(() => {
    close.current = onClose;
  });

  const handleKey = (e: KeyboardEvent<HTMLDivElement>) => {
    if (e.key === 'Escape') {
      e.stopPropagation();
      e.preventDefault();
      close.current();
      return;
    }
    if (dialog.current && trapTab(e, dialog.current)) return;
    onKeyDown?.(e);
  };

  const node = (
    <div
      className={['gd-overlay', reducedMotion && 'gd-reduced'].filter(Boolean).join(' ')}
      onPointerDown={(e) => {
        if (e.target === e.currentTarget) close.current();
      }}
    >
      <div
        ref={dialog}
        role="dialog"
        aria-modal="true"
        aria-labelledby={labelledBy}
        aria-label={labelledBy ? undefined : label}
        tabIndex={-1}
        className={['gd-dialog', className].filter(Boolean).join(' ')}
        onKeyDown={handleKey}
      >
        {children}
      </div>
    </div>
  );
  return typeof document === 'undefined' ? node : createPortal(node, document.body);
}

/** 入力欄の中のキーはページ送りなどに使わない */
export function isTypingTarget(target: EventTarget | null): boolean {
  const el = target as HTMLElement | null;
  return !!el?.closest?.('input, textarea, select, [contenteditable="true"]');
}
