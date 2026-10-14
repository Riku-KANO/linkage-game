import type { Persistence, PersistenceOptions, StorageLike } from './persistence';
import { createPersistence } from './persistence';

/**
 * ブラウザ側の小さな補助。単体テストしない(ロジックは persistence.ts)。
 */

/**
 * 使える localStorage を返す。プライベートモードやサイトデータのブロックで
 * アクセス自体が例外になるときは null(createPersistence がメモリに切り替える)。
 */
export function getBrowserStorage(): StorageLike | null {
  try {
    const s = window.localStorage;
    s.getItem('ashikumi/probe');
    return s;
  } catch {
    return null;
  }
}

/**
 * ページを離れる・隠れるときに fn を呼ぶ(自動保存の flush 用)。
 * 戻り値で登録を解除する。
 */
export function onPageHide(fn: () => void): () => void {
  const onVisibility = () => {
    if (document.visibilityState === 'hidden') fn();
  };
  window.addEventListener('pagehide', fn);
  document.addEventListener('visibilitychange', onVisibility);
  return () => {
    window.removeEventListener('pagehide', fn);
    document.removeEventListener('visibilitychange', onVisibility);
  };
}

/** ブラウザの localStorage(使えなければメモリ)を使う Persistence */
export function createBrowserPersistence(opts?: PersistenceOptions): Persistence {
  return createPersistence(getBrowserStorage(), opts);
}
