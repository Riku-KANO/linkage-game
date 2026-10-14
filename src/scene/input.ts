import { useEffect } from 'react';
import { useApp } from '@/app/store';
import { classifyInput, type InputLike } from './rig/timeline';
import { rigSignals, useSceneUi } from './store';

/**
 * 全体の入力:Esc・右クリックで戻る、遷移中のクリック・キーでスキップ、起動中はロゴを飛ばす。
 * 他の UI(編集ビューなど)が自分で処理した入力は preventDefault() してあれば無視する。
 */
export function useTransitionInput(): void {
  useEffect(() => {
    const ctx = () => {
      const s = useApp.getState();
      return { screen: s.screen, transition: s.transition, historyLength: s.history.length };
    };
    const act = (e: Event, like: InputLike) => {
      const action = classifyInput(like, ctx());
      if (action === 'back') {
        e.preventDefault();
        useApp.getState().back();
      } else if (action === 'skip') {
        rigSignals.skip = true;
      } else if (action === 'skipBoot') {
        rigSignals.skipBoot = true;
      }
    };
    const onKey = (e: KeyboardEvent) =>
      act(e, {
        type: 'keydown',
        key: e.key,
        repeat: e.repeat,
        timeStamp: e.timeStamp,
        defaultPrevented: e.defaultPrevented,
        editable: isEditable(e.target),
      });
    const onPointer = (e: PointerEvent) =>
      act(e, {
        type: 'pointerdown',
        button: e.button,
        timeStamp: e.timeStamp,
        defaultPrevented: e.defaultPrevented,
      });
    const onContext = (e: MouseEvent) => {
      if (e.defaultPrevented) return;
      // ブラウザのメニューは出さない(ゲームの中の右クリックは「戻る」)
      e.preventDefault();
      act(e, { type: 'contextmenu', button: 2, timeStamp: e.timeStamp, defaultPrevented: false });
    };
    window.addEventListener('keydown', onKey);
    window.addEventListener('pointerdown', onPointer);
    window.addEventListener('contextmenu', onContext);
    // ホームを離れたらホバーを消す
    const unsub = useApp.subscribe((s, prev) => {
      if (s.screen !== prev.screen) {
        useSceneUi.getState().setHovered(null);
        document.body.style.cursor = '';
      }
    });
    return () => {
      window.removeEventListener('keydown', onKey);
      window.removeEventListener('pointerdown', onPointer);
      window.removeEventListener('contextmenu', onContext);
      unsub();
    };
  }, []);
}

function isEditable(t: EventTarget | null): boolean {
  if (!(t instanceof HTMLElement)) return false;
  return (
    t.isContentEditable ||
    t.tagName === 'INPUT' ||
    t.tagName === 'TEXTAREA' ||
    t.tagName === 'SELECT'
  );
}

/** OS の「視差効果を減らす」(prefers-reduced-motion)を設定に反映し、変化にも追従する */
export function useReducedMotionSync(): void {
  useEffect(() => {
    if (typeof window === 'undefined' || !window.matchMedia) return;
    const mq = window.matchMedia('(prefers-reduced-motion: reduce)');
    const apply = () => {
      const s = useApp.getState();
      if (s.settings.reducedMotion !== mq.matches) s.setSettings({ reducedMotion: mq.matches });
    };
    if (mq.matches) apply();
    mq.addEventListener('change', apply);
    return () => mq.removeEventListener('change', apply);
  }, []);
}
