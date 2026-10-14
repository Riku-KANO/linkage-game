import type { Crank, DesignDoc, Joint, LegLayout, Link } from './types';
import { DEFAULT_LEGS, DESIGN_VERSION, MAX_RPM } from './types';
import { isBoolean, isFiniteNumber, isRecord, isString, show } from './guards';

/**
 * 設計データの検査と正規化(MOD-1、非機能「データ互換」)。
 *
 * 外から来たデータ(共有リンク・JSON ファイル・localStorage)は必ずここを通す。
 *  - 形と型(有限の数、真偽値、文字列)、id の一意性、参照先の存在を検査し、だめなら理由を返す
 *  - 直せるもの(範囲外の rpm、脚列の組数、リンク内の重複ジョイントなど)は直して警告を返す
 *  - 知らないフィールドは捨て、新しいオブジェクトを返す(入力は変更しない)
 *
 * 機構として成り立つか(クランク軸が固定点か、自由度など)は運動学の解析の仕事なので見ない。
 * 理由の文字列は開発者・ログ向けの短い日本語。画面には呼び出し側が t() の文言を出す。
 */

export const MAX_NAME_LENGTH = 40;
export const MAX_ID_LENGTH = 64;
export const MAX_JOINTS = 256;
export const MAX_LINKS = 256;
export const MAX_CRANKS = 16;
/** 設計座標の上限(cm)。製図用紙から大きく外れた値は壊れたデータとみなす */
export const MAX_COORD_CM = 10000;
/** 脚列の組数の上限 */
export const MAX_LEG_COUNT = 8;
/** 脚列の間隔の上限(cm) */
export const MAX_LEG_SPACING_CM = 200;

export type ValidateResult =
  { ok: true; design: DesignDoc; warnings: string[] } | { ok: false; errors: string[] };

export function validateDesign(input: unknown): ValidateResult {
  try {
    return validateInner(input);
  } catch {
    // getter が例外を投げるような異常なオブジェクト
    return { ok: false, errors: ['設計データを読み取れません'] };
  }
}

function validateInner(input: unknown): ValidateResult {
  if (!isRecord(input)) return { ok: false, errors: ['設計データがオブジェクトではありません'] };
  const errors: string[] = [];
  const warnings: string[] = [];
  const fail = (path: string, msg: string) => errors.push(`${path}: ${msg}`);
  const warn = (path: string, msg: string) => warnings.push(`${path}: ${msg}`);
  /** 失敗を記録して null を返す */
  const bad = (path: string, msg: string): null => {
    fail(path, msg);
    return null;
  };

  if (input.version !== DESIGN_VERSION) {
    fail(
      'version',
      `${DESIGN_VERSION} ではありません(${show(input.version)})。古いデータは migrate を通してください`,
    );
  }

  // 名前
  let name = '';
  if (!isString(input.name)) fail('name', '文字列ではありません');
  else {
    const chars = Array.from(input.name);
    name = input.name;
    if (chars.length > MAX_NAME_LENGTH) {
      name = chars.slice(0, MAX_NAME_LENGTH).join('');
      warn('name', `${MAX_NAME_LENGTH} 文字に切り詰めました`);
    }
  }

  const checkId = (v: unknown, path: string, used: Set<string>): string | null => {
    if (!isString(v)) return bad(path, '文字列ではありません');
    if (v.length === 0) return bad(path, 'id が空です');
    if (v.length > MAX_ID_LENGTH) return bad(path, `id が長すぎます(上限 ${MAX_ID_LENGTH})`);
    if (used.has(v)) return bad(path, `id ${show(v)} が重複しています`);
    used.add(v);
    return v;
  };
  const checkCoord = (v: unknown, path: string): number | null => {
    if (!isFiniteNumber(v)) return bad(path, `有限の数ではありません(${show(v)})`);
    if (Math.abs(v) > MAX_COORD_CM) return bad(path, `座標が範囲外です(±${MAX_COORD_CM})`);
    return v;
  };
  const checkArray = (v: unknown, path: string, max: number): unknown[] | null => {
    if (!Array.isArray(v)) return bad(path, '配列ではありません');
    if (v.length > max) return bad(path, `多すぎます(上限 ${max})`);
    return v;
  };

  // ジョイント
  const joints: Joint[] = [];
  const jointIds = new Set<string>();
  const rawJoints = checkArray(input.joints, 'joints', MAX_JOINTS);
  if (rawJoints) {
    // 疎な配列の穴も検査するため forEach ではなく添字で回す
    for (let i = 0; i < rawJoints.length; i++) {
      const j = rawJoints[i];
      const p = `joints[${i}]`;
      if (!isRecord(j)) {
        fail(p, 'オブジェクトではありません');
        continue;
      }
      const id = checkId(j.id, `${p}.id`, jointIds);
      const x = checkCoord(j.x, `${p}.x`);
      const y = checkCoord(j.y, `${p}.y`);
      if (!isBoolean(j.fixed)) fail(`${p}.fixed`, '真偽値ではありません');
      if (id !== null && x !== null && y !== null && isBoolean(j.fixed)) {
        joints.push({ id, x, y, fixed: j.fixed });
      }
    }
  }

  const jointRef = (v: unknown, path: string): string | null => {
    if (!isString(v)) return bad(path, '文字列ではありません');
    if (!jointIds.has(v)) return bad(path, `存在しないジョイント ${show(v)} を参照しています`);
    return v;
  };

  // リンク
  const links: Link[] = [];
  const linkIds = new Set<string>();
  const rawLinks = checkArray(input.links, 'links', MAX_LINKS);
  if (rawLinks) {
    for (let i = 0; i < rawLinks.length; i++) {
      const l = rawLinks[i];
      const p = `links[${i}]`;
      if (!isRecord(l)) {
        fail(p, 'オブジェクトではありません');
        continue;
      }
      const id = checkId(l.id, `${p}.id`, linkIds);
      const members = checkArray(l.joints, `${p}.joints`, MAX_JOINTS);
      if (!members) continue;
      const out: string[] = [];
      let dup = false;
      for (let k = 0; k < members.length; k++) {
        const jid = jointRef(members[k], `${p}.joints[${k}]`);
        if (jid === null) continue;
        if (out.includes(jid)) dup = true;
        else out.push(jid);
      }
      if (dup) warn(`${p} (${id ?? '?'})`, '重複したジョイントを取り除きました');
      if (id !== null) links.push({ id, joints: out });
    }
  }

  // クランク
  const cranks: Crank[] = [];
  const crankIds = new Set<string>();
  const rawCranks = checkArray(input.cranks, 'cranks', MAX_CRANKS);
  if (rawCranks) {
    for (let i = 0; i < rawCranks.length; i++) {
      const c = rawCranks[i];
      const p = `cranks[${i}]`;
      if (!isRecord(c)) {
        fail(p, 'オブジェクトではありません');
        continue;
      }
      const id = checkId(c.id, `${p}.id`, crankIds);
      let link: string | null = null;
      if (!isString(c.link)) fail(`${p}.link`, '文字列ではありません');
      else if (!linkIds.has(c.link)) {
        fail(`${p}.link`, `存在しないリンク ${show(c.link)} を参照しています`);
      } else link = c.link;
      const pivot = jointRef(c.pivot, `${p}.pivot`);
      let phase: number | null = null;
      if (!isFiniteNumber(c.phase)) fail(`${p}.phase`, `有限の数ではありません(${show(c.phase)})`);
      else phase = c.phase;
      if (id !== null && link !== null && pivot !== null && phase !== null) {
        cranks.push({ id, link, pivot, phase });
      }
    }
  }

  // 脚先
  let foot: string | null = null;
  if (input.foot === undefined) warn('foot', 'ないので null にしました');
  else if (input.foot !== null) foot = jointRef(input.foot, 'foot');

  // モーター
  let rpm = 0;
  if (!isRecord(input.motor)) fail('motor', 'オブジェクトではありません');
  else if (!isFiniteNumber(input.motor.rpm)) {
    fail('motor.rpm', `有限の数ではありません(${show(input.motor.rpm)})`);
  } else {
    rpm = input.motor.rpm;
    if (Math.abs(rpm) > MAX_RPM) {
      rpm = Math.sign(rpm) * MAX_RPM;
      warn('motor.rpm', `±${MAX_RPM} に制限しました`);
    }
  }

  // 脚列
  const legs = checkLegs(input.legs, fail, warn);

  if (errors.length > 0 || !legs) return { ok: false, errors };
  return {
    ok: true,
    design: {
      version: DESIGN_VERSION,
      name,
      joints,
      links,
      cranks,
      foot,
      motor: { rpm },
      legs,
    },
    warnings,
  };
}

function checkLegs(
  v: unknown,
  fail: (path: string, msg: string) => void,
  warn: (path: string, msg: string) => void,
): LegLayout | null {
  if (!isRecord(v)) {
    fail('legs', 'オブジェクトではありません');
    return null;
  }
  let ok = true;
  const num = (key: string): number => {
    const x = v[key];
    if (isFiniteNumber(x)) return x;
    fail(`legs.${key}`, `有限の数ではありません(${show(x)})`);
    ok = false;
    return 0;
  };
  let count = num('count');
  let phaseStepDeg = num('phaseStepDeg');
  let spacing = num('spacing');
  if (!isBoolean(v.mirrorX)) {
    fail('legs.mirrorX', '真偽値ではありません');
    ok = false;
  }
  if (!ok) return null;

  const c = Math.min(MAX_LEG_COUNT, Math.max(1, Math.round(count)));
  if (c !== count) {
    warn('legs.count', `${c} にしました`);
    count = c;
  }
  if (Math.abs(phaseStepDeg) >= 360) {
    phaseStepDeg = phaseStepDeg % 360;
    warn('legs.phaseStepDeg', `${phaseStepDeg} にしました`);
  }
  if (spacing <= 0) {
    spacing = DEFAULT_LEGS.spacing;
    warn('legs.spacing', `正でないので既定値 ${spacing} にしました`);
  } else if (spacing > MAX_LEG_SPACING_CM) {
    spacing = MAX_LEG_SPACING_CM;
    warn('legs.spacing', `${MAX_LEG_SPACING_CM} に制限しました`);
  }
  return { count, phaseStepDeg, spacing, mirrorX: v.mirrorX as boolean };
}
