import { describe, expect, it } from 'vitest';
import {
  availableParts,
  initialProgress,
  newlyUnlocked,
  recordResult,
  stagesOfChapter,
  type Progress,
  type RunResult,
} from '@/game';
import { hasKey, t } from '@/i18n';
import { flow } from '@/i18n/ja/flow';
import { loadFailNotice, sameNotice, saveFailNotice, unlockNotices } from './notices';
import { isSandboxStage, sandboxStage } from './sandbox';
import { pickSettings, sanitizeSettings } from './settings';

const cleared = (stageId: string): RunResult => ({
  stageId,
  cleared: true,
  reason: null,
  time: 4,
  parts: 10,
  cost: 500,
  energy: 50,
  distance: 1.6,
  medals: { time: 'gold', parts: 'gold', cost: 'gold', energy: 'gold' },
});

const clearChapter = (p: Progress, chapter: number) =>
  stagesOfChapter(chapter).reduce((acc, s) => recordResult(acc, cleared(s.id)), p);

describe('notices', () => {
  it('announces the next chapter, its first stage and the leg array when chapter 1 is cleared', () => {
    const ch1 = stagesOfChapter(1);
    const before = ch1
      .slice(0, -1)
      .reduce((acc, s) => recordResult(acc, cleared(s.id)), initialProgress());
    const after = recordResult(before, cleared(ch1.at(-1)!.id));
    const notices = unlockNotices(newlyUnlocked(before, after));
    expect(notices.map((n) => n.key)).toEqual([
      'game.unlock.chapter',
      'game.unlock.stage',
      'game.unlock.feature',
    ]);
    expect(notices[0]!.params).toEqual({ chapter: 2, title: t('game.chapter.2.title') });
    expect(notices.every((n) => n.kind === 'unlock' && n.severity === 'success')).toBe(true);
    for (const n of notices) expect(t(n.key, n.params)).not.toMatch(/\{\w+\}/);
  });

  it('does not announce chapters that have no stages yet', () => {
    const before = clearChapter(clearChapter(initialProgress(), 1), 2);
    const p1 = clearChapter(initialProgress(), 1);
    const almost = stagesOfChapter(2)
      .slice(0, -1)
      .reduce((acc, s) => recordResult(acc, cleared(s.id)), p1);
    const unlocks = newlyUnlocked(almost, before);
    expect(unlocks.chapters).toContain(3);
    expect(unlockNotices(unlocks)).toEqual([]);
  });

  it('maps save and load failures to message keys', () => {
    expect(saveFailNotice('quota')).toEqual({
      kind: 'save',
      severity: 'error',
      key: 'model.save.quota',
    });
    expect(saveFailNotice('newer').severity).toBe('warn');
    expect(loadFailNotice('version', 'share')).toEqual({
      kind: 'share',
      severity: 'error',
      key: 'model.load.version',
    });
    for (const r of ['quota', 'unavailable', 'serialize', 'newer'] as const) {
      expect(hasKey(saveFailNotice(r).key)).toBe(true);
    }
  });

  it('compares notices by content', () => {
    const a = { kind: 'unlock', severity: 'success', key: 'k', params: { a: 1 } } as const;
    expect(sameNotice(a, { ...a, params: { a: 1 } })).toBe(true);
    expect(sameNotice(a, { ...a, params: { a: 2 } })).toBe(false);
    expect(sameNotice(a, { ...a, kind: 'save' })).toBe(false);
  });

  it('every flow string is a non-empty Japanese text reachable through t()', () => {
    for (const [k, v] of Object.entries(flow)) {
      expect(k.startsWith('flow.')).toBe(true);
      expect(v.length).toBeGreaterThan(0);
      expect(hasKey(k)).toBe(true);
    }
  });
});

describe('settings', () => {
  const base = { volume: 0.8, reducedMotion: false, lowPerf: false };
  it('keeps valid fields and drops broken ones', () => {
    expect(sanitizeSettings({ volume: 0.2, reducedMotion: true, lowPerf: 'yes' }, base)).toEqual({
      volume: 0.2,
      reducedMotion: true,
      lowPerf: false,
    });
    expect(sanitizeSettings({ volume: 7 }, base).volume).toBe(1);
    expect(sanitizeSettings({ volume: Number.NaN }, base).volume).toBe(0.8);
    expect(pickSettings({ ...base, volume: 0.5 })).toEqual({ ...base, volume: 0.5 });
  });
});

describe('sandbox', () => {
  it('is a flat stage with the unlocked parts and no medals', () => {
    const p = initialProgress();
    const s = sandboxStage(p);
    expect(isSandboxStage(s)).toBe(true);
    expect(sandboxStage(p)).toBe(s);
    expect(s.parts).toEqual(availableParts(p));
    expect(s.features.legArray).toBe(false);
    expect(s.terrain.shapes).toEqual([]);
    expect(hasKey(s.titleKey) && hasKey(s.descKey)).toBe(true);
    expect(sandboxStage(clearChapter(p, 1)).features.legArray).toBe(true);
  });
});
