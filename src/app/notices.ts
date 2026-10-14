import type { PartKind } from '@/core/model/types';
import { PART_ORDER } from '@/game';
import { MAX_NOTICES as HUD_MAX_NOTICES, type HudNotice, type UnlockKind } from '@/hud/notices';
import { t } from '@/i18n';
import type { Notice } from './flow';

/**
 * flow の通知(useSession.notices、id は数)を HUD の NoticeStack の札(HudNotice、id は文字列)に写す。
 * 列は flow が持ち、消すのは dismissNotice(Number(id))。
 */

const UNLOCK_KEYS: Record<string, UnlockKind> = {
  'game.unlock.chapter': 'chapter',
  'game.unlock.stage': 'stage',
  'game.unlock.part': 'part',
  'game.unlock.feature': 'feature',
};

/** 部品の解放の通知の部品(flow は訳した名前だけを持つので、名前から引き直す。アイコン用) */
function partFromName(name: unknown): PartKind | undefined {
  if (typeof name !== 'string') return undefined;
  return PART_ORDER.find((p) => t(`game.part.${p}`) === name);
}

const cache = new WeakMap<Notice, HudNotice>();

/** 1 件を写す(同じ通知には同じオブジェクトを返す) */
export function toHudNotice(n: Notice): HudNotice {
  const hit = cache.get(n);
  if (hit) return hit;
  const unlock = n.kind === 'unlock' ? UNLOCK_KEYS[n.key] : undefined;
  const part = unlock === 'part' ? partFromName(n.params?.part) : undefined;
  const out: HudNotice = {
    id: String(n.id),
    key: n.key,
    severity: n.severity,
    ...(n.params ? { params: n.params } : {}),
    ...(unlock ? { unlock } : {}),
    ...(part ? { part } : {}),
  };
  cache.set(n, out);
  return out;
}

/**
 * 画面に出す札(新しいものから max 件、古い順に並べる)。flow は最大 12 件を持つが、
 * 画面には HUD の上限(4 件)だけを出す。閉じると、待っていた古いものが順に出る。
 * エラー(閉じるまで残る)は数に関係なく必ず出す。
 */
export function visibleNotices(list: readonly Notice[], max = HUD_MAX_NOTICES): HudNotice[] {
  const errors = list.filter((n) => n.severity === 'error');
  const room = Math.max(0, max - errors.length);
  const rest = list.filter((n) => n.severity !== 'error');
  const keep = new Set<Notice>([...errors, ...rest.slice(Math.max(0, rest.length - room))]);
  return list.filter((n) => keep.has(n)).map(toHudNotice);
}

/** NoticeStack の札の id を flow の通知の id に戻す(数でなければ null) */
export function flowNoticeId(id: string): number | null {
  const n = Number(id);
  return Number.isInteger(n) ? n : null;
}
