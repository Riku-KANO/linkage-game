import type { DesignDoc } from '@/core/model/types';
import { migrate, readDesign, toEnvelope } from '@/core/model/migrate';
import { isFiniteNumber, isRecord, safeJsonParse } from '@/core/model/guards';
import type { Progress } from '@/game/types';
import { createDefaultProgress, PROGRESS_VERSION, validateProgress } from './progress';
import { debounce } from './debounce';

/**
 * localStorage への自動保存(MOD-5、U-01)。設計(ステージごと+サンドボックス)、クリア状況、設定。
 *
 * 方針:決して例外を投げない。
 *  - localStorage が使えない(null を渡す) → メモリに保存(再読み込みで消える。persistent = false)
 *  - 読み込みの例外・壊れた JSON・形の崩れ・大きすぎる値 → 既定値(設計なら null)
 *  - 書き込みの例外(容量超過など) → { ok: false, reason } を返し、この画面の間はメモリの値を読む
 *  - このアプリより新しい版が書いたデータ → 読まず、上書きもしない(reason: 'newer')
 *
 * キーは `ashikumi/v1/...`(名前空間+保存レイアウトの版)。設計は版つき封筒で書くので、
 * 設計の形式が変わっても migrate で読める。
 */

export type StorageLike = Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>;

/** 保存レイアウト(キーの構成)の版。キーの付け方を変えるときに上げる */
export const STORAGE_LAYOUT_VERSION = 1;
export const STORAGE_PREFIX = `ashikumi/v${STORAGE_LAYOUT_VERSION}/`;
/** ステージに属さない自由設計のスロット */
export const SANDBOX_SLOT = 'sandbox';
/** 設計のスロット:ステージ id(StageId)か SANDBOX_SLOT */
export type DesignSlot = string;

/**
 * 1 つのキーの値の長さの上限(文字数)。設計・進行・設定はどれも数十 KB に収まる。
 * 改ざんされた巨大な値は JSON として読まずに壊れたデータとみなす(起動を遅くしない)
 */
export const MAX_STORED_ITEM_LENGTH = 1_000_000;

const LONE_SURROGATE_G = /[\ud800-\udbff](?![\udc00-\udfff])|(?<![\ud800-\udbff])[\udc00-\udfff]/g;
/** encodeURIComponent は対になっていないサロゲートで例外を投げるので、先に U+FFFD にする */
function encodeSlot(slot: string): string {
  return encodeURIComponent(slot.replace(LONE_SURROGATE_G, '\ufffd'));
}

export const storageKeys = {
  design: (slot: DesignSlot) => `${STORAGE_PREFIX}design/${encodeSlot(slot)}`,
  progress: `${STORAGE_PREFIX}progress`,
  settings: `${STORAGE_PREFIX}settings`,
} as const;

/**
 * 保存の失敗理由:
 *  - quota:容量超過 / unavailable:ストレージが使えない(この画面の間はメモリに残る)
 *  - serialize:JSON にできない値 / newer:新しい版のデータがあるので上書きしなかった
 */
export type SaveFailReason = 'quota' | 'unavailable' | 'serialize' | 'newer';
export type SaveResult = { ok: true } | { ok: false; reason: SaveFailReason };

export interface Persistence {
  /** false ならメモリに保存している(再読み込みで消える) */
  readonly persistent: boolean;
  /** 保存された設計。なければ・読めなければ null */
  loadDesign(slot: DesignSlot): DesignDoc | null;
  saveDesign(slot: DesignSlot, design: DesignDoc): SaveResult;
  removeDesign(slot: DesignSlot): void;
  /** クリア状況。なければ・読めなければ既定値 */
  loadProgress(): Progress;
  saveProgress(progress: Progress): SaveResult;
  /** 設定(中身は呼び出し側が決める)。guard を通らなければ fallback */
  loadSettings<T>(guard: (v: unknown) => v is T, fallback: T): T;
  saveSettings(settings: unknown): SaveResult;
}

export interface PersistenceOptions {
  /** クリア状況の既定値(既定:章 1 だけ解放) */
  defaultProgress?: () => Progress;
}

const OK: SaveResult = { ok: true };

export function createPersistence(
  storage: StorageLike | null,
  opts: PersistenceOptions = {},
): Persistence {
  const backend = storage ?? createMemoryStorage();
  const defaultProgress = opts.defaultProgress ?? createDefaultProgress;
  /** 書けなかった値。この画面の間だけ読み込みに使う */
  const overlay = new Map<string, string>();
  /** 新しい版のデータが入っているキー(上書きしない) */
  const newer = new Set<string>();
  const checked = new Set<string>();

  const read = (key: string): string | null => {
    const o = overlay.get(key);
    if (o !== undefined) return o;
    try {
      return backend.getItem(key);
    } catch {
      return null;
    }
  };
  const readJson = (key: string): unknown => {
    const text = read(key);
    if (typeof text !== 'string' || text.length > MAX_STORED_ITEM_LENGTH) return undefined;
    const parsed = safeJsonParse(text);
    return parsed.ok ? parsed.value : undefined;
  };
  const write = (key: string, value: unknown): SaveResult => {
    if (newer.has(key)) return { ok: false, reason: 'newer' };
    let text: string | undefined;
    try {
      text = JSON.stringify(value);
    } catch {
      text = undefined;
    }
    if (text === undefined) return { ok: false, reason: 'serialize' };
    try {
      backend.setItem(key, text);
      overlay.delete(key);
      return OK;
    } catch (e) {
      overlay.set(key, text);
      return { ok: false, reason: isQuotaError(e) ? 'quota' : 'unavailable' };
    }
  };
  /** そのキーに新しい版のデータがあるか、最初の読み書きのときに一度だけ調べる */
  const guardNewer = (key: string, isNewer: (v: unknown) => boolean) => {
    if (checked.has(key)) return;
    checked.add(key);
    try {
      if (isNewer(readJson(key))) newer.add(key);
    } catch {
      // 調べられなければ上書きしてよい
    }
  };

  return {
    persistent: storage !== null,

    loadDesign(slot) {
      try {
        const key = storageKeys.design(slot);
        guardNewer(key, designIsNewer);
        if (newer.has(key)) return null;
        const raw = readJson(key);
        if (raw === undefined) return null;
        const r = readDesign(raw);
        return r.ok ? r.design : null;
      } catch {
        return null;
      }
    },

    saveDesign(slot, design) {
      const key = storageKeys.design(slot);
      guardNewer(key, designIsNewer);
      return write(key, toEnvelope(design));
    },

    removeDesign(slot) {
      const key = storageKeys.design(slot);
      overlay.delete(key);
      newer.delete(key);
      try {
        backend.removeItem(key);
      } catch {
        // 消せなくても次の読み込みで既定値になるだけ
      }
    },

    loadProgress() {
      try {
        guardNewer(storageKeys.progress, progressIsNewer);
        if (newer.has(storageKeys.progress)) return defaultProgress();
        return validateProgress(readJson(storageKeys.progress)) ?? defaultProgress();
      } catch {
        return defaultProgress();
      }
    },

    saveProgress(progress) {
      guardNewer(storageKeys.progress, progressIsNewer);
      return write(storageKeys.progress, progress);
    },

    loadSettings<T>(guard: (v: unknown) => v is T, fallback: T): T {
      try {
        const v = readJson(storageKeys.settings);
        return v !== undefined && guard(v) ? v : fallback;
      } catch {
        return fallback;
      }
    },

    saveSettings(settings) {
      return write(storageKeys.settings, settings);
    },
  };
}

function designIsNewer(v: unknown): boolean {
  if (v === undefined) return false;
  const m = migrate(v);
  return !m.ok && m.reason === 'version';
}

function progressIsNewer(v: unknown): boolean {
  return isRecord(v) && isFiniteNumber(v.version) && v.version > PROGRESS_VERSION;
}

/** 容量超過の例外か(ブラウザごとに名前とコードが違う) */
export function isQuotaError(e: unknown): boolean {
  if (typeof e !== 'object' || e === null) return false;
  const { name, code } = e as { name?: unknown; code?: unknown };
  return (
    name === 'QuotaExceededError' ||
    name === 'NS_ERROR_DOM_QUOTA_REACHED' ||
    code === 22 ||
    code === 1014
  );
}

/** localStorage が使えないときの代わり(再読み込みで消える) */
export function createMemoryStorage(): StorageLike {
  const data = new Map<string, string>();
  return {
    getItem: (k) => data.get(k) ?? null,
    setItem: (k, v) => void data.set(k, String(v)),
    removeItem: (k) => void data.delete(k),
  };
}

export interface AutosaverOptions {
  /** 最後の変更からこれだけ待って保存する(ms) */
  waitMs?: number;
  /** 変更が続いてもこれ以上は待たない(ms) */
  maxWaitMs?: number;
  /** 保存のたびに呼ばれる(失敗の表示用) */
  onResult?: (slot: DesignSlot, result: SaveResult) => void;
}

export interface Autosaver {
  /** 設計が変わるたびに呼ぶ。設計は不変のデータとして扱う(渡した後に書き換えない) */
  schedule(slot: DesignSlot, design: DesignDoc): void;
  /** 待っている保存を今すぐ行う(画面を離れる前、試走の前など) */
  flush(): void;
  cancel(): void;
  isPending(): boolean;
}

/** 設計の自動保存。スロットごとに最新の設計だけを debounce して保存する */
export function createAutosaver(persistence: Persistence, opts: AutosaverOptions = {}): Autosaver {
  const pending = new Map<DesignSlot, DesignDoc>();
  const save = debounce(
    () => {
      const items = [...pending];
      pending.clear();
      for (const [slot, design] of items) {
        const r = persistence.saveDesign(slot, design);
        opts.onResult?.(slot, r);
      }
    },
    opts.waitMs ?? 800,
    { maxWaitMs: opts.maxWaitMs ?? 5000 },
  );
  return {
    schedule(slot, design) {
      pending.set(slot, design);
      save();
    },
    flush: () => save.flush(),
    cancel() {
      save.cancel();
      pending.clear();
    },
    isPending: () => pending.size > 0,
  };
}
