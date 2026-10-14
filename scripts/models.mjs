#!/usr/bin/env node
/**
 * 工房の素材(GLB)を Blender のスクリプト(art/blender/)から作り直す。
 *
 *   pnpm models                     全部作り直して public/models/ に書く
 *   pnpm models --only room,logo    一部だけ
 *   pnpm models --preview           確認用の PNG も描く(.e2e-results/art-preview/)
 *   pnpm models --check             一時フォルダに作り、public/models/ とバイト単位で一致するか確かめる
 *
 * Blender は環境変数 BLENDER、なければ macOS の既定の場所、なければ PATH の `blender` を使う。
 * 出力は決定論的(同じスクリプトと同じ Blender なら同じバイト列)。予算:1 つ 400KB、合計 3MB。
 */
import { spawnSync } from 'node:child_process';
import { existsSync, mkdtempSync, readFileSync, readdirSync, rmSync, statSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

const ROOT = resolve(import.meta.dirname, '..');
const OUT = join(ROOT, 'public', 'models');
const BUDGET_EACH = 400_000;
const BUDGET_TOTAL = 3_000_000;

const argv = process.argv.slice(2);
const flag = (name) => argv.includes(name);
const value = (name) => {
  const i = argv.indexOf(name);
  return i >= 0 ? argv[i + 1] : undefined;
};

function findBlender() {
  const candidates = [
    process.env.BLENDER,
    '/Applications/Blender.app/Contents/MacOS/Blender',
    'blender',
  ].filter(Boolean);
  for (const c of candidates) {
    const r = spawnSync(c, ['--version'], { encoding: 'utf8' });
    if (r.status === 0 && /Blender/.test(r.stdout)) {
      return { bin: c, version: r.stdout.split('\n')[0].trim() };
    }
  }
  console.error('Blender が見つかりません。BLENDER=/path/to/blender を指定してください');
  process.exit(2);
}

function run(outDir) {
  const { bin, version } = findBlender();
  console.log(`[models] ${version}`);
  // ユーザーの Python 環境の影響を受けないようにし、ハッシュ順を固定する
  const env = {
    ...process.env,
    PYTHONHASHSEED: '0',
    PYTHONNOUSERSITE: '1',
    PYTHONDONTWRITEBYTECODE: '1',
  };
  for (const k of ['PYTHONPATH', 'PYTHONHOME', 'PYTHONSTARTUP', 'PYTHONUSERBASE']) delete env[k];
  const args = [
    '-b',
    '--factory-startup',
    '--python-use-system-env',
    '--python-exit-code',
    '1',
    '--python',
    join(ROOT, 'art', 'blender', 'build.py'),
    '--',
    '--out',
    outDir,
  ];
  const only = value('--only');
  if (only) args.push('--only', only);
  if (flag('--preview')) args.push('--preview', join(ROOT, '.e2e-results', 'art-preview'));
  const r = spawnSync(bin, args, { cwd: ROOT, env, encoding: 'utf8', maxBuffer: 64 << 20 });
  const lines = `${r.stdout ?? ''}\n${r.stderr ?? ''}`.split('\n');
  for (const l of lines) if (/^\[models\]|Error|Traceback|error/i.test(l)) console.log(l);
  if (r.status !== 0) {
    console.error(lines.slice(-40).join('\n'));
    console.error(`[models] Blender failed (exit ${r.status})`);
    process.exit(1);
  }
}

function sizes(dir) {
  const files = readdirSync(dir)
    .filter((f) => f.endsWith('.glb'))
    .sort();
  let total = 0;
  let over = false;
  for (const f of files) {
    const s = statSync(join(dir, f)).size;
    total += s;
    const bad = s > BUDGET_EACH;
    over ||= bad;
    console.log(
      `  ${f.padEnd(22)} ${(s / 1000).toFixed(1).padStart(7)} KB${bad ? '  ← 400KB 超過' : ''}`,
    );
  }
  console.log(`  ${'合計'.padEnd(20)} ${(total / 1000).toFixed(1).padStart(7)} KB`);
  if (total > BUDGET_TOTAL) {
    console.error('[models] 合計が 3MB を超えています');
    over = true;
  }
  return { files, over };
}

if (flag('--check')) {
  const tmp = mkdtempSync(join(tmpdir(), 'ashikumi-models-'));
  try {
    run(tmp);
    const { files } = sizes(tmp);
    let diff = 0;
    for (const f of files) {
      const committed = join(OUT, f);
      const same =
        existsSync(committed) && readFileSync(committed).equals(readFileSync(join(tmp, f)));
      if (!same) {
        diff++;
        console.error(
          `[models] ${f}: public/models と一致しません(pnpm models で作り直してください)`,
        );
      }
    }
    console.log(diff ? '\nMODELS: DIFF' : '\nMODELS: 一致(再現できる)');
    process.exit(diff ? 1 : 0);
  } finally {
    rmSync(tmp, { recursive: true, force: true });
  }
} else {
  run(OUT);
  const { over } = sizes(OUT);
  process.exit(over ? 1 : 0);
}
