import { BufferAttribute, BufferGeometry } from 'three';
import { box, cylinder, mergeParts, seeded, jitterColor, type Part } from '../env/geometry';
import { PALETTE } from '../env/materials';
import {
  createRouteSample,
  PATH_LIFT,
  PATH_WIDTH,
  sampleRoute,
  SAND_TOP,
  TERRACE_LENGTH,
  TERRACE_WIDTH,
  type DioramaLayout,
  type PlateauSpec,
  type Route,
} from './diorama';

/**
 * ジオラマの動かない地形(台地・小道・橋・段・溝・点景)を 1 つのジオメトリ(頂点色)にまとめる。
 * 目印と機械は別(インスタンス描画)。座標はコース模型のローカル。
 */

/** 章ごとの台地の色(遊べる章は暖色、まだの章は灰色) */
const PLATEAU_COLORS = ['#d9b07a', '#c98a4b', '#8b909a', '#80868f', '#767c86'];
/** 小道の色(踏み固めた土)。まだ遊べない章は灰色 */
const TRAIL_COLORS = ['#8c6440', '#76502f', '#6c6a66', '#66645f', '#5f5d59'];
const DITCH_COLOR = '#2a1a10';
const DITCH_HALF = 0.006;

/** 道のりの点 i → i+1 を帯にした四角形(上向き)を並べる */
function ribbon(route: Route, quads: number[], halfWidth: number, drop: number): BufferGeometry {
  const pos = new Float32Array(quads.length * 18);
  const nor = new Float32Array(quads.length * 18);
  let o = 0;
  const put = (x: number, y: number, z: number) => {
    pos[o] = x;
    pos[o + 1] = y;
    pos[o + 2] = z;
    nor[o + 1] = 1;
    o += 3;
  };
  for (const i of quads) {
    const corner = (k: number, side: 1 | -1) => {
      const h = route.heading[k]!;
      // 進む向きの左の法線
      const nx = -Math.sin(h) * side * halfWidth;
      const nz = -Math.cos(h) * side * halfWidth;
      return [route.x[k]! + nx, route.y[k]! - drop, route.z[k]! + nz] as const;
    };
    const l0 = corner(i, 1);
    const r0 = corner(i, -1);
    const l1 = corner(i + 1, 1);
    const r1 = corner(i + 1, -1);
    put(...l0);
    put(...r0);
    put(...r1);
    put(...l0);
    put(...r1);
    put(...l1);
  }
  const g = new BufferGeometry();
  g.setAttribute('position', new BufferAttribute(pos, 3));
  g.setAttribute('normal', new BufferAttribute(nor, 3));
  return g;
}

function plateauOf(layout: DioramaLayout, x: number, z: number): PlateauSpec | undefined {
  return layout.plateaus.find((p) => Math.hypot(x - p.x, z - p.z) < p.r * 0.95);
}

export function buildDioramaTerrain(layout: DioramaLayout): BufferGeometry {
  const parts: Part[] = [];
  const rnd = seeded(41);
  const { route } = layout;

  // 台地:裾の広がった多角柱、地層の帯、上面の薄い層
  layout.plateaus.forEach((p, i) => {
    const col = PLATEAU_COLORS[i] ?? PLATEAU_COLORS[PLATEAU_COLORS.length - 1]!;
    const h = p.top - SAND_TOP;
    parts.push(cylinder(p.r, p.r * 1.1, h, [p.x, SAND_TOP + h / 2, p.z], col, p.sides));
    parts.push(
      cylinder(
        p.r * 1.035,
        p.r * 1.05,
        Math.min(0.008, h * 0.2),
        [p.x, SAND_TOP + h * 0.45, p.z],
        jitterColor(col, rnd, 0.25),
        p.sides,
      ),
    );
    parts.push(
      cylinder(
        p.r * 1.01,
        p.r * 1.01,
        0.004,
        [p.x, p.top - 0.002, p.z],
        jitterColor(col, rnd, 0.1),
        p.sides,
      ),
    );
  });

  // 小道(台地ごとに色を変え、溝のところは途切れさせる)
  const ditches = layout.markers.filter((m) => m.ditchS !== null).map((m) => m.ditchS!);
  const quadsByPlateau = new Map<number, number[]>();
  const bridgeQuads: number[] = [];
  for (let i = 0; i + 1 < route.count; i++) {
    const sMid = (route.s[i]! + route.s[i + 1]!) / 2;
    if (ditches.some((d) => Math.abs(sMid - d) < DITCH_HALF)) continue;
    const p = plateauOf(
      layout,
      (route.x[i]! + route.x[i + 1]!) / 2,
      (route.z[i]! + route.z[i + 1]!) / 2,
    );
    if (!p) {
      bridgeQuads.push(i);
      continue;
    }
    const list = quadsByPlateau.get(p.chapter) ?? [];
    list.push(i);
    quadsByPlateau.set(p.chapter, list);
  }
  layout.plateaus.forEach((p, i) => {
    const quads = quadsByPlateau.get(p.chapter);
    if (!quads) return;
    const col = TRAIL_COLORS[i] ?? TRAIL_COLORS[TRAIL_COLORS.length - 1]!;
    parts.push({ geometry: ribbon(route, quads, PATH_WIDTH / 2, PATH_LIFT - 0.0008), color: col });
  });

  // 橋:板を並べる(板と板の間は少し空ける)
  const pt = createRouteSample();
  for (const b of layout.bridges) {
    const s0 = nearestS(route, b.a[0], b.a[2]);
    const s1 = nearestS(route, b.b[0], b.b[2]);
    const playable = layout.plateaus.find((p) => p.chapter === b.to)?.playable ?? false;
    const n = Math.max(2, Math.round((s1 - s0) / 0.011));
    for (let k = 0; k <= n; k++) {
      sampleRoute(route, s0 + ((s1 - s0) * k) / n, pt);
      parts.push(
        box(
          [0.0075, 0.004, PATH_WIDTH * 1.35],
          [pt.x, pt.y - PATH_LIFT + 0.0005, pt.z],
          playable ? jitterColor(PALETTE.woodLight, rnd, 0.2) : '#8a8a8a',
          [0, pt.heading, 0],
        ),
      );
    }
    // 橋の両端の杭
    for (const e of [b.a, b.b]) {
      for (const side of [1, -1]) {
        parts.push(
          cylinder(
            0.0025,
            0.0025,
            0.02,
            [e[0], e[1] + 0.006, e[2] + side * 0.018],
            PALETTE.woodDark,
            5,
          ),
        );
      }
    }
    // 下の支え(地面から橋の真ん中へ)
    sampleRoute(route, (s0 + s1) / 2, pt);
    const hy = pt.y - PATH_LIFT - SAND_TOP;
    if (hy > 0.01) {
      parts.push(box([0.006, hy, 0.006], [pt.x, SAND_TOP + hy / 2, pt.z - 0.01], PALETTE.woodDark));
      parts.push(box([0.006, hy, 0.006], [pt.x, SAND_TOP + hy / 2, pt.z + 0.01], PALETTE.woodDark));
    }
  }

  // 段(章 2):小道の下に 2 段の台を敷く。目印は上の段に立つ
  for (const m of layout.markers) {
    if (m.terrace <= 0) continue;
    const p = layout.plateaus.find((q) => q.chapter === m.chapter)!;
    sampleRoute(route, m.s, pt);
    const rot = [0, pt.heading, 0] as const;
    parts.push(
      box(
        [TERRACE_LENGTH + 0.016, m.terrace / 2, TERRACE_WIDTH + 0.014],
        [pt.x, p.top + m.terrace / 4, pt.z],
        '#a96c3c',
        rot,
      ),
    );
    parts.push(
      box(
        [TERRACE_LENGTH, m.terrace, TERRACE_WIDTH],
        [pt.x, p.top + m.terrace / 2, pt.z],
        '#b98049',
        rot,
      ),
    );
  }

  // 溝(章 2):小道を横切る暗い切れ目と、両側の盛り土
  for (const m of layout.markers) {
    if (m.ditchS === null) continue;
    const p = layout.plateaus.find((q) => q.chapter === m.chapter)!;
    sampleRoute(route, m.ditchS, pt);
    const rot = [0, pt.heading, 0] as const;
    parts.push(
      box([DITCH_HALF * 2, 0.0012, 0.058], [pt.x, p.top + 0.0006, pt.z], DITCH_COLOR, rot),
    );
    for (const k of [-1, 1]) {
      const dx = Math.cos(pt.heading) * k * (DITCH_HALF + 0.0025);
      const dz = -Math.sin(pt.heading) * k * (DITCH_HALF + 0.0025);
      parts.push(
        box([0.004, 0.003, 0.058], [pt.x + dx, p.top + 0.0015, pt.z + dz], '#9a6234', rot),
      );
    }
  }

  // 点景:台地の上の低木と岩(小道と目印を避ける)、砂地の小石
  for (const p of layout.plateaus) {
    let placed = 0;
    for (let tries = 0; tries < 60 && placed < (p.playable ? 7 : 3); tries++) {
      const a = rnd() * Math.PI * 2;
      const r = Math.sqrt(rnd()) * p.r * 0.8;
      const x = p.x + Math.cos(a) * r;
      const z = p.z + Math.sin(a) * r;
      if (nearRoute(route, x, z, 0.03)) continue;
      if (layout.markers.some((m) => Math.hypot(m.x - x, m.z - z) < 0.035)) continue;
      const shrub = rnd() > 0.45;
      parts.push(
        cylinder(
          shrub ? 0.004 : 0.007,
          shrub ? 0.009 : 0.01,
          0.008 + rnd() * 0.01,
          [x, p.top + 0.006, z],
          shrub ? jitterColor(PALETTE.green, rnd, 0.3) : jitterColor(PALETTE.rust, rnd, 0.3),
          5,
        ),
      );
      placed++;
    }
  }
  for (let k = 0; k < 18; k++) {
    const x = (rnd() - 0.5) * 1.95;
    const z = (rnd() - 0.5) * 0.55;
    if (layout.plateaus.some((p) => Math.hypot(p.x - x, p.z - z) < p.r * 1.12 + 0.02)) continue;
    if (nearRoute(route, x, z, 0.03)) continue;
    parts.push(
      cylinder(
        0.008,
        0.015,
        0.012 + rnd() * 0.015,
        [x, 0.012, z],
        rnd() > 0.5 ? PALETTE.rust : PALETTE.green,
        5,
      ),
    );
  }
  return mergeParts(parts);
}

function nearestS(route: Route, x: number, z: number): number {
  let best = 0;
  let bd = Infinity;
  for (let i = 0; i < route.count; i++) {
    const d = Math.hypot(route.x[i]! - x, route.z[i]! - z);
    if (d < bd) {
      bd = d;
      best = route.s[i]!;
    }
  }
  return best;
}

function nearRoute(route: Route, x: number, z: number, dist: number): boolean {
  for (let i = 0; i < route.count; i += 2) {
    if (Math.hypot(route.x[i]! - x, route.z[i]! - z) < dist) return true;
  }
  return false;
}
