import type { Ghost } from '@/core/model/ghost';
import type { ShareDecodeResult, ShareRun } from '@/core/model/share';
import type { DesignDoc } from '@/core/model/types';
import { getStage, isStageUnlocked, type Progress, type StageId } from '@/game';
import { loadFailNotice, type NoticeInput } from './notices';

/**
 * 共有リンクで起動したときの段取り(FLOW-3、U-02)。純粋な関数で、実際の読み込みはセッションが行う。
 *  - 共有がない → none
 *  - 壊れている・新しい版 → invalid(通知を出して無視する)
 *  - 読めた → load:送り主の記録のステージが遊べるならそのステージに、そうでなければ
 *    サンドボックスに設計を読み込み、記録とゴーストを対戦相手にする
 */

export type ShareBootPlan =
  | { kind: 'none' }
  | { kind: 'invalid'; notices: NoticeInput[] }
  | {
      kind: 'load';
      /** 読み込むステージ。null ならサンドボックス */
      stageId: StageId | null;
      design: DesignDoc;
      opponent: ShareRun | null;
      opponentGhost: Ghost | null;
      notices: NoticeInput[];
    };

export function planShareBoot(decoded: ShareDecodeResult, progress: Progress): ShareBootPlan {
  if (!decoded.ok) {
    if (decoded.reason === 'empty') return { kind: 'none' };
    return { kind: 'invalid', notices: [loadFailNotice(decoded.reason, 'share')] };
  }
  const { design, run, ghost } = decoded.payload;
  const notices: NoticeInput[] = [
    { kind: 'share', severity: 'success', key: 'model.share.loaded' },
  ];
  // 記録・ゴーストだけが壊れていたときは捨てて機械だけを読む(decodeShare の警告)
  if (decoded.warnings.some((w) => w.startsWith('run:') || w.startsWith('ghost:'))) {
    notices.push({ kind: 'share', severity: 'warn', key: 'flow.share.partial' });
  }
  let stageId: StageId | null = null;
  if (run && getStage(run.stageId)) {
    if (isStageUnlocked(progress, run.stageId)) stageId = run.stageId;
    else notices.push({ kind: 'share', severity: 'info', key: 'flow.share.sandbox' });
  }
  return {
    kind: 'load',
    stageId,
    design,
    opponent: run ?? null,
    opponentGhost: ghost ?? null,
    notices,
  };
}
