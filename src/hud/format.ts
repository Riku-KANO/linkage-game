import type { PreflightProblem, StageDef } from '@/game/types';

/**
 * HUD の数値の表示と、状態の帯分け(純粋な関数)。
 * 毎フレーム呼ばれるもの(試走中の時間・距離・負荷)もあるので、軽く保つ。
 */

/** 秒の表示。負は 0、数でなければ「—」 */
export function formatSeconds(sec: number, decimals = 1): string {
  if (!Number.isFinite(sec)) return '—';
  return Math.max(0, sec).toFixed(decimals);
}

/** 距離(m)の表示。後退は負のまま見せる */
export function formatMeters(m: number, decimals = 2): string {
  if (!Number.isFinite(m)) return '—';
  return m.toFixed(decimals);
}

/** value / total を 0..1 に収める。分母が 0 以下や数でなければ 0 */
export function ratio(value: number, total: number): number {
  if (!Number.isFinite(value) || !Number.isFinite(total) || total <= 0) return 0;
  return Math.min(1, Math.max(0, value / total));
}

/** スタートからゴールまでの距離(m) */
export function goalDistance(stage: StageDef): number {
  return stage.goal.x - stage.start.x;
}

export type BudgetLevel = 'none' | 'ok' | 'near' | 'over';

export interface BudgetState {
  level: BudgetLevel;
  /** 予算に対するコストの割合(0..1、超過は 1) */
  ratio: number;
  /** 残り(超過は負)。予算なしは null */
  remaining: number | null;
}

/** 予算の帯:予算なし・余裕・あと少し(nearAt 以上)・超過 */
export function budgetState(cost: number, budget: number | null, nearAt = 0.9): BudgetState {
  if (budget === null || !Number.isFinite(budget))
    return { level: 'none', ratio: 0, remaining: null };
  const r = ratio(cost, budget);
  const level: BudgetLevel = cost > budget ? 'over' : cost >= budget * nearAt ? 'near' : 'ok';
  return { level, ratio: r, remaining: budget - cost };
}

export type LoadLevel = 'low' | 'mid' | 'high' | 'stall';

/** モーター負荷(トルク / 上限)の帯。1 以上は停動 */
export function loadLevel(load: number): LoadLevel {
  if (!Number.isFinite(load) || load < 0.6) return 'low';
  if (load < 0.85) return 'mid';
  if (load < 1) return 'high';
  return 'stall';
}

export type TimeLevel = 'ok' | 'low' | 'over';

/** 残り時間の帯:warnAt 秒を切ったら注意、制限時間に達したら終わり。制限なし(0 以下)は ok */
export function timeLevel(elapsed: number, limit: number, warnAt = 5): TimeLevel {
  if (!(limit > 0)) return 'ok';
  if (elapsed >= limit) return 'over';
  return limit - elapsed <= warnAt ? 'low' : 'ok';
}

export interface PreflightSummary {
  /** エラーが 1 つでもあれば試走できない */
  blocked: boolean;
  errors: number;
  warnings: number;
  /** 表示する問題(エラーが先、それぞれ元の順) */
  visible: PreflightProblem[];
  /** 表示しきれなかった数 */
  hidden: number;
}

/** 試走前チェックの一覧をまとめる。エラーは試走を止め、注意は止めない */
export function summarizePreflight(
  problems: readonly PreflightProblem[],
  maxVisible = 3,
): PreflightSummary {
  const errors = problems.filter((p) => p.severity === 'error');
  const warnings = problems.filter((p) => p.severity !== 'error');
  const ordered = [...errors, ...warnings];
  const visible = ordered.slice(0, Math.max(0, maxVisible));
  return {
    blocked: errors.length > 0,
    errors: errors.length,
    warnings: warnings.length,
    visible,
    hidden: ordered.length - visible.length,
  };
}
