import { useSyncExternalStore } from 'react';
import { useApp } from '@/app/store';

const QUERY = '(prefers-reduced-motion: reduce)';

function subscribe(cb: () => void): () => void {
  if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return () => {};
  const mq = window.matchMedia(QUERY);
  mq.addEventListener('change', cb);
  return () => mq.removeEventListener('change', cb);
}

function snapshot(): boolean {
  if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return false;
  return window.matchMedia(QUERY).matches;
}

/** OS の「視差効果を減らす」設定 */
export function usePrefersReducedMotion(): boolean {
  return useSyncExternalStore(subscribe, snapshot, () => false);
}

/**
 * 動きを減らすか。明示の指定 > アプリの設定(useApp().settings.reducedMotion)または OS の設定。
 * 減らすときは演出を即座の最終状態か 0.3 秒以内のフェードに置き換える。
 */
export function useReducedMotion(override?: boolean): boolean {
  const setting = useApp((s) => s.settings.reducedMotion);
  const os = usePrefersReducedMotion();
  return override ?? (setting || os);
}
