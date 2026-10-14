import type { FailReason, MedalThreshold } from '@/game/types';
import { niceCeil } from '@/ui/mech/math';
import type { AxisKey } from './compare';

/** スコア 4 軸の表示設定(到達時間、部品数、コスト、消費エネルギー) */
export interface AxisDef {
  key: AxisKey;
  labelKey: string;
  unitKey: string;
  /** 表示する小数の桁数 */
  decimals: number;
}

export const AXES: readonly AxisDef[] = [
  { key: 'time', labelKey: 'result.axis.time', unitKey: 'result.unit.time', decimals: 1 },
  { key: 'parts', labelKey: 'result.axis.parts', unitKey: 'result.unit.parts', decimals: 0 },
  { key: 'cost', labelKey: 'result.axis.cost', unitKey: 'result.unit.cost', decimals: 0 },
  { key: 'energy', labelKey: 'result.axis.energy', unitKey: 'result.unit.energy', decimals: 1 },
];

/** 目盛りの最大値に使うきりのよい値 */
const DIAL_STEPS = [1, 1.2, 1.5, 2, 2.5, 3, 4, 5, 6, 8] as const;

/**
 * 文字盤の最大値。基準があれば銅の基準が目盛りの 7〜9 割に来るようにする(銅より悪い範囲も
 * 少し見せる)。範囲を超えた値の針はストッパーで止まる。基準がなければ値から決める。
 */
export function dialMaxFor(value: number, thresholds?: MedalThreshold, ghost?: number): number {
  const bronze = thresholds ? Math.max(...thresholds) : 0;
  if (bronze > 0 && Number.isFinite(bronze)) return niceCeil(bronze * 1.12, DIAL_STEPS);
  const top = Math.max(Number.isFinite(value) ? value : 0, ghost ?? 0);
  return top > 0 ? niceCeil(top * 1.12, DIAL_STEPS) : 1;
}

export function formatValue(v: number, decimals: number): string {
  return Number.isFinite(v) ? v.toFixed(decimals) : '—';
}

/**
 * 失敗理由の文言キー。game が判定した理由のキー(reasonKey)を優先し、なければ RunResult の
 * reason から、どちらもなければ汎用の文言にする。
 */
export function reasonKeyFor(reasonKey: string | undefined, reason: FailReason | null): string {
  if (reasonKey) return reasonKey;
  return reason ? `result.reason.${reason}` : 'result.reason.unknown';
}
