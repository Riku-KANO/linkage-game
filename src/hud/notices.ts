import type { LoadFailReason } from '@/core/model';
import type { SaveFailReason } from '@/core/storage/persistence';
import { LOAD_FAIL_KEYS, SAVE_FAIL_KEYS } from '@/core/model/messages';
import type { PartKind } from '@/core/model/types';
import { getChapter, getStage, type Unlocks } from '@/game';
import { t } from '@/i18n';

/**
 * 通知(HUD-4)の型と、通知の列を扱う純粋な関数。
 * 列そのものは呼び出し側(flow)が持ち、NoticeStack は表示と自動で消える時計だけを受け持つ。
 */

export type NoticeSeverity = 'info' | 'success' | 'warn' | 'error';
/** 解放の通知(機構の飾りつきで出す) */
export type UnlockKind = 'chapter' | 'stage' | 'part' | 'feature';

export interface HudNotice {
  id: string;
  /** 文言の i18n キー */
  key: string;
  params?: Record<string, string | number>;
  severity: NoticeSeverity;
  /** 解放の通知なら、その種類 */
  unlock?: UnlockKind;
  /** 部品の解放ならその部品(アイコンに使う) */
  part?: PartKind;
  /** 消えるまで(ms)。null は自分で閉じるまで残す。省略時は重さで決める */
  durationMs?: number | null;
}

/** 重さごとの表示時間(ms)。エラーは読み終える前に消えないよう、閉じるまで残す */
export const NOTICE_DURATION: Record<NoticeSeverity, number | null> = {
  info: 4500,
  success: 5000,
  warn: 7000,
  error: null,
};
/** 解放の通知は飾りの動きを見せるので少し長め */
export const UNLOCK_DURATION = 6500;
/** 同時に出す通知の上限 */
export const MAX_NOTICES = 4;

export function noticeDuration(n: HudNotice): number | null {
  if (n.durationMs !== undefined) return n.durationMs;
  if (n.unlock) return UNLOCK_DURATION;
  return NOTICE_DURATION[n.severity];
}

const sameText = (a: HudNotice, b: HudNotice) =>
  a.key === b.key && JSON.stringify(a.params ?? {}) === JSON.stringify(b.params ?? {});

/**
 * 通知を後ろに足す。同じ文言の通知は古い方を消して出し直す(保存の失敗が続いても積もらない)。
 * 上限を超えたら、エラー以外の古いものから消す。
 */
export function pushNotice(
  list: readonly HudNotice[],
  notice: HudNotice,
  max = MAX_NOTICES,
): HudNotice[] {
  const next = [...list.filter((n) => !sameText(n, notice)), notice];
  while (next.length > Math.max(1, max)) {
    const i = next.findIndex((n) => n.severity !== 'error' && n !== notice);
    next.splice(i >= 0 ? i : 0, 1);
  }
  return next;
}

export function dismissNotice(list: readonly HudNotice[], id: string): HudNotice[] {
  return list.some((n) => n.id === id) ? list.filter((n) => n.id !== id) : (list as HudNotice[]);
}

let seq = 0;
/** 通知の id(読み込みごとに 1 から数える。乱数は使わない) */
export function noticeId(prefix = 'n'): string {
  seq += 1;
  return `${prefix}${seq}`;
}

/* ---- 自動で消える時計(ホバー・フォーカス中は止める) ---- */

export interface Countdown {
  /** 止めた時点での残り(ms) */
  remaining: number;
  /** 動き出した時刻(ms)。止まっていれば null */
  startedAt: number | null;
}

export function startCountdown(ms: number, now: number): Countdown {
  return { remaining: Math.max(0, ms), startedAt: now };
}

export function countdownLeft(c: Countdown, now: number): number {
  if (c.startedAt === null) return c.remaining;
  return Math.max(0, c.remaining - (now - c.startedAt));
}

export function pauseCountdown(c: Countdown, now: number): Countdown {
  if (c.startedAt === null) return c;
  return { remaining: countdownLeft(c, now), startedAt: null };
}

export function resumeCountdown(c: Countdown, now: number): Countdown {
  if (c.startedAt !== null) return c;
  return { remaining: c.remaining, startedAt: now };
}

/* ---- よく使う通知を作る ---- */

/**
 * 解放(game の newlyUnlocked の結果)を通知にする。章・部品・機能を出す。
 * 章の中で次のステージが開くのはいつものことなので、既定では出さない(stages: true で出す)。
 */
export function unlockNotices(
  unlocks: Unlocks,
  { stages = false }: { stages?: boolean } = {},
): HudNotice[] {
  const out: HudNotice[] = [];
  for (const chapter of unlocks.chapters) {
    const def = getChapter(chapter);
    out.push({
      id: noticeId('unlock'),
      key: 'game.unlock.chapter',
      params: { chapter, title: def ? t(def.titleKey) : '' },
      severity: 'success',
      unlock: 'chapter',
    });
  }
  for (const part of unlocks.parts) {
    out.push({
      id: noticeId('unlock'),
      key: 'game.unlock.part',
      params: { part: t(`game.part.${part}`) },
      severity: 'success',
      unlock: 'part',
      part,
    });
  }
  for (const feature of unlocks.features) {
    out.push({
      id: noticeId('unlock'),
      key: 'game.unlock.feature',
      params: { feature: t(`game.feature.${feature}`) },
      severity: 'success',
      unlock: 'feature',
    });
  }
  if (stages) {
    for (const id of unlocks.stages) {
      const stage = getStage(id);
      out.push({
        id: noticeId('unlock'),
        key: 'game.unlock.stage',
        params: { title: stage ? t(stage.titleKey) : id },
        severity: 'success',
        unlock: 'stage',
      });
    }
  }
  return out;
}

/** 設計ファイル・共有リンクの読み込みに失敗した */
export function loadFailNotice(reason: LoadFailReason): HudNotice {
  return { id: noticeId('load'), key: LOAD_FAIL_KEYS[reason], severity: 'error' };
}

/** 自動保存に失敗した(遊び続けられるので注意どまり) */
export function saveFailNotice(reason: SaveFailReason): HudNotice {
  return { id: noticeId('save'), key: SAVE_FAIL_KEYS[reason], severity: 'warn' };
}

/** 共有リンクの機械を読み込んだ */
export function shareLoadedNotice(): HudNotice {
  return { id: noticeId('share'), key: 'model.share.loaded', severity: 'success' };
}
