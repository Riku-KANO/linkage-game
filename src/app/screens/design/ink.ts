import type { MechanismAnalysis } from '@/core/kinematics';
import type { DesignDoc } from '@/core/model/types';
import { linkOutlineOrder, trajectoryExtent } from '@/editor/render';
import { toScreen, type Camera, type WorldRect } from '@/editor/viewport';
import type { DesignRect } from '@/scene/rig/paper';

/**
 * 3D の製図用紙に描く「インクの図面」(INT-1)。今の設計を、設計画面のエディタ(DesignCanvas)と
 * 同じ見た目で Canvas 2D に描き、紙にぴったり重ねる板のテクスチャにする。
 *
 * - 板は紙の絵(scene の drawPaperSheet)ごと描いた不透明なテクスチャ。インクの半透明・縁のにじみは
 *   Canvas の中で(ブラウザがエディタの SVG を重ねるのと同じ sRGB で)混ぜてから 3D で照らすので、
 *   後処理の有無(低性能モード)にかかわらずエディタと同じ太さ・濃さに見える
 * - 解像度は設計画面での紙の画素と 1:1(降りきったときテクスチャの画素が画面の画素に重なる)
 * - 線の太さ(画面 px)・色・重なり順はエディタに合わせてある(editor.css / DesignCanvas.tsx の値。
 *   変えたらここも合わせる)。描くのは静止した図面だけ:軌道・リンク・ピン・固定点・クランクの矢印・脚先。
 *   動いている機構・寸法線・バッジはエディタだけが描く(切り替わりでふわっと現れる)
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

/** 紙の板のテクスチャ:覆う範囲・描画座標・解像度 */
export interface SheetRegion {
  /** テクスチャが覆う設計座標の範囲(cm)。紙の矩形(画素の境目まで内側に縮めたもの) */
  rect: WorldRect;
  /** 設計 cm → 描画座標(設計画面での画面 px 相当。テクスチャ px はこれの k 倍) */
  cam: Camera;
  /** 画面 px あたりのテクスチャ px(画素比。大きすぎるときは下げる) */
  k: number;
  /** テクスチャの大きさ(px) */
  width: number;
  height: number;
  /** 紙の範囲(描画座標)。図面はこれより外に描かない(エディタの SVG も紙の縁で切れる) */
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

export interface SheetRegionOptions {
  /** テクスチャの一辺の上限(px) */
  maxTexture?: number;
  /**
   * 設計画面での紙の左上の画面位置(CSS px)。渡すと板の縁を画面の画素の境目まで内側に縮め、
   * 降りきったときテクスチャの画素と画面の画素がずれずに重なる(にじまない)。
   * 縮めた 1 画素未満の縁には下の紙(scene の紙)がそのまま見える
   */
  origin?: { x: number; y: number };
}

/**
 * 紙の板のテクスチャの範囲と解像度。設計画面での 1 cm の画面 px(pxPerCm)と画素比(dpr)から、
 * 降りきったときにテクスチャの 1 px が画面の 1 画素にちょうど重なる大きさにする。
 */
export function sheetRegion(
  paper: DesignRect,
  pxPerCm: number,
  dpr: number,
  opts: SheetRegionOptions = {},
): SheetRegion | null {
  const maxTexture = opts.maxTexture ?? 4096;
  if (!(pxPerCm > 0)) return null;
  const s = pxPerCm;
  const wPx = (paper.xMax - paper.xMin) * s;
  const hPx = (paper.yMax - paper.yMin) * s;
  const k = Math.min(Math.max(1, dpr), maxTexture / wPx, maxTexture / hPx);
  let minX = paper.xMin;
  let maxX = paper.xMax;
  let minY = paper.yMin;
  let maxY = paper.yMax;
  let width = Math.ceil(wPx * k);
  let height = Math.ceil(hPx * k);
  if (opts.origin) {
    const EPS = 1e-6;
    const l = opts.origin.x;
    const tp = opts.origin.y;
    const l2 = Math.ceil(l * k - EPS) / k;
    const t2 = Math.ceil(tp * k - EPS) / k;
    const r2 = Math.floor((l + wPx) * k + EPS) / k;
    const b2 = Math.floor((tp + hPx) * k + EPS) / k;
    if (!(r2 > l2 && b2 > t2)) return null;
    minX = paper.xMin + (l2 - l) / s;
    maxX = paper.xMin + (r2 - l) / s;
    maxY = paper.yMax - (t2 - tp) / s;
    minY = paper.yMax - (b2 - tp) / s;
    width = Math.round((r2 - l2) * k);
    height = Math.round((b2 - t2) * k);
  } else {
    maxX = minX + width / k / s;
    minY = maxY - height / k / s;
  }
  const cam: Camera = { scale: s, ox: -minX * s, oy: maxY * s };
  const c0 = toScreen(cam, paper.xMin, paper.yMax);
  const c1 = toScreen(cam, paper.xMax, paper.yMin);
  return {
    rect: { minX, minY, maxX, maxY },
    cam,
    k,
    width,
    height,
    clip: { x: c0.x, y: c0.y, w: c1.x - c0.x, h: c1.y - c0.y },
  };
}

/** 紙の絵を描く関数(scene の drawPaperSheet)。(0,0)–(W,H) に紙全体を描く */
export type PaperPainter = (ctx: CanvasRenderingContext2D, W: number, H: number) => void;

/**
 * 板のテクスチャを描く:紙の絵(全体を W0 × H0 の座標で描く関数を、この範囲・解像度に写して呼ぶ)と、
 * ink があればその上に図面。
 */
export function drawSheet(
  ctx: Ctx & Pick<CanvasRenderingContext2D, 'fillRect'>,
  region: SheetRegion,
  paper: DesignRect,
  painter: { draw: PaperPainter; width: number; height: number },
  ink: { design: DesignDoc; analysis: MechanismAnalysis; footLabel: string } | null,
  style: InkStyle = INK_STYLE,
): void {
  const { cam, k } = region;
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.clearRect(0, 0, region.width, region.height);
  // 紙の絵の座標 (u, v) → 設計座標 → 描画座標 → テクスチャ px
  const qx = (cam.scale * (paper.xMax - paper.xMin)) / painter.width;
  const qy = (cam.scale * (paper.yMax - paper.yMin)) / painter.height;
  ctx.setTransform(
    k * qx,
    0,
    0,
    k * qy,
    k * (cam.ox + cam.scale * paper.xMin),
    k * (cam.oy - cam.scale * paper.yMax),
  );
  painter.draw(ctx as CanvasRenderingContext2D, painter.width, painter.height);
  if (ink) drawDesignInk(ctx, ink.design, ink.analysis, region, ink.footLabel, style);
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
 * ctx はテクスチャの Canvas(大きさ region.width × region.height)。紙の絵の上に重ねて描く。
 */
export function drawDesignInk(
  ctx: Ctx,
  design: DesignDoc,
  analysis: MechanismAnalysis,
  region: SheetRegion,
  footLabel: string,
  style: InkStyle = INK_STYLE,
): void {
  const { cam, k } = region;
  ctx.setTransform(k, 0, 0, k, 0, 0);
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
