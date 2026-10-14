import { dyadPoint, JANSEN_LENGTHS, jansenLeg } from '@/core/model/presets';
import type { DesignDoc, Joint, LegLayout, Link } from '@/core/model/types';
import { DESIGN_VERSION } from '@/core/model/types';
import { t } from '@/i18n';

/**
 * ステージで使う設計(参考解・壊れた機械・ヒントの影)を作る関数。
 * 単位は cm、クランク角 0 の姿勢。どの関数も新しいオブジェクトを返す(共有しない)。
 * 設計の名前はプレイヤーに見えるので i18n の文言から付ける(作った時点の言語で保存される)。
 */

/**
 * 章 1 の脚列(固定)と章 2 の既定値。ヤンセン型見本機と同じ両側配置:前後反転ペアを 6 組・120°ずらし
 * (計 12 脚)。位相 0/120/240 の組が左右に 1 つずつ来るので、支えが「線」でなく「面」になる。
 * 片側 3 組(6 脚)では接地する脚先が一直線に並び、本物の sim で 2 秒ほどで横に倒れる(TUNE-1)。
 */
export const STANDARD_LEGS: LegLayout = { count: 6, phaseStepDeg: 120, spacing: 12, mirrorX: true };

/** 脚が 1 本だけ(章 2「脚をふやす」の壊れた機械) */
export const SINGLE_LEG: LegLayout = { count: 1, phaseStepDeg: 0, spacing: 22, mirrorX: false };

export interface FourBarLegParams {
  name: string;
  /** クランク(O2-A)、連結棒(A-B)、揺動節(O4-B)、地節(O2-O4)の長さ(cm) */
  crank: number;
  coupler: number;
  rocker: number;
  ground: number;
  /** 地節の向き(度)。0 で O4 が O2 の真右 */
  groundAngleDeg: number;
  /** 脚先 F の位置:連結棒 A→B の向きに u、その左法線の向きに v(cm) */
  foot: { u: number; v: number };
  /** B を 2 円の交点のどちらに取るか */
  branch: 'up' | 'down';
  rpm: number;
  legs?: LegLayout;
}

/** 設計データは 0.01cm に丸める(手で読める数にする) */
const r2 = (v: number) => Math.round(v * 100) / 100;

/**
 * 四節リンクの脚(てこクランク)。クランク角 0 でクランクピン A は軸 O2 の真上。
 * ジョイント id:O2(クランク軸)、O4(揺動節の軸)、A、B、F(脚先)。
 * リンク id:crank、coupler(A-B-F の三角プレート)、rocker。
 */
export function fourBarLeg(p: FourBarLegParams): DesignDoc {
  const al = (p.groundAngleDeg * Math.PI) / 180;
  const O2 = { x: 0, y: 0 };
  const O4 = { x: p.ground * Math.cos(al), y: p.ground * Math.sin(al) };
  const A = { x: 0, y: p.crank };
  const B = dyadPoint(A, p.coupler, O4, p.rocker, p.branch);
  const ex = (B.x - A.x) / p.coupler;
  const ey = (B.y - A.y) / p.coupler;
  const F = { x: A.x + p.foot.u * ex - p.foot.v * ey, y: A.y + p.foot.u * ey + p.foot.v * ex };
  const joint = (id: string, q: { x: number; y: number }, fixed = false): Joint => ({
    id,
    x: r2(q.x),
    y: r2(q.y),
    fixed,
  });
  return {
    version: DESIGN_VERSION,
    name: p.name,
    joints: [
      joint('O2', O2, true),
      joint('O4', O4, true),
      joint('A', A),
      joint('B', B),
      joint('F', F),
    ],
    links: [
      { id: 'crank', joints: ['O2', 'A'] },
      { id: 'coupler', joints: ['A', 'B', 'F'] },
      { id: 'rocker', joints: ['O4', 'B'] },
    ],
    cranks: [{ id: 'motor', link: 'crank', pivot: 'O2', phase: 0 }],
    foot: 'F',
    motor: { rpm: p.rpm },
    legs: { ...(p.legs ?? STANDARD_LEGS) },
  };
}

/**
 * 基本の四節リンクの脚。脚先の軌道は底が平ら(1 周の 46%)で、歩幅 約 39cm・足上げ 約 12cm。
 * 脚先は軸から 約 46cm 下。時計回り(rpm < 0)で +x へ歩く。
 */
export function basicLeg(legs: LegLayout = STANDARD_LEGS): DesignDoc {
  return fourBarLeg({
    name: t('game.design.basicLeg'),
    crank: 15,
    coupler: 45,
    rocker: 20,
    ground: 45,
    groundAngleDeg: 30,
    foot: { u: 40, v: -50 },
    branch: 'down',
    rpm: -60,
    legs,
  });
}

/**
 * 足を高く上げる四節リンクの脚(c1-s5 と章 2 の四節ステージの参考解)。歩幅 約 46cm・足上げ 約 22cm。
 * 脚先は軸から 約 71cm 下。時計回り(rpm < 0)で +x へ歩く。
 *
 * 段差を越えられるかは足上げの高さだけでなく軌道の形で決まる(TUNE-1 の実測)。脚先が低いまま前へ
 * 進んで段差の側面に突き当たると、クランクが止まって動けなくなる。この脚は前後の端で脚先を
 * 「後ろへ引きながら」上げ下ろしするので、前後反転した脚も含めて段差の側面に突き当たりにくい。
 * 寸法は、軌道の形の指標で絞り込んだ候補を、本物の sim で段差 4〜16cm・溝・スタート位置 16 通りに
 * 通して選んだ(段差 14cm と溝のコースで 16/16 合格)。以前の寸法(クランク 18・連結棒 30・揺動節 35)は
 * 足上げ 20cm でも前の端で脚先を 2cm の高さで引きずるため、4cm の段差でも止まった。
 */
export function highStepLeg(legs: LegLayout = STANDARD_LEGS): DesignDoc {
  return fourBarLeg({
    name: t('game.design.highStepLeg'),
    crank: 21,
    coupler: 47,
    rocker: 26,
    ground: 49,
    groundAngleDeg: 47,
    foot: { u: 12, v: -75 },
    branch: 'down',
    rpm: -60,
    legs,
  });
}

/** ヤンセンリンクの機械(見本機と同じ脚列)。歩幅 約 57cm・足上げ 約 22cm */
export function jansenMachine(legs: LegLayout = STANDARD_LEGS): DesignDoc {
  return { ...jansenLeg(JANSEN_LENGTHS, { ...legs }), name: t('game.design.jansen') };
}

// ---- 設計の加工(壊れた機械を作る・影を切り出す) ----

function clone(design: DesignDoc): DesignDoc {
  return structuredClone(design);
}

export function withName(design: DesignDoc, name: string): DesignDoc {
  return { ...clone(design), name };
}

/** リンクを取り除く(そのリンクのクランクも消える) */
export function withoutLinks(design: DesignDoc, linkIds: string[]): DesignDoc {
  const d = clone(design);
  d.links = d.links.filter((l) => !linkIds.includes(l.id));
  d.cranks = d.cranks.filter((c) => !linkIds.includes(c.link));
  return d;
}

export function withExtraLinks(design: DesignDoc, links: Link[]): DesignDoc {
  const d = clone(design);
  d.links.push(...links.map((l) => ({ id: l.id, joints: [...l.joints] })));
  return d;
}

export function withJointAt(design: DesignDoc, jointId: string, x: number, y: number): DesignDoc {
  const d = clone(design);
  d.joints = d.joints.map((j) => (j.id === jointId ? { ...j, x, y } : j));
  return d;
}

export function withLegs(design: DesignDoc, legs: LegLayout): DesignDoc {
  return { ...clone(design), legs: { ...legs } };
}

export function withRpm(design: DesignDoc, rpm: number): DesignDoc {
  return { ...clone(design), motor: { rpm } };
}

/**
 * 設計の一部を切り出す(ヒントの影)。指定したリンクとその点、追加で指定した点だけを残す。
 * クランクはリンクが残っていれば残す。脚先は残った点に含まれるときだけ残す。
 */
export function subDesign(
  design: DesignDoc,
  pick: { links?: string[]; joints?: string[] },
): DesignDoc {
  const links = design.links.filter((l) => pick.links?.includes(l.id));
  const keep = new Set<string>(pick.joints ?? []);
  for (const l of links) for (const id of l.joints) keep.add(id);
  return {
    version: design.version,
    name: design.name,
    joints: design.joints.filter((j) => keep.has(j.id)).map((j) => ({ ...j })),
    links: links.map((l) => ({ id: l.id, joints: [...l.joints] })),
    cranks: design.cranks.filter((c) => links.some((l) => l.id === c.link)).map((c) => ({ ...c })),
    foot: design.foot && keep.has(design.foot) ? design.foot : null,
    motor: { ...design.motor },
    legs: { ...design.legs },
  };
}

/** 固定点とクランクだけ(ヒント 2「部品配置の影」の基本形) */
export function frameGhost(design: DesignDoc): DesignDoc {
  return subDesign(design, {
    links: design.cranks.map((c) => c.link),
    joints: design.joints.filter((j) => j.fixed).map((j) => j.id),
  });
}
