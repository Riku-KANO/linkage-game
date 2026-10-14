import { useEffect, useRef } from 'react';
import { useStore } from 'zustand';
import { t } from '@/i18n';
import { SIM_SPEEDS, type SimSpeed } from './clock';
import type { TestRunController, VisualToggles } from './controller';

/**
 * 時間操作の帯(TR-4、S-06):再生・一時停止、コマ送り、リセット、速度、経過時間と距離、状態。
 * 押した状態などは controller.store から(変わったときだけ再描画)、時間と距離は onFrame で
 * 文字だけ書き換える(毎フレームの React の再描画なし)。
 */
export interface ControlBarProps {
  controller: TestRunController;
  /** キーボード操作(Space・→・R・1〜4)を受け付ける */
  keyboard?: boolean;
}

const SPEED_LABEL: Record<SimSpeed, string> = { 0.25: '¼', 1: '1', 2: '2', 4: '4' };

export function ControlBar({ controller, keyboard = false }: ControlBarProps) {
  const paused = useStore(controller.store, (s) => s.paused);
  const speed = useStore(controller.store, (s) => s.speed);
  const status = useStore(controller.store, (s) => s.status);
  const slowMo = useStore(controller.store, (s) => s.slowMo);
  const timeRef = useRef<HTMLElement>(null);
  const distRef = useRef<HTMLElement>(null);

  useEffect(() => {
    let shownTime = -1;
    let shownDist = Number.NaN;
    const update = () => {
      const s = controller.getSnapshot();
      const tenth = Math.floor(s.time * 10);
      if (tenth !== shownTime && timeRef.current) {
        shownTime = tenth;
        timeRef.current.textContent = t('testrun.time', { s: (tenth / 10).toFixed(1) });
      }
      const d = Math.round((s.com.x - controller.getOrigin().x) * 100) / 100;
      if (d !== shownDist && distRef.current) {
        shownDist = d;
        distRef.current.textContent = t('testrun.distance', { m: d.toFixed(2) });
      }
    };
    update();
    return controller.onFrame(update);
  }, [controller]);

  useEffect(() => {
    if (!keyboard) return;
    const onKey = (e: KeyboardEvent) => {
      const el = e.target as HTMLElement | null;
      if (el && (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.isContentEditable))
        return;
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      if (e.code === 'Space') {
        e.preventDefault();
        controller.togglePause();
      } else if (e.code === 'ArrowRight' || e.key === '.') {
        e.preventDefault();
        controller.stepOnce();
      } else if (e.key === 'r' || e.key === 'R') {
        controller.reset();
      } else if (e.key >= '1' && e.key <= '4') {
        controller.setSpeed(SIM_SPEEDS[Number(e.key) - 1]!);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [controller, keyboard]);

  return (
    <div className="tr-panel tr-bar" role="toolbar" aria-label={t('testrun.controls')}>
      <button
        type="button"
        className="tr-btn"
        onClick={() => controller.reset()}
        title={t('testrun.reset')}
        aria-label={t('testrun.reset')}
      >
        ↺
      </button>
      <button
        type="button"
        className="tr-btn tr-primary"
        onClick={() => controller.togglePause()}
        title={paused ? t('testrun.play') : t('testrun.pause')}
        aria-label={paused ? t('testrun.play') : t('testrun.pause')}
      >
        {paused ? '▶' : '❚❚'}
      </button>
      <button
        type="button"
        className="tr-btn"
        onClick={() => controller.stepOnce()}
        title={t('testrun.step')}
        aria-label={t('testrun.step')}
      >
        ▸|
      </button>
      <span className="tr-seg" role="group" aria-label={t('testrun.speed')}>
        <span className="tr-seg-label">{t('testrun.speed')}</span>
        {SIM_SPEEDS.map((s) => (
          <button
            key={s}
            type="button"
            className="tr-btn"
            aria-pressed={speed === s}
            aria-label={t('testrun.speed.x', { s })}
            title={t('testrun.speed.x', { s })}
            onClick={() => controller.setSpeed(s)}
          >
            ×{SPEED_LABEL[s]}
          </button>
        ))}
      </span>
      <span className="tr-readout">
        <small>{t('testrun.timeLabel')}</small>
        <b ref={timeRef} />
      </span>
      <span className="tr-readout">
        <small>{t('testrun.distanceLabel')}</small>
        <b ref={distRef} />
      </span>
      {slowMo && <span className="tr-badge tr-slow">{t('testrun.slowMo')}</span>}
      {status !== 'running' && (
        <span className={`tr-badge${status === 'goal' ? ' tr-goal' : ''}`} role="status">
          {t(`testrun.status.${status}`)}
        </span>
      )}
    </div>
  );
}

/** 可視化・カメラの切り替え(TR-5) */
export function VisualTogglePanel({ controller }: { controller: TestRunController }) {
  const show = useStore(controller.store, (s) => s.show);
  const follow = useStore(controller.store, (s) => s.follow);
  const keys: (keyof VisualToggles)[] = ['trails', 'contacts', 'com', 'torque', 'ghost', 'design'];
  return (
    <div className="tr-panel tr-toggles" role="group" aria-label={t('testrun.toggles')}>
      <h3>{t('testrun.toggles')}</h3>
      {keys.map((k) => (
        <label key={k} className="tr-toggle">
          <input
            type="checkbox"
            checked={show[k]}
            onChange={(e) => controller.setShow({ [k]: e.target.checked })}
          />
          {t(`testrun.show.${k}`)}
        </label>
      ))}
      <label className="tr-toggle">
        <input
          type="checkbox"
          checked={follow}
          onChange={(e) => controller.setFollow(e.target.checked)}
        />
        {t('testrun.follow')}
      </label>
    </div>
  );
}
