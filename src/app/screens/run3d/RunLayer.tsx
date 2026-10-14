import { useStore } from 'zustand';
import { useSession } from '@/app/flow';
import { useApp } from '@/app/store';
import { t } from '@/i18n';
import { runViewStore, setPreflightOpen } from './runView';
import './run3d.css';

/**
 * どの画面にも重ねる DOM(GameShell の children):設計画面で試走ボタンが試走前チェックに
 * 止められたときの問題の一覧。通知(解放など)は app の NoticeLayer が出す。
 *
 * TODO(int-design / INT-7):設計画面に HUD-1 の TestRunButton(試走前チェックの一覧つき)が入ったら、
 * 問題の一覧はそちらに任せてここは消す(runViewStore.preflightOpen が「試走ボタンで止まった」合図)。
 */
export function RunLayer() {
  return (
    <>
      <PreflightProblems />
    </>
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
          className="ak-run-preflight__close"
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
