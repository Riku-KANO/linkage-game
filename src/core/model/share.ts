import LZString from 'lz-string';
import type { DesignDoc } from './types';
import { isBoolean, isFiniteNumber, isInteger, isRecord, isString, safeJsonParse } from './guards';
import type { Ghost } from './ghost';
import { decodeGhostCompact, encodeGhostCompact, validateGhost } from './ghost';
import { MAX_CRANKS, MAX_JOINTS, MAX_LINK_JOINTS, MAX_LINKS, validateDesign } from './validate';
import { readDesign } from './migrate';
import type { LoadFailure } from './migrate';
import { decompressFromEncodedURIComponentBounded } from './lz';

/**
 * 共有リンク(MOD-3、U-02)。サーバーなしで、設計(+任意でスコアとゴースト)を URL に埋め込む。
 *
 *   payload → 短縮形式(タプル、座標は 0.01cm の整数)→ JSON → lz-string → `#s=<token>`
 *
 * 必ず URL のフラグメント(# の後ろ)に置く。クエリに置くとサーバーのログやリファラに残るため。
 * 読み込みは短縮形式の版ごとの読み取り → migrate → validateDesign を通す。
 * 短縮形式の版(SHARE_FORMAT)は設計の版(DESIGN_VERSION)と一緒に上げ、古い版の読み取りは残す。
 *
 * 共有リンクは誰でも作れる信用できない入力(SEC-3)。読み込みの時間とメモリを有限にするため、
 * トークンの長さ → 展開後の長さ(上限つきの展開、lz.ts)→ 配列の長さ、の順に、物を作る前に上限を調べる。
 */

/** フラグメントのキー */
export const SHARE_PARAM = 's';
/** 短縮形式の版。版 1 は DesignDoc の版 1 を運ぶ */
export const SHARE_FORMAT = 1;
/** これより長いトークンは読まない(展開で大量のメモリを使わせないため) */
export const MAX_SHARE_TOKEN_LENGTH = 24000;
/**
 * 展開後の JSON の長さの上限(文字数)。lz-string は 1 文字ずつ長くなる辞書で、24000 文字のトークンが
 * 6000 万文字に膨らむ(展開爆弾)。正しい共有リンクは、上限いっぱいのゴースト(6000 フレーム)でも
 * 60 万文字に届かない
 */
export const MAX_SHARE_JSON_LENGTH = 1_000_000;

/** 送り主の記録。結果画面で並べて比べる */
export interface ShareRun {
  stageId: string;
  /** 到達時間(s) */
  time: number;
  /** 消費エネルギー(J) */
  energy: number;
  /** 部品数 */
  parts: number;
  cost: number;
  cleared: boolean;
}

export interface SharePayload {
  design: DesignDoc;
  run?: ShareRun;
  ghost?: Ghost;
}

export type ShareDecodeResult =
  { ok: true; payload: SharePayload; warnings: string[]; fromVersion: number } | LoadFailure;

const MAX_STAGE_ID_LENGTH = 64;
const MAX_RUN_VALUE = 1e7;

// ---- 書き出し ----

/**
 * 共有用のフラグメント `#s=...` を作る。設計は validateDesign で正規化してから書く。
 * 設計が壊れているとき(エディタのバグ)は例外を投げる。スコアやゴーストが壊れているときは
 * それだけを省く。RunResult をそのまま run に渡してよい(必要な項目だけ書く)。
 */
export function encodeShare(payload: SharePayload): string {
  const v = validateDesign(payload.design);
  if (!v.ok) throw new Error(`encodeShare: invalid design: ${v.errors.join('; ')}`);
  const out: unknown[] = [SHARE_FORMAT, encodeDesignV1(v.design)];
  // スコア・ゴーストが壊れていれば(NaN など)書かない。機械の共有を優先する
  const run = payload.run ? validateRun(payload.run) : null;
  const ghost = payload.ghost ? validateGhost(payload.ghost) : null;
  if (run || ghost) out.push(run ? encodeRunV1(run) : 0);
  if (ghost) out.push(encodeGhostCompact(ghost));
  return `#${SHARE_PARAM}=${LZString.compressToEncodedURIComponent(JSON.stringify(out))}`;
}

/** base(今のページの URL など)のフラグメントを共有用に差し替えた URL */
export function buildShareUrl(base: string, payload: SharePayload): string {
  const i = base.indexOf('#');
  return `${i >= 0 ? base.slice(0, i) : base}${encodeShare(payload)}`;
}

/** 整数に量子化する(-0 は 0 に) */
const q = (v: number, scale: number) => Math.round(v * scale) || 0;

/**
 * 設計の短縮形式(版 1):
 * [name, jointIds, coords(x0,y0,x1,y1… ×100), fixedJointIdx, links([id, ...jointIdx]),
 *  cranks([id, linkIdx, pivotIdx, phase×1e4]), footIdx(なければ -1), rpm×100,
 *  [count, phaseStepDeg×100, spacing×100, mirrorX(0/1)]]
 */
function encodeDesignV1(d: DesignDoc): unknown[] {
  const ji = new Map(d.joints.map((j, i) => [j.id, i]));
  const li = new Map(d.links.map((l, i) => [l.id, i]));
  const at = (m: Map<string, number>, id: string) => m.get(id) ?? -1;
  const coords: number[] = [];
  for (const j of d.joints) coords.push(q(j.x, 100), q(j.y, 100));
  return [
    d.name,
    d.joints.map((j) => j.id),
    coords,
    d.joints.flatMap((j, i) => (j.fixed ? [i] : [])),
    d.links.map((l) => [l.id, ...l.joints.map((id) => at(ji, id))]),
    d.cranks.map((c) => [c.id, at(li, c.link), at(ji, c.pivot), q(c.phase, 1e4)]),
    d.foot === null ? -1 : at(ji, d.foot),
    q(d.motor.rpm, 100),
    [d.legs.count, q(d.legs.phaseStepDeg, 100), q(d.legs.spacing, 100), d.legs.mirrorX ? 1 : 0],
  ];
}

/** 記録の短縮形式(版 1):[stageId, time(ms), energy×100, parts, cost×10, cleared(0/1)] */
function encodeRunV1(r: ShareRun): unknown[] {
  return [r.stageId, q(r.time, 1000), q(r.energy, 100), r.parts, q(r.cost, 10), r.cleared ? 1 : 0];
}

// ---- 読み込み ----

/** URL・`#...`・`s=...` のどれからでも共有トークンを取り出す。フラグメントだけを見る */
export function extractShareToken(hashOrUrl: string): string | null {
  const i = hashOrUrl.indexOf('#');
  const frag = i >= 0 ? hashOrUrl.slice(i + 1) : hashOrUrl;
  for (const part of frag.split('&')) {
    const eq = part.indexOf('=');
    if (eq > 0 && part.slice(0, eq) === SHARE_PARAM) return part.slice(eq + 1);
  }
  return null;
}

/**
 * 共有リンクを読む。失敗しても例外は投げず、理由(LoadFailReason)を返す。
 * 共有がなければ reason: 'empty'(普通のページ表示)。
 * スコアやゴーストだけが壊れているときは捨てて警告にし、機械は読む。
 */
export function decodeShare(hashOrUrl: string): ShareDecodeResult {
  try {
    return decodeInner(hashOrUrl);
  } catch {
    return { ok: false, reason: 'corrupt', errors: ['共有リンクを読み取れません'] };
  }
}

function decodeInner(hashOrUrl: string): ShareDecodeResult {
  let token = extractShareToken(hashOrUrl);
  if (!token) return { ok: false, reason: 'empty', errors: [] };
  // % でエスケープされていても 1 文字は最大 3 文字。それより長ければ展開する前に捨てる
  if (token.length > MAX_SHARE_TOKEN_LENGTH * 3) {
    return { ok: false, reason: 'corrupt', errors: ['共有リンクが長すぎます'] };
  }
  if (token.includes('%')) {
    try {
      token = decodeURIComponent(token);
    } catch {
      // そのまま
    }
  }
  // チャットアプリなどで + が空白に化けたもの
  token = token.replace(/ /g, '+');
  if (token.length > MAX_SHARE_TOKEN_LENGTH) {
    return { ok: false, reason: 'corrupt', errors: ['共有リンクが長すぎます'] };
  }
  const unpacked = decompressFromEncodedURIComponentBounded(token, MAX_SHARE_JSON_LENGTH);
  if (!unpacked.ok && unpacked.reason === 'too-large') {
    return { ok: false, reason: 'corrupt', errors: ['共有リンクの中身が大きすぎます'] };
  }
  const json = unpacked.ok ? unpacked.text : '';
  if (!json) return { ok: false, reason: 'corrupt', errors: ['共有リンクを展開できません'] };
  const parsed = safeJsonParse(json);
  if (!parsed.ok)
    return { ok: false, reason: 'corrupt', errors: ['共有リンクの中身が壊れています'] };
  const v = parsed.value;
  if (Array.isArray(v)) return decodeCompact(v);
  if (isRecord(v)) return decodePlain(v);
  return { ok: false, reason: 'invalid', errors: ['共有リンクの形式が違います'] };
}

/** 短縮形式 [format, design, run | 0, ghost] */
function decodeCompact(v: unknown[]): ShareDecodeResult {
  const format = v[0];
  if (!isInteger(format))
    return { ok: false, reason: 'invalid', errors: ['共有形式の版がありません'] };
  if (format > SHARE_FORMAT) {
    return {
      ok: false,
      reason: 'version',
      errors: [`共有形式 ${format} はこのアプリより新しい版です(読めるのは ${SHARE_FORMAT} まで)`],
    };
  }
  const decoder = COMPACT_DECODERS[format];
  if (!decoder)
    return { ok: false, reason: 'invalid', errors: [`共有形式 ${format} は読めません`] };
  const d = decoder.design(v[1]);
  if (!d.ok) return { ok: false, reason: 'invalid', errors: d.errors };
  const r = readDesign(d.design);
  if (!r.ok) return r;
  const warnings = [...r.warnings];
  const payload: SharePayload = { design: r.design };
  if (v[2] !== undefined && v[2] !== 0) {
    const run = decoder.run(v[2]);
    if (run) payload.run = run;
    else warnings.push('run: 壊れているので捨てました');
  }
  if (v[3] !== undefined) {
    const ghost = decodeGhostCompact(v[3]);
    if (ghost) payload.ghost = ghost;
    else warnings.push('ghost: 壊れているので捨てました');
  }
  return { ok: true, payload, warnings, fromVersion: r.fromVersion };
}

/** 素の JSON({ design, run?, ghost? } や封筒、設計そのもの)。開発用・古いリンク用 */
function decodePlain(v: Record<string, unknown>): ShareDecodeResult {
  const r = readDesign(v);
  if (!r.ok) return r;
  const warnings = [...r.warnings];
  const payload: SharePayload = { design: r.design };
  if (v.run !== undefined) {
    const run = validateRun(v.run);
    if (run) payload.run = run;
    else warnings.push('run: 壊れているので捨てました');
  }
  if (v.ghost !== undefined) {
    const ghost = validateGhost(v.ghost);
    if (ghost) payload.ghost = ghost;
    else warnings.push('ghost: 壊れているので捨てました');
  }
  return { ok: true, payload, warnings, fromVersion: r.fromVersion };
}

interface CompactDecoder {
  /** 設計の短縮形式 → その版の DesignDoc の形(検査は readDesign で行う) */
  design(v: unknown): { ok: true; design: unknown } | { ok: false; errors: string[] };
  run(v: unknown): ShareRun | null;
}

const COMPACT_DECODERS: Readonly<Record<number, CompactDecoder>> = {
  1: {
    design: decodeDesignV1,
    run: (v) => {
      if (!Array.isArray(v) || v.length !== 6) return null;
      const [stageId, time, energy, parts, cost, cleared] = v as unknown[];
      if (!isInteger(time) || !isInteger(energy) || !isInteger(cost)) return null;
      if (cleared !== 0 && cleared !== 1) return null;
      return validateRun({
        stageId,
        time: time / 1000,
        energy: energy / 100,
        parts,
        cost: cost / 10,
        cleared: cleared === 1,
      });
    },
  },
};

function decodeDesignV1(
  v: unknown,
): { ok: true; design: unknown } | { ok: false; errors: string[] } {
  if (!Array.isArray(v) || v.length !== 9) return { ok: false, errors: ['design: 形式が違います'] };
  const [name, ids, coords, fixed, links, cranks, foot, rpm, legs] = v as unknown[];
  const errors: string[] = [];
  if (!Array.isArray(ids)) return { ok: false, errors: ['design.ids: 配列ではありません'] };
  // 物を作る前に配列の長さを調べる(validateDesign と同じ上限。巨大な配列から大量のオブジェクトを作らない)
  const tooMany = (arr: unknown, max: number) => Array.isArray(arr) && arr.length > max;
  if (
    tooMany(ids, MAX_JOINTS) ||
    tooMany(fixed, MAX_JOINTS) ||
    tooMany(links, MAX_LINKS) ||
    tooMany(cranks, MAX_CRANKS) ||
    (Array.isArray(links) && links.some((l: unknown) => tooMany(l, MAX_LINK_JOINTS + 1)))
  ) {
    return { ok: false, errors: ['design: ジョイント・リンク・クランクが多すぎます'] };
  }
  if (!Array.isArray(coords) || coords.length !== ids.length * 2) {
    return { ok: false, errors: ['design.coords: 座標の数が合いません'] };
  }
  const fixedSet = new Set<unknown>();
  if (!Array.isArray(fixed)) errors.push('design.fixed: 配列ではありません');
  else
    fixed.forEach((k: unknown, i) => {
      if (isInteger(k) && k >= 0 && k < ids.length) fixedSet.add(k);
      else errors.push(`design.fixed[${i}]: 添字が範囲外です`);
    });
  /** 量子化した整数を戻す。整数でなければ NaN にして validateDesign に拒否させる */
  const scaled = (x: unknown, s: number) => (isInteger(x) ? x / s : Number.NaN);
  const coord = (k: number) => scaled(coords[k], 100);
  const joints = ids.map((id: unknown, i) => ({
    id,
    x: coord(i * 2),
    y: coord(i * 2 + 1),
    fixed: fixedSet.has(i),
  }));
  const idAt = (arr: unknown[], k: unknown, path: string): unknown => {
    if (!isInteger(k) || k < 0 || k >= arr.length) {
      errors.push(`${path}: 添字が範囲外です`);
      return undefined;
    }
    return arr[k];
  };
  const linkList: { id: unknown; joints: unknown[] }[] = [];
  if (!Array.isArray(links)) errors.push('design.links: 配列ではありません');
  else
    links.forEach((l: unknown, i) => {
      if (!Array.isArray(l) || l.length < 1) {
        errors.push(`design.links[${i}]: 形式が違います`);
        return;
      }
      const [id, ...members] = l as unknown[];
      linkList.push({
        id,
        joints: members.map((k, m) => idAt(ids, k, `design.links[${i}][${m}]`)),
      });
    });
  const linkIds = linkList.map((l) => l.id);
  const crankList: unknown[] = [];
  if (!Array.isArray(cranks)) errors.push('design.cranks: 配列ではありません');
  else
    cranks.forEach((c: unknown, i) => {
      if (!Array.isArray(c) || c.length !== 4) {
        errors.push(`design.cranks[${i}]: 形式が違います`);
        return;
      }
      const [id, link, pivot, phase] = c as unknown[];
      crankList.push({
        id,
        link: idAt(linkIds, link, `design.cranks[${i}].link`),
        pivot: idAt(ids, pivot, `design.cranks[${i}].pivot`),
        phase: scaled(phase, 1e4),
      });
    });
  const footId = foot === -1 ? null : idAt(ids, foot, 'design.foot');
  if (!Array.isArray(legs) || legs.length !== 4) errors.push('design.legs: 形式が違います');
  const [count, step, spacing, mirror] = Array.isArray(legs) ? (legs as unknown[]) : [];
  if (mirror !== 0 && mirror !== 1) errors.push('design.legs.mirrorX: 0 か 1 ではありません');
  if (errors.length > 0) return { ok: false, errors };
  return {
    ok: true,
    design: {
      version: 1,
      name,
      joints,
      links: linkList,
      cranks: crankList,
      foot: footId,
      motor: { rpm: scaled(rpm, 100) },
      legs: {
        count,
        phaseStepDeg: scaled(step, 100),
        spacing: scaled(spacing, 100),
        mirrorX: mirror === 1,
      },
    },
  };
}

/** 記録の検査。だめなら null。例外は投げない */
export function validateRun(v: unknown): ShareRun | null {
  try {
    return validateRunInner(v);
  } catch {
    // getter が例外を投げるような異常なオブジェクト
    return null;
  }
}

function validateRunInner(v: unknown): ShareRun | null {
  if (!isRecord(v)) return null;
  const { stageId, time, energy, parts, cost, cleared } = v;
  if (!isString(stageId) || stageId.length === 0 || stageId.length > MAX_STAGE_ID_LENGTH)
    return null;
  const nonNeg = (x: unknown): x is number => isFiniteNumber(x) && x >= 0 && x <= MAX_RUN_VALUE;
  if (!nonNeg(time) || !nonNeg(energy) || !nonNeg(cost)) return null;
  if (!isInteger(parts) || parts < 0 || parts > MAX_RUN_VALUE) return null;
  if (!isBoolean(cleared)) return null;
  return { stageId, time, energy, parts, cost, cleared };
}
