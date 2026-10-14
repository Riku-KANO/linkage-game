import { useEffect, useState } from 'react';
import { playSfx } from '@/audio/sfx';
import { stageTextParams } from '@/game';
import { MechanismEditor } from '@/editor';
import { t } from '@/i18n';
import {
  isHintSuggested,
  selectAllowedParts,
  selectHasNextHint,
  selectHintGhost,
  selectLockedJoints,
  selectOpponent,
  selectRevealedHints,
  selectStage,
  selectTutorial,
} from '../session';
import { isSandboxStage } from '../sandbox';
import { useFlow, useFlowStore } from './context';

/** 設計画面:ステージの課題・チュートリアル・ヒント・試走前チェック・試走ボタンと、機構エディタ */
export function DesignView() {
  const store = useFlowStore();
  const stage = useFlow(selectStage);
  const allowedParts = useFlow(selectAllowedParts);
  const lockedJoints = useFlow(selectLockedJoints);
  const hintGhost = useFlow(selectHintGhost);
  const loading = useFlow((s) => s.run.phase === 'loading');

  if (!stage) return null;
  const params = stageTextParams(stage);
  const back = () => store.getState().leaveStage();
  const run = () => {
    playSfx('press');
    void store.getState().startRun();
  };

  return (
    <div className="fl-design">
      <aside className="fl-side">
        <div className="fl-row">
          <button type="button" className="fl-btn" onClick={back}>
            ← {t('flow.ui.backToStages')}
          </button>
        </div>
        <header>
          <h2 className="fl-stage-title">
            {!isSandboxStage(stage) && (
              <span className="fl-muted">
                {stage.chapter}-{stage.order}{' '}
              </span>
            )}
            {t(stage.titleKey)}
          </h2>
          <p>{t(stage.descKey, params)}</p>
          <div className="fl-chips">
            <span className="fl-chip">{t('flow.ui.goal', { distance: params.distance! })}</span>
            <span className="fl-chip">
              {t('flow.ui.timeLimit', { timeLimit: stage.timeLimit })}
            </span>
            {stage.budget !== null && (
              <span className="fl-chip">{t('flow.ui.budget', { budget: stage.budget })}</span>
            )}
          </div>
          <Opponent />
        </header>
        <Tutorial />
        <Hints params={params} />
        <Preflight />
        <div className="fl-row">
          <button
            type="button"
            className="fl-btn fl-btn--primary fl-btn--big"
            onClick={run}
            disabled={loading}
          >
            {loading ? t('flow.ui.preparing') : t('flow.ui.testRun')}
          </button>
        </div>
        <div className="fl-row fl-row--wrap">
          <button type="button" className="fl-btn" onClick={() => store.getState().exportDesign()}>
            {t('flow.ui.export')}
          </button>
          <button
            type="button"
            className="fl-btn"
            onClick={() => void store.getState().importDesign()}
          >
            {t('flow.ui.import')}
          </button>
          <button
            type="button"
            className="fl-btn"
            onClick={() => void store.getState().shareCurrent()}
          >
            {t('flow.ui.share')}
          </button>
          <button type="button" className="fl-btn" onClick={() => store.getState().resetDesign()}>
            {t('flow.ui.resetDesign')}
          </button>
        </div>
      </aside>
      <MechanismEditor
        className="fl-editor"
        allowedParts={allowedParts}
        lockedJoints={lockedJoints}
        ghost={hintGhost}
        budget={stage.budget}
      />
    </div>
  );
}

function Opponent() {
  const store = useFlowStore();
  const opponent = useFlow(selectOpponent);
  if (!opponent) return null;
  return (
    <div className="fl-chips">
      <span className="fl-chip fl-chip--opponent">
        {t('flow.ui.opponent', { time: opponent.time.toFixed(1) })}
      </span>
      <button type="button" className="fl-link" onClick={() => store.getState().clearOpponent()}>
        {t('flow.ui.opponent.clear')}
      </button>
    </div>
  );
}

function Tutorial() {
  const store = useFlowStore();
  const tut = useFlow(selectTutorial);
  if (!tut) return null;
  return (
    <section className="fl-bubble" aria-live="polite">
      <div className="fl-muted">
        {t('flow.ui.tutorial', { step: tut.index + 1, total: tut.total })}
      </div>
      <p>{t(tut.textKey)}</p>
      <div className="fl-row">
        {tut.waitsForClick && (
          <button
            type="button"
            className="fl-btn fl-btn--primary"
            onClick={() => store.getState().tutorialClick()}
          >
            {t('game.tutorial.next')}
          </button>
        )}
        <button type="button" className="fl-link" onClick={() => store.getState().skipTutorial()}>
          {t('game.tutorial.skip')}
        </button>
      </div>
    </section>
  );
}

/** ヒントを促すかを時間でも判定するため、10 秒ごとに見直す */
function useNow(intervalMs: number): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), intervalMs);
    return () => clearInterval(id);
  }, [intervalMs]);
  return now;
}

function Hints({ params }: { params: Record<string, string | number> }) {
  const store = useFlowStore();
  const stage = useFlow(selectStage);
  const hints = useFlow(selectRevealedHints);
  const hasNext = useFlow(selectHasNextHint);
  const now = useNow(10_000);
  const suggested = useFlow((s) => s.hintSuggested || isHintSuggested(s, now));
  if (!stage || isSandboxStage(stage)) return null;
  return (
    <section className="fl-hints">
      <div className="fl-row">
        <strong>{t('flow.ui.hints')}</strong>
        <button
          type="button"
          className="fl-btn"
          data-glow={(suggested && hasNext) || undefined}
          disabled={!hasNext}
          onClick={() => store.getState().revealHint()}
        >
          {t(
            !hasNext ? 'game.hint.none' : hints.length === 0 ? 'game.hint.show' : 'game.hint.next',
          )}
        </button>
        {suggested && hasNext && <span className="fl-muted">{t('flow.ui.hint.suggested')}</span>}
      </div>
      {hints.map((h) => (
        <p key={h.level} className="fl-hint">
          <strong>{t(h.labelKey)}</strong> {t(h.hint.key, params)}
        </p>
      ))}
    </section>
  );
}

function Preflight() {
  const pf = useFlow((s) => s.preflight);
  if (!pf) return null;
  return (
    <section className="fl-preflight" data-ok={pf.ok || undefined}>
      <strong>{t('flow.ui.preflight.title')}</strong>
      {pf.ok && <p className="fl-ok">{t('flow.ui.preflight.ok')}</p>}
      <ul>
        {pf.problems.map((p, i) => (
          <li key={`${p.code}-${i}`} data-severity={p.severity}>
            {t(p.key, p.params)}
          </li>
        ))}
      </ul>
    </section>
  );
}
