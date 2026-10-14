// @vitest-environment jsdom
import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import { ResultPanel } from './ResultPanel';
import { getStage } from '@/game/stages';
import { jansenLeg } from '@/core/model/presets';
import { hasKey, t } from '@/i18n';
import type { RunResult } from '@/game/types';

describe('result panel failure advice', () => {
  afterEach(cleanup);
  it('shows the next-step advice under the failure reason', () => {
    const stage = getStage('c1-s1')!;
    const result: RunResult = {
      stageId: stage.id,
      cleared: false,
      reason: 'stalled',
      time: 5,
      parts: 10,
      cost: 1000,
      energy: 50,
      distance: 0.3,
      medals: { time: null, parts: null, cost: null, energy: null },
    };
    render(
      <ResultPanel
        result={result}
        stage={stage}
        reasonKey="game.fail.stalled"
        adviceKey="game.fail.stalled.advice"
        design={jansenLeg()}
        reducedMotion
        onRetry={() => {}}
        onBackToDesign={() => {}}
      />,
    );
    expect(hasKey('game.fail.stalled.advice')).toBe(true);
    expect(screen.getByText(t('game.fail.stalled.advice'))).toBeTruthy();
  });
});
