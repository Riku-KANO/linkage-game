import type { SharePayload, ShareDecodeResult } from './share';
import { buildShareUrl, decodeShare } from './share';

/**
 * 共有リンクのブラウザ側の小さな補助(location・history・クリップボード)。
 * 中身のロジックは share.ts(Node でテストする)。ここは単体テストしない。
 */

/** 今のページの URL のフラグメントから共有を読む。共有がなければ reason: 'empty' */
export function readShareFromLocation(): ShareDecodeResult {
  return decodeShare(window.location.hash);
}

/** 読み終えた共有フラグメントを、再読み込みせずにアドレスバーから消す */
export function clearShareFromLocation(): void {
  const { pathname, search } = window.location;
  window.history.replaceState(window.history.state, '', `${pathname}${search}`);
}

/** 今のページを基準に共有 URL を作り、クリップボードにコピーする(失敗しても URL は返す) */
export async function copyShareUrl(
  payload: SharePayload,
): Promise<{ url: string; copied: boolean }> {
  const url = buildShareUrl(window.location.href, payload);
  try {
    await navigator.clipboard.writeText(url);
    return { url, copied: true };
  } catch {
    return { url, copied: false };
  }
}
