import { describe, expect, it } from 'vitest';
import { designFileName, designToJSONText, parseDesignFile, prettyJson } from './file';
import { chebyshevLambda, fourBar, jansenLeg, jansenWalker } from './presets';
import { createEmptyDesign, DESIGN_VERSION } from './types';
import { APP_ID } from './migrate';

describe('JSON file export/import (MOD-4, U-03)', () => {
  it('writes a pretty, versioned envelope', () => {
    const text = designToJSONText(jansenLeg());
    expect(text.endsWith('\n')).toBe(true);
    expect(text.split('\n').length).toBeGreaterThan(10);
    expect(text).toContain(`"app": "${APP_ID}"`);
    const env = JSON.parse(text) as Record<string, unknown>;
    expect(env).toEqual({
      app: APP_ID,
      kind: 'design',
      version: DESIGN_VERSION,
      design: jansenLeg(),
    });
    // 1 ジョイント 1 行
    expect(text).toMatch(/\{ "id": "O", "x": 0, "y": 0, "fixed": true \}/);
    const dated = JSON.parse(
      designToJSONText(fourBar(), { savedAt: '2026-10-15T12:00:00.000Z' }),
    ) as Record<string, unknown>;
    expect(dated.savedAt).toBe('2026-10-15T12:00:00.000Z');
  });

  it('round-trips exactly (no rounding in files)', () => {
    for (const d of [
      jansenLeg(),
      jansenWalker(),
      chebyshevLambda(),
      fourBar(),
      createEmptyDesign(),
    ]) {
      const r = parseDesignFile(designToJSONText(d));
      if (!r.ok) throw new Error(r.errors.join('; '));
      expect(r.design).toEqual(d);
      expect(r.warnings).toEqual([]);
      expect(r.fromVersion).toBe(DESIGN_VERSION);
    }
  });

  it('pretty printing is plain JSON', () => {
    const v = { a: [1, 2, { b: 'x"y', c: null }], d: { e: [] as number[], f: {} }, g: 'é' };
    expect(JSON.parse(prettyJson(v))).toEqual(v);
    expect(JSON.parse(prettyJson(v, 0))).toEqual(v);
    expect(prettyJson({ skip: undefined, keep: 1 })).toBe('{ "keep": 1 }');
  });

  it('reads a bare design, a BOM and legacy v0 files through migrate + validate', () => {
    expect(parseDesignFile(JSON.stringify(jansenLeg())).ok).toBe(true);
    expect(parseDesignFile(`﻿${designToJSONText(jansenLeg())}`).ok).toBe(true);
    const v0 = {
      app: APP_ID,
      kind: 'design',
      version: 0,
      design: {
        joints: [
          { id: 'a', x: 0, y: 0 },
          { id: 'b', x: 1, y: 2 },
        ],
        fixed: ['a'],
        links: [{ id: 'l', joints: ['a', 'b'] }],
        cranks: [],
        rpm: 12,
      },
    };
    const r = parseDesignFile(JSON.stringify(v0));
    expect(r.ok && r.fromVersion).toBe(0);
    expect(r.ok && r.design.motor.rpm).toBe(12);
  });

  it('explains why a file cannot be read', () => {
    const reason = (text: string) => {
      const r = parseDesignFile(text);
      return r.ok ? 'ok' : r.reason;
    };
    expect(reason('')).toBe('empty');
    expect(reason('   \n')).toBe('empty');
    expect(reason('{"app": "ashikumi", ')).toBe('corrupt');
    expect(reason('<html></html>')).toBe('corrupt');
    expect(reason(JSON.stringify({ app: 'other', version: 1, design: jansenLeg() }))).toBe(
      'foreign',
    );
    expect(reason(JSON.stringify({ app: APP_ID, version: 42, design: {} }))).toBe('version');
    const broken = JSON.parse(designToJSONText(jansenLeg())) as { design: { foot: string } };
    broken.design.foot = 'nowhere';
    expect(reason(JSON.stringify(broken))).toBe('invalid');
    expect(reason('[1, 2, 3]')).toBe('invalid');
    expect(reason('"design"')).toBe('invalid');
  });

  it('makes a safe file name from the design name', () => {
    expect(designFileName(jansenLeg())).toBe('ヤンセンリンク.ashikumi.json');
    const d = createEmptyDesign('a/b:c*?"<>|\\d');
    expect(designFileName(d)).toBe('a_b_c_______d.ashikumi.json');
    expect(designFileName(createEmptyDesign('   '))).toBe('design.ashikumi.json');
  });
});
