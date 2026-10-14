import { isRecord, safeJsonParse } from '@/core/model/guards';
import type { DesignDoc } from '@/core/model/types';
import { validateDesign } from '@/core/model/validate';
import {
  isQuotaError,
  MAX_STORED_ITEM_LENGTH,
  STORAGE_PREFIX,
  type SaveResult,
  type StorageLike,
} from '@/core/storage/persistence';
import { CHAPTERS } from '@/game/chapters';
import type { WorldData } from './store';

/**
 * 工房が育った分(WORLD-2)の保存:作業台の見本機(最新の機械)と、棚に並ぶ章の機械。
 * 進行(クリア状況)は flow が保存するので、ここは機械の設計だけを `ashikumi/v1/world` に置く。
 * 読み込みは 1 つずつ validateDesign に通し、壊れた設計だけ捨てる(全体は捨てない)。
 */
export const WORLD_SAVE_KEY = `${STORAGE_PREFIX}world`;
export const WORLD_SAVE_VERSION = 1;

export type WorldSaveData = Pick<WorldData, 'machineDesign' | 'chapterMachines'>;

export function emptyWorldSave(): WorldSaveData {
  return { machineDesign: null, chapterMachines: {} };
}

function design(v: unknown): DesignDoc | null {
  const r = validateDesign(v);
  return r.ok ? r.design : null;
}

/** 保存した値を検査して戻す(知らない章・壊れた設計は捨てる)。決して例外を投げない */
export function parseWorldSave(raw: unknown): WorldSaveData {
  const out = emptyWorldSave();
  if (!isRecord(raw) || raw.version !== WORLD_SAVE_VERSION) return out;
  if (raw.machineDesign !== null && raw.machineDesign !== undefined) {
    out.machineDesign = design(raw.machineDesign);
  }
  const ch = raw.chapterMachines;
  if (isRecord(ch)) {
    for (const c of CHAPTERS) {
      const v = ch[String(c.chapter)];
      if (v === undefined) continue;
      const d = design(v);
      if (d) out.chapterMachines[c.chapter] = d;
    }
  }
  return out;
}

export function loadWorldSave(storage: StorageLike | null): WorldSaveData {
  if (!storage) return emptyWorldSave();
  try {
    const text = storage.getItem(WORLD_SAVE_KEY);
    if (typeof text !== 'string' || text.length > MAX_STORED_ITEM_LENGTH) return emptyWorldSave();
    const parsed = safeJsonParse(text);
    return parsed.ok ? parseWorldSave(parsed.value) : emptyWorldSave();
  } catch {
    return emptyWorldSave();
  }
}

export function saveWorldSave(storage: StorageLike | null, data: WorldSaveData): SaveResult {
  if (!storage) return { ok: false, reason: 'unavailable' };
  let text: string;
  try {
    text = JSON.stringify({
      version: WORLD_SAVE_VERSION,
      machineDesign: data.machineDesign,
      chapterMachines: data.chapterMachines,
    });
  } catch {
    return { ok: false, reason: 'serialize' };
  }
  if (text.length > MAX_STORED_ITEM_LENGTH) return { ok: false, reason: 'quota' };
  try {
    storage.setItem(WORLD_SAVE_KEY, text);
    return { ok: true };
  } catch (e) {
    return { ok: false, reason: isQuotaError(e) ? 'quota' : 'unavailable' };
  }
}
