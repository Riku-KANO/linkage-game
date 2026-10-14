import { useRef } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import { useApp } from '@/app/store';
import {
  MIN_SAMPLES,
  browserStorage,
  classifyGpu,
  loadPerfDecision,
  readRendererString,
  savePerfDecision,
  type PerfDecision,
} from './gpu';

/** 最後に決めた判定(設定画面の表示用) */
export const perfStatus: { decision: PerfDecision | null } = { decision: null };

/**
 * 保存済みの判定を設定に入れる。Canvas を作る前に一度呼ぶ(後処理を作ってから外す無駄を避ける)。
 * 戻り値:保存済みの判定があったか
 */
export function applyStoredPerfDecision(): boolean {
  const d = loadPerfDecision(browserStorage());
  if (!d) return false;
  perfStatus.decision = d;
  const app = useApp.getState();
  if (app.settings.lowPerf !== d.lowPerf) app.setSettings({ lowPerf: d.lowPerf });
  return true;
}

/** 設定画面で手動で切り替えたとき */
export function setLowPerfManually(lowPerf: boolean): void {
  const d: PerfDecision = { lowPerf, reason: 'manual' };
  perfStatus.decision = d;
  savePerfDecision(browserStorage(), d);
  useApp.getState().setSettings({ lowPerf });
}

const SKIP_FRAMES = 12;
const WANT_SAMPLES = 90;

/**
 * 初回起動時の性能測定(SC-6)。ロゴが組み上がる間のフレーム時間を測り、GPU の名前と合わせて
 * 低性能モードを選ぶ。結果は保存し、2 回目以降は測らない。
 */
export function PerfProbe({ enabled }: { enabled: boolean }) {
  const gl = useThree((s) => s.gl);
  const st = useRef({ frames: 0, samples: [] as number[], last: 0, done: !enabled });

  useFrame(() => {
    const s = st.current;
    if (s.done) return;
    const now = performance.now();
    if (typeof document !== 'undefined' && document.hidden) {
      s.last = 0;
      return;
    }
    if (s.last > 0 && s.frames > SKIP_FRAMES) s.samples.push(now - s.last);
    s.last = now;
    s.frames++;
    const leftBoot = useApp.getState().screen !== 'boot';
    if (s.samples.length >= WANT_SAMPLES || (leftBoot && s.frames > SKIP_FRAMES + MIN_SAMPLES)) {
      s.done = true;
      const d = classifyGpu(readRendererString(gl.getContext()), s.samples);
      perfStatus.decision = d;
      savePerfDecision(browserStorage(), d);
      const app = useApp.getState();
      if (app.settings.lowPerf !== d.lowPerf) app.setSettings({ lowPerf: d.lowPerf });
    }
  });
  return null;
}
