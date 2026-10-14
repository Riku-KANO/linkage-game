import { STAGES, type Progress, type StageId } from '@/game';
import type { BootResult } from './flow';
import type { AppPrefs } from './prefs';

/**
 * 初回の「はじめての方へ」(INT-7b、guide の WelcomeCard)をホームに出すかどうか(純粋な判定)と、
 * このセッションでしまったかどうか。
 *
 * 出すのは次のすべてを満たすとき:
 *  - まだどのステージもクリアしていない
 *  - 前にカードのどれか(チュートリアル・遊び方・あとで)を選んでいない(prefs.welcomed、保存する)
 *  - 共有リンクで開いていない(ロゴの後に作業台の設計画面へ直行するので)
 *  - このセッションでまだしまっていない(選ばずにホームを離れたら、このセッションでは出さない。保存はしない)
 */

/** 「チュートリアルから始める」で開くステージ(章 1 の最初。チュートリアルの吹き出しつき) */
export const TUTORIAL_STAGE: StageId = STAGES[0]!.id;

export interface WelcomeInput {
  progress: Pick<Progress, 'best'>;
  prefs: Pick<AppPrefs, 'welcomed'>;
  /** 起動したときの共有リンクの結果(まだ起動していなければ null) */
  share: BootResult['share'] | null;
}

/** どれかのステージをクリアしたことがある */
export function hasClearedAny(progress: Pick<Progress, 'best'>): boolean {
  return Object.values(progress.best).some((r) => r?.cleared === true);
}

export function shouldWelcome({ progress, prefs, share }: WelcomeInput): boolean {
  if (sessionDismissed || prefs.welcomed === true || share === 'loaded') return false;
  return !hasClearedAny(progress);
}

let sessionDismissed = false;

/** このセッションではもう出さない(選んだとき・選ばずにホームを離れたとき) */
export function dismissWelcomeForSession(): void {
  sessionDismissed = true;
}

export function welcomeDismissedThisSession(): boolean {
  return sessionDismissed;
}

/** テスト用:このセッションでしまったことを忘れる */
export function resetWelcomeSession(): void {
  sessionDismissed = false;
}
