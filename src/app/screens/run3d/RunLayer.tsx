import { useEffect } from 'react';
import { useStore } from 'zustand';
import { useSession } from '@/app/flow';
import { useApp } from '@/app/store';
import { t } from '@/i18n';
import { runViewStore, setPreflightOpen } from './runView';
import './run3d.css';

/** 通知を自動で消すまでの時間(ms)。エラーは手で閉じるまで残す */
const AUTO_DISMISS_MS = 7000;

/**
 * どの画面にも重ねる DOM(GameShell の children):
 *  - 通知(解放・保存の失敗・共有リンクの読み込みなど、session.notices)の簡単な一覧
 *  - 設計画面で試走ボタンが試走前チェックに止められたときの問題の一覧
 *
 * TODO(hud):HUD-4 の NoticeStack が main に入ったら通知はそちらに、HUD-1 の TestRunButton
 * (試走前チェックの一覧つき)が設計画面に入ったら問題の一覧はそちらに任せて、ここは消す。
 */
export function RunLayer() {
  return (
    <>
      <PreflightProblems />
      <RunNotices />
    </>
  );
}

function RunNotices() {
  const notices = useSession((s) => s.notices);
  useEffect(() => {
    const timers = notices
      .filter((n) => n.severity !== 'error')
      .map((n) => setTimeout(() => useSession.getState().dismissNotice(n.id), AUTO_DISMISS_MS));
    return () => timers.forEach(clearTimeout);
  }, [notices]);
  if (notices.length === 0) return null;
  return (
    <ul className="ak-run-notices" aria-live="polite" aria-label={t('app.run.notices')}>
      {notices.map((n) => (
        <li key={n.id} className="ak-run-notice" data-severity={n.severity} data-kind={n.kind}>
          <span>{t(n.key, n.params)}</span>
          <button
            type="button"
            className="ak-run-notice__close"
            aria-label={t('flow.ui.dismiss')}
            onClick={() => useSession.getState().dismissNotice(n.id)}
          >
            ×
          </button>
        </li>
      ))}
    </ul>
  );
}

function PreflightProblems() {
  const open = useStore(runViewStore, (s) => s.preflightOpen);
  const screen = useApp((s) => s.screen);
  const preflight = useSession((s) => s.preflight);
  if (!open || screen !== 'design' || !preflight || preflight.ok) return null;
  const errors = preflight.problems.filter((p) => p.severity === 'error');
  return (
    <section className="ak-run-preflight" role="alert" aria-label={t('flow.ui.preflight.title')}>
      <header>
        <strong>{t('flow.ui.preflight.title')}</strong>
        <button
          type="button"
          className="ak-run-notice__close"
          aria-label={t('flow.ui.dismiss')}
          onClick={() => setPreflightOpen(false)}
        >
          ×
        </button>
      </header>
      <ul>
        {errors.map((p, i) => (
          <li key={`${p.code}-${i}`}>{t(p.key, p.params)}</li>
        ))}
      </ul>
      <p className="ak-run-preflight__hint">{t('app.run.preflight.hint')}</p>
    </section>
  );
}
