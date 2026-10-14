import { setAudioMuted } from '@/audio';
import { getBrowserStorage } from '@/core/storage/browser';
import type { DesignSlot, SaveFailReason, StorageLike } from '@/core/storage/persistence';
import { browserStorage, loadPerfDecision, type PerfDecision } from '@/scene/perf/gpu';
import { saveFailNotice, useSession } from './flow';
import {
  applyUserChoice,
  enforceUserChoices,
  loadPrefs,
  resolveSettings,
  savePrefs,
  type AppPrefs,
  type UserChoice,
} from './prefs';
import { useApp, type AppSettings } from './store';

/**
 * 設定の保存と反映(INT-5)。useApp.settings を「今効いている値」とし、利用者が設定画面で選んだ値だけを
 * prefs(`ashikumi/v1/prefs`)に保存する。自動判定(OS の動きの軽減・GPU の測定)の値は保存しない。
 *
 *  - 起動時:prefs と自動判定から設定を決め直す(flow が読み込んだ古い自動の値は使わない)
 *  - 実行中:OS の追従(scene の useReducedMotionSync)や GPU の測定(PerfProbe)が設定を書き換えても、
 *    利用者が選んだ項目は選んだ値に戻す
 *  - ミュートは音のエンジン(setAudioMuted)へ。音量は flow の保存と audio の追従のまま
 */

export interface SettingsSyncOptions {
  /** prefs の保存先(既定:localStorage。使えなければ null = 保存しない) */
  storage?: StorageLike | null;
  /** OS の「視差効果を減らす」(既定:matchMedia) */
  osReducedMotion?: () => boolean;
  /** 保存済みの GPU の判定(既定:scene の perf の保存) */
  perfDecision?: () => PerfDecision | null;
  /** ミュートを音のエンジンへ(既定:setAudioMuted) */
  setMuted?: (muted: boolean) => void;
  /** 保存に失敗した(既定:flow の通知) */
  onSaveFail?: (reason: SaveFailReason) => void;
}

interface Runtime {
  prefs: AppPrefs;
  storage: StorageLike | null;
  os: () => boolean;
  setMuted: (muted: boolean) => void;
  onSaveFail: (reason: SaveFailReason) => void;
}

let rt: Runtime | null = null;
let unsub: (() => void) | null = null;

function defaultOs(): boolean {
  try {
    return typeof window !== 'undefined' && typeof window.matchMedia === 'function'
      ? window.matchMedia('(prefers-reduced-motion: reduce)').matches
      : false;
  } catch {
    return false;
  }
}

function createRuntime(opts: SettingsSyncOptions): Runtime {
  const storage = opts.storage !== undefined ? opts.storage : browserOnly(getBrowserStorage);
  return {
    prefs: loadPrefs(storage),
    storage,
    os: opts.osReducedMotion ?? defaultOs,
    setMuted: opts.setMuted ?? setAudioMuted,
    onSaveFail:
      opts.onSaveFail ?? ((reason) => useSession.getState().pushNotice(saveFailNotice(reason))),
  };
}

/** 今の実行時の状態(同期を始める前なら既定の保存先から読む) */
function runtime(): Runtime {
  return (rt ??= createRuntime({}));
}

function browserOnly<T>(fn: () => T | null): T | null {
  return typeof window === 'undefined' ? null : fn();
}

function persist(r: Runtime) {
  if (!r.storage) return;
  const res = savePrefs(r.storage, r.prefs);
  if (!res.ok) r.onSaveFail(res.reason);
}

/**
 * 設定の同期を始める(起動時に 1 回。何度呼んでも最初の 1 回だけ効く)。戻り値で止める(テスト用)。
 * flow の init(設定の読み込み)の後に呼ぶ。
 */
export function installSettingsSync(opts: SettingsSyncOptions = {}): () => void {
  if (unsub) return unsub;
  const r = (rt = createRuntime(opts));
  const perf = opts.perfDecision ?? (() => loadPerfDecision(browserStorage()));
  const app = useApp.getState();
  const resolved = resolveSettings(app.settings, r.prefs, {
    osReducedMotion: r.os(),
    perf: perf(),
  });
  app.setSettings(resolved);
  r.setMuted(resolved.muted ?? false);

  const stop = useApp.subscribe((s, prev) => {
    if (s.settings === prev.settings) return;
    const muted = s.settings.muted ?? false;
    if (muted !== (prev.settings.muted ?? false)) r.setMuted(muted);
    const fix = enforceUserChoices(s.settings, r.prefs, r.os());
    if (fix) s.setSettings(fix);
  });
  unsub = () => {
    stop();
    unsub = null;
    rt = null;
  };
  return unsub;
}

/**
 * 設定画面での変更(利用者の選択)。ミュート・動きを減らす・低性能モードは prefs に保存し、出どころを
 * 'user' にする。音量は useApp に入れるだけ(flow が保存する)。
 */
export function setUserSettings(choice: UserChoice & { volume?: number }): void {
  const r = runtime();
  const { volume, ...rest } = choice;
  const app = useApp.getState();
  const patch: Partial<AppSettings> = {};
  if (volume !== undefined && Number.isFinite(volume)) {
    patch.volume = Math.min(1, Math.max(0, volume));
  }
  const next = applyUserChoice(r.prefs, rest);
  if (next !== r.prefs) {
    r.prefs = next;
    persist(r);
  }
  const sources = { ...app.settings.sources };
  if (rest.muted !== undefined) patch.muted = rest.muted;
  if (rest.reducedMotion !== undefined) {
    patch.reducedMotion = rest.reducedMotion || r.os();
    sources.reducedMotion = 'user';
  }
  if (rest.lowPerf !== undefined) {
    patch.lowPerf = rest.lowPerf;
    sources.lowPerf = 'user';
  }
  if (rest.reducedMotion !== undefined || rest.lowPerf !== undefined) patch.sources = sources;
  if (Object.keys(patch).length > 0) app.setSettings(patch);
  // 同期を始める前(テストなど)でもエンジンに伝える
  if (rest.muted !== undefined && !unsub) r.setMuted(rest.muted);
}

/** 保存した利用者の選択と最後のスロット */
export function getPrefs(): AppPrefs {
  return runtime().prefs;
}

/** 最後に開いた設計のスロットを覚える(「続きから」) */
export function rememberSlot(slot: DesignSlot): void {
  const r = runtime();
  if (r.prefs.lastSlot === slot) return;
  r.prefs = { ...r.prefs, lastSlot: slot };
  persist(r);
}

/** テスト用:同期を止め、読み込んだ prefs を捨てる */
export function resetSettingsSync(): void {
  unsub?.();
  unsub = null;
  rt = null;
}
