import { useEffect, useRef, useState } from 'react';
import { useStore } from 'zustand';
import { useSession, type RunEnd } from '@/app/flow';
import { isSandboxStage } from '@/app/flow';
import { t } from '@/i18n';
import { Button } from '@/scene/overlay/Panel';
import type { ScreenOverlayProps } from '@/scene/overlay/placeholders';
import { TestRunHud } from '@/testrun/TestRunHud';
import { backToDesign, finishToResult } from './run3d/actions';
import { runViewStore, type RunView } from './run3d/runView';
import './run3d/run3d.css';

/**
 * 試走画面の DOM(INT-2)。GameShell の overlays の testRun に置く。
 *
 *  - 上の帯:ステージ、経過時間 / 制限時間、進んだ距離 / ゴールまで、進み具合、状態の札、
 *    ゴーストの凡例、「設計に戻る」(Esc)と「結果へ」
 *  - testrun の操作盤(TestRunHud):再生・一時停止・コマ送り・↺(新しい試走)・速度、
 *    トルク計、表示の切り替え(軌跡・接地・重心・ゴースト・設計図・追従カメラ)、設計図の縮小版(U-04)
 *
 * TODO(hud):HUD-5 の RunHud が main に入ったら、上の帯を <RunHud> に差し替える。
 * 値は runHudModel 相当(elapsed = status.time、timeLimit、distance、goalDistance、
 * motorLoad = snapshot.motorTorque / stallTorque、badges = 停動・転倒・詰まった、
 * ghostDistance = 前回のゴーストの x − startX)、onBackToDesign = backToDesign。
 */
export function TestRunScreen(_props: ScreenOverlayProps) {
  const view = useStore(runViewStore, (s) => s.view);
  const run = useSession((s) => s.run);
  const current = view && run.phase === 'running' && run.live === view.live ? view : null;
  const handingOver = view && run.phase === 'finished' && view.handedOver ? view : null;
  const shown = current ?? handingOver;
  if (!shown) {
    return (
      <div className="ak-run-screen">
        <p className="ak-run-loading" role="status">
          {t('flow.ui.preparing')}
        </p>
      </div>
    );
  }
  return (
    <div className="ak-run-screen">
      <RunStrip key={shown.id} view={shown} />
      <TestRunHud controller={shown.controller} design={shown.live.design} keyboard />
    </div>
  );
}

/** 終わった理由の札(game の失敗理由の文言を使う) */
const END_KEYS: Record<RunEnd, string> = {
  goal: 'testrun.status.goal',
  fallen: 'game.fail.fallen',
  jammed: 'game.fail.jammed',
  stalled: 'game.fail.stalled',
  timeLimit: 'game.fail.timeout',
};

function RunStrip({ view }: { view: RunView }) {
  const { live, controller } = view;
  const stage = live.stage;
  const timeRef = useRef<HTMLElement>(null);
  const distRef = useRef<HTMLElement>(null);
  const barRef = useRef<HTMLSpanElement>(null);
  const [end, setEnd] = useState<RunEnd | null>(live.end);
  const [stalled, setStalled] = useState(false);

  // 数値は毎フレーム文字だけ書き換える(React の再描画なし)。札は変わったときだけ
  useEffect(() => {
    let shownTenth = -1;
    let shownCm = Number.NaN;
    let shownBar = -1;
    const update = () => {
      const st = live.status();
      const tenth = Math.floor(st.time * 10);
      if (tenth !== shownTenth && timeRef.current) {
        shownTenth = tenth;
        timeRef.current.textContent = t('flow.ui.time', {
          time: (tenth / 10).toFixed(1),
          limit: st.timeLimit,
        });
      }
      const cm = Math.round(Math.max(0, st.distance) * 100);
      if (cm !== shownCm && distRef.current) {
        shownCm = cm;
        distRef.current.textContent = t('flow.ui.distance', {
          distance: (cm / 100).toFixed(2),
          goal: st.goalDistance.toFixed(1),
        });
      }
      const bar = Math.round(st.progress * 1000);
      if (bar !== shownBar && barRef.current) {
        shownBar = bar;
        barRef.current.style.transform = `scaleX(${bar / 1000})`;
      }
      setEnd(st.end);
      setStalled(st.stalled && !st.done);
    };
    update();
    return controller.onFrame(update);
  }, [live, controller]);

  const title = isSandboxStage(stage)
    ? t('app.run.sandbox')
    : t('result.stage', { chapter: stage.chapter, order: stage.order, title: t(stage.titleKey) });

  return (
    <section className="ak-run-strip" aria-label={t('app.run.hud')}>
      <Button variant="ghost" onClick={() => backToDesign()} title={t('app.run.backKey')}>
        ← {t('flow.ui.abort')}
      </Button>
      <div className="ak-run-strip__body">
        <div className="ak-run-strip__row">
          <strong className="ak-run-strip__stage">{title}</strong>
          {view.replay && <span className="ak-run-chip">{t('flow.ui.replaying')}</span>}
          {end && (
            <span className={`ak-run-chip ${end === 'goal' ? 'is-goal' : 'is-bad'}`} role="status">
              {t(END_KEYS[end])}
            </span>
          )}
          {!end && stalled && (
            <span className="ak-run-chip is-warn" role="status">
              {t('flow.ui.stalled')}
            </span>
          )}
        </div>
        <div className="ak-run-strip__row ak-run-strip__nums">
          <b ref={timeRef} />
          <b ref={distRef} />
        </div>
        <div className="ak-run-progress" aria-label={t('app.run.progress')}>
          <span ref={barRef} className="ak-run-progress__bar" />
        </div>
        {(view.previousGhost || view.opponentGhost) && (
          <div className="ak-run-strip__row ak-run-legend">
            {view.previousGhost && (
              <span>
                <i className="ak-run-dot is-previous" aria-hidden />
                {t('flow.ui.ghost.previous')}
              </span>
            )}
            {view.opponentGhost && (
              <span>
                <i className="ak-run-dot is-opponent" aria-hidden />
                {t('flow.ui.ghost.opponent')}
              </span>
            )}
          </div>
        )}
      </div>
      <Button variant="primary" onClick={() => finishToResult()}>
        {t('flow.ui.skip')}
      </Button>
    </section>
  );
}
