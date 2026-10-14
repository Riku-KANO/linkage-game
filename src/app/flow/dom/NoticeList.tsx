import { useEffect } from 'react';
import { t } from '@/i18n';
import { useFlow, useFlowStore } from './context';

/** 通知を自動で消すまでの時間(ms)。エラーは手で閉じるまで残す */
const AUTO_DISMISS_MS = 7000;

/** 通知の一覧(画面の右上)。HUD-4 の本番の通知ができるまでの簡単な表示 */
export function NoticeList() {
  const notices = useFlow((s) => s.notices);
  const store = useFlowStore();

  useEffect(() => {
    const timers = notices
      .filter((n) => n.severity !== 'error')
      .map((n) => setTimeout(() => store.getState().dismissNotice(n.id), AUTO_DISMISS_MS));
    return () => timers.forEach(clearTimeout);
  }, [notices, store]);

  if (notices.length === 0) return null;
  return (
    <ul className="fl-notices" aria-live="polite">
      {notices.map((n) => (
        <li key={n.id} className="fl-notice" data-severity={n.severity} data-kind={n.kind}>
          <span>{t(n.key, n.params)}</span>
          <button
            type="button"
            className="fl-notice__close"
            aria-label={t('flow.ui.dismiss')}
            onClick={() => store.getState().dismissNotice(n.id)}
          >
            ×
          </button>
        </li>
      ))}
    </ul>
  );
}
