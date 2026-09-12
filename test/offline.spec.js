/* ============================================================
   offline.spec.js — 이 앱의 전제를 검증한다

   맥북에 서버를 띄우고 태블릿이 붙어 쓰는 구성인데,
   맥북이 꺼져 있거나 잠들었거나 아이가 집 밖이면 서버가 없다.
   그때도 태블릿에서 앱이 열려야 한다. 안 열리면
   "아이가 아침에 태블릿을 켰는데 아무것도 안 뜨는" 일이 생기고,
   그 한 번으로 앱은 버려진다.

   그래서 서버 프로세스를 실제로 죽인 뒤 앱이 뜨는지 확인한다.

   왜 setOffline() 만으로는 부족한가:
   서비스워커는 페이지와 다른 네트워크 문맥에서 돈다. 오프라인
   에뮬레이션이 서비스워커의 fetch 까지 덮는지는 브라우저·버전에
   따라 달라서, "정말 서버가 없을 때"를 증명했다고 하기 어렵다.
   포트를 실제로 닫으면 해석의 여지가 없다.

   이 파일은 자기 서버를 직접 띄우고 직접 죽인다. 그래서
   playwright.config.js 의 공용 webServer 와 다른 포트를 쓴다.
   ============================================================ */
const { test, expect } = require('@playwright/test');
const { spawn } = require('child_process');
const net = require('net');
const path = require('path');

const PORT = Number(process.env.OFFLINE_PORT || 8181);
const ORIGIN = `http://127.0.0.1:${PORT}`;
const ROOT = path.join(__dirname, '..');

/** 포트가 실제로 응답하는지 (TCP 연결 가능 여부) */
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

test.afterAll(() => { if (server && !server.killed) server.kill('SIGKILL'); });

test('서버 프로세스를 죽여도 캐시만으로 앱이 열린다', async ({ browser }) => {
  test.slow();

  // --- 0. 전용 서버를 띄운다 ---
  server = spawn(
    path.join(ROOT, 'node_modules', '.bin', 'http-server'),
    ['.', '-p', String(PORT), '-a', '127.0.0.1', '-c-1', '--silent'],
    { cwd: ROOT, stdio: 'ignore' }
  );
  expect(await waitPort(PORT, true), `서버가 ${PORT} 에 떠야 한다`).toBe(true);

  // 서비스워커가 없는 깨끗한 상태에서 시작한다
  const ctx = await browser.newContext();
  const page = await ctx.newPage();

  // --- 1. 온라인에서 한 번 열어 캐시를 채운다 ---
  await page.goto(ORIGIN + '/');

  await expect.poll(
    () => page.evaluate(async () => {
      const r = await navigator.serviceWorker.ready;
      return !!(r && r.active && r.active.state === 'activated');
    }),
    { timeout: 15000, message: '서비스워커 활성화 대기' }
  ).toBe(true);

  // addAll 이 끝나야 진짜 캐시가 찬 것이다. 목록까지 확인한다.
  const cached = await page.evaluate(async () => {
    const names = await caches.keys();
    const c = await caches.open(names[0]);
    return { cache: names[0], urls: (await c.keys()).map(r => new URL(r.url).pathname) };
  });
  // 캐시 이름은 배포마다 바뀐다(Actions 가 커밋 해시를 박는다).
  // 이름을 못박으면 배포할 때마다 이 테스트가 깨지므로 접두어만 본다.
  expect(cached.cache, '캐시 이름').toMatch(/^kidboard-/);
  for (const must of ['/index.html', '/css/style.css', '/js/store.js', '/js/app.js',
                      '/manifest.webmanifest', '/icons/icon-192.png']) {
    expect(cached.urls, `${must} 가 캐시에 있어야 한다`).toContain(must);
  }

  // 컨트롤러가 붙어야 다음 요청을 서비스워커가 가로챈다
  await page.reload();
  await expect.poll(
    () => page.evaluate(() => !!navigator.serviceWorker.controller),
    { timeout: 10000, message: '서비스워커가 페이지를 제어하기까지 대기' }
  ).toBe(true);

  // --- 2. 서버를 정말로 죽인다 ---
  server.kill('SIGKILL');
  expect(await waitPort(PORT, false), `${PORT} 포트가 닫혀야 한다`).toBe(true);

  // 죽었는지 브라우저 밖에서 한 번 더 확인한다. 여기서 살아 있으면
  // 아래 결과는 전부 의미가 없다.
  expect(await portAlive(PORT), '서버가 확실히 죽었는지').toBe(false);

  // --- 3. 그 상태에서 앱이 열리는가 ---
  await page.reload();

  await expect(page.locator('.brand')).toHaveText('오늘의 할 일');
  await expect(page.locator('[data-act="open-kid"]')).toHaveCount(2);

  // 껍데기만 뜨고 스크립트가 죽었을 수도 있다. 실제로 동작하는지 본다.
  await page.locator('[data-act="open-kid"]').first().click();
  await page.waitForSelector('.tile');
  expect(await page.locator('.tile').count(), '오프라인에서도 할 일 타일이 그려져야 한다')
    .toBeGreaterThan(0);

  // 체크가 되고 저장까지 되는가 (localStorage 는 네트워크와 무관해야 한다)
  const before = await page.evaluate(() => KB.store.getChild('c1').stars);
  await page.locator('.tile').first().click();
  await page.waitForTimeout(700);
  const after = await page.evaluate(() => KB.store.getChild('c1').stars);
  expect(after, '오프라인에서도 별이 올라야 한다').toBeGreaterThan(before);

  // 새로 연 탭에서도 되는가 — 아이가 앱을 껐다 켜는 상황
  const page2 = await ctx.newPage();
  await page2.goto(ORIGIN + '/');
  await expect(page2.locator('[data-act="open-kid"]')).toHaveCount(2);
  expect(await page2.evaluate(() => KB.store.getChild('c1').stars),
    '껐다 켜도 별이 남아 있어야 한다').toBe(after);

  await ctx.close();
});
