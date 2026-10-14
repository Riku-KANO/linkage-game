import type { GhostSample } from '@/core/model/ghost';
import { CM, type DesignDoc } from '@/core/model/types';
import { quatToMat } from '@/core/sim/math3';
import type { Quat, SimSnapshot, TerrainCollider, Vec3 } from '@/core/sim';
import type { StageDef } from '@/game';
import { t } from '@/i18n';

/**
 * 試走の 2D 側面図(x–y、+x 右・+y 上)。3D の試走ビューができるまでの通しループ用の簡単な絵:
 * 地形の断面、スタートとゴールの線、ゴースト(胴体の箱)、脚(legPositions)、胴体、重心と接地点。
 */

export interface SideViewGhost {
  pose: GhostSample;
  /** 'previous'(前回の試走)か 'opponent'(共有リンクの相手) */
  kind: 'previous' | 'opponent';
}

export interface SideViewInput {
  snapshot: SimSnapshot;
  design: DesignDoc;
  terrain: TerrainCollider;
  stage: StageDef;
  /** 胴体の箱(機体ローカル、m) */
  chassis: { min: readonly number[]; max: readonly number[] };
  ghosts?: SideViewGhost[];
}

export interface SideViewCamera {
  /** 1m あたりのピクセル */
  ppm: number;
  /** 画面中央の x(m) */
  cx: number;
  /** 地面の基準の高さ(m)。画面の下から 28% の位置に来る */
  groundY: number;
}

const COLORS = {
  grid: 'rgba(255,255,255,0.06)',
  gridText: 'rgba(255,255,255,0.35)',
  ground: '#3a2a1c',
  groundEdge: '#8a6a48',
  start: 'rgba(239,230,210,0.35)',
  goal: '#6fbf73',
  leg: (a: number) => `rgba(242,166,90,${a})`,
  legMirrored: (a: number) => `rgba(120,180,255,${a})`,
  chassis: 'rgba(239,230,210,0.85)',
  com: '#efe6d2',
  contact: '#f2a65a',
  ghostPrevious: 'rgba(239,230,210,0.35)',
  ghostOpponent: 'rgba(224,83,61,0.55)',
} as const;

/** 画面の大きさとコースから、表示の倍率とカメラの位置を決める(全体が入れば固定、入らなければ重心を追う) */
export function sideViewCamera(
  width: number,
  height: number,
  stage: StageDef,
  comX: number,
  groundY: number,
): SideViewCamera {
  const x0 = stage.start.x - 0.8;
  const x1 = stage.goal.x + 0.8;
  const ppm = Math.max(90, Math.min(260, width / (x1 - x0), height / 1.6));
  const half = width / 2 / ppm;
  const lo = x0 + half;
  const hi = Math.max(lo, x1 - half);
  return { ppm, cx: Math.min(hi, Math.max(lo, comX)), groundY };
}

export function drawSideView(
  ctx: CanvasRenderingContext2D,
  width: number,
  height: number,
  input: SideViewInput,
): SideViewCamera {
  const { snapshot: snap, design, terrain, stage, chassis } = input;
  const ground = snap.comGround?.y ?? terrain.heightAt(snap.com.x, snap.com.z);
  const cam = sideViewCamera(
    width,
    height,
    stage,
    snap.com.x,
    Number.isFinite(ground) ? ground : 0,
  );
  const sx = (x: number) => width / 2 + (x - cam.cx) * cam.ppm;
  const sy = (y: number) => height * 0.72 - (y - cam.groundY) * cam.ppm;
  const xMin = cam.cx - width / 2 / cam.ppm;
  const xMax = cam.cx + width / 2 / cam.ppm;

  ctx.clearRect(0, 0, width, height);
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';

  // 目盛り(0.5m ごと、1m ごとに数字)
  ctx.strokeStyle = COLORS.grid;
  ctx.fillStyle = COLORS.gridText;
  ctx.lineWidth = 1;
  ctx.font = '11px system-ui, sans-serif';
  for (let k = Math.ceil(xMin * 2); k <= xMax * 2; k++) {
    const x = k / 2;
    ctx.beginPath();
    ctx.moveTo(sx(x), 0);
    ctx.lineTo(sx(x), height);
    ctx.stroke();
    if (k % 2 === 0) ctx.fillText(`${x}m`, sx(x) + 3, 14);
  }

  // 地形の断面(z = 0)
  ctx.beginPath();
  ctx.moveTo(sx(xMin), height);
  const stepM = 2 / cam.ppm;
  for (let x = xMin; x <= xMax + stepM; x += stepM) {
    const y = terrain.heightAt(x, 0);
    ctx.lineTo(sx(x), Number.isFinite(y) ? sy(y) : height);
  }
  ctx.lineTo(sx(xMax), height);
  ctx.closePath();
  ctx.fillStyle = COLORS.ground;
  ctx.fill();
  ctx.strokeStyle = COLORS.groundEdge;
  ctx.stroke();

  // スタートとゴール
  ctx.setLineDash([6, 6]);
  ctx.strokeStyle = COLORS.start;
  ctx.beginPath();
  ctx.moveTo(sx(stage.start.x), 0);
  ctx.lineTo(sx(stage.start.x), height);
  ctx.stroke();
  ctx.setLineDash([]);
  ctx.strokeStyle = COLORS.goal;
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.moveTo(sx(stage.goal.x), 0);
  ctx.lineTo(sx(stage.goal.x), height);
  ctx.stroke();
  ctx.fillStyle = COLORS.goal;
  ctx.fillText(
    t('flow.ui.goal', { distance: round1(stage.goal.x - stage.start.x) }),
    sx(stage.goal.x) + 6,
    30,
  );

  // ゴースト(胴体の箱と重心の位置)
  const R = new Float64Array(9);
  for (const g of input.ghosts ?? []) {
    const color = g.kind === 'opponent' ? COLORS.ghostOpponent : COLORS.ghostPrevious;
    drawBox(ctx, R, g.pose.position, g.pose.quaternion, chassis, sx, sy, color, 1.5, true);
    ctx.fillStyle = color;
    ctx.fillText(
      t(g.kind === 'opponent' ? 'flow.ui.ghost.opponent' : 'flow.ui.ghost.previous'),
      sx(g.pose.position.x),
      sy(g.pose.position.y + chassis.max[1]!) - 8,
    );
  }

  // 機体の姿勢
  const o = snap.body.position;
  const q = snap.body.quaternion;
  quatToMat(q.x, q.y, q.z, q.w, R);
  const wx = (lx: number, ly: number, lz: number) => o.x + R[0]! * lx + R[1]! * ly + R[2]! * lz;
  const wy = (lx: number, ly: number, lz: number) => o.y + R[3]! * lx + R[4]! * ly + R[5]! * lz;

  // 脚(奥から手前へ、手前ほど濃く)
  const index = new Map(design.joints.map((j, i) => [j.id, i]));
  const links = design.links.map((l) =>
    l.joints.map((id) => index.get(id)).filter((i): i is number => i !== undefined),
  );
  const order = snap.instances
    .map((_, k) => k)
    .sort((a, b) => snap.instances[a]!.z - snap.instances[b]!.z);
  const zs = snap.instances.map((i) => i.z);
  const zMin = Math.min(...zs);
  const zSpan = Math.max(1e-9, Math.max(...zs) - zMin);
  for (const k of order) {
    const inst = snap.instances[k]!;
    const pos = snap.legPositions[k];
    if (!pos) continue;
    const near = (inst.z - zMin) / zSpan;
    const alpha = 0.3 + 0.7 * near;
    ctx.strokeStyle = inst.mirrored ? COLORS.legMirrored(alpha) : COLORS.leg(alpha);
    ctx.lineWidth = 1.2 + 1.8 * near;
    const px = (j: number) => sx(wx(pos[j * 2]! * CM, pos[j * 2 + 1]! * CM, inst.z));
    const py = (j: number) => sy(wy(pos[j * 2]! * CM, pos[j * 2 + 1]! * CM, inst.z));
    for (const ids of links) {
      for (let a = 0; a < ids.length; a++) {
        for (let b = a + 1; b < ids.length; b++) {
          ctx.beginPath();
          ctx.moveTo(px(ids[a]!), py(ids[a]!));
          ctx.lineTo(px(ids[b]!), py(ids[b]!));
          ctx.stroke();
        }
      }
    }
  }

  // 胴体
  drawBox(ctx, R, o, q, chassis, sx, sy, COLORS.chassis, 2, false);

  // 接地点
  ctx.fillStyle = COLORS.contact;
  for (const c of snap.contacts) {
    if (!c.contact) continue;
    ctx.beginPath();
    ctx.arc(sx(c.position.x), sy(c.position.y), 3, 0, Math.PI * 2);
    ctx.fill();
  }

  // 重心とその投影
  const cx = sx(snap.com.x);
  const cy = sy(snap.com.y);
  ctx.strokeStyle = COLORS.com;
  ctx.lineWidth = 1;
  ctx.setLineDash([3, 4]);
  ctx.beginPath();
  ctx.moveTo(cx, cy);
  ctx.lineTo(cx, snap.comGround ? sy(snap.comGround.y) : height);
  ctx.stroke();
  ctx.setLineDash([]);
  ctx.fillStyle = COLORS.com;
  ctx.beginPath();
  ctx.arc(cx, cy, 5, 0, Math.PI * 2);
  ctx.fill();
  return cam;
}

/** 胴体の箱の側面(xy に投影した 8 隅の外形)を描く */
function drawBox(
  ctx: CanvasRenderingContext2D,
  R: Float64Array,
  o: Vec3,
  q: Quat,
  box: { min: readonly number[]; max: readonly number[] },
  sx: (x: number) => number,
  sy: (y: number) => number,
  color: string,
  width: number,
  fill: boolean,
) {
  quatToMat(q.x, q.y, q.z, q.w, R);
  const pts: [number, number][] = [];
  for (let c = 0; c < 8; c++) {
    const lx = c & 1 ? box.max[0]! : box.min[0]!;
    const ly = c & 2 ? box.max[1]! : box.min[1]!;
    const lz = c & 4 ? box.max[2]! : box.min[2]!;
    pts.push([
      o.x + R[0]! * lx + R[1]! * ly + R[2]! * lz,
      o.y + R[3]! * lx + R[4]! * ly + R[5]! * lz,
    ]);
  }
  const hull = convexHull(pts);
  if (hull.length < 2) return;
  ctx.beginPath();
  hull.forEach(([x, y], i) => (i === 0 ? ctx.moveTo(sx(x), sy(y)) : ctx.lineTo(sx(x), sy(y))));
  ctx.closePath();
  if (fill) {
    ctx.fillStyle = color;
    ctx.globalAlpha = 0.35;
    ctx.fill();
    ctx.globalAlpha = 1;
  }
  ctx.strokeStyle = color;
  ctx.lineWidth = width;
  ctx.stroke();
}

/** 点列の凸包(反時計回り、Andrew の単調連鎖法) */
export function convexHull(points: [number, number][]): [number, number][] {
  const p = [...points].sort((a, b) => a[0] - b[0] || a[1] - b[1]);
  if (p.length < 3) return p;
  const cross = (o: [number, number], a: [number, number], b: [number, number]) =>
    (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0]);
  const lower: [number, number][] = [];
  for (const q of p) {
    while (lower.length >= 2 && cross(lower.at(-2)!, lower.at(-1)!, q) <= 0) lower.pop();
    lower.push(q);
  }
  const upper: [number, number][] = [];
  for (let i = p.length - 1; i >= 0; i--) {
    const q = p[i]!;
    while (upper.length >= 2 && cross(upper.at(-2)!, upper.at(-1)!, q) <= 0) upper.pop();
    upper.push(q);
  }
  return [...lower.slice(0, -1), ...upper.slice(0, -1)];
}

const round1 = (v: number) => Math.round(v * 10) / 10;
