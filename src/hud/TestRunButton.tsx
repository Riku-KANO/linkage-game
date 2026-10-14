import { useEffect, useId, useRef, useState } from 'react';
import { playSfx } from '@/audio/sfx';
import type { PreflightProblem, PreflightResult } from '@/game/types';
import { t } from '@/i18n';
import { LinkButton, useReducedMotion } from '@/ui/mech';
import { cx, Kbd } from './common';
import { summarizePreflight } from './format';
import { HudIcon } from './icons';
import './hud.css';

export interface TestRunButtonProps {
  /** 試走前チェックの結果(game の preflight)。null はまだチェック中 */
  preflight: PreflightResult | null;
  /** 試走を始める(エラーがないときだけ呼ぶ) */
  onTestRun: () => void;
  /** 問題の場所を図面で示す。一覧の行を押したとき、エラーで止められたときは最初のエラーで呼ぶ */
  onHighlight?: (problem: PreflightProblem) => void;
  /** 図面で今示している問題(行に印を付ける) */
  highlighted?: PreflightProblem | null;
  /** 一覧に一度に出す数(既定 3、残りは「ほか N 件」で開く) */
  maxVisible?: number;
  /** ボタンに添えるショートカットキーの表示(例:「T」) */
  shortcut?: string;
  /** ほかの理由で押せない(遷移中など) */
  disabled?: boolean;
  /**
   * 一覧をたたみ、状態の 1 行(「直すところが 1 つあります」など)だけを出す。試走を押すまでは
   * 一覧を出さず機械とパネルを隠さない、という使い方(INT-7a)。エラーで止められたときの
   * onHighlight で統合側が開く。既定 false
   */
  collapsed?: boolean;
  /** 省略時はアプリと OS の設定に従う */
  reducedMotion?: boolean;
  className?: string;
}

const sameProblem = (a: PreflightProblem | null | undefined, b: PreflightProblem) =>
  !!a &&
  a.code === b.code &&
  a.key === b.key &&
  JSON.stringify(a.params) === JSON.stringify(b.params);

/**
 * 試走ボタンと試走前チェックの一覧(HUD-1)。右下の端に置き、一覧はボタンの上へ伸びる
 * (ボタンの位置は動かない)。エラーがあると試走できず、押すと一覧が震えて最初のエラーの場所を示す。
 * 注意(warn)だけなら試走できる。
 */
export function TestRunButton({
  preflight,
  onTestRun,
  onHighlight,
  highlighted,
  maxVisible = 3,
  shortcut,
  disabled = false,
  collapsed = false,
  reducedMotion,
  className,
}: TestRunButtonProps) {
  const rm = useReducedMotion(reducedMotion);
  const listId = useId();
  const [expanded, setExpanded] = useState(false);
  const [shake, setShake] = useState(0);
  const problems = preflight?.problems ?? [];
  const summary = summarizePreflight(problems, expanded ? problems.length : maxVisible);
  const checking = preflight === null;
  const blocked = !checking && (summary.blocked || preflight.ok === false);
  const listShown = problems.length > 0 && !collapsed;

  // 問題が減って一覧が短くなったら、開いた状態を戻す
  useEffect(() => {
    if (problems.length <= maxVisible) setExpanded(false);
  }, [problems.length, maxVisible]);

  // 震えは一度きり(同じ値のままだと 2 回目が動かないので数で区別する)
  const plaqueRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (shake === 0 || rm) return;
    const el = plaqueRef.current;
    if (!el) return;
    el.removeAttribute('data-shake');
    void el.offsetWidth;
    el.setAttribute('data-shake', '');
  }, [shake, rm]);

  const run = () => {
    if (disabled || checking) return;
    if (blocked) {
      setShake((n) => n + 1);
      playSfx('error', { volume: 0.6 });
      const first = problems.find((p) => p.severity === 'error');
      if (first) onHighlight?.(first);
      return;
    }
    onTestRun();
  };

  const status = checking
    ? t('hud.testRun.checking')
    : summary.errors > 0
      ? t('hud.testRun.blocked', { count: summary.errors })
      : summary.warnings > 0
        ? t('hud.testRun.warnings', { count: summary.warnings })
        : t('hud.testRun.ready');

  return (
    <div
      className={cx('hud-run-btn', rm && 'hud-rm', className)}
      role="group"
      aria-label={t('hud.testRun.region')}
      data-state={checking ? 'checking' : blocked ? 'blocked' : summary.warnings ? 'warn' : 'ok'}
    >
      {listShown && (
        <div ref={plaqueRef} className="hud-plate hud-problems" id={listId}>
          <p className="hud-problems__status" aria-live="polite">
            {status}
          </p>
          <ul className="hud-problems__list">
            {summary.visible.map((p, i) => (
              <li key={`${p.code}-${i}`}>
                <button
                  type="button"
                  className="hud-problem"
                  data-severity={p.severity}
                  data-active={sameProblem(highlighted, p) || undefined}
                  aria-describedby={`${listId}-locate`}
                  onClick={() => onHighlight?.(p)}
                  disabled={!onHighlight}
                >
                  <span className="hud-problem__tag">
                    <HudIcon name={p.severity === 'error' ? 'error' : 'warn'} size={12} />
                    {t(p.severity === 'error' ? 'hud.testRun.error' : 'hud.testRun.warn')}
                  </span>
                  <span className="hud-problem__text">{t(p.key, p.params)}</span>
                  {onHighlight && (
                    <span className="hud-problem__locate">
                      <HudIcon name="locate" size={14} />
                    </span>
                  )}
                </button>
              </li>
            ))}
          </ul>
          {summary.hidden > 0 && (
            <button
              type="button"
              className="hud-problems__more"
              aria-expanded={false}
              aria-controls={listId}
              onClick={() => setExpanded(true)}
            >
              {t('hud.testRun.more', { count: summary.hidden })}
            </button>
          )}
          <span id={`${listId}-locate`} hidden>
            {t('hud.testRun.showOnDesign')}
          </span>
        </div>
      )}
      {!listShown && (
        <p className="hud-run-btn__status" aria-live="polite">
          {status}
        </p>
      )}
      <LinkButton
        variant="primary"
        className="hud-run-btn__button"
        reducedMotion={rm}
        disabled={disabled || checking}
        aria-disabled={blocked || undefined}
        aria-describedby={listShown ? listId : undefined}
        aria-keyshortcuts={shortcut}
        data-blocked={blocked || undefined}
        onClick={run}
      >
        <HudIcon name="play" size={15} />
        {t('hud.testRun.button')}
        {shortcut && <Kbd>{shortcut}</Kbd>}
      </LinkButton>
    </div>
  );
}
