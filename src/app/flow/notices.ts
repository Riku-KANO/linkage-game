import type { LoadFailReason } from '@/core/model/migrate';
import { LOAD_FAIL_KEYS, SAVE_FAIL_KEYS } from '@/core/model/messages';
import type { SaveFailReason } from '@/core/storage/persistence';
import { CHAPTERS, getChapter, getStage, type Unlocks } from '@/game';
import { t } from '@/i18n';

/**
 * HUD に出す通知(章・部品の解放、保存の失敗、共有リンクの読み込みなど)。
 * 表示は `t(notice.key, notice.params)`。params は表示用の文字列まで埋めてある。
 */

export type NoticeSeverity = 'info' | 'success' | 'warn' | 'error';
export type NoticeKind =
  'unlock' | 'save' | 'load' | 'share' | 'file' | 'hint' | 'run' | 'progress';

export interface Notice {
  /** 通知ごとの番号(React の key・消すときに使う) */
  id: number;
  kind: NoticeKind;
  severity: NoticeSeverity;
  /** i18n キー */
  key: string;
  params?: Record<string, string | number>;
}

export type NoticeInput = Omit<Notice, 'id'>;

/** 同じ内容の通知か(表示中のものと同じなら積まない) */
export function sameNotice(a: NoticeInput, b: NoticeInput): boolean {
  if (a.key !== b.key || a.kind !== b.kind) return false;
  const pa = a.params ?? {};
  const pb = b.params ?? {};
  const ka = Object.keys(pa);
  return ka.length === Object.keys(pb).length && ka.every((k) => pa[k] === pb[k]);
}

/** 保存の失敗(容量超過・ストレージなし・新しい版のデータ) */
export function saveFailNotice(reason: SaveFailReason): NoticeInput {
  return {
    kind: 'save',
    severity: reason === 'quota' || reason === 'serialize' ? 'error' : 'warn',
    key: SAVE_FAIL_KEYS[reason],
  };
}

/** 読み込みの失敗(共有リンク・ファイル) */
export function loadFailNotice(
  reason: LoadFailReason,
  kind: 'load' | 'share' | 'file',
): NoticeInput {
  return { kind, severity: 'error', key: LOAD_FAIL_KEYS[reason] };
}

/** 部品・機能が「遊べる章」で解放されるものか(章 3 以降はまだステージがない) */
function playableChapterOf(pred: (c: (typeof CHAPTERS)[number]) => boolean): boolean {
  return CHAPTERS.some((c) => c.playable && pred(c));
}

/**
 * 新しく解放されたものの通知。遊べる章(ステージのある章)のものだけを出す
 * (章 2 をクリアすると記録上は章 3 も解放されるが、まだ準備中なので知らせない)。
 */
export function unlockNotices(unlocks: Unlocks): NoticeInput[] {
  const out: NoticeInput[] = [];
  for (const c of unlocks.chapters) {
    const ch = getChapter(c);
    if (!ch?.playable) continue;
    out.push({
      kind: 'unlock',
      severity: 'success',
      key: 'game.unlock.chapter',
      params: { chapter: c, title: t(ch.titleKey) },
    });
  }
  for (const id of unlocks.stages) {
    const stage = getStage(id);
    if (!stage) continue;
    out.push({
      kind: 'unlock',
      severity: 'success',
      key: 'game.unlock.stage',
      params: { title: t(stage.titleKey) },
    });
  }
  for (const part of unlocks.parts) {
    if (!playableChapterOf((c) => c.parts.includes(part))) continue;
    out.push({
      kind: 'unlock',
      severity: 'success',
      key: 'game.unlock.part',
      params: { part: t(`game.part.${part}`) },
    });
  }
  for (const feature of unlocks.features) {
    if (!playableChapterOf((c) => c.features.includes(feature))) continue;
    out.push({
      kind: 'unlock',
      severity: 'success',
      key: 'game.unlock.feature',
      params: { feature: t(`game.feature.${feature}`) },
    });
  }
  return out;
}
