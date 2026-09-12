/* ============================================================
   update.spec.js — 태블릿이 낡은 버전에 갇히지 않는가

   실제로 당한 문제는 아니지만, 당하면 조용하고 치명적이다.
   앱 코드를 고쳐 배포했는데 sw.js 를 안 건드리면, 캐시 우선
   전략에서는 태블릿이 옛 파일을 **영원히** 쓴다. 새로고침을
   몇 번을 하든 바뀌지 않는다. 부모는 고쳤다고 믿고, 아이 화면은
   그대로다.

   "배포할 때 sw.js 버전을 올린다"는 규칙으로 막을 수도 있지만,
   사람 기억에 의존하는 안전장치는 언젠가 실패한다. 코드가
   막아야 한다.

   이 파일은 임시 폴더에 앱을 복사해 자기 서버를 띄우고,
   배포를 흉내 낸 뒤 태블릿이 새 코드를 받는지 확인한다.
   ============================================================ */
const { test, expect } = require('@playwright/test');
const { spawn } = require('child_process');
const fs = require('fs');
const os = require('os');
const net = require('net');
const path = require('path');

const PORT = Number(process.env.UPDATE_PORT || 8282);
const ORIGIN = `http://127.0.0.1:${PORT}`;
const SRC = path.join(__dirname, '..');

function portAlive(port) {
  return new Promise(resolve => {
    const s = net.connect({ host: '127.0.0.1', port });
    const done = v => { s.destroy(); resolve(v); };
    s.setTimeout(1500);
    s.on('connect', () => done(true));
    s.on('error', () => done(false));
    s.on('timeout', () => done(false));
  });
}

async function waitPort(port, want, timeoutMs = 15000) {
  const until = Date.now() + timeoutMs;
  while (Date.now() < until) {
    if (await portAlive(port) === want) return true;
    await new Promise(r => setTimeout(r, 200));
  }
  return false;
}

let server = null;
let dir = null;

test.afterAll(() => {
  if (server && !server.killed) server.kill('SIGKILL');
  if (dir) fs.rmSync(dir, { recursive: true, force: true });
});

test('앱 코드를 고치면 sw.js 를 안 건드려도 태블릿이 새 코드를 받는다', async ({ browser }) => {
  test.slow();

  // --- 0. 배포본을 흉내 낸 임시 폴더 ---
  dir = fs.mkdtempSync(path.join(os.tmpdir(), 'kidboard-update-'));
  for (const e of ['index.html', 'sw.js', 'manifest.webmanifest', 'css', 'js', 'icons']) {
    fs.cpSync(path.join(SRC, e), path.join(dir, e), { recursive: true });
  }

  server = spawn(
    path.join(SRC, 'node_modules', '.bin', 'http-server'),
    ['.', '-p', String(PORT), '-a', '127.0.0.1', '-c-1', '--silent'],
    { cwd: dir, stdio: 'ignore' }
  );
  expect(await waitPort(PORT, true), `서버가 ${PORT} 에 떠야 한다`).toBe(true);

  const ctx = await browser.newContext();
  const page = await ctx.newPage();

  // --- 1. 태블릿이 처음 앱을 받는다 ---
  await page.goto(ORIGIN + '/');
  await expect.poll(
    () => page.evaluate(async () => {
      const r = await navigator.serviceWorker.ready;
      return !!(r && r.active && r.active.state === 'activated');
    }),
    { timeout: 15000, message: '서비스워커 활성화 대기' }
  ).toBe(true);

  await page.reload();
  await expect.poll(
    () => page.evaluate(() => !!navigator.serviceWorker.controller),
    { timeout: 10000, message: '서비스워커가 페이지를 제어하기까지 대기' }
  ).toBe(true);

  await expect(page.locator('.brand')).toHaveText('오늘의 할 일');

  // --- 2. 부모가 앱을 고쳐 배포한다. sw.js 는 건드리지 않는다 ---
  const before = fs.readFileSync(path.join(dir, 'js', 'views.js'), 'utf8');
  fs.writeFileSync(path.join(dir, 'js', 'views.js'),
    before.replace('오늘의 할 일', '새 제목'));

  const swUntouched = fs.readFileSync(path.join(dir, 'sw.js'), 'utf8')
    === fs.readFileSync(path.join(SRC, 'sw.js'), 'utf8');
  expect(swUntouched, 'sw.js 는 그대로여야 이 테스트가 의미를 갖는다').toBe(true);

  // --- 3. 아이가 다음에 앱을 연다 ---
  // 온라인이므로 최신을 받아야 한다. 한 번 열어서 반영되는 게 목표다.
  await page.reload();
  await expect(page.locator('.brand'),
    'sw.js 를 안 올려도 앱을 열면 새 코드가 와야 한다').toHaveText('새 제목', { timeout: 10000 });

  await ctx.close();
});
