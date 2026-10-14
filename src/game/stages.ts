import type { DesignDoc, LegLayout, PartKind } from '@/core/model/types';
import { CM, createEmptyDesign, DEFAULT_LEGS } from '@/core/model/types';
import { t } from '@/i18n';
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
 * メダル基準(小さいほど良い)・制限時間・予算は、参考解(reference)を本物の sim で試走した実測から
 * calibrate.ts の方法で決めた値(TUNE-3)。sim を変えたら `pnpm calibrate` で表を出して書き直す
 * (calibrate.test.ts がずれを検出する)。全ステージの参考解がクリアでき、最初の設計が意図どおりに
 * 失敗することは stages.sim.test.ts が本物の sim で確かめる(TUNE-1・TUNE-2)。
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
    timeLimit: 15,
    budget: null,
    parts: CH1_PARTS,
    features: { legArray: false },
    defaultLegs: STANDARD_LEGS,
    // 揺動節が外れて自由度 2(ぐらつく)。O4 と B をリンクでつなげば直る
    initialDesign: withName(withoutLinks(ref, ['rocker']), t('game.design.broken')),
    lockedJoints: ['O2', 'O4', 'A', 'B', 'F'],
    reference: ref,
    // 校正値(calibrate.ts。参考解の実測 1.79 秒・54 J)
    medals: {
      time: [1.9, 2.5, 3.3],
      parts: [10, 12, 15],
      cost: [1250, 1500, 1900],
      energy: [60, 82, 120],
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
    timeLimit: 15,
    budget: null,
    parts: CH1_PARTS,
    features: { legArray: false },
    defaultLegs: STANDARD_LEGS,
    // クランクが 30cm と長すぎて一回転できない(参考解は 15cm)。A を軸に近づければ直る
    initialDesign: withName(withJointAt(ref, 'A', 0, 30), t('game.design.stuckCrank')),
    lockedJoints: ['O2', 'O4', 'B', 'F'],
    reference: ref,
    // 校正値(calibrate.ts。参考解の実測 1.79 秒・54 J)
    medals: {
      time: [1.9, 2.5, 3.3],
      parts: [10, 12, 15],
      cost: [1250, 1500, 1900],
      energy: [60, 82, 120],
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
    timeLimit: 15,
    budget: null,
    parts: CH1_PARTS,
    features: { legArray: false },
    defaultLegs: STANDARD_LEGS,
    reference: ref,
    // 校正値(calibrate.ts。参考解の実測 2.32 秒・67 J)
    medals: {
      time: [2.5, 3.2, 4.2],
      parts: [10, 12, 15],
      cost: [1250, 1500, 1900],
      energy: [74, 105, 150],
    },
    hints: [
      text(id, 1),
      ghost(id, 2, frameGhost(ref)),
      // 脚先の位置が分かるよう、クランクと脚先まで伸びた連結棒を見せる(残りは 1-1 で覚えた「つなぐ」だけ)
      ghost(id, 3, subDesign(ref, { links: ['crank', 'coupler'] })),
    ],
    // 組み方(PLAY-1):クランクの先から脚先まで長い棒を引き、その途中に足した点と右の固定点をつなぐ。
    // クランクの道具はリンクがないと使えないので、先に短い棒を引いてからクランクにする。
    // 吹き出しの寸法(固定点は 40cm 右・20cm 上、クランク 10cm、脚先は右下)で組めば、
    // 既定の回転数(+30rpm)のまま前へ歩いてクリアできる(e2e/playtest で確かめる)
    tutorial: [
      { key: tut(id, 1), until: { kind: 'click' } },
      { key: tut(id, 2), give: ['fixed'], until: { kind: 'place', part: 'fixed', count: 2 } },
      { key: tut(id, 3), give: ['link', 'pin'], until: { kind: 'place', part: 'link', count: 1 } },
      { key: tut(id, 4), give: ['crank'], until: { kind: 'place', part: 'crank', count: 1 } },
      { key: tut(id, 5), until: { kind: 'place', part: 'link', count: 1 } },
      { key: tut(id, 6), until: { kind: 'place', part: 'link', count: 1 } },
      { key: tut(id, 7), until: { kind: 'dof', value: 1 } },
      { key: tut(id, 8), until: { kind: 'fullRotation' } },
      { key: tut(id, 9), until: { kind: 'click' } },
      { key: tut(id, 10), until: { kind: 'testRun' } },
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
    timeLimit: 15,
    budget: null,
    parts: CH1_PARTS,
    features: { legArray: false },
    defaultLegs: STANDARD_LEGS,
    reference: ref,
    // 校正値(calibrate.ts。参考解の実測 2.64 秒・132 J)
    medals: {
      time: [2.8, 3.6, 4.8],
      parts: [10, 12, 15],
      cost: [1250, 1500, 1900],
      energy: [150, 200, 300],
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
    timeLimit: 25,
    budget: null,
    parts: CH1_PARTS,
    features: { legArray: false },
    defaultLegs: STANDARD_LEGS,
    reference: ref,
    // 校正値(calibrate.ts。参考解の実測 4.53 秒・475 J)
    medals: {
      time: [4.8, 6.2, 8.2],
      parts: [10, 12, 15],
      cost: [1500, 1800, 2300],
      energy: [540, 720, 1050],
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
    timeLimit: 15,
    budget: null,
    parts: CH2_PARTS,
    features: { legArray: true },
    defaultLegs: STANDARD_LEGS,
    initialDesign: withName(basicLeg(), t('game.design.shuffler')),
    reference: ref,
    // 校正値(calibrate.ts。参考解の実測 2.64 秒・246 J)
    medals: {
      time: [2.8, 3.6, 4.8],
      parts: [10, 12, 15],
      cost: [1500, 1800, 2300],
      energy: [280, 370, 560],
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
    // 低い台(4cm)が 2 つ。短い台を 3 つ並べると、参考解でも 1 割ほど台の端で止まった
    terrain: stepCourse([
      [1.2, 1.8, 0.04],
      [2.4, 3.0, 0.04],
    ]),
    start: { x: 0, z: 0 },
    goal: { x: 3.6 },
    timeLimit: 20,
    budget: null,
    parts: CH2_PARTS,
    features: { legArray: true },
    defaultLegs: STANDARD_LEGS,
    // 脚が 1 本だけなので立っていられない。脚列の複製で脚を増やせば直る
    initialDesign: withName(withLegs(ref, SINGLE_LEG), t('game.design.oneLeg')),
    reference: ref,
    // 校正値(calibrate.ts。参考解の実測 3.30 秒・322 J)
    medals: {
      time: [3.5, 4.5, 6],
      parts: [10, 12, 15],
      cost: [1500, 1800, 2300],
      energy: [360, 490, 720],
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
  // ヤンセン機は重いので、段の途中で止まらないよう回転数を上げて勢いをつける(-40 では 2 秒ほど止まる)
  const ref = withRpm(jansenMachine(), -60);
  return {
    id,
    chapter: 2,
    order: 3,
    ...keys(id),
    // 6cm の段を 2 つ上る(8cm だと 12 脚のヤンセン機が段の途中で止まることがある)
    terrain: stepCourse([
      [1.2, 2.4, 0.06],
      [2.4, 8, 0.12],
    ]),
    start: { x: 0, z: 0 },
    goal: { x: 3.6 },
    timeLimit: 30,
    budget: null,
    parts: CH2_PARTS,
    features: { legArray: true },
    defaultLegs: STANDARD_LEGS,
    // 余分なリンク C-E で三角形 A-C-E が固まり、自由度 0(動かない)
    initialDesign: withName(
      withExtraLinks(ref, [{ id: 'brace', joints: ['C', 'E'] }]),
      t('game.design.locked'),
    ),
    reference: ref,
    // 校正値(calibrate.ts。参考解の実測 5.61 秒・482 J)
    medals: {
      time: [6, 7.6, 10.5],
      parts: [20, 24, 30],
      cost: [3200, 3800, 4700],
      energy: [540, 740, 1100],
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
    timeLimit: 35,
    budget: 3900,
    parts: CH2_PARTS,
    features: { legArray: true },
    defaultLegs: STANDARD_LEGS,
    reference: ref,
    // 校正値(calibrate.ts。参考解の実測 6.92 秒・310 J)
    medals: {
      time: [7.4, 9.4, 12.5],
      parts: [20, 24, 30],
      cost: [3200, 3800, 3900],
      energy: [350, 470, 700],
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
    // 10cm 上がって、幅 25cm の溝をまたぎ、10cm 下りる。溝の底は -5cm(台の上から 15cm)。
    // 溝に落ちた脚先が自力で上がれる深さにする(底 -15cm だと四節の参考解でも 3 割ほど抜け出せない)
    terrain: ditchCourse(-0.05, [
      [-3, 1.2, 0],
      [1.2, 2.2, 0.1],
      [2.45, 3.4, 0.1],
      [3.4, 8, 0],
    ]),
    start: { x: 0, z: 0 },
    goal: { x: 4.6 },
    timeLimit: 25,
    budget: 1900,
    parts: CH2_PARTS,
    features: { legArray: true },
    defaultLegs: STANDARD_LEGS,
    reference: ref,
    // 校正値(calibrate.ts。参考解の実測 4.11 秒・411 J)
    medals: {
      time: [4.4, 5.6, 7.6],
      parts: [10, 12, 15],
      cost: [1500, 1800, 1900],
      energy: [460, 620, 920],
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
  return { ...createEmptyDesign(t('game.design.new')), legs: stageLegs(stage) };
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
