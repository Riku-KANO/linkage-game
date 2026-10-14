import { useEffect, useMemo, useState } from 'react';
import { useApp } from '@/app/store';
import { jansenWalker } from '@/core/model/presets';
import type { DesignDoc } from '@/core/model/types';
import { basicLeg, highStepLeg, jansenMachine } from '@/game/designs';
import { isStageCleared, progressReducer, recordResult } from '@/game/progress';
import { getStage, STAGES, stagesOfChapter } from '@/game/stages';
import type { Medal, StageId } from '@/game/types';
import { t } from '@/i18n';
import { worldDebug } from './debug';
import { frontierStage, restingStage } from './stageView';
import { useWorld } from './store';
import { clearResult } from './testing';
import './world.css';

/**
 * 開発用パネル(?dev=scene):進行を偽装して、ジオラマ・棚・図鑑の額・T-06 を確かめる。
 * window.__worldDev から同じ操作を呼べる(E2E 用)。
 */
type MedalPreset = 'gold' | 'silver' | 'bronze' | 'none' | 'mixed';
const PRESETS: MedalPreset[] = ['mixed', 'gold', 'silver', 'bronze', 'none'];
const MIXED: Medal[] = ['gold', 'silver', 'bronze', null];

function medalsFor(preset: MedalPreset, index: number): [Medal, Medal, Medal, Medal] {
  if (preset === 'mixed') {
    return [0, 1, 2, 3].map((k) => MIXED[(index + k) % 4]!) as [Medal, Medal, Medal, Medal];
  }
  const m: Medal = preset === 'none' ? null : preset;
  return [m, m, m, m];
}

const MACHINES: (() => DesignDoc)[] = [jansenWalker, basicLeg, highStepLeg, jansenMachine];

const dev = {
  preset: 'mixed' as MedalPreset,
  machine: 0,
  designs: [] as DesignDoc[],
};

function machine(): DesignDoc {
  dev.designs[dev.machine] ??= MACHINES[dev.machine]!();
  return dev.designs[dev.machine]!;
}

/** 最前線のステージをクリアする(本物の recordResult を通す)。全部クリア済みなら null */
function clearNext(): StageId | null {
  const w = useWorld.getState();
  const id = frontierStage(w.progress);
  if (isStageCleared(w.progress, id)) return null;
  const index = STAGES.findIndex((s) => s.id === id);
  const progress = recordResult(w.progress, clearResult(id, medalsFor(dev.preset, index)));
  w.noteRun({ stageId: id, cleared: true, progress, design: machine() });
  return id;
}

/** 結果画面から T-06(ステージ選択へ戻る)を始める */
function playT06(): void {
  useApp.setState({ screen: 'result', transition: null, history: ['home', 'stageSelect'] });
  requestAnimationFrame(() => useApp.getState().go('stageSelect'));
}

function clearAndWalk(): StageId | null {
  const id = clearNext();
  playT06();
  return id;
}

function clearChapter(): void {
  const w = useWorld.getState();
  const ch = getStage(frontierStage(w.progress))?.chapter ?? 1;
  for (const s of stagesOfChapter(ch)) {
    if (!isStageCleared(useWorld.getState().progress, s.id)) clearNext();
  }
}

function clearAll(): void {
  for (let i = 0; i < STAGES.length; i++) if (!clearNext()) break;
}

function registerZukan(): void {
  const w = useWorld.getState();
  const id = `dev-${w.progress.zukan.length + 1}`;
  w.setProgress(progressReducer(w.progress, { type: 'registerZukan', id }));
}

function nextMachine(): void {
  dev.machine = (dev.machine + 1) % MACHINES.length;
  useWorld.getState().setMachineDesign(machine());
}

declare global {
  interface Window {
    __worldDev?: Record<string, unknown>;
  }
}

export function WorldDevPanel() {
  const progress = useWorld((s) => s.progress);
  const current = useWorld((s) => s.currentStageId);
  const last = useWorld((s) => s.lastClearedStageId);
  const walking = useWorld((s) => s.walking);
  const design = useWorld((s) => s.machineDesign);
  const appStage = useApp((s) => s.stageId);
  const [preset, setPreset] = useState<MedalPreset>(dev.preset);

  useEffect(() => {
    window.__worldDev = {
      useWorld,
      worldDebug,
      clearNext,
      clearAndWalk,
      playT06,
      clearChapter,
      clearAll,
      registerZukan,
      nextMachine,
      reset: () => useWorld.getState().reset(),
    };
    return () => {
      delete window.__worldDev;
    };
  }, []);

  const cleared = useMemo(
    () => STAGES.filter((s) => isStageCleared(progress, s.id)).length,
    [progress],
  );
  const here = restingStage(progress, current ?? appStage, last);
  // パネルの中のクリック・キーは遷移のスキップに数えない
  const stop = (e: { stopPropagation(): void }) => e.stopPropagation();

  return (
    <details
      className="ak-world-dev"
      open
      onPointerDown={stop}
      onKeyDown={stop}
      onContextMenu={stop}
    >
      <summary>{t('world.dev.title')}</summary>
      <p>{t('world.dev.status', { cleared, total: STAGES.length, stage: here })}</p>
      {walking && <p>{t('world.dev.walking', { from: walking.from, to: walking.to })}</p>}
      <p>{t('world.dev.machine', { name: design?.name ?? jansenWalker().name })}</p>
      <label>
        {t('world.dev.medals')}{' '}
        <select
          value={preset}
          onChange={(e) => {
            dev.preset = e.target.value as MedalPreset;
            setPreset(dev.preset);
          }}
        >
          {PRESETS.map((p) => (
            <option key={p} value={p}>
              {p === 'mixed' ? t('world.dev.medal.mixed') : t(`game.medal.${p}`)}
            </option>
          ))}
        </select>
      </label>
      <div className="ak-world-dev__buttons">
        <button type="button" onClick={() => clearNext()}>
          {t('world.dev.clearNext')}
        </button>
        <button type="button" onClick={() => clearAndWalk()}>
          {t('world.dev.clearAndWalk')}
        </button>
        <button type="button" onClick={clearChapter}>
          {t('world.dev.clearChapter')}
        </button>
        <button type="button" onClick={clearAll}>
          {t('world.dev.clearAll')}
        </button>
        <button type="button" onClick={nextMachine}>
          {t('world.dev.nextMachine')}
        </button>
        <button type="button" onClick={registerZukan}>
          {t('world.dev.zukan')}
        </button>
        <button type="button" onClick={() => useWorld.getState().reset()}>
          {t('world.dev.reset')}
        </button>
      </div>
    </details>
  );
}
