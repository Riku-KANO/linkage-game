import { useEffect, useMemo, useRef, useState } from 'react';
import { WelcomeCard } from '@/guide';
import { homeMenuItems, TextMenu, type TextMenuItem } from '@/hud';
import { t } from '@/i18n';
import { MENU_ITEMS } from '@/scene/home/menu';
import { useSceneUi, type MenuItemId } from '@/scene/store';
import { activateHomeItem, currentContinueTarget, startTutorial } from '../actions';
import { bootResult } from '../boot';
import { useSession } from '../flow';
import { getPrefs, markWelcomed } from '../settings';
import { dismissWelcomeForSession, shouldWelcome } from '../welcome';
import { useGuideBook } from './GuideBook';
import './screens.css';

/** テキストメニューだけの項目(工房の物体はない):遊び方の本を開く */
export const HOW_TO_PLAY_ITEM = 'howToPlay';

/**
 * ホームの端のテキストメニュー(INT-5、3D を操作しなくても使える)。HUD の TextMenu を使い、
 * 光っている項目は scene のホバー(useSceneUi.hovered)と共有する:工房の物体にマウスを乗せると
 * この項目が光り、この項目にマウス・フォーカスを当てると工房の物体の輪郭が光る。
 * 選んだときの処理は工房の物体のクリックと同じ activateHomeItem(scene の setMenuHandler 経由)。
 *
 * INT-7b:最後の「遊び方」で遊び方の本(用語集・操作一覧へも)を開く。初めての人(まだ何もクリアして
 * いない・前に選んでいない・共有リンクで開いていない)には「はじめての方へ」のカードを右に出す。
 */
export function HomeScreen() {
  const hovered = useSceneUi((s) => s.hovered);
  const progress = useSession((s) => s.progress);
  // 続きの先は進行と最後のスロットで決まる(ホームにいる間にスロットは変わらない)
  const canContinue = useMemo(() => currentContinueTarget() !== null, [progress]);
  const items = useMemo(() => homeItems(canContinue), [canContinue]);
  const root = useRef<HTMLDivElement>(null);
  // 工房の物体がない項目(遊び方)の光り(工房のホバーが優先)
  const [ownActive, setOwnActive] = useState<string | null>(null);
  useEffect(() => {
    if (hovered !== null) setOwnActive(null);
  }, [hovered]);

  const focusHowToPlay = () =>
    root.current
      ?.querySelector<HTMLElement>(`[data-id="${HOW_TO_PLAY_ITEM}"]`)
      ?.focus({ preventScroll: true });
  const guide = useGuideBook({ onClosed: focusHowToPlay });
  const welcome = useWelcome();

  // メニューの外にフォーカスがあるときも、↑↓ でメニューへ入れる(戻ってきた直後など)。
  // 遊び方の本などのダイアログが開いている間は奪わない
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.defaultPrevented || (e.key !== 'ArrowDown' && e.key !== 'ArrowUp')) return;
      const el = root.current;
      if (!el || el.contains(document.activeElement)) return;
      if (document.activeElement?.closest('[aria-modal="true"]')) return;
      const buttons = el.querySelectorAll<HTMLButtonElement>('[role="menuitem"]');
      const target = e.key === 'ArrowDown' ? buttons[0] : buttons[buttons.length - 1];
      if (!target) return;
      e.preventDefault();
      target.focus();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  return (
    <>
      <div ref={root} className="app-home">
        <TextMenu
          items={items}
          activeId={hovered ?? ownActive}
          onActiveChange={(id) => {
            useSceneUi.getState().setHovered(isMenuItemId(id) ? id : null);
            setOwnActive(isMenuItemId(id) ? null : id);
          }}
          onSelect={(id) => {
            if (id === HOW_TO_PLAY_ITEM) guide.open('book');
            else if (isMenuItemId(id)) activateHomeItem(id);
          }}
        />
        <p className="app-home__hint">{t('home.menu.keyHint')}</p>
      </div>
      {welcome.shown && !guide.isOpen && (
        <section className="app-welcome" aria-label={t('home.welcome.region')}>
          <WelcomeCard
            // 本を閉じて戻ってきたときは、フォーカスを本を開いた項目に残す
            autoFocus={!guide.wasOpened}
            onStartTutorial={() => {
              welcome.choose();
              startTutorial();
            }}
            onHowToPlay={() => {
              welcome.choose();
              guide.open('book');
            }}
            // カードが消えた後は ↑↓ でメニューへ入れる
            onLater={welcome.choose}
          />
        </section>
      )}
      {guide.element}
    </>
  );
}

/**
 * 初回の「はじめての方へ」。出すかどうかはホームに着いたときに 1 回決める(welcome.ts)。
 * どれかを選べば保存して以後は出さない。選ばずにホームを離れたら、このセッションでは出さない。
 */
function useWelcome() {
  const [shown, setShown] = useState(() =>
    shouldWelcome({
      progress: useSession.getState().progress,
      prefs: getPrefs(),
      share: bootResult()?.share ?? null,
    }),
  );
  const shownRef = useRef(shown);
  useEffect(() => {
    shownRef.current = shown;
  }, [shown]);
  useEffect(
    () => () => {
      if (shownRef.current) dismissWelcomeForSession();
    },
    [],
  );
  return {
    shown,
    choose() {
      markWelcomed();
      dismissWelcomeForSession();
      setShown(false);
    },
  };
}

/**
 * ホームの項目(工房の物体と同じ並び+最後に遊び方)。HUD の既定では図鑑とサンドボックスは選べないが、
 * アプリでは図鑑は「準備中」の札を付けたまま小さなパネルを開き、サンドボックスは設計画面を開く。
 */
export function homeItems(canContinue: boolean): TextMenuItem[] {
  const items = homeMenuItems({ canContinue }).map((item) => {
    if (item.id === 'zukan') return { ...item, disabled: false };
    if (item.id === 'sandbox') return { ...item, disabled: false, badgeKey: undefined };
    return item;
  });
  items.push({
    id: HOW_TO_PLAY_ITEM,
    labelKey: 'home.menu.howToPlay',
    descKey: 'home.menu.howToPlay.desc',
  });
  return items;
}

function isMenuItemId(id: string | null): id is MenuItemId {
  return id !== null && MENU_ITEMS.some((m) => m.id === id);
}
