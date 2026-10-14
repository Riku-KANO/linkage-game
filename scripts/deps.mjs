#!/usr/bin/env node
/**
 * 依存パッケージの鮮度と脆弱性のゲート(セキュリティ方針:できるだけ最新を使う)。
 *
 *   pnpm deps:check    既知の脆弱性(pnpm audit)と、最新でない直接依存を検出したら失敗
 *   pnpm deps:update   直接依存を最新へ更新(範囲指定は pnpm update --latest、
 *                      固定したプレリリースは同じタグの最新へ)してから check
 *
 * 固定したプレリリース(例:cf@1.0.0-beta.17)は `latest` タグとは比べず、
 * 同じプレリリース系列(beta など)の最新版と比べる。
 * pnpm 11 の minimumReleaseAge(公開直後の版を待つ供給網対策)はそのまま効かせる。
 */
import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';

const mode = process.argv[2] ?? 'check';

function run(cmd, args, opts = {}) {
  const r = spawnSync(cmd, args, { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024, ...opts });
  return { status: r.status, stdout: r.stdout ?? '', stderr: r.stderr ?? '' };
}

function directDeps() {
  const pkg = JSON.parse(readFileSync('package.json', 'utf8'));
  return { ...(pkg.dependencies ?? {}), ...(pkg.devDependencies ?? {}) };
}

const isExactPrerelease = (spec) => /^\d+\.\d+\.\d+-[0-9A-Za-z.-]+$/.test(spec);
const prereleaseTag = (spec) => spec.split('-')[1].split('.')[0]; // "beta"

/** 固定したプレリリースの、同じ系列の最新版 */
function newestPrerelease(name, spec) {
  const r = run('npm', ['view', name, 'dist-tags', '--json']);
  if (r.status !== 0) return null;
  const tags = JSON.parse(r.stdout);
  const tag = prereleaseTag(spec);
  // dist-tag が同名ならそれを使う。なければ latest がプレリリース系列ならそれ
  if (tags[tag]) return tags[tag];
  if (tags.latest && tags.latest.includes(`-${tag}`)) return tags.latest;
  return null;
}

function checkOutdated() {
  const problems = [];
  const r = run('pnpm', ['outdated', '--format', 'json']);
  if (r.stdout.trim()) {
    try {
      const data = JSON.parse(r.stdout);
      for (const [name, info] of Object.entries(data)) {
        const spec = directDeps()[name];
        if (spec && isExactPrerelease(spec)) continue; // 下で別に比べる
        problems.push(`${name}: ${info.current} → ${info.latest}`);
      }
    } catch {
      problems.push(`pnpm outdated の出力を読めません: ${r.stdout.slice(0, 200)}`);
    }
  }
  for (const [name, spec] of Object.entries(directDeps())) {
    if (!isExactPrerelease(spec)) continue;
    const newest = newestPrerelease(name, spec);
    if (newest && newest !== spec)
      problems.push(`${name}: ${spec} → ${newest}(${prereleaseTag(spec)})`);
  }
  return problems;
}

function checkAudit() {
  const r = run('pnpm', ['audit', '--json']);
  try {
    const data = JSON.parse(r.stdout);
    const v = data.metadata?.vulnerabilities ?? {};
    const total = Object.values(v).reduce((a, b) => a + b, 0);
    const lines = Object.values(data.advisories ?? {}).map(
      (a) =>
        `${a.severity.padEnd(8)} ${a.module_name} ${a.vulnerable_versions} → ${a.patched_versions}  (${a.findings?.[0]?.paths?.[0] ?? ''})`,
    );
    return { total, summary: v, lines };
  } catch {
    return {
      total: -1,
      summary: {},
      lines: [`pnpm audit を実行できません: ${r.stderr.slice(0, 200)}`],
    };
  }
}

function update() {
  console.log('== pnpm update --latest');
  let r = run('pnpm', ['update', '--latest'], { stdio: 'inherit' });
  if (r.status !== 0) process.exit(r.status ?? 1);
  for (const [name, spec] of Object.entries(directDeps())) {
    if (!isExactPrerelease(spec)) continue;
    const newest = newestPrerelease(name, spec);
    if (newest && newest !== spec) {
      console.log(`== ${name}@${newest}`);
      r = run('pnpm', ['add', '--save-exact', `${name}@${newest}`], { stdio: 'inherit' });
      if (r.status !== 0) process.exit(r.status ?? 1);
    }
  }
}

if (mode === 'update') update();
else if (mode !== 'check') {
  console.log('usage: node scripts/deps.mjs [check|update]');
  process.exit(2);
}

const outdated = checkOutdated();
const audit = checkAudit();
console.log(outdated.length ? 'FAIL  outdated' : 'PASS  outdated');
outdated.forEach((l) => console.log(`    ${l}`));
console.log(audit.total === 0 ? 'PASS  audit' : 'FAIL  audit');
audit.lines.forEach((l) => console.log(`    ${l}`));
const ok = outdated.length === 0 && audit.total === 0;
console.log(
  ok ? '\nDEPS: PASS' : '\nDEPS: FAIL — `pnpm deps:update` で更新し、`pnpm verify` で確認',
);
process.exit(ok ? 0 : 1);
