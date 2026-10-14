import { expect, test } from '@playwright/test';
import { spawn, type ChildProcess } from 'node:child_process';
import { mkdirSync, mkdtempSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { connect } from 'node:net';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import LZString from 'lz-string';
import { watchErrors } from './helpers';

/**
 * セキュリティの E2E(SEC-3, SEC-4、docs/security.md)。
 *  1. 手元配信サーバー(scripts/serve-dist.mjs)を細工したディレクトリで起動し、生の HTTP で
 *     パス走査・外へのシンボリックリンク・壊れた URL・不正なメソッドを試す
 *  2. 本番ビルドのヘッダー(CSP・Trusted Types・COOP/CORP・Permissions-Policy)
 *  3. 全画面が Trusted Types と CSP の下でエラーなく動くこと、危ない API が実際に止まること
 *  4. 細工した共有リンク(展開爆弾)を開いても固まらないこと
 */

const SECRET = 'TOP-SECRET-OUTSIDE-THE-ROOT';

/** 生の HTTP リクエストを送る(クライアントの URL 正規化を通さない) */
function rawRequest(port: number, head: string): Promise<{ status: number; text: string }> {
  return new Promise((resolve, reject) => {
    const socket = connect(port, '127.0.0.1');
    let data = '';
    socket.setEncoding('latin1');
    socket.on('data', (d: string) => (data += d));
    socket.on('error', reject);
    socket.on('close', () =>
      resolve({ status: Number(/^HTTP\/1\.1 (\d+)/.exec(data)?.[1] ?? 0), text: data }),
    );
    socket.setTimeout(5000, () => socket.destroy());
    socket.write(head);
  });
}
const get = (port: number, target: string, method = 'GET') =>
  rawRequest(port, `${method} ${target} HTTP/1.1\r\nHost: localhost\r\nConnection: close\r\n\r\n`);

test.describe('local dist server (SEC-4)', () => {
  let dir = '';
  let server: ChildProcess | null = null;
  let port = 0;

  test.beforeAll(async () => {
    dir = mkdtempSync(join(tmpdir(), 'ashikumi-serve-'));
    const root = join(dir, 'root');
    const outside = join(dir, 'outside');
    mkdirSync(join(root, 'assets'), { recursive: true });
    mkdirSync(outside);
    writeFileSync(join(root, 'index.html'), '<!doctype html><title>index</title>');
    writeFileSync(join(root, 'assets', 'app.js'), 'console.log(1)');
    writeFileSync(
      join(root, '_headers'),
      "/*\n  X-Test: on\n  Content-Security-Policy: default-src 'self'; upgrade-insecure-requests\n  Strict-Transport-Security: max-age=1\n",
    );
    writeFileSync(join(outside, 'secret.txt'), SECRET);
    symlinkSync(join(outside, 'secret.txt'), join(root, 'link.txt'));
    symlinkSync(outside, join(root, 'linkdir'));
    server = spawn(process.execPath, ['scripts/serve-dist.mjs', '0'], {
      env: { ...process.env, ASSETS_DIR: root },
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    port = await new Promise<number>((resolve, reject) => {
      let out = '';
      server!.stdout!.on('data', (d: Buffer) => {
        out += d.toString();
        const m = /localhost:(\d+)/.exec(out);
        if (m) resolve(Number(m[1]));
      });
      server!.on('exit', (code) => reject(new Error(`server exited ${code}: ${out}`)));
      setTimeout(() => reject(new Error(`server did not start: ${out}`)), 10_000);
    });
  });

  test.afterAll(() => {
    server?.kill();
    rmSync(dir, { recursive: true, force: true });
  });

  test('serves files with the _headers rules, minus HSTS and upgrade-insecure-requests', async () => {
    const r = await get(port, '/assets/app.js');
    expect(r.status).toBe(200);
    expect(r.text).toContain('console.log(1)');
    expect(r.text).toMatch(/content-type: text\/javascript/i);
    expect(r.text).toMatch(/x-test: on/i);
    expect(r.text).not.toMatch(/strict-transport-security/i);
    expect(r.text).not.toMatch(/upgrade-insecure-requests/i);
    // 知らないパスは SPA として index.html
    const spa = await get(port, '/stage/c1-s1');
    expect(spa.status).toBe(200);
    expect(spa.text).toContain('<title>index</title>');
  });

  test('never serves anything outside the root (traversal, encoded slashes, symlinks)', async () => {
    const targets = [
      '/../outside/secret.txt',
      '/..%2foutside%2fsecret.txt',
      '/..%2Foutside%2Fsecret.txt',
      '/%2e%2e/outside/secret.txt',
      '/%2e%2e%2foutside%2fsecret.txt',
      '/..%5coutside%5csecret.txt',
      '/assets/..%2f..%2foutside%2fsecret.txt',
      '//outside/secret.txt',
      '/link.txt',
      '/linkdir/secret.txt',
      '/linkdir%2fsecret.txt',
      `${'/..'.repeat(20)}/etc/passwd`,
      'http://localhost/../outside/secret.txt',
    ];
    for (const t of targets) {
      const r = await get(port, t);
      expect(r.text, t).not.toContain(SECRET);
      expect(r.text, t).not.toContain('root:');
      expect([200, 400, 404], t).toContain(r.status);
    }
  });

  test('survives malformed URLs and requests', async () => {
    for (const t of ['/%E0%A4%A', '/%', '/%zz', '/%00', '/a%00.js', '/%ff%fe']) {
      expect((await get(port, t)).status, t).toBe(400);
    }
    // 壊れた HTTP そのもの
    expect(
      (await rawRequest(port, 'GET / HTTP/1.1\r\nHost: x\r\nBad\u0001Header: y\r\n\r\n')).status,
    ).toBe(400);
    expect((await rawRequest(port, 'NOT HTTP AT ALL\r\n\r\n')).status).toBe(400);
    // まだ生きている
    expect((await get(port, '/')).status).toBe(200);
  });

  test('only GET and HEAD; HEAD has no body; config files are not served', async () => {
    for (const m of ['POST', 'PUT', 'DELETE', 'OPTIONS', 'TRACE', 'PATCH']) {
      const r = await get(port, '/', m);
      expect(r.status, m).toBe(405);
      expect(r.text, m).toMatch(/allow: GET, HEAD/i);
    }
    const head = await get(port, '/assets/app.js', 'HEAD');
    expect(head.status).toBe(200);
    expect(head.text).not.toContain('console.log');
    // _headers の中身(本文)は返さない(ヘッダーとしては付く)
    const conf = await get(port, '/_headers');
    const body = conf.text.slice(conf.text.indexOf('\r\n\r\n') + 4);
    expect(body).not.toContain('X-Test');
    expect(body).toContain('<title>index</title>');
  });
});

test.describe('production headers (SEC-1, SEC-4)', () => {
  test('sends a strict CSP with Trusted Types and the isolation headers', async ({ request }) => {
    const res = await request.get('/');
    const h = res.headers();
    const csp = Object.fromEntries(
      (h['content-security-policy'] ?? '')
        .split(';')
        .map((d) => d.trim().split(/\s+/))
        .filter((d) => d[0])
        .map((d) => [d[0]!, d.slice(1).join(' ')]),
    );
    expect(csp['default-src']).toBe("'self'");
    expect(csp['script-src']).toBe("'self' 'wasm-unsafe-eval'");
    expect(csp['style-src']).toBe("'self'");
    expect(csp['object-src']).toBe("'none'");
    expect(csp['base-uri']).toBe("'none'");
    expect(csp['frame-ancestors']).toBe("'none'");
    expect(csp['form-action']).toBe("'none'");
    expect(csp['connect-src']).toBe("'self'");
    expect(csp['require-trusted-types-for']).toBe("'script'");
    expect(csp['trusted-types']).toBe("'none'");
    expect(h['x-content-type-options']).toBe('nosniff');
    expect(h['x-frame-options']).toBe('DENY');
    expect(h['cross-origin-opener-policy']).toBe('same-origin');
    expect(h['cross-origin-resource-policy']).toBe('same-origin');
    expect(h['referrer-policy']).toBe('no-referrer');
    for (const f of ['camera', 'microphone', 'geolocation', 'payment', 'usb', 'browsing-topics']) {
      expect(h['permissions-policy']).toContain(`${f}=()`);
    }
  });
});

/** main.tsx の全画面(?dev=…)。smoke.spec より多く、Trusted Types の下で確かめる */
const ROUTES = [
  '/',
  '/?dev=editor',
  '/?dev=sim',
  '/?dev=scene',
  '/?dev=testrun',
  '/?dev=result',
  '/?dev=audio',
  '/?dev=flow',
  '/?dev=hud',
  '/?dev=guide',
];

test.describe('Trusted Types and CSP in the browser (SEC-4)', () => {
  for (const route of ROUTES) {
    test(`${route} runs under Trusted Types without violations`, async ({ page }) => {
      const w = watchErrors(page);
      await page.goto(route);
      await expect(page.locator('#root > *').first()).toBeVisible();
      await page.mouse.click(640, 360);
      await page.waitForTimeout(1500);
      w.expectClean();
    });
  }

  test('DOM XSS sinks and eval are blocked', async ({ page }) => {
    await page.goto('/?dev=editor');
    await expect(page.locator('#root > *').first()).toBeVisible();
    // DevTools 経由の評価(page.evaluate の呼び出しの間)は eval の制限を受けないので、
    // タイマーのタスクとして、ページ自身のコードと同じ条件で試す
    const blocked = await page.evaluate(
      () =>
        new Promise<Record<string, boolean>>((resolve) => {
          setTimeout(() => {
            const tries: Record<string, () => unknown> = {
              innerHTML: () =>
                (document.createElement('div').innerHTML = '<img src=x onerror=alert(1)>'),
              scriptSrc: () => (document.createElement('script').src = '/x.js'),
              eval: () => eval('1 + 1'),
              Function: () => new Function('return 1')(),
              setTimeoutString: () => setTimeout('1' as unknown as () => void, 0),
            };
            const out: Record<string, boolean> = {};
            for (const [k, f] of Object.entries(tries)) {
              try {
                f();
                out[k] = false;
              } catch {
                out[k] = true;
              }
            }
            resolve(out);
          }, 0);
        }),
    );
    expect(blocked).toEqual({
      innerHTML: true,
      scriptSrc: true,
      eval: true,
      Function: true,
      setTimeoutString: true,
    });
  });
});

test('opening a decompression-bomb share link does not hang the page', async ({ page }) => {
  const w = watchErrors(page);
  // 1 万文字に満たないトークンが 300 万文字に展開される(上限つきの展開で読まずに捨てる)
  const bomb = LZString.compressToEncodedURIComponent(`[${' '.repeat(3_000_000)}]`);
  for (const route of ['/', '/?dev=editor']) {
    const t0 = Date.now();
    await page.goto(`${route}#s=${bomb}`);
    await expect(page.locator('#root > *').first()).toBeVisible();
    // ページが応答する(メインスレッドが固まっていない)
    expect(await page.evaluate(() => 1 + 1)).toBe(2);
    expect(Date.now() - t0).toBeLessThan(15_000);
  }
  w.expectClean();
});
