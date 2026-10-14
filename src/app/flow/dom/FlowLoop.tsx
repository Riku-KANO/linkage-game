import { useEffect, useState } from 'react';
import { t } from '@/i18n';
import type { SessionDeps } from '../session';
import { SessionContext, useFlow, useFlowStore, type SessionStore } from './context';
import { DesignView } from './DesignView';
import { NoticeList } from './NoticeList';
import { ResultView } from './ResultView';
import { RunView } from './RunView';
import { StageList } from './StageList';
import './flow.css';

export interface FlowLoopProps {
  /** 使うセッション(既定はアプリ全体の useSession) */
  store?: SessionStore;
  /** init に渡す依存(テスト用) */
  deps?: SessionDeps;
}

/**
 * 3D なしで遊べる通しのループ(FLOW-6、`?dev=flow`):
 * ステージ選択 → 設計(機構エディタ)→ 2D 側面の試走 → 結果 → 次のステージ。
 * 見た目は機能優先。本番のパネルは hud、3D は scene・testrun が受け持つ。
 */
export function FlowLoop({ store, deps }: FlowLoopProps) {
  const body = <FlowLoopInner deps={deps} />;
  return store ? <SessionContext.Provider value={store}>{body}</SessionContext.Provider> : body;
}

function FlowLoopInner({ deps }: { deps: SessionDeps | undefined }) {
  const store = useFlowStore();
  // 起動は 1 回だけ(init は何度呼んでも最初の結果を返す)
  const [ready, setReady] = useState(() => store.getState().ready);
  useEffect(() => {
    store.getState().init(deps);
    setReady(true);
  }, [store, deps]);
  const phase = useFlow((s) => s.run.phase);
  const slot = useFlow((s) => s.slot);

  let view: 'stages' | 'design' | 'run' | 'result' = 'stages';
  if (phase === 'loading' || phase === 'running') view = 'run';
  else if (phase === 'finished') view = 'result';
  else if (slot !== null) view = 'design';

  return (
    <div className="fl-root" data-view={view}>
      <header className="fl-top">
        <strong>{t('flow.ui.title')}</strong>
      </header>
      <main className="fl-main">
        {!ready ? null : view === 'run' ? (
          <RunView />
        ) : view === 'result' ? (
          <ResultView />
        ) : view === 'design' ? (
          <DesignView />
        ) : (
          <StageList />
        )}
      </main>
      <NoticeList />
    </div>
  );
}
