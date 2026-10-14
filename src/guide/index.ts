/**
 * 遊び方・用語集・操作一覧・状況の一言(guide ストリーム、GUIDE-1〜4)の公開 API。
 * どれも props とコールバックだけで動く表示部品と、純関数。統合側がホームと設計画面に置く。
 */
export { HowToPlay, type HowToPlayProps } from './HowToPlay';
export {
  HOW_TO_PLAY_PAGES,
  HOW_TO_PLAY_PAGE_IDS,
  pageIndex,
  type HowToPlayPage,
  type HowToPlayPageId,
} from './pages';
export {
  GlossaryPanel,
  GlossaryDialog,
  type GlossaryPanelProps,
  type GlossaryDialogProps,
} from './GlossaryPanel';
export { Term, RichText, type TermProps, type RichTextProps } from './Term';
export {
  GLOSSARY,
  GLOSSARY_IDS,
  glossaryEntry,
  isGlossaryId,
  termName,
  type GlossaryEntry,
  type GlossaryId,
} from './glossary';
export {
  ShortcutSheet,
  ShortcutTable,
  useShortcutSheetHotkey,
  type ShortcutSheetProps,
} from './ShortcutSheet';
export {
  shortcutRows,
  isHelpKey,
  HELP_KEY,
  SHEET_GROUPS,
  type SheetRow,
  type SheetGroup,
} from './shortcuts';
export { TipBubble, type TipBubbleProps } from './TipBubble';
export {
  pickTip,
  candidates,
  maxCrankLength,
  type Tip,
  type TipId,
  type TipInput,
  type TipSeverity,
  type GuideEvent,
} from './tips';
export { WelcomeCard, type WelcomeCardProps } from './WelcomeCard';
export { GuideOverlay, type GuideOverlayProps } from './Overlay';
export { parseRich, plainRich, type RichSegment } from './rich';
