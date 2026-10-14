import { useMemo } from 'react';
import { useStore } from 'zustand';
import { useSession } from '@/app/flow';
import { isSandboxStage } from '@/app/flow';
import { ghostFrameCount, type Ghost } from '@/core/model/ghost';
import { LiveRunHud, RUN_BADGES, type RunBadge, type RunHudFrame, type RunHudSource } from '@/hud';
import { t } from '@/i18n';
import type { ScreenOverlayProps } from '@/scene/overlay/placeholders';
import { sampleGhostInto, type GhostPose } from '@/testrun/ghostPlayer';
import { TestRunHud } from '@/testrun/TestRunHud';
import { LinkButton } from '@/ui/mech';
import { backToDesign, finishToResult } from './run3d/actions';
import { runViewStore, type RunView } from './run3d/runView';
import './run3d/run3d.css';

/**
 * 試走画面の DOM(INT-2、INT-7b で HUD の計器に)。GameShell の overlays の testRun に置く。
 *
 *  - 上の中央:HUD の計器(LiveRunHud):経過時間 / 制限時間、距離 / ゴールまで・進み具合の帯
 *    (ゴーストの印)、モーター負荷、状態の札(停動・転倒・詰まった)。左上に「設計に戻る」(Esc)
 *  - 左上(その下):ステージ名・転倒の再生中・ゴーストの凡例。右下:「結果へ」
 *  - testrun の操作盤(TestRunHud):再生・一時停止・コマ送り・↺(新しい試走)・速度、
 *    表示の切り替え(軌跡・接地・重心・トルク・ゴースト・設計図・追従カメラ)、設計図の縮小版(U-04)。
 *    クランクトルクの詳しい計器は計器の負荷と重なるので、既定では隠す(表示の切り替えで出せる)
 *
 * 計器の値(runHudSource):elapsed = status.time、timeLimit、distance、goalDistance、
 * motorLoad = |描画中のモーターのトルク| / 停動トルク、badges、ghostDistance = ゴースト(前回、なければ相手)
 * の今の時刻の x − 記録の最初の x。値は進行役の onFrame で React を通さずに書き換える。
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
      <RunGauges key={shown.id} view={shown} />
      <TestRunHud controller={shown.controller} design={shown.live.design} keyboard />
    </div>
  );
}

function RunGauges({ view }: { view: RunView }) {
  const source = useMemo(() => runHudSource(view), [view]);
  const stage = view.live.stage;
  const st = view.live.status();
  const title = isSandboxStage(stage)
    ? t('app.run.sandbox')
    : t('result.stage', { chapter: stage.chapter, order: stage.order, title: t(stage.titleKey) });
  return (
    <>
      <LiveRunHud
        source={source}
        timeLimit={st.timeLimit}
        goalDistance={st.goalDistance}
        onBackToDesign={() => backToDesign()}
        backShortcut={t('app.run.backKey')}
        className="ak-run-gauges"
      />
      <section className="ak-run-info" aria-label={t('app.run.hud')}>
        <strong className="ak-run-info__stage">{title}</strong>
        {view.replay && <span className="ak-run-chip">{t('flow.ui.replaying')}</span>}
        {(view.previousGhost || view.opponentGhost) && (
          <span className="ak-run-legend">
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
          </span>
        )}
      </section>
      <div className="ak-run-skip">
        <LinkButton variant="primary" onClick={() => finishToResult()}>
          {t('flow.ui.skip')}
        </LinkButton>
      </div>
    </>
  );
}

/** 札の組み合わせごとに同じ配列を返す(毎フレーム配列を作らない) */
const BADGE_SETS = new Map<string, readonly RunBadge[]>();
function badgeSet(stalled: boolean, fallen: boolean, jammed: boolean): readonly RunBadge[] {
  const key = `${+stalled}${+fallen}${+jammed}`;
  let set = BADGE_SETS.get(key);
  if (!set) {
    const on = { stalled, fallen, jammed };
    set = RUN_BADGES.filter((b) => on[b]);
    BADGE_SETS.set(key, set);
  }
  return set;
}

/** 計器に流す値:試走(LiveRun)と進行役(描画中のスナップショット・onFrame)から */
export function runHudSource(
  view: Pick<RunView, 'live' | 'controller' | 'previousGhost' | 'opponentGhost'>,
): RunHudSource {
  const { live, controller } = view;
  const stall = Math.max(1e-6, controller.sim.params.motor.stallTorque);
  const ghost: Ghost | null =
    [view.previousGhost, view.opponentGhost].find((g) => g && ghostFrameCount(g) > 0) ?? null;
  const pose: GhostPose = {
    position: { x: 0, y: 0, z: 0 },
    quaternion: { x: 0, y: 0, z: 0, w: 1 },
    motorAngle: 0,
  };
  let ghostStart = 0;
  if (ghost && sampleGhostInto(ghost, 0, pose)) ghostStart = pose.position.x;
  const frame: RunHudFrame = { elapsed: 0, distance: 0, motorLoad: 0, ghostDistance: null };
  return {
    read() {
      const st = live.status();
      frame.elapsed = st.time;
      frame.distance = st.distance;
      frame.motorLoad = Math.abs(controller.getSnapshot().motorTorque) / stall;
      frame.badges = badgeSet(
        st.end === 'stalled' || (st.stalled && !st.done),
        st.end === 'fallen' || st.fallen,
        st.end === 'jammed' || st.jammed,
      );
      frame.ghostDistance =
        ghost && sampleGhostInto(ghost, st.time, pose) ? pose.position.x - ghostStart : null;
      return frame;
    },
    subscribe: (onFrame) => controller.onFrame(onFrame),
  };
}
