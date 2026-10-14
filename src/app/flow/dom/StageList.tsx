import { useState } from 'react';
import { useApp } from '@/app/store';
import {
  CHAPTERS,
  isChapterUnlocked,
  isStageCleared,
  isStageUnlocked,
  stagesOfChapter,
  type Medal,
} from '@/game';
import { t } from '@/i18n';
import { useFlow, useFlowStore } from './context';

const AXES = ['time', 'parts', 'cost', 'energy'] as const;

/** ステージ選択(章・解放状態・最高メダル)と設定。HUD-2/3 ができるまでの簡単な一覧 */
export function StageList() {
  const store = useFlowStore();
  const progress = useFlow((s) => s.progress);
  const persistent = useFlow((s) => s.persistent);

  return (
    <div className="fl-stages">
      <section className="fl-chapters" aria-label={t('flow.ui.stages')}>
        <h2>{t('flow.ui.stages')}</h2>
        {CHAPTERS.map((ch) => {
          const unlocked = isChapterUnlocked(progress, ch.chapter);
          const stages = stagesOfChapter(ch.chapter);
          return (
            <div key={ch.chapter} className="fl-chapter" data-locked={!unlocked || undefined}>
              <h3>
                {t('flow.ui.chapter', { chapter: ch.chapter, title: t(ch.titleKey) })}
                {!ch.playable && <small> — {t('game.chapter.comingSoon')}</small>}
                {ch.playable && !unlocked && <small> — {t('game.chapter.locked')}</small>}
              </h3>
              {ch.playable && <p className="fl-muted">{t(ch.descKey)}</p>}
              <div className="fl-stage-grid">
                {stages.map((st) => {
                  const open = isStageUnlocked(progress, st.id);
                  const best = progress.best[st.id];
                  const done = isStageCleared(progress, st.id);
                  return (
                    <button
                      key={st.id}
                      type="button"
                      className="fl-stage"
                      data-cleared={done || undefined}
                      disabled={!open}
                      onClick={() => store.getState().startStage(st.id)}
                    >
                      <span className="fl-stage__no">
                        {st.chapter}-{st.order}
                      </span>
                      <span className="fl-stage__title">{t(st.titleKey)}</span>
                      <span className="fl-stage__state">
                        {!open
                          ? t('flow.ui.locked')
                          : done
                            ? t('flow.ui.cleared')
                            : t('flow.ui.notCleared')}
                      </span>
                      {best?.cleared && (
                        <span className="fl-stage__best">
                          {t('flow.ui.best', { time: best.time.toFixed(1) })}
                          <span className="fl-medals">
                            {AXES.map((a) => (
                              <MedalDot key={a} axis={a} medal={best.medals[a]} />
                            ))}
                          </span>
                        </span>
                      )}
                    </button>
                  );
                })}
              </div>
            </div>
          );
        })}
        <div className="fl-chapter">
          <button
            type="button"
            className="fl-stage fl-stage--sandbox"
            onClick={() => store.getState().openSandbox()}
          >
            <span className="fl-stage__title">{t('flow.ui.sandbox')}</span>
          </button>
        </div>
      </section>
      <Settings persistent={persistent} />
    </div>
  );
}

function MedalDot({ axis, medal }: { axis: (typeof AXES)[number]; medal: Medal }) {
  const label = `${t(`flow.ui.medal.${axis}`)}:${t(`game.medal.${medal ?? 'none'}`)}`;
  return <i className="fl-medal" data-medal={medal ?? 'none'} title={label} aria-label={label} />;
}

function Settings({ persistent }: { persistent: boolean }) {
  const store = useFlowStore();
  const settings = useApp((s) => s.settings);
  const setSettings = useApp((s) => s.setSettings);
  const [confirm, setConfirm] = useState(false);
  return (
    <section className="fl-settings" aria-label={t('flow.ui.settings')}>
      <h2>{t('flow.ui.settings')}</h2>
      <label>
        {t('flow.ui.volume')}{' '}
        <input
          type="range"
          min={0}
          max={1}
          step={0.05}
          value={settings.volume}
          onChange={(e) => setSettings({ volume: Number(e.target.value) })}
        />
      </label>
      <label>
        <input
          type="checkbox"
          checked={settings.reducedMotion}
          onChange={(e) => setSettings({ reducedMotion: e.target.checked })}
        />{' '}
        {t('flow.ui.reducedMotion')}
      </label>
      <label>
        <input
          type="checkbox"
          checked={settings.lowPerf}
          onChange={(e) => setSettings({ lowPerf: e.target.checked })}
        />{' '}
        {t('flow.ui.lowPerf')}
      </label>
      <button
        type="button"
        className="fl-btn fl-btn--danger"
        onClick={() => {
          if (!confirm) return setConfirm(true);
          setConfirm(false);
          store.getState().resetProgress();
        }}
        onBlur={() => setConfirm(false)}
      >
        {t(confirm ? 'flow.ui.resetProgress.confirm' : 'flow.ui.resetProgress')}
      </button>
      {!persistent && <p className="fl-muted">{t('flow.ui.storageMemory')}</p>}
    </section>
  );
}
