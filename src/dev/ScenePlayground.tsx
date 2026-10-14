import { useEffect, useState } from 'react';
import { useApp } from '@/app/store';
import { t } from '@/i18n';
import { TRANSITIONS, type Screen, type TransitionId } from '@/ui/tokens';
import { GameShell } from '@/scene/GameShell';
import { rigDebug, rigSignals, useSceneUi } from '@/scene/store';
import { setLowPerfManually } from '@/scene/perf/PerfProbe';
import { WorldDevPanel } from '@/scene/world/WorldDevPanel';

/**
 * 開発用プレイグラウンド(?dev=scene)。ゲームと同じ工房に、デバッグパネルを重ねる:
 * 今の画面、遷移の進行、fps、低性能モード・reduced-motion の切り替え、各遷移を試すボタン。
 */
export default function ScenePlayground() {
  // 自動確認・コンソール操作用の入口(開発用のページだけ)
  useEffect(() => {
    window.__sceneDev = { useApp, useSceneUi, rigDebug, rigSignals, trigger, jump };
    return () => {
      delete window.__sceneDev;
    };
  }, []);
  return (
    <GameShell>
      <DebugPanel />
      <WorldDevPanel />
    </GameShell>
  );
}

declare global {
  interface Window {
    __sceneDev?: Record<string, unknown>;
  }
}

/** 遷移なしでその画面へ瞬間移動する(履歴はホームから来たことにする) */
function jump(screen: Screen) {
  const history: Screen[] = screen === 'home' || screen === 'boot' ? [] : ['home'];
  useApp.setState({ screen, transition: null, history });
}

/** 遷移 id の出発点へ瞬間移動してから、その遷移を始める */
function trigger(id: TransitionId, to?: Screen) {
  const token = TRANSITIONS.find((x) => x.id === id)!;
  const dest = to ?? token.to;
  if (id === 'T-00') {
    useApp.setState({ screen: 'boot', transition: null, history: [] });
    return;
  }
  const history: Screen[] = token.from === 'home' ? [] : ['home'];
  useApp.setState({ screen: token.from, transition: null, history });
  // 1 フレーム置いて、カメラが出発点に移ってから始める
  requestAnimationFrame(() => useApp.getState().go(dest));
}

function DebugPanel() {
  const screen = useApp((s) => s.screen);
  const settings = useApp((s) => s.settings);
  const setSettings = useApp((s) => s.setSettings);
  const paper = useSceneUi((s) => s.paper);
  const [, tick] = useState(0);
  // 毎フレームの値(rigDebug)は 10Hz で読む
  useEffect(() => {
    const id = window.setInterval(() => tick((n) => n + 1), 100);
    return () => window.clearInterval(id);
  }, []);
  const d = rigDebug;
  // パネルの中のクリック・キーは遷移のスキップに数えない
  const stop = (e: { stopPropagation(): void }) => e.stopPropagation();
  return (
    <aside className="ak-debug" onPointerDown={stop} onKeyDown={stop} onContextMenu={stop}>
      <h3>{t('scene.debug.title')}</h3>
      <dl>
        <dt>{t('scene.debug.screen')}</dt>
        <dd>{screen}</dd>
        <dt>{t('scene.debug.transition')}</dt>
        <dd>
          {d.transitionId
            ? `${d.transitionId} ${d.mode} ${(d.progress * 100).toFixed(0)}% / ${d.duration.toFixed(2)}s` +
              `${d.reverse ? ` ${t('scene.debug.reverse')}` : ''}${d.short ? ` ${t('scene.debug.short')}` : ''}`
            : t('scene.debug.none')}
        </dd>
        <dt>{t('scene.debug.fps')}</dt>
        <dd>{d.fps.toFixed(0)}</dd>
        <dt>{t('scene.debug.camera')}</dt>
        <dd>
          fov {d.fov.toFixed(1)}° ortho {d.ortho.toFixed(2)}
        </dd>
        <dt>{t('scene.debug.paper')}</dt>
        <dd>
          {paper.ready
            ? `${paper.screen.left.toFixed(0)},${paper.screen.top.toFixed(0)} ${paper.screen.width.toFixed(0)}×${paper.screen.height.toFixed(0)} (${paper.pxPerCm.toFixed(2)}px/cm)`
            : '—'}
        </dd>
      </dl>
      <div className="ak-debug__buttons">
        {TRANSITIONS.map((tok) => (
          <button key={tok.id} type="button" onClick={() => trigger(tok.id)}>
            {tok.id}
          </button>
        ))}
        <button type="button" onClick={() => trigger('T-08', 'settings')}>
          T-08 {t('scene.menu.settings')}
        </button>
        <button type="button" onClick={() => trigger('T-08', 'sandbox')}>
          T-08 {t('scene.menu.sandbox')}
        </button>
      </div>
      <div className="ak-debug__buttons">
        <button type="button" onClick={() => useApp.getState().back()}>
          {t('scene.debug.back')}
        </button>
        <button type="button" onClick={() => (rigSignals.skip = true)}>
          {t('scene.debug.skip')}
        </button>
        <button type="button" onClick={() => useApp.setState({ seenTransitions: new Set() })}>
          {t('scene.debug.resetSeen')}
        </button>
      </div>
      <label>
        <input
          type="checkbox"
          checked={settings.lowPerf}
          onChange={(e) => setLowPerfManually(e.target.checked)}
        />
        {t('scene.debug.lowPerf')}
      </label>
      <label>
        <input
          type="checkbox"
          checked={settings.reducedMotion}
          onChange={(e) => setSettings({ reducedMotion: e.target.checked })}
        />
        {t('scene.debug.reducedMotion')}
      </label>
    </aside>
  );
}
