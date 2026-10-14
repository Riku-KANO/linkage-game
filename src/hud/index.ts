/**
 * HUD(3D の Canvas の上に重ねる DOM のパネル)。どれも表示だけの部品で、
 * 値は props で受け取り、操作はコールバックで返す(状態は flow、3D は scene の担当)。
 *
 * - HUD-1 設計画面:StageHeader, TestRunButton, HintPanel, TutorialBubble, BudgetMeter
 * - HUD-2 ステージ選択:StageSelectPanel、ホームのテキストメニュー TextMenu
 * - HUD-3 設定:SettingsPanel
 * - HUD-4 通知:NoticeStack(列の操作は pushNotice・dismissNotice)
 * - HUD-5 試走中:RunHud(毎フレームの値を React の外で書き換える LiveRunHud も)
 * - 置き場:HudDock(画面の端に寄せ、中央の機械を空ける)
 */
export { HudDock, type HudDockProps } from './HudDock';
export { StageHeader, type StageHeaderProps } from './StageHeader';
export { BudgetMeter, type BudgetMeterProps } from './BudgetMeter';
export { TestRunButton, type TestRunButtonProps } from './TestRunButton';
export { HintPanel, type HintPanelProps } from './HintPanel';
export { TutorialBubble, partsGivenUpTo, type TutorialBubbleProps } from './TutorialBubble';
export { StageSelectPanel, type StageSelectPanelProps } from './StageSelectPanel';
export { TextMenu, homeMenuItems, type TextMenuItem, type TextMenuProps } from './TextMenu';
export {
  SettingsPanel,
  RESET_CONFIRM_MS,
  type HudSettings,
  type SettingsPanelProps,
} from './SettingsPanel';
export { NoticeStack, NOTICE_EXIT_MS, type NoticeStackProps } from './NoticeStack';
export {
  RunHud,
  LiveRunHud,
  runHudView,
  RUN_BADGES,
  type RunBadge,
  type RunHudProps,
  type LiveRunHudProps,
  type RunHudFrame,
  type RunHudSource,
  type RunHudView,
} from './RunHud';
export { MedalPips, MEDAL_AXES, type MedalPipsProps } from './MedalPips';
export type { CollapsibleProps } from './common';
export {
  pushNotice,
  dismissNotice,
  noticeId,
  noticeDuration,
  unlockNotices,
  loadFailNotice,
  saveFailNotice,
  shareLoadedNotice,
  NOTICE_DURATION,
  UNLOCK_DURATION,
  MAX_NOTICES,
  type HudNotice,
  type NoticeSeverity,
  type UnlockKind,
} from './notices';
export {
  buildStageSelect,
  nextPlayableStage,
  medalTally,
  stageAriaLabel,
  type ChapterRow,
  type StageCell,
  type MedalSet,
} from './stageSelect';
export {
  budgetState,
  summarizePreflight,
  formatSeconds,
  formatMeters,
  type BudgetState,
  type PreflightSummary,
} from './format';
