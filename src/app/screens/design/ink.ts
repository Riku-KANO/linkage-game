import type { MechanismAnalysis } from '@/core/kinematics';
import type { DesignDoc } from '@/core/model/types';
import { linkOutlineOrder, trajectoryExtent } from '@/editor/render';
import { toScreen, type Camera, type WorldRect } from '@/editor/viewport';
import type { DesignRect } from '@/scene/rig/paper';

/**
 * 3D の製図用紙に描く「インクの図面」(INT-1)。今の設計を、設計画面のエディタ(DesignCanvas)と
 * 同じ見た目で Canvas 2D に描き、紙の上に重ねる板のテクスチャにする。
 * 設計画面に降りきってエディタの SVG に切り替わる瞬間に線が変わらないよう、太さ(画面 px)・色・
 * 重なり順をエディタに合わせてある(editor.css / DesignCanvas.tsx の値。変えたらここも合わせる)。
 * 描くのは静止した図面だけ:軌道・リンク・ピン・固定点・クランクの矢印・脚先。
 * 動いている機構・寸法線・バッジはエディタだけが描く(切り替わりでふわっと現れる)。
 */

export const INK_STYLE = {
  ink: '#2b2118',
  paper: '#f2e8d2',
  crank: '#e0761c',
  crankSoft: '#fbe2c4',
  error: '#d23d29',
  errorSoft: '#f8d4cc',
  live: '#2a77a6',
  foot: '#17577f',
  font: "'Hiragino Sans', 'Noto Sans JP', system-ui, sans-serif",
} as const;

export type InkStyle = { readonly [K in keyof typeof INK_STYLE]: string };

/** 線の太さ・大きさ(画面 px)。editor.css と同じ */
const PX = {
  linkOuter: 9,
  linkInner: 5,
  pinR: 4.5,
  pinStroke: 2,
  footRing: 8.5,
  footRingStroke: 2,
  traj: 1,
  trajFoot: 2.5,
  trajFail: 1.5,
  groundStroke: 1.5,
  hatch: 1,
  crankArrow: 2,
  labelSize: 11,
  labelHalo: 3,
} as const;

/** 図面の外側に足す余白(画面 px):線の太さ、固定点の記号(下に 18px)、クランクの矢印、脚先のラベル */
export const INK_MARGIN_PX = 40;

export interface InkRegion {
  /** テクスチャが覆う設計座標の範囲(cm) */
  rect: WorldRect;
  /** 設計 cm → 描画座標(設計画面での画面 px 相当。テクスチャ px はこれの k 倍) */
  cam: Camera;
  /** 画面 px あたりのテクスチャ px(画素比。大きすぎるときは下げる) */
  k: number;
  /** テクスチャの大きさ(px) */
  width: number;
  height: number;
  /** 紙の範囲(描画座標)。これより外は描かない(エディタの SVG も紙の縁で切れる) */
  clip: { x: number; y: number; w: number; h: number };
}

/** 軌道を描く点(エディタと同じ条件:クランクがあり、固定・浮いた点でなく、少しでも動く点) */
export function trajectoryJoints(analysis: MechanismAnalysis): number[] {
  const m = analysis.compiled;
  if (m.design.cranks.length === 0) return [];
  const floating = new Set(m.floating);
  const out: number[] = [];
  m.jointIds.forEach((_, i) => {
    if (m.fixed[i] || floating.has(i)) return;
    if (trajectoryExtent(analysis.cycle, i) < 0.05) return;
    out.push(i);
  });
  // 脚先をいちばん上に
  return out.sort((a, b) => Number(a === m.footIndex) - Number(b === m.footIndex));
}

/** 図面が占める設計座標の範囲(設計姿勢の点と、組み立てられた区間の軌道)。点がなければ null */
export function inkBounds(design: DesignDoc, analysis: MechanismAnalysis): WorldRect | null {
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  const add = (x: number, y: number) => {
    if (!Number.isFinite(x) || !Number.isFinite(y)) return;
    if (x < minX) minX = x;
    if (x > maxX) maxX = x;
    if (y < minY) minY = y;
    if (y > maxY) maxY = y;
  };
  for (const j of design.joints) add(j.x, j.y);
  const { cycle } = analysis;
  for (const i of trajectoryJoints(analysis)) {
    cycle.positions.forEach((p, s) => {
      if (cycle.ok[s]) add(p[i * 2]!, p[i * 2 + 1]!);
    });
  }
  return Number.isFinite(minX) ? { minX, minY, maxX, maxY } : null;
}

export interface InkRegionOptions {
  marginPx?: number;
  /** テクスチャの一辺の上限(px) */
  maxTexture?: number;
  /** テクスチャの大きさをこの倍数に切り上げる(編集のたびに作り直さないため) */
  quantum?: number;
  /**
   * 設計画面での紙の左上の画面位置(CSS px)。渡すとテクスチャの縁を画面の画素の境目にそろえ、
   * 降りきったときテクスチャの画素と画面の画素がずれずに重なる(にじまない)
   */
  origin?: { x: number; y: number };
}

/**
 * 図面のテクスチャが覆う範囲と解像度。設計画面での 1 cm の画面 px(pxPerCm)と画素比(dpr)から、
 * 降りきったときにテクスチャの 1 px が画面の 1 画素にちょうど重なる大きさにする。
 * 範囲は図面の外接矩形+余白を紙で切り取ったもの。紙の外だけなら null。
 */
export function inkRegion(
  bounds: WorldRect,
  paper: DesignRect,
  pxPerCm: number,
  dpr: number,
  opts: InkRegionOptions = {},
): InkRegion | null {
  const marginPx = opts.marginPx ?? INK_MARGIN_PX;
  const maxTexture = opts.maxTexture ?? 4096;
  const quantum = opts.quantum ?? 64;
  if (!(pxPerCm > 0)) return null;
  const pad = marginPx / pxPerCm;
  let minX = Math.max(paper.xMin, bounds.minX - pad);
  const maxX = Math.min(paper.xMax, bounds.maxX + pad);
  const minY = Math.max(paper.yMin, bounds.minY - pad);
  let maxY = Math.min(paper.yMax, bounds.maxY + pad);
  if (!(maxX > minX && maxY > minY)) return null;
  const k0 = Math.max(1, dpr);
  const k = Math.max(
    0.25,
    Math.min(k0, maxTexture / ((maxX - minX) * pxPerCm), maxTexture / ((maxY - minY) * pxPerCm)),
  );
  if (opts.origin) {
    // 左上の角を画面の画素の境目へ(左・上へ 1 画素未満広げる)
    const sx = opts.origin.x + (minX - paper.xMin) * pxPerCm;
    const sy = opts.origin.y + (paper.yMax - maxY) * pxPerCm;
    minX -= (sx - Math.floor(sx * k) / k) / pxPerCm;
    maxY += (sy - Math.floor(sy * k) / k) / pxPerCm;
  }
  const wPx = (maxX - minX) * pxPerCm;
  const hPx = (maxY - minY) * pxPerCm;
  const width = Math.min(maxTexture, Math.ceil((wPx * k) / quantum) * quantum);
  const height = Math.min(maxTexture, Math.ceil((hPx * k) / quantum) * quantum);
  // 切り上げたぶん右と下に広げる(左上の角は図面に合わせたまま)
  const rect: WorldRect = {
    minX,
    maxY,
    maxX: minX + width / k / pxPerCm,
    minY: maxY - height / k / pxPerCm,
  };
  const cam: Camera = { scale: pxPerCm, ox: -minX * pxPerCm, oy: maxY * pxPerCm };
  const c0 = toScreen(cam, paper.xMin, paper.yMax);
  const c1 = toScreen(cam, paper.xMax, paper.yMin);
  return {
    rect,
    cam,
    k,
    width,
    height,
    clip: { x: c0.x, y: c0.y, w: c1.x - c0.x, h: c1.y - c0.y },
  };
}

type Ctx = Pick<
  CanvasRenderingContext2D,
  | 'save'
  | 'restore'
  | 'setTransform'
  | 'clearRect'
  | 'beginPath'
  | 'closePath'
  | 'rect'
  | 'clip'
  | 'moveTo'
  | 'lineTo'
  | 'arc'
  | 'stroke'
  | 'fill'
  | 'setLineDash'
  | 'strokeText'
  | 'fillText'
> & {
  strokeStyle: CanvasRenderingContext2D['strokeStyle'];
  fillStyle: CanvasRenderingContext2D['fillStyle'];
  lineWidth: number;
  lineCap: CanvasLineCap;
  lineJoin: CanvasLineJoin;
  globalAlpha: number;
  font: string;
  textAlign: CanvasTextAlign;
  textBaseline: CanvasTextBaseline;
};

type Pt = { x: number; y: number };

/**
 * 今の設計を図面として描く(エディタの設計姿勢の層と同じ順:軌道 → リンク → 固定点・ピン・脚先)。
 * ctx はテクスチャの Canvas(大きさ region.width × region.height)。
 */
export function drawDesignInk(
  ctx: Ctx,
  design: DesignDoc,
  analysis: MechanismAnalysis,
  region: InkRegion,
  footLabel: string,
  style: InkStyle = INK_STYLE,
): void {
  const { cam, k } = region;
  ctx.setTransform(k, 0, 0, k, 0, 0);
  ctx.clearRect(0, 0, region.width / k, region.height / k);
  ctx.save();
  ctx.beginPath();
  ctx.rect(region.clip.x, region.clip.y, region.clip.w, region.clip.h);
  ctx.clip();
  ctx.lineJoin = 'round';

  const S = (x: number, y: number) => toScreen(cam, x, y);
  const m = analysis.compiled;
  const cycle = analysis.cycle;

  // 軌道(組み立てられた区間と、できない区間)
  ctx.lineCap = 'butt';
  for (const i of trajectoryJoints(analysis)) {
    const foot = i === m.footIndex;
    const n = cycle.positions.length;
    const pt = (s: number) => {
      const p = cycle.positions[s]!;
      return S(p[i * 2]!, p[i * 2 + 1]!);
    };
    for (const ok of [true, false]) {
      ctx.beginPath();
      let any = false;
      let open = false;
      for (let s = 0; s < n; s++) {
        const next = (s + 1) % n;
        const segOk = cycle.ok[s]! && cycle.ok[next]!;
        if (segOk !== ok) {
          open = false;
          continue;
        }
        const a = pt(s);
        const b = pt(next);
        if (!open) ctx.moveTo(a.x, a.y);
        ctx.lineTo(b.x, b.y);
        open = true;
        any = true;
      }
      if (!any) continue;
      if (ok) {
        ctx.strokeStyle = foot ? style.foot : style.live;
        ctx.lineWidth = foot ? PX.trajFoot : PX.traj;
        ctx.globalAlpha = foot ? 0.9 : 0.35;
        ctx.setLineDash(foot ? [] : [3, 3]);
      } else {
        ctx.strokeStyle = style.error;
        ctx.lineWidth = PX.trajFail;
        ctx.globalAlpha = 0.85;
        ctx.setLineDash([4, 4]);
      }
      ctx.stroke();
    }
  }
  ctx.globalAlpha = 1;
  ctx.setLineDash([]);
  ctx.lineCap = 'round';

  // リンク(外側のインク → 内側の紙色で、中が抜けた棒に見せる。3 点以上は板)
  const crankLinks = new Set(design.cranks.map((c) => c.link));
  const problemLinks = new Set(analysis.problemLinks);
  design.links.forEach((l, li) => {
    const pts = linkOutlineOrder(design, li).map((i) =>
      S(design.joints[i]!.x, design.joints[i]!.y),
    );
    if (pts.length < 2) return;
    const crank = crankLinks.has(l.id);
    const problem = problemLinks.has(l.id);
    const shape = () => {
      ctx.beginPath();
      ctx.moveTo(pts[0]!.x, pts[0]!.y);
      for (let q = 1; q < pts.length; q++) ctx.lineTo(pts[q]!.x, pts[q]!.y);
      if (pts.length > 2) ctx.closePath();
    };
    if (pts.length > 2) {
      shape();
      ctx.fillStyle = crank ? 'rgba(224, 118, 28, 0.18)' : 'rgba(43, 33, 24, 0.1)';
      ctx.fill();
    }
    shape();
    ctx.strokeStyle = problem ? style.error : crank ? style.crank : style.ink;
    ctx.lineWidth = PX.linkOuter;
    ctx.stroke();
    ctx.strokeStyle = problem ? style.errorSoft : crank ? style.crankSoft : style.paper;
    ctx.lineWidth = PX.linkInner;
    ctx.stroke();
  });

  // クランクの回転方向の矢印
  const jointPos = new Map(design.joints.map((j) => [j.id, S(j.x, j.y)]));
  for (const c of design.cranks) {
    const p = jointPos.get(c.pivot);
    if (p) drawCrankArrow(ctx, p, design.motor.rpm >= 0, style);
  }

  // ジョイント:固定点の記号、脚先の輪とラベル、ピン
  const problemJoints = new Set(analysis.problemJoints);
  for (const j of design.joints) {
    const p = jointPos.get(j.id)!;
    if (j.fixed) drawGround(ctx, p, style);
    if (design.foot === j.id) {
      ctx.beginPath();
      ctx.arc(p.x, p.y, PX.footRing, 0, Math.PI * 2);
      ctx.strokeStyle = style.foot;
      ctx.lineWidth = PX.footRingStroke;
      ctx.stroke();
      ctx.font = `600 ${PX.labelSize}px ${style.font}`;
      ctx.textAlign = 'start';
      ctx.textBaseline = 'alphabetic';
      ctx.strokeStyle = style.paper;
      ctx.lineWidth = PX.labelHalo;
      ctx.strokeText(footLabel, p.x + 11, p.y + 16);
      ctx.fillStyle = style.foot;
      ctx.fillText(footLabel, p.x + 11, p.y + 16);
    }
    const problem = problemJoints.has(j.id);
    ctx.beginPath();
    ctx.arc(p.x, p.y, PX.pinR, 0, Math.PI * 2);
    ctx.fillStyle = problem ? style.errorSoft : style.paper;
    ctx.fill();
    ctx.strokeStyle = problem ? style.error : style.ink;
    ctx.lineWidth = PX.pinStroke;
    ctx.stroke();
  }
  ctx.restore();
}

/** 固定点の記号(DesignCanvas の GroundSymbol と同じ形) */
function drawGround(ctx: Ctx, p: Pt, style: InkStyle) {
  const h = 13;
  const w = 8;
  const y = p.y + h;
  ctx.beginPath();
  ctx.moveTo(p.x, p.y);
  ctx.lineTo(p.x - w, y);
  ctx.lineTo(p.x + w, y);
  ctx.closePath();
  ctx.fillStyle = style.paper;
  ctx.fill();
  ctx.strokeStyle = style.ink;
  ctx.lineWidth = PX.groundStroke;
  ctx.stroke();
  ctx.beginPath();
  ctx.moveTo(p.x - 12, y);
  ctx.lineTo(p.x + 12, y);
  for (let i = 0; i < 5; i++) {
    const x = p.x - 10 + i * 5;
    ctx.moveTo(x, y + 5);
    ctx.lineTo(x + 4, y);
  }
  ctx.lineWidth = PX.hatch;
  ctx.lineCap = 'butt';
  ctx.stroke();
  ctx.lineCap = 'round';
}

/** クランク軸の回転方向の矢印(DesignCanvas の CrankArrow と同じ形) */
function drawCrankArrow(ctx: Ctx, p: Pt, ccw: boolean, style: InkStyle) {
  const r = 17;
  const a0 = (40 * Math.PI) / 180;
  const a1 = (300 * Math.PI) / 180;
  const pt = (a: number) => ({ x: p.x + r * Math.cos(a), y: p.y - r * Math.sin(a) });
  ctx.beginPath();
  const n = 24;
  for (let i = 0; i <= n; i++) {
    const q = pt(a0 + ((a1 - a0) * i) / n);
    if (i === 0) ctx.moveTo(q.x, q.y);
    else ctx.lineTo(q.x, q.y);
  }
  ctx.strokeStyle = style.crank;
  ctx.lineWidth = PX.crankArrow;
  ctx.stroke();
  const at = ccw ? a1 : a0;
  const dir = ccw ? 1 : -1;
  const tip = pt(at);
  const tx = -Math.sin(at) * dir;
  const ty = -Math.cos(at) * dir;
  const nx = Math.cos(at);
  const ny = -Math.sin(at);
  ctx.beginPath();
  ctx.moveTo(tip.x + tx * 6, tip.y + ty * 6);
  ctx.lineTo(tip.x + nx * 4, tip.y + ny * 4);
  ctx.lineTo(tip.x - nx * 4, tip.y - ny * 4);
  ctx.closePath();
  ctx.fillStyle = style.crank;
  ctx.fill();
}
