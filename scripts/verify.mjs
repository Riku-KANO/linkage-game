#!/usr/bin/env node
/**
 * 検証ゲート(ループの「判定」)。エージェントも人間もこれ 1 本で合否を決める。
 *
 *   pnpm verify            format → typecheck → test → build
 *   pnpm verify --quick    build を省く(内側ループ用)
 *   pnpm verify --fix      先に prettier --write してから検証
 *   pnpm verify --e2e      最後に Playwright の E2E(本番ビルド+本番ヘッダー、実 Chromium)も実行
 *
 * 失敗したステップは出力の末尾だけを表示する(エージェントの文脈を節約するため)。
 */
import { spawnSync } from 'node:child_process';

const args = new Set(process.argv.slice(2));
const quick = args.has('--quick');
const fix = args.has('--fix');
const e2e = args.has('--e2e');

const steps = [
  fix && {
    name: 'format:write',
    cmd: ['pnpm', 'exec', 'prettier', '--write', '.', '--log-level', 'warn'],
  },
  { name: 'format', cmd: ['pnpm', 'exec', 'prettier', '--check', '.', '--log-level', 'warn'] },
  { name: 'typecheck', cmd: ['pnpm', 'exec', 'tsc', '--noEmit', '-p', 'tsconfig.json'] },
  { name: 'test', cmd: ['pnpm', 'exec', 'vitest', 'run', '--reporter=dot'] },
  !quick && { name: 'build', cmd: ['pnpm', 'exec', 'vite', 'build', '--logLevel', 'warn'] },
  !quick && e2e && { name: 'e2e', cmd: ['pnpm', 'exec', 'playwright', 'test', '--reporter=line'] },
].filter(Boolean);

const TAIL = 60;
const results = [];
let failed = false;
for (const step of steps) {
  const t0 = Date.now();
  const r = spawnSync(step.cmd[0], step.cmd.slice(1), {
    encoding: 'utf8',
    env: { ...process.env, FORCE_COLOR: '0', CI: '1' },
    maxBuffer: 64 * 1024 * 1024,
  });
  const ms = Date.now() - t0;
  const ok = r.status === 0;
  results.push({ name: step.name, ok, ms });
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${step.name.padEnd(12)} ${(ms / 1000).toFixed(1)}s`);
  if (!ok) {
    failed = true;
    const out = `${r.stdout ?? ''}\n${r.stderr ?? ''}`.trim().split('\n');
    console.log(
      out
        .slice(-TAIL)
        .map((l) => `    ${l}`)
        .join('\n'),
    );
    if (step.name === 'format') console.log('    → `pnpm verify --fix` で整形できます');
    break;
  }
}
console.log(failed ? '\nVERIFY: FAIL' : '\nVERIFY: PASS');
process.exit(failed ? 1 : 0);
