import { isBoolean, isRecord, safeJsonParse } from '@/core/model/guards';
import {
  isQuotaError,
  MAX_STORED_ITEM_LENGTH,
  STORAGE_PREFIX,
  type DesignSlot,
  type SaveResult,
  type StorageLike,
} from '@/core/storage/persistence';
import type { PerfDecision } from '@/scene/perf/gpu';
import type { AppSettings, SettingSources } from './store';

/**
 * アプリ層(統合)が保存する小さな値(U-01):利用者が設定画面で自分で選んだ値と、最後に遊んだスロット。
 *
 * 自動判定の値(OS の「視差効果を減らす」、初回起動時の GPU の測定)はここに入れない。
 * flow も useApp の設定(音量・動きの軽減・低性能モード)を `ashikumi/v1/settings` に保存するが、
 * 起動時の動きの軽減・低性能モードはここ(利用者の選択)と自動判定から決め直す(resolveSettings)。
 * 音量は flow の保存をそのまま使う(自動判定がないので)。
 */
export interface AppPrefs {
  version: typeof PREFS_VERSION;
  /** ミュート(利用者の選択) */
  muted?: boolean;
  /** 動きを減らす:設定画面で選んだ値。なければ OS の設定に従う */
  reducedMotion?: boolean;
  /** 低性能モード:設定画面で選んだ値。なければ GPU の測定に従う */
  lowPerf?: boolean;
  /** 最後に開いた設計のスロット(ステージ id かサンドボックス)。「続きから」に使う */
  lastSlot?: DesignSlot;
}

export const PREFS_VERSION = 1;
export const PREFS_KEY = `${STORAGE_PREFIX}prefs`;
/** スロット名の長さの上限(壊れた値・巨大な値を読まない) */
const MAX_SLOT_LENGTH = 64;

export function emptyPrefs(): AppPrefs {
  return { version: PREFS_VERSION };
}

/** 読み込んだ値を 1 項目ずつ検査する(壊れた項目だけ捨てる。全体は捨てない) */
export function parsePrefs(raw: unknown): AppPrefs {
  const out = emptyPrefs();
  if (!isRecord(raw)) return out;
  if (isBoolean(raw.muted)) out.muted = raw.muted;
  if (isBoolean(raw.reducedMotion)) out.reducedMotion = raw.reducedMotion;
  if (isBoolean(raw.lowPerf)) out.lowPerf = raw.lowPerf;
  const slot = raw.lastSlot;
  if (typeof slot === 'string' && slot.length > 0 && slot.length <= MAX_SLOT_LENGTH) {
    out.lastSlot = slot;
  }
  return out;
}

/** 保存した値(なければ・読めなければ空)。決して例外を投げない */
export function loadPrefs(storage: StorageLike | null): AppPrefs {
  if (!storage) return emptyPrefs();
  try {
    const text = storage.getItem(PREFS_KEY);
    // 改ざんされた巨大な値は読まない(persistence と同じ上限)
    if (typeof text !== 'string' || text.length > MAX_STORED_ITEM_LENGTH) return emptyPrefs();
    const parsed = safeJsonParse(text);
    return parsed.ok ? parsePrefs(parsed.value) : emptyPrefs();
  } catch {
    return emptyPrefs();
  }
}

export function savePrefs(storage: StorageLike | null, prefs: AppPrefs): SaveResult {
  if (!storage) return { ok: false, reason: 'unavailable' };
  let text: string;
  try {
    text = JSON.stringify(prefs);
  } catch {
    return { ok: false, reason: 'serialize' };
  }
  try {
    storage.setItem(PREFS_KEY, text);
    return { ok: true };
  } catch (e) {
    return { ok: false, reason: isQuotaError(e) ? 'quota' : 'unavailable' };
  }
}

/** 自動判定の材料 */
export interface AutoSettings {
  /** OS の「視差効果を減らす」(prefers-reduced-motion: reduce) */
  osReducedMotion: boolean;
  /** 保存済みの GPU の判定(scene の perf)。まだ測っていなければ null */
  perf: PerfDecision | null;
}

/** 利用者が選んだ低性能モード。scene の古い設定画面で手で選んだ判定(reason: manual)も利用者の選択とみなす */
function userLowPerf(prefs: AppPrefs, perf: PerfDecision | null): boolean | undefined {
  if (prefs.lowPerf !== undefined) return prefs.lowPerf;
  return perf?.reason === 'manual' ? perf.lowPerf : undefined;
}

/**
 * 利用者の選択と自動判定から、useApp に入れる設定を決める(起動時)。
 *  - 動きを減らす:選んだ値 または OS の設定(OS で減らしていれば常に減らす)。選んでいなければ OS の設定
 *  - 低性能モード:選んだ値。選んでいなければ GPU の判定(まだなければオフ。測り終えたら PerfProbe が入れる)
 *  - ミュート:選んだ値(既定オフ)。音量は base(flow が読み込んだ値)のまま
 */
export function resolveSettings(
  base: AppSettings,
  prefs: AppPrefs,
  auto: AutoSettings,
): AppSettings {
  const rm = prefs.reducedMotion;
  const lp = userLowPerf(prefs, auto.perf);
  const sources: SettingSources = {
    reducedMotion: rm === undefined ? 'auto' : 'user',
    lowPerf: lp === undefined ? 'auto' : 'user',
  };
  return {
    ...base,
    reducedMotion: (rm ?? false) || auto.osReducedMotion,
    lowPerf: lp ?? auto.perf?.lowPerf ?? false,
    muted: prefs.muted ?? false,
    sources,
  };
}

/**
 * 他(OS の設定の追従・GPU の測定)が設定を書き換えたとき、利用者の選択と食い違う項目を戻す差分。
 * 選んでいない項目(自動)はそのまま受け入れる。直すところがなければ null。
 */
export function enforceUserChoices(
  settings: AppSettings,
  prefs: AppPrefs,
  osReducedMotion: boolean,
): Partial<AppSettings> | null {
  const patch: Partial<AppSettings> = {};
  if (prefs.reducedMotion !== undefined) {
    const want = prefs.reducedMotion || osReducedMotion;
    if (settings.reducedMotion !== want) patch.reducedMotion = want;
  }
  if (prefs.lowPerf !== undefined && settings.lowPerf !== prefs.lowPerf) {
    patch.lowPerf = prefs.lowPerf;
  }
  return Object.keys(patch).length > 0 ? patch : null;
}

/** 設定画面で選べる、利用者の選択として保存する項目 */
export interface UserChoice {
  muted?: boolean;
  reducedMotion?: boolean;
  lowPerf?: boolean;
}

/** 設定画面の変更を利用者の選択として prefs に写す(変わらなければ同じオブジェクト) */
export function applyUserChoice(prefs: AppPrefs, choice: UserChoice): AppPrefs {
  let next = prefs;
  for (const key of ['muted', 'reducedMotion', 'lowPerf'] as const) {
    const v = choice[key];
    if (v === undefined || prefs[key] === v) continue;
    if (next === prefs) next = { ...prefs };
    next[key] = v;
  }
  return next;
}
