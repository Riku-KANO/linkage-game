import type { ShareRun } from '@/core/model';
import { jansenWalker } from '@/core/model';
import type { RunResult, StageDef } from '@/game/types';

/**
 * 結果画面の見本データ(?dev=result とテスト用)。ゲームの規則は持たない:
 * メダルは game の evaluateRun が出したものとして、そのまま書いてある。
 */

const design = jansenWalker();

export const SAMPLE_STAGE: StageDef = {
  id: 'c1-s2',
  chapter: 1,
  order: 2,
  titleKey: 'result.dev.stageTitle',
  descKey: 'result.dev.stageTitle',
  terrain: { ground: { y: 0 }, shapes: [] },
  start: { x: 0, z: 0 },
  goal: { x: 3 },
  timeLimit: 30,
  budget: 300,
  parts: ['link', 'pin', 'fixed', 'crank'],
  features: { legArray: true },
  medals: {
    time: [12, 16, 22],
    parts: [8, 10, 12],
    cost: [150, 200, 260],
    energy: [40, 60, 85],
  },
  hints: [
    { kind: 'text', key: 'result.dev.stageTitle' },
    { kind: 'ghost', key: 'result.dev.stageTitle', design },
    { kind: 'ghost', key: 'result.dev.stageTitle', design },
  ],
};

export const SAMPLE_DESIGN = design;

export const SAMPLE_CLEARED_MIXED: RunResult = {
  stageId: 'c1-s2',
  cleared: true,
  reason: null,
  time: 13.4,
  parts: 8,
  cost: 236.5,
  energy: 91.2,
  distance: 3,
  medals: { time: 'silver', parts: 'gold', cost: 'bronze', energy: null },
};

export const SAMPLE_CLEARED_GOLD: RunResult = {
  stageId: 'c1-s2',
  cleared: true,
  reason: null,
  time: 10.8,
  parts: 7,
  cost: 142,
  energy: 36.5,
  distance: 3,
  medals: { time: 'gold', parts: 'gold', cost: 'gold', energy: 'gold' },
};

export const SAMPLE_FAILED_FALL: RunResult = {
  stageId: 'c1-s2',
  cleared: false,
  reason: 'fallen',
  time: 30,
  parts: 9,
  cost: 188,
  energy: 22.4,
  distance: 1.37,
  medals: { time: null, parts: null, cost: null, energy: null },
};

export const SAMPLE_FAILED_TORQUE: RunResult = {
  stageId: 'c1-s2',
  cleared: false,
  reason: 'stalled',
  time: 30,
  parts: 11,
  cost: 251,
  energy: 8.1,
  distance: 0.42,
  medals: { time: null, parts: null, cost: null, energy: null },
};

/** 共有リンクで受け取った相手の記録 */
export const SAMPLE_OPPONENT: ShareRun = {
  stageId: 'c1-s2',
  time: 12.9,
  parts: 9,
  cost: 236.5,
  energy: 74,
  cleared: true,
};

export const SAMPLE_OPPONENT_UNCLEARED: ShareRun = {
  stageId: 'c1-s2',
  time: 30,
  parts: 6,
  cost: 120,
  energy: 15.2,
  cleared: false,
};
