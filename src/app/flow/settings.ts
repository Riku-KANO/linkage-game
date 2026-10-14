import type { AppSettings } from '@/app/store';

/**
 * 設定(useApp の settings)の保存形式。保存するのは音量・動きの軽減・低性能モードだけ。
 * 読み込んだ値は 1 項目ずつ検査し、壊れた項目だけを既定値に戻す(全体は捨てない)。
 */

export interface StoredSettings {
  volume?: number;
  reducedMotion?: boolean;
  lowPerf?: boolean;
}

/** loadSettings に渡すガード:オブジェクトなら受け取り、中身は sanitizeSettings で検査する */
export function isSettingsRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

/** 保存された値を base に重ねる。型の違う項目は無視し、音量は 0..1 に収める */
export function sanitizeSettings(stored: Record<string, unknown>, base: AppSettings): AppSettings {
  const out: AppSettings = { ...base };
  const { volume, reducedMotion, lowPerf } = stored;
  if (typeof volume === 'number' && Number.isFinite(volume)) {
    out.volume = Math.min(1, Math.max(0, volume));
  }
  if (typeof reducedMotion === 'boolean') out.reducedMotion = reducedMotion;
  if (typeof lowPerf === 'boolean') out.lowPerf = lowPerf;
  return out;
}

/** 保存する項目だけを取り出す */
export function pickSettings(s: AppSettings): StoredSettings {
  return { volume: s.volume, reducedMotion: s.reducedMotion, lowPerf: s.lowPerf };
}

export function sameSettings(a: AppSettings, b: AppSettings): boolean {
  return a.volume === b.volume && a.reducedMotion === b.reducedMotion && a.lowPerf === b.lowPerf;
}
