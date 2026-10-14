#!/usr/bin/env node
/**
 * ビルド結果(cf の Build Output:.cloudflare/output/v0/workers/default/assets)を、本番と同じヘッダー(public/_headers)つきで配信する手元検証用サーバー。
 * CSP などのセキュリティヘッダーで壊れないかをブラウザで確かめるために使う。
 *
 *   pnpm build && node scripts/serve-dist.mjs [port]   (既定 4173)
 *
 * _headers の書式は Cloudflare と同じ:パス(* はワイルドカード)の行のあとに、字下げしたヘッダー行。
 * 一致した規則のヘッダーはすべて足し合わせる。存在しないパスは index.html を返す(SPA フォールバック)。
 */
import { createServer } from 'node:http';
import { readFileSync, statSync, createReadStream } from 'node:fs';
import { extname, join, normalize, resolve } from 'node:path';

const root = resolve(process.env.ASSETS_DIR ?? '.cloudflare/output/v0/workers/default/assets');
const port = Number(process.argv[2] ?? 4173);

function parseHeaders(text) {
  const rules = [];
  let current = null;
  for (const raw of text.split('\n')) {
    if (!raw.trim() || raw.trim().startsWith('#')) continue;
    if (!/^\s/.test(raw)) {
      const pattern = raw.trim();
      const re = new RegExp(
        '^' +
          pattern
            .split('*')
            .map((s) => s.replace(/[.+?^${}()|[\]\\]/g, '\\$&'))
            .join('.*') +
          '$',
      );
      current = { re, headers: [] };
      rules.push(current);
    } else if (current) {
      const i = raw.indexOf(':');
      current.headers.push([raw.slice(0, i).trim(), raw.slice(i + 1).trim()]);
    }
  }
  return rules;
}

const rules = parseHeaders(readFileSync(join(root, '_headers'), 'utf8'));
const TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.json': 'application/json',
  '.wasm': 'application/wasm',
  '.glb': 'model/gltf-binary',
  '.png': 'image/png',
};

createServer((req, res) => {
  const url = new URL(req.url ?? '/', 'http://localhost');
  let path = normalize(decodeURIComponent(url.pathname)).replace(/^(\.\.[/\\])+/, '');
  let file = join(root, path);
  let isFile = false;
  try {
    isFile = statSync(file).isFile();
  } catch {}
  if (!isFile) {
    path = '/index.html';
    file = join(root, 'index.html');
  }
  for (const rule of rules) {
    if (rule.re.test(url.pathname)) for (const [k, v] of rule.headers) res.setHeader(k, v);
  }
  // ローカルは http なので HSTS と upgrade-insecure-requests は外す(本番は https)
  res.removeHeader('Strict-Transport-Security');
  const csp = res.getHeader('Content-Security-Policy');
  if (typeof csp === 'string')
    res.setHeader('Content-Security-Policy', csp.replace(/;\s*upgrade-insecure-requests/, ''));
  res.setHeader('Content-Type', TYPES[extname(file)] ?? 'application/octet-stream');
  createReadStream(file).pipe(res);
}).listen(port, () => console.log(`dist + _headers → http://localhost:${port}`));
