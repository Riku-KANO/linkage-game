import type { LoadFailReason } from './migrate';
import type { SaveFailReason } from '@/core/storage/persistence';

/** 読み込み・保存に失敗した理由を、利用者向けの文言キー(src/i18n/ja/model.ts)に写す */
export const LOAD_FAIL_KEYS: Record<LoadFailReason, string> = {
  empty: 'model.load.empty',
  corrupt: 'model.load.corrupt',
  foreign: 'model.load.foreign',
  version: 'model.load.version',
  invalid: 'model.load.invalid',
};

export const SAVE_FAIL_KEYS: Record<SaveFailReason, string> = {
  quota: 'model.save.quota',
  unavailable: 'model.save.unavailable',
  serialize: 'model.save.serialize',
  newer: 'model.save.newer',
};
