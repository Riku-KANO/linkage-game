import type { Crank, DesignDoc, Joint, LegLayout, Link } from './types';
import { DEFAULT_LEGS, DESIGN_VERSION, MAX_RPM } from './types';
import {
  hasUnsafeChars,
  isBoolean,
  isFiniteNumber,
  isRecord,
  isString,
  sanitizeText,
  show,
} from './guards';

/**
 * 設計データの検査と正規化(MOD-1、非機能「データ互換」)。
 *
 * 外から来たデータ(共有リンク・JSON ファイル・localStorage)は必ずここを通す。
 *  - 形と型(有限の数、真偽値、文字列)、id の一意性、参照先の存在を検査し、だめなら理由を返す
 *  - 直せるもの(範囲外の rpm、脚列の組数、リンク内の重複ジョイントなど)は直して警告を返す
 *  - 知らないフィールドは捨て、新しいオブジェクトを返す(入力は変更しない。入力のオブジェクトを
 *    展開・コピーしないので、`__proto__` などのキーが結果に混ざることはない)
 *  - 数・配列の長さに上限を置き、運動学ソルバーと試走が有限の時間で終わる大きさに抑える(SEC-3)
 *  - id は Object.prototype のメンバー名(`__proto__`, `constructor` など)と制御文字を拒否する。
 *    下流で id をオブジェクトのキーに使っても衝突しないように
 *  - 名前の制御文字・双方向の上書き文字は取り除く(画面やファイル名の見た目をごまかせないように)
 *
 * 機構として成り立つか(クランク軸が固定点か、自由度など)は運動学の解析の仕事なので見ない。
 * 理由の文字列は開発者・ログ向けの短い日本語。画面には呼び出し側が t() の文言を出す。
 */

export const MAX_NAME_LENGTH = 40;
export const MAX_ID_LENGTH = 64;
/**
 * ジョイント数の上限(脚 1 本分。脚列で最大 16 組に複製される)。
 * 解けない部分はニュートン法(密な行列、ジョイント数の 3 乗)に回るので、これが計算量の上限を決める。
 * 256 だと 1 姿勢 0.8 秒・設計ビューの解析(180 姿勢)で 2 分以上かかった(SEC-3)。64 で 1 秒程度
 */
export const MAX_JOINTS = 64;
export const MAX_LINKS = 96;
/** 1 本のリンク(剛体プレート)に載せられる点の数 */
export const MAX_LINK_JOINTS = 16;
export const MAX_CRANKS = 16;
/** 理由をこれ以上は集めない(巨大な入力で理由の配列が膨らまないように) */
export const MAX_ERRORS = 50;
/**
 * id に使えない名前:Object.prototype のメンバーと prototype。id を普通のオブジェクトのキーに
 * 使う処理(`obj[id] = …`)でプロトタイプを書き換えたり、継承したメンバーを読んだりしないように。
 * エンジンごとの差で検査結果が変わらないよう、実行時に集めずに固定の一覧にする
 */
export const RESERVED_IDS: ReadonlySet<string> = new Set([
  '__proto__',
  '__defineGetter__',
  '__defineSetter__',
  '__lookupGetter__',
  '__lookupSetter__',
  'constructor',
  'hasOwnProperty',
  'isPrototypeOf',
  'propertyIsEnumerable',
  'toLocaleString',
  'toString',
  'valueOf',
  'prototype',
]);
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
  let dropped = 0;
  const fail = (path: string, msg: string) => {
    if (errors.length < MAX_ERRORS) errors.push(`${path}: ${msg}`);
    else dropped++;
  };
  const warn = (path: string, msg: string) => {
    if (warnings.length < MAX_ERRORS) warnings.push(`${path}: ${msg}`);
  };
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
    // 巨大な文字列を全部 1 文字ずつに分けないよう、先に符号単位で大まかに切る(1 文字は最大 2 単位。
    // 取り除く文字のぶん余裕を持たせる)。切り口でサロゲートの対を割らない
    const limit = MAX_NAME_LENGTH * 4;
    let head = input.name.length > limit ? input.name.slice(0, limit) : input.name;
    if (head.length < input.name.length && /[\ud800-\udbff]$/.test(head)) head = head.slice(0, -1);
    const cleaned = sanitizeText(head);
    if (cleaned !== head) warn('name', '制御文字・双方向の制御文字・壊れた文字を取り除きました');
    const chars = Array.from(cleaned);
    name = cleaned;
    if (head.length < input.name.length && chars.length <= MAX_NAME_LENGTH) {
      // 取り除いた文字が多くて切った後ろが残る場合(制御文字だらけの名前)。残りは捨てる
      warn('name', `${MAX_NAME_LENGTH} 文字に切り詰めました`);
    }
    if (chars.length > MAX_NAME_LENGTH) {
      name = chars.slice(0, MAX_NAME_LENGTH).join('');
      warn('name', `${MAX_NAME_LENGTH} 文字に切り詰めました`);
    }
  }

  const checkId = (v: unknown, path: string, used: Set<string>): string | null => {
    if (!isString(v)) return bad(path, '文字列ではありません');
    if (v.length === 0) return bad(path, 'id が空です');
    if (v.length > MAX_ID_LENGTH) return bad(path, `id が長すぎます(上限 ${MAX_ID_LENGTH})`);
    if (RESERVED_IDS.has(v)) return bad(path, `id ${show(v)} は予約された名前です`);
    if (hasUnsafeChars(v)) return bad(path, 'id に使えない文字(制御文字など)があります');
    if (used.has(v)) return bad(path, `id ${show(v)} が重複しています`);
    used.add(v);
    return v;
  };
  const checkCoord = (v: unknown, path: string): number | null => {
    if (!isFiniteNumber(v)) return bad(path, `有限の数ではありません(${show(v)})`);
    if (Math.abs(v) > MAX_COORD_CM) return bad(path, `座標が範囲外です(±${MAX_COORD_CM})`);
    return flushTiny(v);
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
      const members = checkArray(l.joints, `${p}.joints`, MAX_LINK_JOINTS);
      if (!members) continue;
      const out: string[] = [];
      const seen = new Set<string>();
      let dup = false;
      for (let k = 0; k < members.length; k++) {
        const jid = jointRef(members[k], `${p}.joints[${k}]`);
        if (jid === null) continue;
        if (seen.has(jid)) dup = true;
        else {
          seen.add(jid);
          out.push(jid);
        }
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
      else if (Math.abs(c.phase) > TAU) {
        // 同じ角度に戻す。巨大な値は共有リンクの量子化(×1e4)で Infinity になり読めなくなるため
        phase = flushTiny(c.phase % TAU);
        warn(`${p}.phase`, '±2π の範囲に戻しました');
      } else phase = flushTiny(c.phase);
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
    rpm = flushTiny(input.motor.rpm);
    if (Math.abs(rpm) > MAX_RPM) {
      rpm = Math.sign(rpm) * MAX_RPM;
      warn('motor.rpm', `±${MAX_RPM} に制限しました`);
    }
  }

  // 脚列
  const legs = checkLegs(input.legs, fail, warn);

  if (dropped > 0) errors.push(`ほか ${dropped} 件`);
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
    if (isFiniteNumber(x)) return flushTiny(x);
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
    phaseStepDeg = flushTiny(phaseStepDeg % 360);
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

const TAU = 2 * Math.PI;

/** -0 と非正規化数(2.2e-308 未満)を 0 にする。意味のない極小値で計算が遅い経路に入らないように */
function flushTiny(v: number): number {
  return Math.abs(v) < 2.2250738585072014e-308 ? 0 : v;
}
