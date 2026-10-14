import { nextId } from '@/core/model/ids';
import {
  MAX_RPM,
  type Crank,
  type DesignDoc,
  type Joint,
  type JointId,
  type LegLayout,
  type Link,
  type LinkId,
} from '@/core/model/types';

/**
 * 設計データの編集操作(ED-2, ED-7)。すべて純関数で、元の DesignDoc は変更しない。
 * 変更がないときは同じオブジェクトを返す(履歴に空の操作を積まないため)。
 *
 * locked:動かせない・消せないジョイント(チュートリアル用)。
 */

export type Locked = ReadonlySet<JointId>;
const NONE: Locked = new Set();

export interface Selection {
  joints: JointId[];
  links: LinkId[];
}

export const EMPTY_SELECTION: Selection = { joints: [], links: [] };

/** 既存のジョイントか、新しく置く座標か */
export type PointRef = { joint: JointId } | { x: number; y: number };

const round = (v: number) => Math.round(v * 1e6) / 1e6;

function jointById(design: DesignDoc, id: JointId): Joint | undefined {
  return design.joints.find((j) => j.id === id);
}

export function addJoint(
  design: DesignDoc,
  p: { x: number; y: number },
  fixed = false,
): { design: DesignDoc; id: JointId } {
  const id = nextId(design, 'j');
  return {
    design: { ...design, joints: [...design.joints, { id, x: round(p.x), y: round(p.y), fixed }] },
    id,
  };
}

function resolve(design: DesignDoc, ref: PointRef): { design: DesignDoc; id: JointId } | null {
  if ('joint' in ref) return jointById(design, ref.joint) ? { design, id: ref.joint } : null;
  return addJoint(design, ref);
}

/** 点を動かす(locked は動かさない) */
export function moveJoints(
  design: DesignDoc,
  ids: readonly JointId[],
  dx: number,
  dy: number,
  locked: Locked = NONE,
): DesignDoc {
  if (dx === 0 && dy === 0) return design;
  const set = new Set(ids.filter((id) => !locked.has(id)));
  if (set.size === 0) return design;
  return {
    ...design,
    joints: design.joints.map((j) =>
      set.has(j.id) ? { ...j, x: round(j.x + dx), y: round(j.y + dy) } : j,
    ),
  };
}

export function setJointPosition(
  design: DesignDoc,
  id: JointId,
  x: number,
  y: number,
  locked: Locked = NONE,
): DesignDoc {
  const j = jointById(design, id);
  if (!j || locked.has(id) || (j.x === x && j.y === y)) return design;
  return {
    ...design,
    joints: design.joints.map((k) => (k.id === id ? { ...k, x: round(x), y: round(y) } : k)),
  };
}

/** 2 点を結ぶ棒を足す。既存のジョイントに置けばピンでつながる */
export function addLink(
  design: DesignDoc,
  a: PointRef,
  b: PointRef,
): { design: DesignDoc; linkId: LinkId | null; joints: JointId[] } {
  if ('joint' in a && 'joint' in b && a.joint === b.joint)
    return { design, linkId: null, joints: [] };
  const pa = 'joint' in a ? jointById(design, a.joint) : a;
  const pb = 'joint' in b ? jointById(design, b.joint) : b;
  if (!pa || !pb || Math.hypot(pa.x - pb.x, pa.y - pb.y) < 1e-6)
    return { design, linkId: null, joints: [] };
  if ('joint' in a && 'joint' in b) {
    // 同じ剛体上の 2 点を棒で結んでも意味がない
    const redundant = design.links.some(
      (l) => l.joints.includes(a.joint) && l.joints.includes(b.joint),
    );
    if (redundant) return { design, linkId: null, joints: [] };
  }
  const ra = resolve(design, a)!;
  const rb = resolve(ra.design, b)!;
  const linkId = nextId(rb.design, 'l');
  return {
    design: { ...rb.design, links: [...rb.design.links, { id: linkId, joints: [ra.id, rb.id] }] },
    linkId,
    joints: [ra.id, rb.id],
  };
}

/**
 * リンクに点を足して三角リンクなどの剛体にする。
 * 既存のジョイントを指定すればそのジョイントがリンクに固く付く(ピンではなく剛体の一部)。
 */
export function attachToLink(
  design: DesignDoc,
  linkId: LinkId,
  ref: PointRef,
): { design: DesignDoc; jointId: JointId | null } {
  const link = design.links.find((l) => l.id === linkId);
  if (!link) return { design, jointId: null };
  if ('joint' in ref && link.joints.includes(ref.joint)) return { design, jointId: null };
  const r = resolve(design, ref);
  if (!r) return { design, jointId: null };
  return {
    design: {
      ...r.design,
      links: r.design.links.map((l) =>
        l.id === linkId ? { ...l, joints: [...l.joints, r.id] } : l,
      ),
    },
    jointId: r.id,
  };
}

export function setFixed(
  design: DesignDoc,
  id: JointId,
  fixed: boolean,
  locked: Locked = NONE,
): DesignDoc {
  const j = jointById(design, id);
  if (!j || j.fixed === fixed || locked.has(id)) return design;
  let next: DesignDoc = {
    ...design,
    joints: design.joints.map((k) => (k.id === id ? { ...k, fixed } : k)),
  };
  // 固定を外したらその点を軸にしていたクランクは外す
  if (!fixed) next = { ...next, cranks: next.cranks.filter((c) => c.pivot !== id) };
  return next;
}

export function toggleFixed(design: DesignDoc, id: JointId, locked: Locked = NONE): DesignDoc {
  const j = jointById(design, id);
  return j ? setFixed(design, id, !j.fixed, locked) : design;
}

export type CrankFailure = 'no-link' | 'no-fixed' | 'multi-fixed';

/**
 * リンクをモーターのクランクにする(MVP はクランク 1 つ:既存のクランクは置き換える)。
 * リンクに固定点がちょうど 1 つ必要(それが回転軸になる)。
 */
export function setCrank(
  design: DesignDoc,
  linkId: LinkId,
): { design: DesignDoc; ok: true } | { design: DesignDoc; ok: false; reason: CrankFailure } {
  const link = design.links.find((l) => l.id === linkId);
  if (!link) return { design, ok: false, reason: 'no-link' };
  const fixed = link.joints.filter((id) => jointById(design, id)?.fixed);
  if (fixed.length === 0) return { design, ok: false, reason: 'no-fixed' };
  if (fixed.length > 1) return { design, ok: false, reason: 'multi-fixed' };
  const existing = design.cranks[0];
  if (
    existing &&
    existing.link === linkId &&
    existing.pivot === fixed[0] &&
    design.cranks.length === 1
  )
    return { design, ok: true };
  const crank: Crank = {
    id: existing?.id ?? nextId(design, 'c'),
    link: linkId,
    pivot: fixed[0]!,
    phase: 0,
  };
  return { design: { ...design, cranks: [crank] }, ok: true };
}

export function removeCrank(design: DesignDoc, linkId?: LinkId): DesignDoc {
  const cranks = design.cranks.filter((c) => linkId !== undefined && c.link !== linkId);
  return cranks.length === design.cranks.length ? design : { ...design, cranks };
}

/** クランク道具のクリック:クランクのリンクなら外し、そうでなければクランクにする */
export function toggleCrank(
  design: DesignDoc,
  linkId: LinkId,
): { design: DesignDoc; ok: true } | { design: DesignDoc; ok: false; reason: CrankFailure } {
  if (design.cranks.some((c) => c.link === linkId))
    return { design: removeCrank(design, linkId), ok: true };
  return setCrank(design, linkId);
}

export function setFoot(design: DesignDoc, id: JointId | null): DesignDoc {
  if (id !== null && !jointById(design, id)) return design;
  if (design.foot === id) return design;
  return { ...design, foot: id };
}

/** 参照の切れた要素を掃除する(削除・結合の後に呼ぶ) */
function prune(
  design: DesignDoc,
  locked: Locked,
  orphanCandidates: ReadonlySet<JointId>,
): DesignDoc {
  const ids = new Set(design.joints.map((j) => j.id));
  let links: Link[] = design.links
    .map((l) => ({ ...l, joints: [...new Set(l.joints.filter((id) => ids.has(id)))] }))
    .filter((l) => l.joints.length >= 2);
  // 同じ 2 点を結ぶ棒の重複は 1 本にする
  const seen = new Set<string>();
  links = links.filter((l) => {
    if (l.joints.length !== 2) return true;
    const key = [...l.joints].sort().join('|');
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
  // どのリンクにも属さなくなった(固定でない)点は消す
  const used = new Set(links.flatMap((l) => l.joints));
  const joints = design.joints.filter(
    (j) => j.fixed || used.has(j.id) || locked.has(j.id) || !orphanCandidates.has(j.id),
  );
  const jointIds = new Set(joints.map((j) => j.id));
  const linkById = new Map(links.map((l) => [l.id, l]));
  const cranks = design.cranks.filter((c) => {
    const l = linkById.get(c.link);
    return l !== undefined && jointIds.has(c.pivot) && l.joints.includes(c.pivot);
  });
  const foot = design.foot && jointIds.has(design.foot) ? design.foot : null;
  return { ...design, joints, links, cranks, foot };
}

/** ジョイントとリンクを消す。消えた点を含む棒、棒を失ったクランク、浮いた点も連鎖して消える */
export function deleteItems(design: DesignDoc, sel: Selection, locked: Locked = NONE): DesignDoc {
  const dropJ = new Set(sel.joints.filter((id) => !locked.has(id)));
  const dropL = new Set(sel.links);
  const hits =
    design.joints.some((j) => dropJ.has(j.id)) || design.links.some((l) => dropL.has(l.id));
  if (!hits) return design;
  const touched = new Set<JointId>();
  for (const l of design.links) {
    if (dropL.has(l.id) || l.joints.some((id) => dropJ.has(id)))
      l.joints.forEach((id) => touched.add(id));
  }
  const next: DesignDoc = {
    ...design,
    joints: design.joints.filter((j) => !dropJ.has(j.id)),
    links: design.links.filter((l) => !dropL.has(l.id)),
  };
  return prune(next, locked, touched);
}

/** drop を keep に重ねてピンでつなぐ(drop は消え、drop を使っていた棒は keep を使う) */
export function mergeJoints(
  design: DesignDoc,
  keep: JointId,
  drop: JointId,
  locked: Locked = NONE,
): DesignDoc {
  if (keep === drop || locked.has(drop)) return design;
  const k = jointById(design, keep);
  const d = jointById(design, drop);
  if (!k || !d) return design;
  const next: DesignDoc = {
    ...design,
    joints: design.joints
      .filter((j) => j.id !== drop)
      .map((j) => (j.id === keep && d.fixed && !j.fixed ? { ...j, fixed: true } : j)),
    links: design.links.map((l) => ({
      ...l,
      joints: l.joints.map((id) => (id === drop ? keep : id)),
    })),
    cranks: design.cranks.map((c) => (c.pivot === drop ? { ...c, pivot: keep } : c)),
    foot: design.foot === drop ? keep : design.foot,
  };
  return prune(next, locked, new Set([keep]));
}

/** 2 点の棒の長さ(cm)。2 点でなければ null */
export function linkLength(design: DesignDoc, linkId: LinkId): number | null {
  const l = design.links.find((x) => x.id === linkId);
  if (!l || l.joints.length !== 2) return null;
  const a = jointById(design, l.joints[0]!);
  const b = jointById(design, l.joints[1]!);
  if (!a || !b) return null;
  return Math.hypot(b.x - a.x, b.y - a.y);
}

export const MIN_LINK_LENGTH = 0.5;
export const MAX_LINK_LENGTH = 500;

/**
 * 棒の長さを数値で決める(E-02)。棒の向きはそのままで、動かせる側の端点を動かす。
 * 動かす端点の優先順:固定でない 2 番目 → 固定でない 1 番目 → 2 番目 → 1 番目(locked は除く)。
 */
export function setLinkLength(
  design: DesignDoc,
  linkId: LinkId,
  length: number,
  locked: Locked = NONE,
): DesignDoc {
  const l = design.links.find((x) => x.id === linkId);
  if (!l || l.joints.length !== 2 || !Number.isFinite(length)) return design;
  const L = Math.min(MAX_LINK_LENGTH, Math.max(MIN_LINK_LENGTH, length));
  const [ia, ib] = l.joints as [JointId, JointId];
  const a = jointById(design, ia);
  const b = jointById(design, ib);
  if (!a || !b) return design;
  const order: [Joint, Joint][] = [
    [b, a],
    [a, b],
  ];
  const movable = (j: Joint) => !locked.has(j.id);
  const pick =
    order.find(([m]) => movable(m) && !m.fixed) ?? order.find(([m]) => movable(m)) ?? null;
  if (!pick) return design;
  const [moving, anchor] = pick;
  let dx = moving.x - anchor.x;
  let dy = moving.y - anchor.y;
  const d = Math.hypot(dx, dy);
  if (d < 1e-9) {
    dx = 1;
    dy = 0;
  } else {
    dx /= d;
    dy /= d;
  }
  return setJointPosition(design, moving.id, anchor.x + dx * L, anchor.y + dy * L, locked);
}

export function setMotorRpm(design: DesignDoc, rpm: number): DesignDoc {
  if (!Number.isFinite(rpm)) return design;
  const v = Math.round(Math.min(MAX_RPM, Math.max(-MAX_RPM, rpm)) * 10) / 10;
  return v === design.motor.rpm ? design : { ...design, motor: { ...design.motor, rpm: v } };
}

export const MAX_LEG_COUNT = 8;

/** 脚列の設定(E-06)。範囲外の値は丸める */
export function setLegs(design: DesignDoc, patch: Partial<LegLayout>): DesignDoc {
  const cur = design.legs;
  const num = (v: number | undefined, fallback: number) =>
    v === undefined || !Number.isFinite(v) ? fallback : v;
  const legs: LegLayout = {
    count: Math.min(MAX_LEG_COUNT, Math.max(1, Math.round(num(patch.count, cur.count)))),
    phaseStepDeg: Math.min(360, Math.max(0, num(patch.phaseStepDeg, cur.phaseStepDeg))),
    spacing: Math.min(200, Math.max(1, num(patch.spacing, cur.spacing))),
    mirrorX: patch.mirrorX ?? cur.mirrorX,
  };
  const same =
    legs.count === cur.count &&
    legs.phaseStepDeg === cur.phaseStepDeg &&
    legs.spacing === cur.spacing &&
    legs.mirrorX === cur.mirrorX;
  return same ? design : { ...design, legs };
}

/** 選択に含まれるジョイント(リンクの点も含む) */
export function selectionJoints(design: DesignDoc, sel: Selection): JointId[] {
  const set = new Set(sel.joints);
  for (const l of design.links) if (sel.links.includes(l.id)) l.joints.forEach((j) => set.add(j));
  return design.joints.filter((j) => set.has(j.id)).map((j) => j.id);
}

/**
 * 左右反転(x → 2·axisX − x)。axisX を省くと対象の点の範囲の中央で反転する。
 */
export function mirrorJoints(
  design: DesignDoc,
  ids: readonly JointId[],
  axisX?: number,
  locked: Locked = NONE,
): DesignDoc {
  const set = new Set(ids.filter((id) => !locked.has(id)));
  const pts = design.joints.filter((j) => set.has(j.id));
  if (pts.length === 0) return design;
  const ax = axisX ?? (Math.min(...pts.map((j) => j.x)) + Math.max(...pts.map((j) => j.x))) / 2;
  const next = {
    ...design,
    joints: design.joints.map((j) => (set.has(j.id) ? { ...j, x: round(2 * ax - j.x) } : j)),
  };
  return next.joints.every((j, i) => j.x === design.joints[i]!.x) ? design : next;
}

/** 選択の左右反転。選択がなければ機構全体をクランク軸(なければ中央)で反転する */
export function mirrorSelection(
  design: DesignDoc,
  sel: Selection,
  locked: Locked = NONE,
): DesignDoc {
  const ids = selectionJoints(design, sel);
  if (ids.length > 0) return mirrorJoints(design, ids, undefined, locked);
  const pivot = design.cranks[0] ? jointById(design, design.cranks[0].pivot) : undefined;
  return mirrorJoints(
    design,
    design.joints.map((j) => j.id),
    pivot?.x,
    locked,
  );
}

/** コピーした部品(id は元のまま。貼り付けのときに振り直す) */
export interface Clipboard {
  joints: Joint[];
  links: Link[];
  cranks: Crank[];
  foot: JointId | null;
}

export function copyItems(design: DesignDoc, sel: Selection): Clipboard | null {
  const ids = new Set(selectionJoints(design, sel));
  if (ids.size === 0) return null;
  const links = design.links.filter((l) => l.joints.every((j) => ids.has(j)));
  const linkIds = new Set(links.map((l) => l.id));
  return {
    joints: design.joints.filter((j) => ids.has(j.id)).map((j) => ({ ...j })),
    links: links.map((l) => ({ ...l, joints: [...l.joints] })),
    cranks: design.cranks
      .filter((c) => linkIds.has(c.link) && ids.has(c.pivot))
      .map((c) => ({ ...c })),
    foot: design.foot && ids.has(design.foot) ? design.foot : null,
  };
}

/**
 * 貼り付け:id を振り直し、offset だけずらして足す。
 * クランクと脚先は、貼り付け先にまだなければ引き継ぐ(MVP はクランク 1 つ)。
 */
export function pasteItems(
  design: DesignDoc,
  clip: Clipboard,
  offset: { dx: number; dy: number },
): { design: DesignDoc; selection: Selection } {
  let d = design;
  const jmap = new Map<JointId, JointId>();
  for (const j of clip.joints) {
    const id = nextId(d, 'j');
    jmap.set(j.id, id);
    d = {
      ...d,
      joints: [...d.joints, { ...j, id, x: round(j.x + offset.dx), y: round(j.y + offset.dy) }],
    };
  }
  const lmap = new Map<LinkId, LinkId>();
  for (const l of clip.links) {
    const joints = l.joints.map((j) => jmap.get(j)).filter((j) => j !== undefined);
    if (joints.length < 2) continue;
    const id = nextId(d, 'l');
    lmap.set(l.id, id);
    d = { ...d, links: [...d.links, { id, joints }] };
  }
  if (d.cranks.length === 0) {
    for (const c of clip.cranks) {
      const link = lmap.get(c.link);
      const pivot = jmap.get(c.pivot);
      if (!link || !pivot) continue;
      d = { ...d, cranks: [{ ...c, id: nextId(d, 'c'), link, pivot }] };
      break;
    }
  }
  if (d.foot === null && clip.foot) d = { ...d, foot: jmap.get(clip.foot) ?? null };
  return { design: d, selection: { joints: [...jmap.values()], links: [...lmap.values()] } };
}

/** 選択から、存在しなくなった id を除く */
export function sanitizeSelection(design: DesignDoc, sel: Selection): Selection {
  const j = new Set(design.joints.map((x) => x.id));
  const l = new Set(design.links.map((x) => x.id));
  const joints = sel.joints.filter((id) => j.has(id));
  const links = sel.links.filter((id) => l.has(id));
  return joints.length === sel.joints.length && links.length === sel.links.length
    ? sel
    : { joints, links };
}
