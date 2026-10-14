import { useEffect, useRef, useState } from 'react';
import { setMotorHum } from '@/audio/sfx';
import { sampleGhost } from '@/core/model/ghost';
import { t } from '@/i18n';
import { RUN_SPEEDS, type LiveRun, type RunStatus } from '../run';
import type { RunPhase } from '../session';
import { useFlow, useFlowStore } from './context';
import { drawSideView, type SideViewGhost } from './sideView';

/** 試走が終わってから結果へ移るまでの間(s、最後の姿勢を見せる) */
const END_PAUSE = 0.8;

type Running = Extract<RunPhase, { phase: 'running' }>;

/**
 * 試走ビュー(3D なしの代わり):2D の側面図に機体を描き、240Hz の固定ステップで進める。
 * 再生・一時停止・×0.5/×1/×2、「結果へ」(最後まで一気に計算)、「設計に戻る」。
 */
export function RunView() {
  const run = useFlow((s) => s.run);
  if (run.phase === 'running') return <RunCanvas key={runKey(run.live)} run={run} />;
  return (
    <div className="fl-run">
      <p className="fl-run__loading">{t('flow.ui.preparing')}</p>
    </div>
  );
}

let keySeq = 0;
const keys = new WeakMap<LiveRun, number>();
function runKey(live: LiveRun): number {
  let k = keys.get(live);
  if (k === undefined) keys.set(live, (k = ++keySeq));
  return k;
}

function RunCanvas({ run }: { run: Running }) {
  const store = useFlowStore();
  const { live } = run;
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [status, setStatus] = useState<RunStatus>(() => live.status());
  const [paused, setPaused] = useState(live.paused);
  const [speed, setSpeed] = useState(live.speed);

  useEffect(() => {
    let raf = 0;
    let last = performance.now();
    let endedAt: number | null = null;
    const frame = (now: number) => {
      raf = requestAnimationFrame(frame);
      const dt = (now - last) / 1000;
      last = now;
      live.advance(dt);
      const snap = live.snapshot();
      const canvas = canvasRef.current;
      if (canvas) {
        const ctx = fitCanvas(canvas);
        if (ctx) {
          const ghosts: SideViewGhost[] = [];
          const prev = run.previousGhost && sampleGhost(run.previousGhost, snap.time);
          if (prev) ghosts.push({ pose: prev, kind: 'previous' });
          const opp = run.opponentGhost && sampleGhost(run.opponentGhost, snap.time);
          if (opp) ghosts.push({ pose: opp, kind: 'opponent' });
          drawSideView(ctx, canvas.clientWidth, canvas.clientHeight, {
            snapshot: snap,
            design: live.design,
            terrain: live.terrain,
            stage: live.stage,
            chassis: live.chassis,
            ghosts,
          });
        }
      }
      // モーターのうなり(回転数と負荷)
      const stall = Math.max(1e-9, live.sim.params.motor.stallTorque);
      const rpm = live.done || live.paused ? 0 : Math.abs((snap.motorSpeed * 60) / (2 * Math.PI));
      setMotorHum(rpm, Math.min(1, Math.max(0, snap.motorTorque / stall)));
      setStatus(live.status());
      if (live.done) {
        endedAt ??= now;
        if (now - endedAt >= END_PAUSE * 1000) {
          cancelAnimationFrame(raf);
          store.getState().finishRun();
        }
      }
    };
    raf = requestAnimationFrame(frame);
    return () => {
      cancelAnimationFrame(raf);
      setMotorHum(0, 0);
    };
  }, [live, run, store]);

  const togglePause = () => {
    live.paused = !live.paused;
    setPaused(live.paused);
  };
  const changeSpeed = (s: number) => {
    live.speed = s;
    setSpeed(s);
  };

  return (
    <div className="fl-run">
      <div className="fl-run__bar">
        <button type="button" className="fl-btn" onClick={() => store.getState().abortRun()}>
          ← {t('flow.ui.abort')}
        </button>
        <button type="button" className="fl-btn" onClick={togglePause} disabled={status.done}>
          {paused ? t('flow.ui.play') : t('flow.ui.pause')}
        </button>
        {RUN_SPEEDS.map((s) => (
          <button
            key={s}
            type="button"
            className="fl-btn"
            aria-pressed={speed === s}
            onClick={() => changeSpeed(s)}
          >
            {t('flow.ui.speed', { speed: s })}
          </button>
        ))}
        <button
          type="button"
          className="fl-btn fl-btn--primary"
          onClick={() => store.getState().finishRun()}
        >
          {t('flow.ui.skip')}
        </button>
        {run.replay && <span className="fl-chip">{t('flow.ui.replaying')}</span>}
      </div>
      <div className="fl-run__status" role="status">
        <span>
          {t('flow.ui.time', {
            time: status.time.toFixed(1),
            limit: status.timeLimit,
          })}
        </span>
        <span>
          {t('flow.ui.distance', {
            distance: Math.max(0, status.distance).toFixed(2),
            goal: status.goalDistance.toFixed(1),
          })}
        </span>
        <progress max={1} value={status.progress} />
        {status.stalled && !status.done && <span className="fl-warn">{t('flow.ui.stalled')}</span>}
      </div>
      <canvas ref={canvasRef} className="fl-run__canvas" />
    </div>
  );
}

/** キャンバスの解像度を表示の大きさ × devicePixelRatio に合わせる */
function fitCanvas(canvas: HTMLCanvasElement): CanvasRenderingContext2D | null {
  const dpr = window.devicePixelRatio || 1;
  const w = Math.max(1, Math.round(canvas.clientWidth * dpr));
  const h = Math.max(1, Math.round(canvas.clientHeight * dpr));
  if (canvas.width !== w || canvas.height !== h) {
    canvas.width = w;
    canvas.height = h;
  }
  const ctx = canvas.getContext('2d');
  ctx?.setTransform(dpr, 0, 0, dpr, 0, 0);
  return ctx;
}
