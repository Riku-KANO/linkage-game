import type { DesignDoc, LegLayout, PartKind } from '@/core/model/types';
import { CM, createEmptyDesign, DEFAULT_LEGS } from '@/core/model/types';
import { partsUpToChapter } from './chapters';
import { ditchCourse, flatCourse, stepCourse, terrainHeightAt } from './courses';
import {
  basicLeg,
  frameGhost,
  highStepLeg,
  jansenMachine,
  SINGLE_LEG,
  STANDARD_LEGS,
  subDesign,
  withExtraLinks,
  withJointAt,
  withLegs,
  withName,
  withoutLinks,
  withRpm,
} from './designs';
import type { HintGhost, HintText, StageDef, StageId } from './types';

/**
 * 章 1「はじめの一歩」と章 2「段差を越える」のステージ(MVP の 10 ステージ)。
 *
 * メダル基準・制限時間は仮の値(小さいほど良い)。時間は参考解の歩幅 × 回転数からの見積もり、
 * エネルギーは距離あたりの目安(四節 40/70/120 J/m、ヤンセン 80/140/240 J/m 前後)。
 * sim の統合後に、参考解(reference)をヘッドレス試走して調整する。
 *
 * STAGES は読み取り専用として扱う。設計を編集に渡すときは startDesign() で複製する。
 */

const CH1_PARTS: PartKind[] = partsUpToChapter(1);
const CH2_PARTS: PartKind[] = partsUpToChapter(2);

const text = (id: StageId, n: 1): HintText => ({ kind: 'text', key: `game.stage.${id}.hint${n}` });
const ghost = (id: StageId, n: 2 | 3, design: DesignDoc): HintGhost => ({
  kind: 'ghost',
  key: `game.stage.${id}.hint${n}`,
  design,
});
const tut = (id: StageId, n: number) => `game.stage.${id}.tut.${n}`;
const keys = (id: StageId) => ({
  titleKey: `game.stage.${id}.title`,
  descKey: `game.stage.${id}.desc`,
});

// ---- 章 1:はじめの一歩(平地。四節リンクと、クランクが一回転する条件) ----

const c1s1 = (): StageDef => {
  const id = 'c1-s1';
  const ref = basicLeg();
  return {
    id,
    chapter: 1,
    order: 1,
    ...keys(id),
    terrain: flatCourse(),
    start: { x: 0, z: 0 },
    goal: { x: 1.5 },
    timeLimit: 30,
    budget: null,
    parts: CH1_PARTS,
    features: { legArray: false },
    defaultLegs: STANDARD_LEGS,
    // 揺動節が外れて自由度 2(ぐらつく)。O4 と B をリンクでつなげば直る
    initialDesign: withName(withoutLinks(ref, ['rocker']), 'こわれた機械'),
    lockedJoints: ['O2', 'O4', 'A', 'B', 'F'],
    reference: ref,
    medals: {
      time: [5, 8, 12],
      parts: [10, 12, 16],
      cost: [550, 650, 800],
      energy: [60, 105, 180],
    },
    hints: [
      text(id, 1),
      ghost(id, 2, subDesign(ref, { joints: ['O4', 'B'] })),
      ghost(id, 3, subDesign(ref, { links: ['rocker'] })),
    ],
    tutorial: [
      { key: tut(id, 1), until: { kind: 'click' } },
      { key: tut(id, 2), until: { kind: 'click' } },
      { key: tut(id, 3), give: ['link', 'pin'], until: { kind: 'place', part: 'link', count: 1 } },
      { key: tut(id, 4), until: { kind: 'dof', value: 1 } },
      { key: tut(id, 5), until: { kind: 'fullRotation' } },
      { key: tut(id, 6), until: { kind: 'testRun' } },
    ],
  };
};

const c1s2 = (): StageDef => {
  const id = 'c1-s2';
  const ref = basicLeg();
  return {
    id,
    chapter: 1,
    order: 2,
    ...keys(id),
    terrain: flatCourse(),
    start: { x: 0, z: 0 },
    goal: { x: 1.5 },
    timeLimit: 30,
    budget: null,
    parts: CH1_PARTS,
    features: { legArray: false },
    defaultLegs: STANDARD_LEGS,
    // クランクが 30cm と長すぎて一回転できない(参考解は 15cm)。A を軸に近づければ直る
    initialDesign: withName(withJointAt(ref, 'A', 0, 30), '回らない機械'),
    lockedJoints: ['O2', 'O4', 'B', 'F'],
    reference: ref,
    medals: {
      time: [5, 8, 12],
      parts: [10, 12, 16],
      cost: [550, 650, 800],
      energy: [60, 105, 180],
    },
    hints: [
      text(id, 1),
      ghost(id, 2, subDesign(ref, { joints: ['O2', 'A'] })),
      ghost(id, 3, subDesign(ref, { links: ['crank', 'coupler'] })),
    ],
    tutorial: [
      { key: tut(id, 1), until: { kind: 'click' } },
      { key: tut(id, 2), until: { kind: 'click' } },
      { key: tut(id, 3), until: { kind: 'fullRotation' } },
      { key: tut(id, 4), until: { kind: 'testRun' } },
    ],
  };
};

const c1s3 = (): StageDef => {
  const id = 'c1-s3';
  const ref = basicLeg();
  return {
    id,
    chapter: 1,
    order: 3,
    ...keys(id),
    terrain: flatCourse(),
    start: { x: 0, z: 0 },
    goal: { x: 2 },
    timeLimit: 40,
    budget: null,
    parts: CH1_PARTS,
    features: { legArray: false },
    defaultLegs: STANDARD_LEGS,
    reference: ref,
    medals: {
      time: [7, 10, 15],
      parts: [10, 12, 16],
      cost: [550, 650, 800],
      energy: [80, 140, 240],
    },
    hints: [
      text(id, 1),
      ghost(id, 2, frameGhost(ref)),
      ghost(id, 3, subDesign(ref, { links: ['crank', 'rocker'] })),
    ],
    tutorial: [
      { key: tut(id, 1), until: { kind: 'click' } },
      { key: tut(id, 2), give: ['fixed'], until: { kind: 'place', part: 'fixed', count: 2 } },
      { key: tut(id, 3), give: ['crank'], until: { kind: 'place', part: 'crank', count: 1 } },
      { key: tut(id, 4), give: ['link', 'pin'], until: { kind: 'place', part: 'link', count: 2 } },
      { key: tut(id, 5), until: { kind: 'dof', value: 1 } },
      { key: tut(id, 6), until: { kind: 'fullRotation' } },
      { key: tut(id, 7), until: { kind: 'click' } },
      { key: tut(id, 8), until: { kind: 'testRun' } },
    ],
  };
};

const c1s4 = (): StageDef => {
  const id = 'c1-s4';
  // 回転数を上げて速く歩く
  const ref = withRpm(basicLeg(), -80);
  return {
    id,
    chapter: 1,
    order: 4,
    ...keys(id),
    terrain: flatCourse(),
    start: { x: 0, z: 0 },
    goal: { x: 3 },
    timeLimit: 30,
    budget: null,
    parts: CH1_PARTS,
    features: { legArray: false },
    defaultLegs: STANDARD_LEGS,
    reference: ref,
    medals: {
      time: [8, 12, 18],
      parts: [10, 12, 16],
      cost: [550, 650, 800],
      energy: [120, 210, 360],
    },
    hints: [
      text(id, 1),
      ghost(id, 2, frameGhost(ref)),
      ghost(id, 3, subDesign(ref, { links: ['crank', 'coupler'] })),
    ],
  };
};

const c1s5 = (): StageDef => {
  const id = 'c1-s5';
  // 歩幅の広い四節リンク
  const ref = highStepLeg();
  return {
    id,
    chapter: 1,
    order: 5,
    ...keys(id),
    terrain: flatCourse(),
    start: { x: 0, z: 0 },
    goal: { x: 5 },
    timeLimit: 30,
    budget: null,
    parts: CH1_PARTS,
    features: { legArray: false },
    defaultLegs: STANDARD_LEGS,
    reference: ref,
    medals: {
      time: [12, 17, 24],
      parts: [10, 12, 16],
      cost: [600, 700, 850],
      energy: [200, 350, 600],
    },
    hints: [
      text(id, 1),
      ghost(id, 2, frameGhost(ref)),
      ghost(id, 3, subDesign(ref, { links: ['crank', 'rocker'] })),
    ],
  };
};

// ---- 章 2:段差を越える(脚先軌道の高さと形、自由度。脚列の複製を解放) ----

const c2s1 = (): StageDef => {
  const id = 'c2-s1';
  const ref = highStepLeg();
  return {
    id,
    chapter: 2,
    order: 1,
    ...keys(id),
    // 高さ 14cm の段差。基本の脚(足上げ 約 12cm)ではつまずく
    terrain: stepCourse([[1.2, 8, 0.14]]),
    start: { x: 0, z: 0 },
    goal: { x: 2.6 },
    timeLimit: 40,
    budget: null,
    parts: CH2_PARTS,
    features: { legArray: true },
    defaultLegs: STANDARD_LEGS,
    initialDesign: withName(basicLeg(), 'すり足の機械'),
    reference: ref,
    medals: {
      time: [8, 12, 18],
      parts: [10, 12, 16],
      cost: [600, 700, 850],
      energy: [110, 190, 330],
    },
    hints: [
      text(id, 1),
      ghost(id, 2, frameGhost(ref)),
      ghost(id, 3, subDesign(ref, { links: ['crank', 'coupler'] })),
    ],
  };
};

const c2s2 = (): StageDef => {
  const id = 'c2-s2';
  const ref = highStepLeg();
  return {
    id,
    chapter: 2,
    order: 2,
    ...keys(id),
    // 低いでこぼこ(4cm)
    terrain: stepCourse([
      [1.2, 1.5, 0.04],
      [2.2, 2.5, 0.04],
      [3.0, 3.3, 0.04],
    ]),
    start: { x: 0, z: 0 },
    goal: { x: 3.6 },
    timeLimit: 40,
    budget: null,
    parts: CH2_PARTS,
    features: { legArray: true },
    defaultLegs: STANDARD_LEGS,
    // 脚が 1 本だけなので立っていられない。脚列の複製で脚を増やせば直る
    initialDesign: withName(withLegs(ref, SINGLE_LEG), '一本足の機械'),
    reference: ref,
    medals: {
      time: [9, 13, 19],
      parts: [10, 12, 16],
      cost: [600, 700, 850],
      energy: [150, 260, 450],
    },
    hints: [
      text(id, 1),
      ghost(id, 2, frameGhost(ref)),
      ghost(id, 3, subDesign(ref, { links: ['crank', 'coupler'] })),
    ],
  };
};

const c2s3 = (): StageDef => {
  const id = 'c2-s3';
  const ref = jansenMachine();
  return {
    id,
    chapter: 2,
    order: 3,
    ...keys(id),
    // 8cm の段を 2 つ上る
    terrain: stepCourse([
      [1.2, 2.4, 0.08],
      [2.4, 8, 0.16],
    ]),
    start: { x: 0, z: 0 },
    goal: { x: 3.6 },
    timeLimit: 45,
    budget: null,
    parts: CH2_PARTS,
    features: { legArray: true },
    defaultLegs: STANDARD_LEGS,
    // 余分なリンク C-E で三角形 A-C-E が固まり、自由度 0(動かない)
    initialDesign: withName(
      withExtraLinks(ref, [{ id: 'brace', joints: ['C', 'E'] }]),
      '動かない機械',
    ),
    reference: ref,
    medals: {
      time: [13, 18, 26],
      parts: [14, 20, 26],
      cost: [1100, 1600, 2000],
      energy: [300, 520, 900],
    },
    hints: [
      text(id, 1),
      ghost(id, 2, subDesign(ref, { links: ['crank', 'j', 'k'] })),
      ghost(id, 3, subDesign(ref, { links: ['crank', 'j', 'k', 'bde', 'c'] })),
    ],
  };
};

const c2s4 = (): StageDef => {
  const id = 'c2-s4';
  const ref = jansenMachine();
  return {
    id,
    chapter: 2,
    order: 4,
    ...keys(id),
    // 幅 30cm・深さ 20cm の溝が 2 つ
    terrain: ditchCourse(-0.2, [
      [-3, 1.3, 0],
      [1.6, 2.8, 0],
      [3.1, 8, 0],
    ]),
    start: { x: 0, z: 0 },
    goal: { x: 4.2 },
    timeLimit: 50,
    budget: 2000,
    parts: CH2_PARTS,
    features: { legArray: true },
    defaultLegs: STANDARD_LEGS,
    reference: ref,
    medals: {
      time: [15, 21, 30],
      parts: [14, 20, 26],
      cost: [1100, 1600, 2000],
      energy: [350, 600, 1000],
    },
    hints: [
      text(id, 1),
      ghost(id, 2, frameGhost(ref)),
      ghost(id, 3, subDesign(ref, { links: ['crank', 'j', 'k', 'bde', 'c'] })),
    ],
  };
};

const c2s5 = (): StageDef => {
  const id = 'c2-s5';
  const ref = highStepLeg();
  return {
    id,
    chapter: 2,
    order: 5,
    ...keys(id),
    // 10cm 上がって、幅 25cm の溝をまたぎ、10cm 下りる。溝の底は -15cm
    terrain: ditchCourse(-0.15, [
      [-3, 1.2, 0],
      [1.2, 2.2, 0.1],
      [2.45, 3.4, 0.1],
      [3.4, 8, 0],
    ]),
    start: { x: 0, z: 0 },
    goal: { x: 4.6 },
    timeLimit: 50,
    budget: 900,
    parts: CH2_PARTS,
    features: { legArray: true },
    defaultLegs: STANDARD_LEGS,
    reference: ref,
    medals: {
      time: [13, 19, 27],
      parts: [10, 12, 16],
      cost: [600, 700, 850],
      energy: [220, 380, 650],
    },
    hints: [
      text(id, 1),
      ghost(id, 2, frameGhost(ref)),
      ghost(id, 3, subDesign(ref, { links: ['crank', 'rocker'] })),
    ],
  };
};

/** 遊べる全ステージ(章・順番の昇順) */
export const STAGES: readonly StageDef[] = [
  c1s1(),
  c1s2(),
  c1s3(),
  c1s4(),
  c1s5(),
  c2s1(),
  c2s2(),
  c2s3(),
  c2s4(),
  c2s5(),
];

export function getStage(id: StageId): StageDef | undefined {
  return STAGES.find((s) => s.id === id);
}

export function stagesOfChapter(chapter: number): StageDef[] {
  return STAGES.filter((s) => s.chapter === chapter);
}

/** 同じ章の次のステージ、なければ次の章の最初のステージ。最後なら null */
export function nextStageId(id: StageId): StageId | null {
  const i = STAGES.findIndex((s) => s.id === id);
  if (i < 0) return null;
  return STAGES[i + 1]?.id ?? null;
}

/** このステージで使う脚列(脚列が未解放なら、これに固定される) */
export function stageLegs(stage: StageDef): LegLayout {
  return { ...(stage.defaultLegs ?? DEFAULT_LEGS) };
}

/** ステージ開始時の設計(複製)。initialDesign がなければ空の設計に既定の脚列を入れる */
export function startDesign(stage: StageDef): DesignDoc {
  if (stage.initialDesign) return structuredClone(stage.initialDesign);
  return { ...createEmptyDesign(), legs: stageLegs(stage) };
}

/**
 * ステージの文言(説明・ヒント)に埋める値。t(stage.descKey, stageTextParams(stage)) のように使う。
 * distance:ゴールまでの距離(m)、timeLimit:制限時間(s)、budget:予算、step:最大の段差(cm)
 */
export function stageTextParams(stage: StageDef): Record<string, string | number> {
  const params: Record<string, string | number> = {
    distance: round1(stage.goal.x - stage.start.x),
    timeLimit: stage.timeLimit,
    step: Math.round(maxStepUp(stage) / CM),
  };
  if (stage.budget !== null) params.budget = stage.budget;
  return params;
}

/** スタートからゴールまでの、前進方向の最大の上り段差(m) */
export function maxStepUp(stage: StageDef): number {
  const x0 = stage.start.x;
  const x1 = stage.goal.x;
  const dx = 0.01;
  let prev = terrainHeightAt(stage.terrain, x0, stage.start.z);
  let max = 0;
  for (let x = x0 + dx; x <= x1 + 1e-9; x += dx) {
    const h = terrainHeightAt(stage.terrain, x, stage.start.z);
    if (Number.isFinite(h) && Number.isFinite(prev)) max = Math.max(max, h - prev);
    prev = h;
  }
  return max;
}

const round1 = (v: number) => Math.round(v * 10) / 10;
