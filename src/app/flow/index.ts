/**
 * flow:ゲームのセッションと試走のライフサイクル(FLOW-1〜5)。
 * App・3D の工房(scene)・3D の試走ビュー(testrun)・HUD はここを通してゲームを進める。
 * 3D なしの通しループ(`?dev=flow`)は ./dom。
 */
export {
  createSessionStore,
  useSession,
  stageForSlot,
  selectStage,
  selectTutorial,
  selectAllowedParts,
  selectLockedJoints,
  selectRevealedHints,
  selectHintGhost,
  selectHasNextHint,
  selectOpponent,
  selectOpponentGhost,
  selectPreviousGhost,
  isHintSuggested,
  MAX_NOTICES,
  REPLAY_LEAD,
  type SessionState,
  type SessionDeps,
  type BootResult,
  type RunPhase,
  type LastRun,
  type TutorialView,
} from './session';
export {
  LiveRun,
  runStageHeadless,
  completeRun,
  STALL_TIMEOUT,
  MAX_FRAME_DT,
  RUN_SPEEDS,
  type RunEnd,
  type RunStatus,
  type RunOutcome,
  type LiveRunOptions,
  type HeadlessRun,
  type CompleteRunInput,
} from './run';
export {
  sameNotice,
  saveFailNotice,
  loadFailNotice,
  unlockNotices,
  type Notice,
  type NoticeInput,
  type NoticeKind,
  type NoticeSeverity,
} from './notices';
export { planShareBoot, type ShareBootPlan } from './share';
export {
  sandboxStage,
  isSandboxStage,
  SANDBOX_STAGE_ID,
  SANDBOX_GOAL,
  SANDBOX_TIME_LIMIT,
} from './sandbox';
export {
  isSettingsRecord,
  sanitizeSettings,
  pickSettings,
  sameSettings,
  type StoredSettings,
} from './settings';
export { createTerrainCache, type TerrainCache, type TerrainFactory } from './terrain';
