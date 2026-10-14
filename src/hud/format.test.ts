import { describe, expect, it } from 'vitest';
import type { PreflightProblem } from '@/game/types';
import { getStage } from '@/game';
import {
  budgetState,
  formatMeters,
  formatSeconds,
  goalDistance,
  loadLevel,
  ratio,
  summarizePreflight,
  timeLevel,
} from './format';

const problem = (code: PreflightProblem['code'], severity: 'error' | 'warn'): PreflightProblem => ({
  code,
  severity,
  key: `game.preflight.${code}`,
});

describe('formatSeconds / formatMeters', () => {
  it('小数の桁でそろえ、負は 0、数でなければダッシュ', () => {
    expect(formatSeconds(12.345)).toBe('12.3');
    expect(formatSeconds(3, 0)).toBe('3');
    expect(formatSeconds(-1)).toBe('0.0');
    expect(formatSeconds(Number.NaN)).toBe('—');
    expect(formatMeters(1.5)).toBe('1.50');
    expect(formatMeters(-0.2)).toBe('-0.20');
    expect(formatMeters(Number.POSITIVE_INFINITY)).toBe('—');
  });
});

describe('ratio', () => {
  it('0..1 に収め、分母が 0 以下や数でなければ 0', () => {
    expect(ratio(1, 4)).toBe(0.25);
    expect(ratio(5, 4)).toBe(1);
    expect(ratio(-1, 4)).toBe(0);
    expect(ratio(1, 0)).toBe(0);
    expect(ratio(Number.NaN, 4)).toBe(0);
  });
});

describe('budgetState', () => {
  it('予算なし・余裕・あと少し・超過', () => {
    expect(budgetState(500, null)).toEqual({ level: 'none', ratio: 0, remaining: null });
    expect(budgetState(1000, 2000)).toEqual({ level: 'ok', ratio: 0.5, remaining: 1000 });
    expect(budgetState(1850, 2000).level).toBe('near');
    expect(budgetState(2000, 2000).level).toBe('near');
    const over = budgetState(2300, 2000);
    expect(over.level).toBe('over');
    expect(over.ratio).toBe(1);
    expect(over.remaining).toBe(-300);
  });
});

describe('loadLevel', () => {
  it('負荷の帯:軽い・中・重い・停動', () => {
    expect(loadLevel(0.2)).toBe('low');
    expect(loadLevel(0.7)).toBe('mid');
    expect(loadLevel(0.95)).toBe('high');
    expect(loadLevel(1)).toBe('stall');
    expect(loadLevel(Number.NaN)).toBe('low');
  });
});

describe('timeLevel', () => {
  it('残り 5 秒で注意、制限時間で終わり', () => {
    expect(timeLevel(10, 30)).toBe('ok');
    expect(timeLevel(25, 30)).toBe('low');
    expect(timeLevel(30, 30)).toBe('over');
    expect(timeLevel(5, 0)).toBe('ok');
  });
});

describe('summarizePreflight', () => {
  it('エラーは試走を止め、注意は止めない。エラーを先に並べ、多い分は数だけ', () => {
    const problems = [
      problem('noFoot', 'warn'),
      problem('noCrank', 'error'),
      problem('dofLoose', 'error'),
      problem('overBudget', 'error'),
      problem('walksBackward', 'warn'),
    ];
    const s = summarizePreflight(problems, 3);
    expect(s.blocked).toBe(true);
    expect(s.errors).toBe(3);
    expect(s.warnings).toBe(2);
    expect(s.visible.map((p) => p.code)).toEqual(['noCrank', 'dofLoose', 'overBudget']);
    expect(s.hidden).toBe(2);
  });

  it('注意だけなら試走できる', () => {
    const s = summarizePreflight([problem('noFoot', 'warn')]);
    expect(s.blocked).toBe(false);
    expect(s.visible).toHaveLength(1);
    expect(s.hidden).toBe(0);
  });

  it('問題なし', () => {
    expect(summarizePreflight([])).toEqual({
      blocked: false,
      errors: 0,
      warnings: 0,
      visible: [],
      hidden: 0,
    });
  });
});

describe('goalDistance', () => {
  it('スタートからゴールまで(m)', () => {
    const stage = getStage('c1-s1')!;
    expect(goalDistance(stage)).toBeCloseTo(stage.goal.x - stage.start.x);
  });
});
