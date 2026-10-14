/**
 * 低性能モードの自動選択(SC-6)。初回起動時に GPU の名前と描画時間を見て決め、
 * 結果を localStorage に残す(2 回目以降は測らない)。設定画面で手動で切り替えたらそれを優先する。
 */

export type PerfReason =
  /** ソフトウェア描画(SwiftShader など) */
  | 'software'
  /** 描画時間の中央値が遅い */
  | 'slow'
  | 'ok'
  /** 設定で手動で選んだ */
  | 'manual';

export interface PerfDecision {
  lowPerf: boolean;
  reason: PerfReason;
  /** 測った描画時間の中央値(ms) */
  medianMs?: number;
}

/** これより遅ければ低性能(約 45fps) */
export const SLOW_FRAME_MS = 22;
/** 判定に必要な最小サンプル数 */
export const MIN_SAMPLES = 20;

const SOFTWARE_RENDERERS =
  /swiftshader|llvmpipe|softpipe|software|basic render|mesa offscreen|lavapipe/i;

export function median(xs: readonly number[]): number {
  if (xs.length === 0) return NaN;
  const s = [...xs].sort((a, b) => a - b);
  const m = s.length >> 1;
  return s.length % 2 ? s[m]! : (s[m - 1]! + s[m]!) / 2;
}

/**
 * GPU の名前と、起動直後に測ったフレーム時間(ms)から低性能モードを選ぶ。
 * サンプルが足りなければ名前だけで決める。
 */
export function classifyGpu(
  renderer: string | null,
  frameTimesMs: readonly number[],
): PerfDecision {
  if (renderer && SOFTWARE_RENDERERS.test(renderer)) return { lowPerf: true, reason: 'software' };
  const valid = frameTimesMs.filter((x) => Number.isFinite(x) && x > 0 && x < 1000);
  if (valid.length >= MIN_SAMPLES) {
    const m = median(valid);
    return m > SLOW_FRAME_MS
      ? { lowPerf: true, reason: 'slow', medianMs: m }
      : { lowPerf: false, reason: 'ok', medianMs: m };
  }
  return { lowPerf: false, reason: 'ok' };
}

/** WebGL の描画器の名前(取れなければ null) */
export function readRendererString(
  gl: WebGLRenderingContext | WebGL2RenderingContext,
): string | null {
  try {
    const plain = gl.getParameter(gl.RENDERER);
    // Chrome は RENDERER を伏せる("WebKit WebGL")。そのときだけ拡張で本当の名前を読む
    if (typeof plain === 'string' && plain && !/^webkit webgl$/i.test(plain)) return plain;
    const ext = gl.getExtension('WEBGL_debug_renderer_info');
    if (!ext) return typeof plain === 'string' ? plain : null;
    const real = gl.getParameter(ext.UNMASKED_RENDERER_WEBGL);
    return typeof real === 'string' ? real : null;
  } catch {
    return null;
  }
}

export const PERF_STORAGE_KEY = 'ashikumi.scene.perf.v1';

type KeyValueStore = Pick<Storage, 'getItem' | 'setItem'>;

/** 保存済みの判定(壊れていれば null) */
export function loadPerfDecision(storage: KeyValueStore | null): PerfDecision | null {
  if (!storage) return null;
  try {
    const raw = storage.getItem(PERF_STORAGE_KEY);
    if (!raw) return null;
    const v: unknown = JSON.parse(raw);
    if (typeof v !== 'object' || v === null) return null;
    const o = v as Record<string, unknown>;
    if (typeof o.lowPerf !== 'boolean') return null;
    const reason = o.reason;
    if (reason !== 'software' && reason !== 'slow' && reason !== 'ok' && reason !== 'manual') {
      return null;
    }
    return {
      lowPerf: o.lowPerf,
      reason,
      ...(typeof o.medianMs === 'number' ? { medianMs: o.medianMs } : {}),
    };
  } catch {
    return null;
  }
}

export function savePerfDecision(storage: KeyValueStore | null, d: PerfDecision): void {
  if (!storage) return;
  try {
    storage.setItem(PERF_STORAGE_KEY, JSON.stringify(d));
  } catch {
    // 容量超過・プライベートモードなどは無視(毎回測るだけ)
  }
}

/** ブラウザの localStorage(使えなければ null) */
export function browserStorage(): KeyValueStore | null {
  try {
    return typeof localStorage === 'undefined' ? null : localStorage;
  } catch {
    return null;
  }
}
