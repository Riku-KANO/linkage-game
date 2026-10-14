/**
 * 歩行シミュレーション(S-03〜S-07)の公開 API。
 * 契約(型)は ./types、実装は walker(動力学)、terrain(Rapier の地形判定)、headless(評価用)。
 */
export * from './types';
export { createWalkerSim, Walker } from './walker';
export { createFlatTerrain, createRapierTerrain, initRapier } from './terrain';
export { runHeadless } from './headless';
export { computeMassModel, jointMasses, type MassModel } from './mass';
export { DEFAULT_FRICTION, SIM_TUNING } from './constants';
export { awkwardFourBar, chebyshevWalker, jammingFourBar, jansenTwoSided } from './fixtures';
