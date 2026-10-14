import { useRef } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import { useApp } from '@/app/store';
import {
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

/** 起動直後(シェーダーのコンパイルなど)は測らない */
const SKIP_MS = 500;
/** これだけ測ったら決める(遅い機械ではフレーム数が少なくても打ち切る) */
const MAX_MS = 2600;
const WANT_SAMPLES = 90;
const MIN_CAPPED_SAMPLES = 6;

/**
 * 初回起動時の性能測定(SC-6)。ロゴが組み上がる間のフレーム時間を測り、GPU の名前と合わせて
 * 低性能モードを選ぶ。ソフトウェア描画なら測らずにすぐ決める。結果は保存し、2 回目以降は測らない。
 */
export function PerfProbe({ enabled }: { enabled: boolean }) {
  const gl = useThree((s) => s.gl);
  const st = useRef({
    t0: 0,
    last: 0,
    samples: [] as number[],
    renderer: null as string | null,
    done: !enabled,
  });

  useFrame(() => {
    const s = st.current;
    if (s.done) return;
    const now = performance.now();
    if (s.t0 === 0) {
      s.t0 = now;
      s.renderer = readRendererString(gl.getContext());
      const quick = classifyGpu(s.renderer, []);
      if (quick.reason === 'software') {
        decide(quick);
        return;
      }
    }
    if (typeof document !== 'undefined' && document.hidden) {
      s.last = 0;
      return;
    }
    const elapsed = now - s.t0;
    if (elapsed > SKIP_MS && s.last > 0) s.samples.push(now - s.last);
    s.last = now;
    if (s.samples.length >= WANT_SAMPLES || elapsed > MAX_MS) {
      decide(classifyGpu(s.renderer, s.samples, MIN_CAPPED_SAMPLES));
    }
  });

  function decide(d: PerfDecision) {
    st.current.done = true;
    perfStatus.decision = d;
    savePerfDecision(browserStorage(), d);
    const app = useApp.getState();
    if (app.settings.lowPerf !== d.lowPerf) app.setSettings({ lowPerf: d.lowPerf });
  }
  return null;
}
