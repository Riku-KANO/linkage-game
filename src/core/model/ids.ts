import type { DesignDoc } from './types';

/** 設計内で未使用の id を作る(例:j1, j2, …)。決定論的(乱数を使わない) */
export function nextId(design: DesignDoc, prefix: 'j' | 'l' | 'c'): string {
  const used = new Set<string>([
    ...design.joints.map((j) => j.id),
    ...design.links.map((l) => l.id),
    ...design.cranks.map((c) => c.id),
  ]);
  for (let i = 1; ; i++) {
    const id = `${prefix}${i}`;
    if (!used.has(id)) return id;
  }
}
