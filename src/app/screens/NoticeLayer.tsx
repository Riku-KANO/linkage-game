import { useCallback, useMemo } from 'react';
import { NoticeStack } from '@/hud';
import { useSession } from '../flow';
import { flowNoticeId, visibleNotices } from '../notices';
import './screens.css';

/**
 * 全画面共通の通知(INT-5、HUD-4):章・部品の解放、保存の失敗、共有リンクの読み込み、ファイルの入出力など。
 * 列は flow(useSession.notices)が持ち、ここは右上に札を出して、時間が来た・閉じたものを列から外す。
 * どの画面でも 1 つだけ置く(GameShell の children。設計・試走の画面で別に NoticeStack を置かない)。
 */
export function NoticeLayer() {
  const notices = useSession((s) => s.notices);
  const visible = useMemo(() => visibleNotices(notices), [notices]);
  const onDismiss = useCallback((id: string) => {
    const n = flowNoticeId(id);
    if (n !== null) useSession.getState().dismissNotice(n);
  }, []);
  return (
    <div className="app-notices">
      <NoticeStack notices={visible} onDismiss={onDismiss} />
    </div>
  );
}
