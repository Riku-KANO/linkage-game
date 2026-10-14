import { initialProgress, recordResult, STAGES, stagesOfChapter } from '@/game';
import type { Medal, PreflightResult, Progress, RunResult, StageId } from '@/game/types';

/**
 * HUD の見本データ(?dev=hud とテスト用)。ゲームの規則は持たない:試走前チェックの結果は
 * game の preflight が出したものとして、進行は game の recordResult で組み立てる。
 */

export type PreflightCase = 'checking' | 'ok' | 'warn' | 'error' | 'many';

export const SAMPLE_PREFLIGHT: Record<Exclude<PreflightCase, 'checking'>, PreflightResult> = {
  ok: { ok: true, problems: [] },
  warn: {
    ok: true,
    problems: [
      { code: 'noFoot', severity: 'warn', key: 'game.preflight.noFoot' },
      {
        code: 'walksBackward',
        severity: 'warn',
        key: 'game.preflight.walksBackward',
        jointIds: ['F'],
      },
    ],
  },
  error: {
    ok: false,
    problems: [
      {
        code: 'dofLoose',
        severity: 'error',
        key: 'game.preflight.dofLoose',
        params: { dof: 2 },
        linkIds: ['coupler'],
      },
      { code: 'noFoot', severity: 'warn', key: 'game.preflight.noFoot' },
    ],
  },
  many: {
    ok: false,
    problems: [
      { code: 'noCrank', severity: 'error', key: 'game.preflight.noCrank' },
      {
        code: 'noFullRotation',
        severity: 'error',
        key: 'game.preflight.noFullRotation',
        linkIds: ['crank'],
      },
      {
        code: 'overBudget',
        severity: 'error',
        key: 'game.preflight.overBudget',
        params: { cost: 2340, budget: 2000 },
      },
      {
        code: 'partNotAllowed',
        severity: 'error',
        key: 'game.preflight.partNotAllowed',
        params: { part: 'ギア' },
      },
      { code: 'noFoot', severity: 'warn', key: 'game.preflight.noFoot' },
    ],
  },
};

export function samplePreflight(c: PreflightCase): PreflightResult | null {
  return c === 'checking' ? null : SAMPLE_PREFLIGHT[c];
}

const MEDAL_CYCLE: Medal[] = ['gold', 'silver', 'bronze', null];

/** ステージごとに決まった並びのメダル(見本なので乱数は使わない) */
function sampleCleared(id: StageId, i: number): RunResult {
  const m = (k: number) => MEDAL_CYCLE[(i + k) % MEDAL_CYCLE.length] ?? null;
  return {
    stageId: id,
    cleared: true,
    reason: null,
    time: 6 + i * 1.3,
    parts: 10 + (i % 4),
    cost: 560 + i * 45,
    energy: 70 + i * 9.5,
    distance: 1.6 + i * 0.1,
    medals: { time: m(0), parts: m(1), cost: m(2), energy: m(3) },
  };
}

function sampleFailed(id: StageId): RunResult {
  return {
    stageId: id,
    cleared: false,
    reason: 'fallen',
    time: 30,
    parts: 12,
    cost: 700,
    energy: 120,
    distance: 0.82,
    medals: { time: null, parts: null, cost: null, energy: null },
  };
}

export type ProgressCase = 'new' | 'mid' | 'ch1' | 'all';

/** 進行の見本:はじめて・章 1 の途中(3 面目で一度失敗)・章 1 クリア・全部クリア */
export function sampleProgress(c: ProgressCase): Progress {
  const clear = (ids: StageId[]) =>
    ids.reduce((p, id, i) => recordResult(p, sampleCleared(id, i)), initialProgress());
  switch (c) {
    case 'new':
      return initialProgress();
    case 'mid':
      return recordResult(clear(['c1-s1', 'c1-s2']), sampleFailed('c1-s3'));
    case 'ch1':
      return clear(stagesOfChapter(1).map((s) => s.id));
    case 'all':
      return clear(STAGES.map((s) => s.id));
  }
}
