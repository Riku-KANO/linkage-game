import type { DesignDoc } from './types';
import { DEFAULT_LEGS, DESIGN_VERSION } from './types';
import { isFiniteNumber, isInteger, isRecord, isString, isStringArray, show } from './guards';
import type { UnknownRecord } from './guards';
import { validateDesign } from './validate';

/**
 * バージョン番号つきの封筒と、古い形式からの移行(MOD-2、非機能「データ互換」)。
 *
 * 読み込みの流れ:任意の JSON → migrate()(封筒を開き、古い版を順に DESIGN_VERSION まで上げる)
 *   → validateDesign()(検査と正規化)。まとめて readDesign() で行える。
 *
 * 形式を変えるときは:types.ts の DESIGN_VERSION を上げ、MIGRATIONS に「旧版 → 次の版」の関数を足す。
 * 移行関数は信用できない入力を受けるので、例外を投げずに分かる範囲で変換し、残りの検査は
 * validateDesign に任せる。共有リンクの短縮形式も版ごとの読み取りを残す(share.ts)。
 */

export const APP_ID = 'ashikumi';

/** ファイル・localStorage に書く封筒 */
export interface DesignEnvelope {
  app: typeof APP_ID;
  kind: 'design';
  version: typeof DESIGN_VERSION;
  /** 保存日時(ISO 8601)。任意 */
  savedAt?: string;
  design: DesignDoc;
}

export function toEnvelope(design: DesignDoc, savedAt?: string): DesignEnvelope {
  const env: DesignEnvelope = { app: APP_ID, kind: 'design', version: DESIGN_VERSION, design };
  if (savedAt !== undefined) env.savedAt = savedAt;
  return env;
}

/**
 * 読み込みに失敗した理由。画面の文言はこれで選ぶ。
 *  - empty:読むものがない(共有フラグメントがない、空のファイル)
 *  - corrupt:展開・JSON の解析ができない
 *  - foreign:アシクミのデータではない
 *  - version:このアプリより新しい版のデータ(アプリの更新が必要)
 *  - invalid:形が壊れている・参照先がない
 */
export type LoadFailReason = 'empty' | 'corrupt' | 'foreign' | 'version' | 'invalid';

export type LoadFailure = { ok: false; reason: LoadFailReason; errors: string[] };

/**
 * 版 v のデータを v + 1 の形に変える。入力は信用できない(形が崩れていてもよい)。
 * version フィールドは applyMigrations が設定する。
 */
export type Migration = (data: UnknownRecord, warn: (msg: string) => void) => UnknownRecord;

/**
 * v0(合成した旧形式。開発初期の試作フォーマットとして移行の仕組みを試すためのもの):
 * version なし、固定点は別の id リスト、モーター・脚列の設定なし、rpm はトップレベル、
 * クランクに位相なし。
 */
export interface DesignV0 {
  version?: 0;
  name?: string;
  joints: { id: string; x: number; y: number }[];
  /** 固定点のジョイント id */
  fixed: string[];
  links: { id: string; joints: string[] }[];
  cranks: { id: string; link: string; pivot: string; phase?: number }[];
  foot?: string | null;
  rpm?: number;
}

const DEFAULT_V0_NAME = '無題の機械';
const DEFAULT_V0_RPM = 30;

const migrateV0: Migration = (d, warn) => {
  const fixed = new Set(isStringArray(d.fixed) ? d.fixed : []);
  const seen = new Set<string>();
  const joints = Array.isArray(d.joints)
    ? d.joints.map((j: unknown) => {
        if (!isRecord(j)) return j;
        if (isString(j.id)) seen.add(j.id);
        return { id: j.id, x: j.x, y: j.y, fixed: isString(j.id) && fixed.has(j.id) };
      })
    : d.joints;
  for (const id of fixed)
    if (!seen.has(id)) warn(`fixed: 存在しないジョイント ${show(id)} を無視しました`);
  // 入力のオブジェクトは展開しない(知らないキーや __proto__ を持ち込まない)。必要な項目だけ読む
  const cranks = Array.isArray(d.cranks)
    ? d.cranks.map((c: unknown) =>
        isRecord(c) ? { id: c.id, link: c.link, pivot: c.pivot, phase: c.phase ?? 0 } : c,
      )
    : d.cranks;
  return {
    name: isString(d.name) ? d.name : DEFAULT_V0_NAME,
    joints,
    links: d.links,
    cranks,
    foot: d.foot ?? null,
    motor: { rpm: isFiniteNumber(d.rpm) ? d.rpm : DEFAULT_V0_RPM },
    legs: { ...DEFAULT_LEGS },
  };
};

/** 版 → 次の版への移行。キーは移行元の版 */
export const MIGRATIONS: Readonly<Record<number, Migration>> = {
  0: migrateV0,
};

export type MigrateResult =
  | { ok: true; data: unknown; fromVersion: number; warnings: string[] }
  | { ok: false; reason: 'foreign' | 'version' | 'invalid'; errors: string[] };

/** from の版のデータに移行を順に当てて to の版にする */
export function applyMigrations(
  data: UnknownRecord,
  from: number,
  to: number,
  table: Readonly<Record<number, Migration>> = MIGRATIONS,
):
  | { ok: true; data: UnknownRecord; warnings: string[] }
  | { ok: false; reason: 'invalid'; errors: string[] } {
  const warnings: string[] = [];
  let cur = data;
  for (let v = from; v < to; v++) {
    const step = table[v];
    if (!step)
      return { ok: false, reason: 'invalid', errors: [`v${v} → v${v + 1} の移行がありません`] };
    try {
      cur = { ...step(cur, (msg) => warnings.push(msg)), version: v + 1 };
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      return {
        ok: false,
        reason: 'invalid',
        errors: [`v${v} → v${v + 1} の移行に失敗しました: ${msg}`],
      };
    }
  }
  return { ok: true, data: cur, warnings };
}

/**
 * 封筒・素の設計データのどちらでも受け取り、DESIGN_VERSION の形に上げる(検査はしない)。
 * version がなければ v0 とみなす。
 */
export function migrate(raw: unknown): MigrateResult {
  try {
    return migrateInner(raw);
  } catch {
    return { ok: false, reason: 'invalid', errors: ['設計データを読み取れません'] };
  }
}

function migrateInner(raw: unknown): MigrateResult {
  if (!isRecord(raw)) {
    return { ok: false, reason: 'invalid', errors: ['設計データがオブジェクトではありません'] };
  }
  if (raw.app !== undefined && raw.app !== APP_ID) {
    return {
      ok: false,
      reason: 'foreign',
      errors: [`アシクミのデータではありません(app = ${show(raw.app)})`],
    };
  }
  let body: unknown = raw;
  let envelopeVersion: unknown = undefined;
  // `in` だとプロトタイプ上のキーも数えるので、自前のキーだけを見る
  if (Object.hasOwn(raw, 'design') && !Object.hasOwn(raw, 'joints')) {
    body = raw.design;
    envelopeVersion = raw.version;
  }
  if (!isRecord(body)) {
    return { ok: false, reason: 'invalid', errors: ['design: オブジェクトではありません'] };
  }
  const version =
    body.version !== undefined ? body.version : envelopeVersion !== undefined ? envelopeVersion : 0;
  if (!isInteger(version) || version < 0) {
    return { ok: false, reason: 'invalid', errors: [`version: 不正な値です(${show(version)})`] };
  }
  if (version > DESIGN_VERSION) {
    return {
      ok: false,
      reason: 'version',
      errors: [
        `version: ${version} はこのアプリより新しい形式です(読めるのは ${DESIGN_VERSION} まで)。アプリを更新してください`,
      ],
    };
  }
  if (version === DESIGN_VERSION)
    return { ok: true, data: body, fromVersion: version, warnings: [] };
  const r = applyMigrations(body, version, DESIGN_VERSION);
  if (!r.ok) return r;
  return { ok: true, data: r.data, fromVersion: version, warnings: r.warnings };
}

export type DesignReadResult =
  { ok: true; design: DesignDoc; warnings: string[]; fromVersion: number } | LoadFailure;

/** migrate → validateDesign。外から来た設計データの読み込みはこれを使う */
export function readDesign(raw: unknown): DesignReadResult {
  const m = migrate(raw);
  if (!m.ok) return m;
  const v = validateDesign(m.data);
  if (!v.ok) return { ok: false, reason: 'invalid', errors: v.errors };
  return {
    ok: true,
    design: v.design,
    warnings: [...m.warnings, ...v.warnings],
    fromVersion: m.fromVersion,
  };
}
