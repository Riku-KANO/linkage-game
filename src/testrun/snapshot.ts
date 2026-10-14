import type { FootState, LegInstance, SimSnapshot } from '@/core/sim/types';

/**
 * スナップショットの複製と補間(描画用)。出力先のオブジェクト・配列を再利用し、
 * 形(組の数・ジョイント数・接触点の数)が変わったときだけ割り当てる。
 */

export function createEmptySnapshot(): SimSnapshot {
  return {
    time: 0,
    body: {
      position: { x: 0, y: 0, z: 0 },
      quaternion: { x: 0, y: 0, z: 0, w: 1 },
      velocity: { x: 0, y: 0, z: 0 },
      angularVelocity: { x: 0, y: 0, z: 0 },
    },
    com: { x: 0, y: 0, z: 0 },
    motorAngle: 0,
    motorSpeed: 0,
    motorTorque: 0,
    stalled: false,
    energy: 0,
    instances: [],
    legPositions: [],
    contacts: [],
    fallen: false,
    jammed: false,
  };
}

function ensureShape(src: SimSnapshot, dst: SimSnapshot) {
  if (dst.instances.length !== src.instances.length) {
    dst.instances = src.instances.map((i): LegInstance => ({ ...i }));
  } else {
    for (let k = 0; k < src.instances.length; k++) {
      const a = src.instances[k]!;
      const b = dst.instances[k]!;
      b.z = a.z;
      b.mirrored = a.mirrored;
      b.phase = a.phase;
    }
  }
  if (dst.legPositions.length !== src.legPositions.length) {
    dst.legPositions = src.legPositions.map((p) => new Float64Array(p.length));
  }
  for (let k = 0; k < src.legPositions.length; k++) {
    if (dst.legPositions[k]!.length !== src.legPositions[k]!.length) {
      dst.legPositions[k] = new Float64Array(src.legPositions[k]!.length);
    }
  }
  if (dst.contacts.length !== src.contacts.length) {
    dst.contacts = src.contacts.map((c): FootState => ({
      instance: c.instance,
      joint: c.joint,
      position: { ...c.position },
      contact: c.contact,
      force: { ...c.force },
    }));
  }
}

/** src を dst に深く複製する(dst を返す) */
export function copySnapshot(src: SimSnapshot, dst: SimSnapshot): SimSnapshot {
  ensureShape(src, dst);
  dst.time = src.time;
  copy3(src.body.position, dst.body.position);
  dst.body.quaternion.x = src.body.quaternion.x;
  dst.body.quaternion.y = src.body.quaternion.y;
  dst.body.quaternion.z = src.body.quaternion.z;
  dst.body.quaternion.w = src.body.quaternion.w;
  copy3(src.body.velocity, dst.body.velocity);
  copy3(src.body.angularVelocity, dst.body.angularVelocity);
  copy3(src.com, dst.com);
  dst.motorAngle = src.motorAngle;
  dst.motorSpeed = src.motorSpeed;
  dst.motorTorque = src.motorTorque;
  dst.stalled = src.stalled;
  dst.energy = src.energy;
  dst.fallen = src.fallen;
  dst.jammed = src.jammed;
  for (let k = 0; k < src.legPositions.length; k++) dst.legPositions[k]!.set(src.legPositions[k]!);
  for (let i = 0; i < src.contacts.length; i++) copyContact(src.contacts[i]!, dst.contacts[i]!);
  return dst;
}

/**
 * a と b を t ∈ [0, 1] で補間して out に書く。位置・角度・脚の姿勢は線形、向きは正規化線形補間。
 * 状態フラグ・接地・力は b のもの。形が違えば b を複製する。
 */
export function lerpSnapshot(
  a: SimSnapshot,
  b: SimSnapshot,
  t: number,
  out: SimSnapshot,
): SimSnapshot {
  let sameShape =
    a.legPositions.length === b.legPositions.length && a.contacts.length === b.contacts.length;
  for (let k = 0; sameShape && k < a.legPositions.length; k++) {
    sameShape = a.legPositions[k]!.length === b.legPositions[k]!.length;
  }
  if (!sameShape || t >= 1) return copySnapshot(b, out);
  if (t <= 0) return copySnapshot(a, out);
  copySnapshot(b, out);
  const u = 1 - t;
  out.time = a.time * u + b.time * t;
  lerp3(a.body.position, b.body.position, t, out.body.position);
  lerp3(a.body.velocity, b.body.velocity, t, out.body.velocity);
  lerp3(a.body.angularVelocity, b.body.angularVelocity, t, out.body.angularVelocity);
  lerp3(a.com, b.com, t, out.com);
  const qa = a.body.quaternion;
  const qb = b.body.quaternion;
  const sign = qa.x * qb.x + qa.y * qb.y + qa.z * qb.z + qa.w * qb.w < 0 ? -1 : 1;
  const qx = qa.x * u + sign * qb.x * t;
  const qy = qa.y * u + sign * qb.y * t;
  const qz = qa.z * u + sign * qb.z * t;
  const qw = qa.w * u + sign * qb.w * t;
  const len = Math.hypot(qx, qy, qz, qw) || 1;
  out.body.quaternion.x = qx / len;
  out.body.quaternion.y = qy / len;
  out.body.quaternion.z = qz / len;
  out.body.quaternion.w = qw / len;
  out.motorAngle = a.motorAngle * u + b.motorAngle * t;
  out.motorSpeed = a.motorSpeed * u + b.motorSpeed * t;
  out.motorTorque = a.motorTorque * u + b.motorTorque * t;
  out.energy = a.energy * u + b.energy * t;
  for (let k = 0; k < a.legPositions.length; k++) {
    const pa = a.legPositions[k]!;
    const pb = b.legPositions[k]!;
    const po = out.legPositions[k]!;
    for (let i = 0; i < pa.length; i++) po[i] = pa[i]! * u + pb[i]! * t;
  }
  for (let i = 0; i < a.contacts.length; i++) {
    lerp3(a.contacts[i]!.position, b.contacts[i]!.position, t, out.contacts[i]!.position);
  }
  return out;
}

function copyContact(s: FootState, d: FootState) {
  d.instance = s.instance;
  d.joint = s.joint;
  copy3(s.position, d.position);
  d.contact = s.contact;
  copy3(s.force, d.force);
}

type V = { x: number; y: number; z: number };
function copy3(s: V, d: V) {
  d.x = s.x;
  d.y = s.y;
  d.z = s.z;
}
function lerp3(a: V, b: V, t: number, o: V) {
  o.x = a.x + (b.x - a.x) * t;
  o.y = a.y + (b.y - a.y) * t;
  o.z = a.z + (b.z - a.z) * t;
}
