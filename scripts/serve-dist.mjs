#!/usr/bin/env node
/**
 * ビルド結果(cf の Build Output:.cloudflare/output/v0/workers/default/assets)を、本番と同じヘッダー(public/_headers)つきで配信する手元検証用サーバー。
 * CSP などのセキュリティヘッダーで壊れないかをブラウザで確かめるために使う(E2E もこれを使う)。
 *
 *   pnpm build && node scripts/serve-dist.mjs [port]   (既定 4173。0 なら空いているポート)
 *   環境変数:ASSETS_DIR(配信するディレクトリ)、HOST(既定 127.0.0.1。LAN に出したいときだけ変える)
 *
 * _headers の書式は Cloudflare と同じ:パス(* はワイルドカード)の行のあとに、字下げしたヘッダー行。
 * 一致した規則のヘッダーはすべて足し合わせる。存在しないパスは index.html を返す(SPA フォールバック)。
 *
 * 安全のための決まり(SEC-4、docs/security.md):
 *  - 既定ではループバック(127.0.0.1)だけで待ち受ける
 *  - GET と HEAD だけ。ほかは 405
 *  - 壊れた URL(不正な % エスケープ、NUL)は 400。例外でプロセスを落とさない
 *  - 実体パス(シンボリックリンクを解決した後)が配信ディレクトリの外なら 404(パス走査・外へのリンク)
 *  - _headers などの設定ファイルは配信しない(Cloudflare と同じ)
 */
import { createServer } from 'node:http';
import { createReadStream, readFileSync, realpathSync, statSync } from 'node:fs';
import { extname, join, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

export function parseHeaders(text) {
  const rules = [];
  let current = null;
  for (const raw of text.split(/\r?\n/)) {
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
      if (i <= 0) continue;
      current.headers.push([raw.slice(0, i).trim(), raw.slice(i + 1).trim()]);
    }
  }
  return rules;
}

const TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.json': 'application/json',
  '.webmanifest': 'application/manifest+json',
  '.wasm': 'application/wasm',
  '.glb': 'model/gltf-binary',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.webp': 'image/webp',
  '.ico': 'image/x-icon',
  '.woff2': 'font/woff2',
  '.txt': 'text/plain; charset=utf-8',
};

/** 配信しない設定ファイル(Cloudflare も配信しない) */
const HIDDEN = new Set(['/_headers', '/_redirects', '/_routes.json']);

/**
 * URL のパス(デコード済み)を配信ディレクトリ内の実体ファイルにする。
 * 外に出る(.. やシンボリックリンク)・ファイルでない・存在しないときは null。
 */
export function resolveInside(realRoot, decodedPath) {
  if (HIDDEN.has(decodedPath)) return null;
  const candidate = resolve(realRoot, `.${sep}${decodedPath}`);
  const inside = (p) => p === realRoot || p.startsWith(realRoot + sep);
  if (!inside(candidate)) return null;
  let real;
  try {
    real = realpathSync(candidate);
  } catch {
    return null;
  }
  if (!inside(real)) return null;
  try {
    const st = statSync(real);
    return st.isFile() ? { file: real, size: st.size } : null;
  } catch {
    return null;
  }
}

/** リクエストを処理する関数を作る。どんな入力でも例外を外に出さない */
export function createHandler({ root, rules }) {
  const realRoot = realpathSync(root);
  const index = resolveInside(realRoot, '/index.html');

  const send = (req, res, status, headers, body) => {
    res.writeHead(status, headers);
    res.end(req.method === 'HEAD' ? undefined : body);
  };

  const handle = (req, res) => {
    if (req.method !== 'GET' && req.method !== 'HEAD') {
      send(
        req,
        res,
        405,
        { Allow: 'GET, HEAD', 'Content-Type': 'text/plain' },
        'method not allowed',
      );
      return;
    }
    let pathname;
    let decoded;
    try {
      pathname = new URL(req.url ?? '/', 'http://localhost').pathname;
      decoded = decodeURIComponent(pathname);
    } catch {
      send(req, res, 400, { 'Content-Type': 'text/plain' }, 'bad request');
      return;
    }
    if (decoded.includes('\0')) {
      send(req, res, 400, { 'Content-Type': 'text/plain' }, 'bad request');
      return;
    }
    // .. を含むパス(エスケープした / や \ で URL の正規化をすり抜けたもの)は、解決先が中でも拒否する
    if (/(^|[/\\])\.\.([/\\]|$)/.test(decoded)) {
      send(req, res, 404, { 'Content-Type': 'text/plain' }, 'not found');
      return;
    }
    let hit = resolveInside(realRoot, decoded);
    if (!hit) {
      // SPA フォールバック
      hit = index;
      if (!hit) {
        send(req, res, 404, { 'Content-Type': 'text/plain' }, 'not found');
        return;
      }
    }
    for (const rule of rules) {
      if (rule.re.test(pathname)) for (const [k, v] of rule.headers) res.setHeader(k, v);
    }
    // ローカルは http なので HSTS と upgrade-insecure-requests は外す(本番は https)
    res.removeHeader('Strict-Transport-Security');
    const csp = res.getHeader('Content-Security-Policy');
    if (typeof csp === 'string')
      res.setHeader('Content-Security-Policy', csp.replace(/;\s*upgrade-insecure-requests/, ''));
    res.setHeader('Content-Type', TYPES[extname(hit.file)] ?? 'application/octet-stream');
    res.setHeader('Content-Length', String(hit.size));
    if (req.method === 'HEAD') {
      res.writeHead(200);
      res.end();
      return;
    }
    const stream = createReadStream(hit.file);
    // 読み込み中に消えた・読めないファイルでもプロセスを落とさない
    stream.on('error', () => res.destroy());
    stream.pipe(res);
  };

  return (req, res) => {
    try {
      handle(req, res);
    } catch {
      if (!res.headersSent) {
        res.writeHead(500, { 'Content-Type': 'text/plain' });
        res.end('internal error');
      } else res.destroy();
    }
  };
}

export function startServer({ root, port = 4173, host = '127.0.0.1' }) {
  const rules = parseHeaders(readFileSync(join(root, '_headers'), 'utf8'));
  const server = createServer(createHandler({ root, rules }));
  // 壊れた HTTP(パーサーの例外)でもプロセスを落とさない
  server.on('clientError', (_err, socket) => {
    if (socket.writable) socket.end('HTTP/1.1 400 Bad Request\r\nConnection: close\r\n\r\n');
    else socket.destroy();
  });
  server.listen(port, host);
  return server;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const root = resolve(process.env.ASSETS_DIR ?? '.cloudflare/output/v0/workers/default/assets');
  const port = Number(process.argv[2] ?? 4173);
  const host = process.env.HOST ?? '127.0.0.1';
  const server = startServer({ root, port, host });
  server.on('listening', () => {
    const addr = server.address();
    const p = typeof addr === 'object' && addr ? addr.port : port;
    console.log(`dist + _headers → http://localhost:${p} (${host})`);
  });
}
