/**
 * 開発用プレイグラウンド(?dev=sim、SIM-7)。歩行の動力学を 2D の側面図(x–y)で確かめる。
 * 地形の断面、胴体、脚、接触点と接触力、重心とその投影、支持区間、トルク計を描く。
 * 開発者向けの画面なので文言は i18n を通さない。
 */
import { useEffect, useRef, useState, type CSSProperties } from 'react';
import { compileMechanism } from '@/core/kinematics/compile';
import { sampleCycle } from '@/core/kinematics/solve';
import { mirrorDesignX } from '@/core/kinematics/legs';
import { jansenLeg, jansenWalker } from '@/core/model/presets';
import { CM, MAX_RPM, type DesignDoc } from '@/core/model/types';
import { Walker } from '@/core/sim/walker';
import { createRapierTerrain } from '@/core/sim/terrain';
import { quatToMat } from '@/core/sim/math3';
import { awkwardFourBar, chebyshevWalker, jansenTwoSided } from '@/core/sim/fixtures';
import type { SimSnapshot, TerrainCollider, TerrainSpec } from '@/core/sim/types';

const PRESETS: Record<string, { label: string; make: () => DesignDoc }> = {
  jansen12: { label: 'ヤンセン型 両側 12 脚', make: jansenTwoSided },
  jansen6: { label: 'ヤンセン型 見本機(片側 6 脚)', make: jansenWalker },
  chebyshev: { label: 'チェビシェフ型 4 脚', make: chebyshevWalker },
  fourbar: { label: '不格好な四節 6 脚', make: awkwardFourBar },
  single: { label: 'ヤンセン 1 脚', make: () => jansenLeg() },
};

const WIDE = { z0: -5, z1: 5 };
const TERRAINS: Record<string, { label: string; spec: TerrainSpec }> = {
  flat: { label: '平地', spec: { ground: { y: 0 }, shapes: [] } },
  ramp: {
    label: '上り坂(勾配 0.15)',
    spec: {
      ground: { y: 0 },
      shapes: [{ kind: 'ramp', x0: 1, x1: 21, y0: 0, y1: 3, ...WIDE, bottom: -1 }],
    },
  },
  steps: {
    label: '段差 4・8・12cm',
    spec: {
      ground: { y: 0 },
      shapes: [
        { kind: 'box', min: [2, -1, WIDE.z0], max: [5, 0.04, WIDE.z1] },
        { kind: 'box', min: [6, -1, WIDE.z0], max: [9, 0.08, WIDE.z1] },
        { kind: 'box', min: [10, -1, WIDE.z0], max: [13, 0.12, WIDE.z1] },
      ],
    },
  },
  ledge: {
    label: '20cm の段を降りる',
    spec: {
      ground: { y: -0.2 },
      shapes: [{ kind: 'box', min: [-5, -1, WIDE.z0], max: [2, 0, WIDE.z1] }],
    },
  },
};

const SPEEDS = [0.25, 1, 4];
/** 描画 1 フレームあたりのサブステップ(240Hz / 60fps) */
const SUBSTEPS = 4;
const PX_PER_M = 260;

const panel: CSSProperties = {
  background: 'rgba(255,255,255,0.04)',
  border: '1px solid rgba(255,255,255,0.1)',
  borderRadius: 8,
  padding: 12,
  display: 'grid',
  gap: 8,
  alignContent: 'start',
};
const button: CSSProperties = {
  padding: '6px 12px',
  borderRadius: 6,
  border: '1px solid rgba(255,255,255,0.2)',
  background: 'var(--ink)',
  color: 'var(--text)',
  cursor: 'pointer',
};
const input: CSSProperties = { ...button, width: '6em', cursor: 'text' };

interface Curves {
  normal: Float64Array;
  mirrored: Float64Array | null;
}

/** 脚先の軌道(設計座標 cm、[x0,y0,...])を通常脚と反転脚について 1 回転分 */
function footCurves(design: DesignDoc): Curves {
  const curve = (d: DesignDoc) => {
    const mech = compileMechanism(d);
    const f = mech.footIndex;
    if (f < 0) return new Float64Array(0);
    const cyc = sampleCycle(mech, 120);
    const out = new Float64Array(cyc.steps * 2);
    cyc.positions.forEach((p, i) => {
      out[i * 2] = p[f * 2]!;
      out[i * 2 + 1] = p[f * 2 + 1]!;
    });
    return out;
  };
  return {
    normal: curve(design),
    mirrored: design.legs.mirrorX ? curve(mirrorDesignX(design)) : null,
  };
}

interface Footprint {
  x: number;
  y: number;
  t: number;
}

export default function SimPlayground() {
  const [presetId, setPresetId] = useState('jansen12');
  const [terrainId, setTerrainId] = useState('flat');
  const [rpm, setRpm] = useState(-40);
  const [stall, setStall] = useState(60);
  const [playing, setPlaying] = useState(true);
  const [speed, setSpeed] = useState(1);
  const [terrain, setTerrain] = useState<TerrainCollider | null>(null);
  const [snap, setSnap] = useState<SimSnapshot | null>(null);
  const [version, setVersion] = useState(0);

  const canvasRef = useRef<HTMLCanvasElement>(null);
  const simRef = useRef<Walker | null>(null);
  const curvesRef = useRef<Curves | null>(null);
  const prints = useRef<Footprint[]>([]);
  const ctrl = useRef({ playing, speed, stepOnce: false });
  ctrl.current.playing = playing;
  ctrl.current.speed = speed;

  // 地形(Rapier)を作る
  useEffect(() => {
    let alive = true;
    let made: TerrainCollider | null = null;
    void createRapierTerrain(TERRAINS[terrainId]!.spec).then((t) => {
      if (!alive) return t.dispose?.();
      made = t;
      setTerrain(t);
    });
    return () => {
      alive = false;
      if (made) {
        // ループが破棄済みの地形で進めないよう、先に機体を外す
        simRef.current = null;
        setTerrain(null);
        made.dispose?.();
      }
    };
  }, [terrainId]);

  // 機体を作る(プリセット・地形・リセットで作り直す)
  useEffect(() => {
    if (!terrain) return;
    const base = PRESETS[presetId]!.make();
    const design = { ...base, motor: { rpm } };
    const sim = new Walker({
      design,
      terrain,
      start: { x: 0, z: 0 },
      params: { motor: { stallTorque: stall } },
    });
    simRef.current = sim;
    curvesRef.current = footCurves(design);
    prints.current = [];
    setSnap(sim.snapshot());
    // rpm と停動トルクは走行中に変えられるので、作り直しの依存に入れない
  }, [presetId, terrain, version]);

  // 走行中の指令の変更
  useEffect(() => {
    if (simRef.current) simRef.current.rpm = rpm;
  }, [rpm]);
  useEffect(() => {
    if (simRef.current) simRef.current.params.motor.stallTorque = stall;
  }, [stall]);

  // ループ:1 フレームに 4 サブステップ × 再生速度
  useEffect(() => {
    let raf = 0;
    let carry = 0;
    const frame = () => {
      raf = requestAnimationFrame(frame);
      const sim = simRef.current;
      if (!sim) return;
      const c = ctrl.current;
      let n = 0;
      if (c.playing) {
        carry += SUBSTEPS * c.speed;
        n = Math.floor(carry);
        carry -= n;
      } else if (c.stepOnce) {
        n = 1;
        c.stepOnce = false;
      }
      for (let i = 0; i < n; i++) sim.step();
      const s = sim.snapshot();
      if (n > 0) {
        for (const ct of s.contacts) {
          if (ct.contact && ct.instance >= 0) {
            prints.current.push({ x: ct.position.x, y: ct.position.y, t: s.time });
          }
        }
        prints.current = prints.current.filter((p) => s.time - p.t < 3);
      }
      setSnap(s);
      const canvas = canvasRef.current;
      if (canvas) draw(canvas, sim, s, curvesRef.current, prints.current);
    };
    raf = requestAnimationFrame(frame);
    return () => cancelAnimationFrame(raf);
  }, []);

  const sim = simRef.current;
  const stallTorque = sim?.params.motor.stallTorque ?? stall;
  const load = snap ? snap.motorTorque / Math.max(1e-9, stallTorque) : 0;
  const status = snap
    ? [snap.jammed && '組立不能で停止', snap.stalled && '停動', snap.fallen && '転倒']
        .filter(Boolean)
        .join(' / ') || '走行中'
    : '地形を準備中…';

  return (
    <div style={{ padding: 16, display: 'grid', gap: 12 }}>
      <h1 style={{ margin: 0, fontSize: 18 }}>歩行シミュレーション(?dev=sim)</h1>
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
        <select style={button} value={presetId} onChange={(e) => setPresetId(e.target.value)}>
          {Object.entries(PRESETS).map(([id, p]) => (
            <option key={id} value={id}>
              {p.label}
            </option>
          ))}
        </select>
        <select style={button} value={terrainId} onChange={(e) => setTerrainId(e.target.value)}>
          {Object.entries(TERRAINS).map(([id, p]) => (
            <option key={id} value={id}>
              {p.label}
            </option>
          ))}
        </select>
        <button style={button} onClick={() => setPlaying((p) => !p)}>
          {playing ? '一時停止' : '再生'}
        </button>
        <button
          style={button}
          onClick={() => {
            ctrl.current.stepOnce = true;
            setPlaying(false);
          }}
        >
          1 ステップ
        </button>
        <button style={button} onClick={() => setVersion((v) => v + 1)}>
          リセット
        </button>
        {SPEEDS.map((s) => (
          <button
            key={s}
            style={{ ...button, background: s === speed ? 'var(--accent)' : 'var(--ink)' }}
            onClick={() => setSpeed(s)}
          >
            ×{s}
          </button>
        ))}
        <label>
          rpm{' '}
          <input
            style={input}
            type="number"
            min={-MAX_RPM}
            max={MAX_RPM}
            step={5}
            value={rpm}
            onChange={(e) => setRpm(Math.max(-MAX_RPM, Math.min(MAX_RPM, Number(e.target.value))))}
          />
        </label>
        <label>
          停動トルク N·m{' '}
          <input
            style={input}
            type="number"
            min={0}
            step={5}
            value={stall}
            onChange={(e) => setStall(Math.max(0, Number(e.target.value)))}
          />
        </label>
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) 260px', gap: 12 }}>
        <canvas
          ref={canvasRef}
          style={{ width: '100%', height: '62vh', background: '#120c08', borderRadius: 8 }}
        />
        <div style={panel}>
          <strong>{status}</strong>
          <Gauge value={load} stalled={snap?.stalled ?? false} />
          {snap && sim && (
            <table style={{ fontVariantNumeric: 'tabular-nums', fontSize: 13 }}>
              <tbody>
                <Row k="時刻" v={`${snap.time.toFixed(2)} s`} />
                <Row k="重心 x" v={`${snap.com.x.toFixed(3)} m`} />
                <Row k="重心 y / z" v={`${snap.com.y.toFixed(3)} / ${snap.com.z.toFixed(3)} m`} />
                <Row
                  k="平均速度"
                  v={`${(snap.com.x / Math.max(1e-9, snap.time)).toFixed(2)} m/s`}
                />
                <Row k="前進速度" v={`${snap.body.velocity.x.toFixed(2)} m/s`} />
                <Row k="回転数" v={`${((snap.motorSpeed * 60) / (2 * Math.PI)).toFixed(1)} rpm`} />
                <Row k="負荷トルク" v={`${snap.motorTorque.toFixed(1)} N·m`} />
                <Row k="消費エネルギー" v={`${snap.energy.toFixed(0)} J`} />
                <Row k="傾き" v={`${((snap.tilt * 180) / Math.PI).toFixed(1)}°`} />
                <Row k="接地点" v={`${snap.contacts.filter((c) => c.contact).length}`} />
                <Row k="質量" v={`${sim.mass.total.toFixed(1)} kg`} />
              </tbody>
            </table>
          )}
          <div style={{ fontSize: 12, color: 'var(--muted)', lineHeight: 1.6 }}>
            側面図(+x 右、+y 上、手前の脚ほど濃い)。橙の点:接地点と接触力(1kN = 0.25m)。
            緑の線:重心の投影と接地点の x 範囲(支持区間)。点線:脚先の軌道。
          </div>
        </div>
      </div>
    </div>
  );
}

function Row({ k, v }: { k: string; v: string }) {
  return (
    <tr>
      <td style={{ color: 'var(--muted)', paddingRight: 8 }}>{k}</td>
      <td style={{ textAlign: 'right' }}>{v}</td>
    </tr>
  );
}

/** トルク計:負荷 / 停動トルク */
function Gauge({ value, stalled }: { value: number; stalled: boolean }) {
  const v = Math.max(0, Math.min(1.25, value));
  const color = stalled ? 'var(--danger)' : v > 0.8 ? 'var(--accent)' : 'var(--ok)';
  return (
    <div>
      <div style={{ fontSize: 12, color: 'var(--muted)' }}>
        トルク計(負荷 / 停動トルク):{(value * 100).toFixed(0)}%
      </div>
      <div
        style={{
          position: 'relative',
          height: 14,
          background: 'rgba(255,255,255,0.08)',
          borderRadius: 4,
          overflow: 'hidden',
        }}
      >
        <div
          style={{
            position: 'absolute',
            left: 0,
            width: `${(v / 1.25) * 100}%`,
            top: 0,
            bottom: 0,
            background: color,
          }}
        />
        <div
          style={{
            position: 'absolute',
            left: `${100 / 1.25}%`,
            top: 0,
            bottom: 0,
            width: 2,
            background: 'var(--danger)',
          }}
        />
      </div>
    </div>
  );
}

/** 側面図を描く */
function draw(
  canvas: HTMLCanvasElement,
  sim: Walker,
  snap: SimSnapshot,
  curves: Curves | null,
  prints: Footprint[],
) {
  const dpr = window.devicePixelRatio || 1;
  const w = canvas.clientWidth;
  const h = canvas.clientHeight;
  if (canvas.width !== Math.round(w * dpr) || canvas.height !== Math.round(h * dpr)) {
    canvas.width = Math.round(w * dpr);
    canvas.height = Math.round(h * dpr);
  }
  const ctx = canvas.getContext('2d');
  if (!ctx) return;
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.clearRect(0, 0, w, h);

  // カメラ:重心を横方向の中央に、地面を下から 1/4 に
  const cx = snap.com.x;
  const ground = snap.comGround?.y ?? 0;
  const sx = (x: number) => w / 2 + (x - cx) * PX_PER_M;
  const sy = (y: number) => h * 0.75 - (y - ground) * PX_PER_M;
  const xMin = cx - w / 2 / PX_PER_M;
  const xMax = cx + w / 2 / PX_PER_M;

  // 目盛り(1m ごと)
  ctx.strokeStyle = 'rgba(255,255,255,0.06)';
  ctx.fillStyle = 'rgba(255,255,255,0.3)';
  ctx.font = '11px system-ui';
  for (let x = Math.ceil(xMin); x <= xMax; x++) {
    ctx.beginPath();
    ctx.moveTo(sx(x), 0);
    ctx.lineTo(sx(x), h);
    ctx.stroke();
    ctx.fillText(`${x} m`, sx(x) + 3, 12);
  }

  // 地形の断面(z = 重心の z)
  ctx.beginPath();
  ctx.moveTo(sx(xMin), h);
  for (let x = xMin; x <= xMax + 0.02; x += 0.02) {
    const y = sim.terrain.heightAt(x, snap.com.z);
    ctx.lineTo(sx(x), Number.isFinite(y) ? sy(y) : h);
  }
  ctx.lineTo(sx(xMax), h);
  ctx.closePath();
  ctx.fillStyle = '#3a2a1c';
  ctx.fill();
  ctx.strokeStyle = '#8a6a48';
  ctx.stroke();

  // 足跡(直近 3 秒の接地点)
  ctx.fillStyle = 'rgba(242,166,90,0.35)';
  for (const p of prints) ctx.fillRect(sx(p.x) - 1, sy(p.y) - 1, 2, 2);

  // 機体の姿勢
  const R = new Float64Array(9);
  const q = snap.body.quaternion;
  quatToMat(q.x, q.y, q.z, q.w, R);
  const o = snap.body.position;
  const toWorld = (lx: number, ly: number, lz: number) => ({
    x: o.x + R[0]! * lx + R[1]! * ly + R[2]! * lz,
    y: o.y + R[3]! * lx + R[4]! * ly + R[5]! * lz,
  });

  // 胴体の箱(12 辺)
  const lo = sim.mass.chassisMin;
  const hi = sim.mass.chassisMax;
  const corner = (i: number) =>
    toWorld(i & 1 ? hi[0] : lo[0], i & 2 ? hi[1] : lo[1], i & 4 ? hi[2] : lo[2]);
  ctx.strokeStyle = 'rgba(239,230,210,0.5)';
  ctx.lineWidth = 1.5;
  for (let i = 0; i < 8; i++) {
    for (const bit of [1, 2, 4]) {
      if (i & bit) continue;
      const a = corner(i);
      const b = corner(i | bit);
      ctx.beginPath();
      ctx.moveTo(sx(a.x), sy(a.y));
      ctx.lineTo(sx(b.x), sy(b.y));
      ctx.stroke();
    }
  }

  // 脚(奥から手前へ、手前ほど濃く)
  const design = sim.design;
  const index = new Map(design.joints.map((j, i) => [j.id, i]));
  const order = snap.instances
    .map((_, k) => k)
    .sort((a, b) => snap.instances[a]!.z - snap.instances[b]!.z);
  const zs = snap.instances.map((i) => i.z);
  const zMin = Math.min(...zs);
  const zSpan = Math.max(1e-9, Math.max(...zs) - zMin);
  for (const k of order) {
    const inst = snap.instances[k]!;
    const pos = snap.legPositions[k]!;
    const near = (inst.z - zMin) / zSpan;
    const alpha = 0.25 + 0.75 * near;
    ctx.strokeStyle = inst.mirrored ? `rgba(120,180,255,${alpha})` : `rgba(242,166,90,${alpha})`;
    ctx.lineWidth = 1 + 1.5 * near;
    const P = (j: number) => toWorld(pos[j * 2]! * CM, pos[j * 2 + 1]! * CM, inst.z);
    for (const link of design.links) {
      const ids = link.joints.map((id) => index.get(id)).filter((i) => i !== undefined);
      for (let a = 0; a < ids.length; a++)
        for (let b = a + 1; b < ids.length; b++) {
          const p = P(ids[a]!);
          const r = P(ids[b]!);
          ctx.beginPath();
          ctx.moveTo(sx(p.x), sy(p.y));
          ctx.lineTo(sx(r.x), sy(r.y));
          ctx.stroke();
        }
    }
  }

  // 脚先の軌道(最も手前の通常脚・反転脚)
  if (curves) {
    ctx.setLineDash([3, 4]);
    ctx.lineWidth = 1;
    for (const [curve, mirrored] of [
      [curves.normal, false],
      [curves.mirrored, true],
    ] as const) {
      if (!curve || curve.length === 0) continue;
      const nearest = order.filter((k) => snap.instances[k]!.mirrored === mirrored).pop();
      if (nearest === undefined) continue;
      const z = snap.instances[nearest]!.z;
      ctx.strokeStyle = mirrored ? 'rgba(120,180,255,0.6)' : 'rgba(242,166,90,0.6)';
      ctx.beginPath();
      for (let i = 0; i <= curve.length / 2; i++) {
        const j = i % (curve.length / 2);
        const p = toWorld(curve[j * 2]! * CM, curve[j * 2 + 1]! * CM, z);
        if (i === 0) ctx.moveTo(sx(p.x), sy(p.y));
        else ctx.lineTo(sx(p.x), sy(p.y));
      }
      ctx.stroke();
    }
    ctx.setLineDash([]);
  }

  // 接触点と接触力
  let supMin = Infinity;
  let supMax = -Infinity;
  const F_SCALE = 0.25 / 1000; // 1kN → 0.25m
  for (const c of snap.contacts) {
    if (!c.contact) continue;
    supMin = Math.min(supMin, c.position.x);
    supMax = Math.max(supMax, c.position.x);
    const px = sx(c.position.x);
    const py = sy(c.position.y);
    ctx.fillStyle = c.instance < 0 ? '#e0533d' : '#f2a65a';
    ctx.beginPath();
    ctx.arc(px, py, 4, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = 'rgba(242,166,90,0.9)';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(px, py);
    ctx.lineTo(sx(c.position.x + c.force.x * F_SCALE), sy(c.position.y + c.force.y * F_SCALE));
    ctx.stroke();
  }

  // 重心と投影、支持区間
  const comX = sx(snap.com.x);
  const comY = sy(snap.com.y);
  const inside = snap.com.x >= supMin && snap.com.x <= supMax;
  ctx.strokeStyle = inside ? '#6fbf73' : '#e0533d';
  ctx.lineWidth = 3;
  if (supMin <= supMax) {
    ctx.beginPath();
    ctx.moveTo(sx(supMin), sy(ground) + 8);
    ctx.lineTo(sx(supMax), sy(ground) + 8);
    ctx.stroke();
  }
  ctx.lineWidth = 1;
  ctx.setLineDash([4, 4]);
  ctx.beginPath();
  ctx.moveTo(comX, comY);
  ctx.lineTo(comX, snap.comGround ? sy(snap.comGround.y) : h);
  ctx.stroke();
  ctx.setLineDash([]);
  ctx.fillStyle = '#efe6d2';
  ctx.beginPath();
  ctx.arc(comX, comY, 6, 0, Math.PI * 2);
  ctx.fill();
  if (snap.comGround) {
    const gx = comX;
    const gy = sy(snap.comGround.y);
    ctx.beginPath();
    ctx.moveTo(gx - 6, gy - 6);
    ctx.lineTo(gx + 6, gy + 6);
    ctx.moveTo(gx + 6, gy - 6);
    ctx.lineTo(gx - 6, gy + 6);
    ctx.stroke();
  }
}
