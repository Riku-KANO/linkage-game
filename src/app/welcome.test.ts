import { afterEach, describe, expect, it } from 'vitest';
import { initialProgress, recordResult, STAGES, type RunResult } from '@/game';
import { emptyPrefs, parsePrefs } from './prefs';
import {
  dismissWelcomeForSession,
  hasClearedAny,
  resetWelcomeSession,
  shouldWelcome,
  TUTORIAL_STAGE,
  welcomeDismissedThisSession,
} from './welcome';

const result = (stageId: string, cleared: boolean): RunResult => ({
  stageId,
  cleared,
  reason: cleared ? null : 'timeout',
  time: 4,
  parts: 10,
  cost: 500,
  energy: 50,
  distance: cleared ? 1.6 : 0.4,
  medals: cleared
    ? { time: 'gold', parts: 'gold', cost: 'gold', energy: 'gold' }
    : { time: null, parts: null, cost: null, energy: null },
});

afterEach(() => resetWelcomeSession());

describe('hasClearedAny', () => {
  it('is false for a fresh progress and for failed runs only', () => {
    expect(hasClearedAny(initialProgress())).toBe(false);
    expect(hasClearedAny(recordResult(initialProgress(), result('c1-s1', false)))).toBe(false);
  });

  it('is true once any stage has been cleared', () => {
    expect(hasClearedAny(recordResult(initialProgress(), result('c1-s1', true)))).toBe(true);
  });
});

describe('shouldWelcome', () => {
  const fresh = { progress: initialProgress(), prefs: emptyPrefs(), share: 'none' as const };

  it('shows the welcome card to a first-time player', () => {
    expect(shouldWelcome(fresh)).toBe(true);
    // 壊れた共有リンクはホームに残るので、初めての人には出す
    expect(shouldWelcome({ ...fresh, share: 'invalid' })).toBe(true);
    // 起動の結果がまだない(テストなど)も同じ
    expect(shouldWelcome({ ...fresh, share: null })).toBe(true);
  });

  it('does not show it again once the player chose any of its buttons', () => {
    expect(shouldWelcome({ ...fresh, prefs: { ...emptyPrefs(), welcomed: true } })).toBe(false);
  });

  it('does not show it to a player who has already cleared a stage', () => {
    const progress = recordResult(initialProgress(), result('c1-s1', true));
    expect(shouldWelcome({ ...fresh, progress })).toBe(false);
  });

  it('does not show it when the app was opened with a share link', () => {
    expect(shouldWelcome({ ...fresh, share: 'loaded' })).toBe(false);
  });

  it('does not show it again in this session after it was put away', () => {
    expect(welcomeDismissedThisSession()).toBe(false);
    dismissWelcomeForSession();
    expect(welcomeDismissedThisSession()).toBe(true);
    expect(shouldWelcome(fresh)).toBe(false);
    resetWelcomeSession();
    expect(shouldWelcome(fresh)).toBe(true);
  });
});

describe('prefs.welcomed', () => {
  it('is read only when it is exactly true', () => {
    expect(parsePrefs({ welcomed: true })).toEqual({ version: 1, welcomed: true });
    expect(parsePrefs({ welcomed: false })).toEqual(emptyPrefs());
    expect(parsePrefs({ welcomed: 'yes' })).toEqual(emptyPrefs());
  });
});

describe('TUTORIAL_STAGE', () => {
  it('is the first stage of the first chapter (the tutorial)', () => {
    expect(TUTORIAL_STAGE).toBe(STAGES[0]!.id);
    expect(STAGES[0]!.tutorial?.length).toBeGreaterThan(0);
  });
});
