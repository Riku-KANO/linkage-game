import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
import { playSfx } from '@/audio/sfx';
import { GlossaryDialog, HowToPlay, ShortcutSheet } from '@/guide';

/**
 * 遊び方の本(guide の HowToPlay)と、本から開く用語集・操作一覧(INT-7b)。ホームと設定で使う。
 * 用語集・操作一覧は本の上に重ねて開き、閉じると本の同じページに戻る(出すのはいちばん上の 1 枚だけ)。
 * 全部閉じたら、開く前にフォーカスがあった場所(なければ onClosed)へフォーカスを戻す。
 */

export type GuideView = 'book' | 'glossary' | 'sheet';

export interface GuideBook {
  /** 開く(既定は本の 1 ページ目)。開いている上に重ねる */
  open: (view?: GuideView) => void;
  /** 何か開いている(ほかのキー操作を止めるのに使う) */
  isOpen: boolean;
  /** 一度でも開いた */
  wasOpened: boolean;
  /** 画面に置く要素(閉じているときは null) */
  element: ReactNode;
}

export function useGuideBook({ onClosed }: { onClosed?: () => void } = {}): GuideBook {
  const [stack, setStack] = useState<readonly GuideView[]>([]);
  const [wasOpened, setWasOpened] = useState(false);
  // 本のページ(用語集・操作一覧から戻ったときに同じページを開く)
  const page = useRef(0);
  const opener = useRef<HTMLElement | null>(null);
  const closed = useRef(onClosed);
  useEffect(() => {
    closed.current = onClosed;
  });

  const current = useRef(stack);
  current.current = stack;

  const open = useCallback((view: GuideView = 'book') => {
    const s = current.current;
    if (s[s.length - 1] === view) return;
    if (s.length === 0) {
      // 新しく開く:本は 1 ページ目から。閉じたらここへフォーカスを戻す
      opener.current =
        document.activeElement instanceof HTMLElement ? document.activeElement : null;
      page.current = 0;
    }
    setStack([...s, view]);
    setWasOpened(true);
    playSfx('press');
  }, []);
  const closeTop = useCallback(() => setStack((s) => s.slice(0, -1)), []);

  // 全部閉じたら、フォーカスが迷子(body)ならもとの場所へ戻す
  const wasOpen = useRef(false);
  useEffect(() => {
    const isOpen = stack.length > 0;
    if (wasOpen.current && !isOpen) {
      const active = document.activeElement;
      if (!active || active === document.body) {
        const back = opener.current;
        if (back?.isConnected) back.focus({ preventScroll: true });
        else closed.current?.();
      }
      opener.current = null;
    }
    wasOpen.current = isOpen;
  }, [stack]);

  const top = stack[stack.length - 1];
  let element: ReactNode = null;
  if (top === 'book') {
    element = (
      <HowToPlay
        initialPage={page.current}
        onPageChange={(i) => {
          page.current = i;
        }}
        onClose={closeTop}
        onOpenGlossary={() => open('glossary')}
        onOpenShortcuts={() => open('sheet')}
      />
    );
  } else if (top === 'glossary') {
    element = <GlossaryDialog onClose={closeTop} />;
  } else if (top === 'sheet') {
    element = <ShortcutSheet onClose={closeTop} />;
  }
  return { open, isOpen: stack.length > 0, wasOpened, element };
}
