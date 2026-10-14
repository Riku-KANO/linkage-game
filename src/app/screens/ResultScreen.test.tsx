// @vitest-environment jsdom
import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import { completeRun, useSession } from '@/app/flow';
import { useApp } from '@/app/store';
import { getStage, initialProgress } from '@/game';
import { t } from '@/i18n';
import { ResultScreen } from './ResultScreen';

const stage = getStage('c1-s1')!;

/** 転倒して終わった試走の結果(評価・失敗理由は本物の completeRun) */
function fallenOutcome() {
  return completeRun({
    stage,
    slot: stage.id,
    design: stage.reference!,
    summary: {
      time: 1.2,
      distance: 0.3,
      reachedGoal: false,
      fallen: true,
      stalled: false,
      jammed: false,
      energy: 20,
      maxTilt: 1.2,
      comHeight: 0.3,
    },
    ghost: { hz: 10, frames: [] },
    progress: initialProgress(),
  }).outcome;
}

describe('ResultScreen (INT-3)', () => {
  afterEach(() => {
    cleanup();
    useSession.setState({ run: { phase: 'idle' } });
  });

  it('shows the failure reason with its advice and offers the replay of the fall', () => {
    useApp.setState({ settings: { ...useApp.getState().settings, reducedMotion: true } });
    const outcome = fallenOutcome();
    expect(outcome.diagnosis).not.toBeNull();
    useSession.setState({ run: { phase: 'finished', outcome } });
    render(<ResultScreen screen="result" />);
    expect(screen.getByText(t('result.headline.failed'))).toBeTruthy();
    expect(screen.getByText(t(outcome.diagnosis!.key))).toBeTruthy();
    expect(screen.getByText(t(outcome.diagnosis!.adviceKey))).toBeTruthy();
    expect(screen.getByRole('button', { name: new RegExp(t('result.replayFall')) })).toBeTruthy();
    expect(screen.getByRole('button', { name: t('result.action.back') })).toBeTruthy();
  });

  it('renders nothing unless a result is showing', () => {
    useSession.setState({ run: { phase: 'idle' } });
    const { container } = render(<ResultScreen screen="result" />);
    expect(container.innerHTML).toBe('');
  });
});
