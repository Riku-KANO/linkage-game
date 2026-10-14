import type { DesignDoc } from './types';
import { safeJsonParse } from './guards';
import { readDesign, toEnvelope } from './migrate';
import type { DesignReadResult } from './migrate';

/**
 * 設計の JSON ファイルの書き出し・読み込み(MOD-4、U-03)。純粋な関数だけ。
 * ブラウザでのダウンロード・ファイル選択は fileBrowser.ts。
 *
 * ファイルは封筒 { app: 'ashikumi', kind: 'design', version, savedAt?, design } を人が読める形で書く。
 * 共有リンクと違って丸めない(書いた値がそのまま戻る)。
 */

export const DESIGN_FILE_EXTENSION = '.ashikumi.json';
export const DESIGN_FILE_MIME = 'application/json';
/** これより大きいファイルは設計ではないとみなす(文字数) */
export const MAX_DESIGN_FILE_LENGTH = 2_000_000;

export function designToJSONText(design: DesignDoc, opts: { savedAt?: string } = {}): string {
  return `${prettyJson(toEnvelope(design, opts.savedAt))}\n`;
}

/** ファイルの中身を読む:JSON → migrate → validateDesign。例外は投げない */
export function parseDesignFile(text: string): DesignReadResult {
  if (text.length > MAX_DESIGN_FILE_LENGTH) {
    return { ok: false, reason: 'corrupt', errors: ['ファイルが大きすぎます'] };
  }
  const body = text.replace(/^﻿/, '');
  if (body.trim() === '') return { ok: false, reason: 'empty', errors: ['ファイルが空です'] };
  const parsed = safeJsonParse(body);
  if (!parsed.ok) return { ok: false, reason: 'corrupt', errors: ['JSON として読めません'] };
  return readDesign(parsed.value);
}

/** 設計名からファイル名を作る。OS で使えない文字は _ に置き換える */
export function designFileName(design: DesignDoc): string {
  const base = design.name.replace(/[\\/:*?"<>|\u0000-\u001f]/g, '_').trim();
  return `${base || 'design'}${DESIGN_FILE_EXTENSION}`;
}

/**
 * 読みやすい JSON。width 文字に収まる配列・オブジェクトは 1 行に、それ以外は字下げして展開する
 * (ジョイントやリンクが 1 行ずつ並ぶ)。結果は普通の JSON。
 */
export function prettyJson(value: unknown, width = 100): string {
  return format(value, '', width);
}

function format(v: unknown, indent: string, width: number): string {
  const inline = formatInline(v);
  if (typeof v !== 'object' || v === null || indent.length + inline.length <= width) return inline;
  const inner = `${indent}  `;
  if (Array.isArray(v)) {
    if (v.length === 0) return '[]';
    const items = v.map((x: unknown) => `${inner}${format(x ?? null, inner, width)}`);
    return `[\n${items.join(',\n')}\n${indent}]`;
  }
  const entries = Object.entries(v).filter(([, x]) => x !== undefined);
  if (entries.length === 0) return '{}';
  const items = entries.map(([k, x]) => `${inner}${JSON.stringify(k)}: ${format(x, inner, width)}`);
  return `{\n${items.join(',\n')}\n${indent}}`;
}

function formatInline(v: unknown): string {
  if (Array.isArray(v)) return `[${v.map((x: unknown) => formatInline(x ?? null)).join(', ')}]`;
  if (typeof v === 'object' && v !== null) {
    const entries = Object.entries(v).filter(([, x]) => x !== undefined);
    if (entries.length === 0) return '{}';
    return `{ ${entries.map(([k, x]) => `${JSON.stringify(k)}: ${formatInline(x)}`).join(', ')} }`;
  }
  return JSON.stringify(v) ?? 'null';
}
