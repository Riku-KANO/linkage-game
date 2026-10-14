import { describe, expect, it } from 'vitest';
import { existsSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { MODEL_MANIFEST, modelUrl, presentModelUrls, type ModelId } from './assets';

const modelsDir = fileURLToPath(new URL('../../public/models/', import.meta.url));

describe('素材の一覧', () => {
  it('present: true の素材は public/models に実在する(実行時に 404 を出さない)', () => {
    for (const [id, e] of Object.entries(MODEL_MANIFEST)) {
      if (e.present) expect(existsSync(`${modelsDir}${e.file}`), id).toBe(true);
    }
  });

  it('public/models の GLB は全て一覧に載っている', () => {
    const files = existsSync(modelsDir)
      ? readdirSync(modelsDir).filter((f) => f.endsWith('.glb'))
      : [];
    const listed = new Set<string>(Object.values(MODEL_MANIFEST).map((e) => e.file));
    for (const f of files) expect(listed.has(f), f).toBe(true);
  });

  it('素材がないものは URL を返さない(手続き生成で代用)', () => {
    for (const id of Object.keys(MODEL_MANIFEST) as ModelId[]) {
      const url = modelUrl(id);
      if (MODEL_MANIFEST[id].present) expect(url).toMatch(/models\/.+\.glb$/);
      else expect(url).toBeNull();
    }
    expect(presentModelUrls().length).toBe(
      Object.values(MODEL_MANIFEST).filter((e) => e.present).length,
    );
  });
});
