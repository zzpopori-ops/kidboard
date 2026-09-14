/* sync.spec.js — 진짜 서버를 띄우고 두 기기를 흉내낸다.
   브라우저 컨텍스트 두 개가 PC 와 태블릿이다. */
const { test, expect } = require('@playwright/test');
const { spawn } = require('child_process');
const fs = require('fs');
const os = require('os');
const net = require('net');
const path = require('path');

const PORT = 8479;
const API = `https://127.0.0.1:${PORT}`;
const TOKEN = 'sync-test-token';
const ROOT = path.join(__dirname, '..');

/** 포트가 실제로 응답하는지(TCP 연결 가능 여부) — offline.spec.js 와 같은 방식 */
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

async function waitPort(port, timeoutMs = 15000) {
  const until = Date.now() + timeoutMs;
  while (Date.now() < until) {
    if (await portAlive(port)) return true;
    await new Promise(r => setTimeout(r, 100));
  }
  return false;
}

let server, stateFile;

test.beforeAll(async () => {
  stateFile = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'kb-sync-')), 'state.json');
  server = spawn('node', [
    path.join(ROOT, 'server', 'api.js'),
    '--port', String(PORT),
    '--cert', path.join(ROOT, 'test', 'fixtures', 'tls', 'cert.pem'),
    '--key', path.join(ROOT, 'test', 'fixtures', 'tls', 'key.pem'),
    '--state', stateFile,
    '--token', TOKEN,
    '--origin', 'http://127.0.0.1:8000'
  ], { stdio: 'ignore' });
  // spawn() 은 프로세스가 뜨는 것과 무관하게 즉시 돌아온다. 전체 스위트에서
  // 앞선 테스트들이 CPU를 많이 쓴 직후라 리슨까지 걸리는 시간이 들쭉날쭉한데,
  // 여기서 기다리지 않으면 첫 테스트가 "서버 없음"과 "시딩 전"을 구별하지 못한다.
  expect(await waitPort(PORT), `서버가 ${PORT} 에 떠야 한다`).toBe(true);
});

test.afterAll(() => { if (server && !server.killed) server.kill('SIGKILL'); });

/** 브라우저 하나를 기기 하나로 쓴다. 인증서는 신뢰한다고 친다(태블릿에 CA 설치된 상태). */
async function device(browser, label) {
  const ctx = await browser.newContext({ ignoreHTTPSErrors: true });
  const page = await ctx.newPage();
  await page.goto('/');
  await page.evaluate(() => localStorage.removeItem('kidboard.v2'));
  await page.reload();
  await page.evaluate(cfg => KB.store.setSyncConfig(cfg), { url: API, token: TOKEN });
  return { ctx, page, label };
}

test('시딩 전에는 동기화가 분명히 거절된다', async ({ browser }) => {
  const tab = await device(browser, '태블릿');
  const r = await tab.page.evaluate(() => KB.store.syncNow());
  expect(r.ok, '시딩 전에는 성공하면 안 된다').toBe(false);
  expect(r.reason).toMatch(/초기화/);
  await tab.ctx.close();
});

test('태블릿이 서버를 초기화하고, PC 가 그 상태를 받는다', async ({ browser }) => {
  const tab = await device(browser, '태블릿');
  await tab.page.evaluate(() => {
    KB.store.addHomework({ childId: 'c1', emoji: '📕', label: '태블릿 숙제', date: KB.store.dateKey() });
    KB.store.addBonus('c1', 7, '태블릿에서 준 별');
  });
  const seeded = await tab.page.evaluate(() => KB.store.seedServer());
  expect(seeded.ok, '태블릿이 서버를 초기화한다').toBe(true);

  const pc = await device(browser, 'PC');
  const pulled = await pc.page.evaluate(() => KB.store.syncNow());
  expect(pulled.ok).toBe(true);
  const labels = await pc.page.evaluate(() => KB.store.homeworkOf('c1').map(w => w.label));
  expect(labels, 'PC 가 태블릿 데이터를 받는다').toContain('태블릿 숙제');
  expect(await pc.page.evaluate(() => KB.store.starsOf('c1')), '별도 따라온다').toBe(7);
  await tab.ctx.close(); await pc.ctx.close();
});

test('PC 에서 넣은 숙제가 태블릿에 간다 — 이 Phase 를 만든 이유', async ({ browser }) => {
  const tab = await device(browser, '태블릿');
  await tab.page.evaluate(() => KB.store.seedServer());
  const pc = await device(browser, 'PC');
  await pc.page.evaluate(() => KB.store.syncNow());

  await pc.page.evaluate(() => {
    KB.store.addHomework({ childId: 'c1', emoji: '📗', label: 'PC 에서 넣은 숙제', date: KB.store.dateKey() });
  });
  await pc.page.evaluate(() => KB.store.syncNow());
  await tab.page.evaluate(() => KB.store.syncNow());

  const labels = await tab.page.evaluate(() => KB.store.homeworkOf('c1').map(w => w.label));
  expect(labels, '태블릿이 PC 숙제를 받는다').toContain('PC 에서 넣은 숙제');
  await tab.ctx.close(); await pc.ctx.close();
});

test('서버가 죽어 있어도 아이는 체크할 수 있고, 살아나면 올라간다', async ({ browser }) => {
  const tab = await device(browser, '태블릿');
  await tab.page.evaluate(() => KB.store.seedServer());

  server.kill('SIGKILL');
  await new Promise(r => setTimeout(r, 500));

  const before = await tab.page.evaluate(() => KB.store.starsOf('c1'));
  await tab.page.evaluate(() => {
    const hw = KB.store.addHomework({ childId: 'c1', emoji: '📕', label: '서버 죽었을 때', date: KB.store.dateKey() });
    KB.store.setHomeworkDone(hw.id, KB.store.dateKey());
  });
  const after = await tab.page.evaluate(() => KB.store.starsOf('c1'));
  expect(after, '서버가 없어도 별은 오른다').toBe(before + 1);

  const failed = await tab.page.evaluate(() => KB.store.syncNow());
  expect(failed.ok, '서버가 없으면 실패로 보고한다').toBe(false);
  expect(await tab.page.evaluate(() => KB.store.outbox().length), '큐에 남아 있다').toBeGreaterThan(0);
  await tab.ctx.close();
});

test('같은 큐를 두 번 보내도 별이 두 배가 되지 않는다', async ({ browser }) => {
  // 서버를 다시 띄운다
  server = spawn('node', [
    path.join(ROOT, 'server', 'api.js'),
    '--port', String(PORT),
    '--cert', path.join(ROOT, 'test', 'fixtures', 'tls', 'cert.pem'),
    '--key', path.join(ROOT, 'test', 'fixtures', 'tls', 'key.pem'),
    '--state', stateFile, '--token', TOKEN, '--origin', 'http://127.0.0.1:8000'
  ], { stdio: 'ignore' });
  expect(await waitPort(PORT), `서버가 ${PORT} 에 다시 떠야 한다`).toBe(true);

  const tab = await device(browser, '태블릿');
  await tab.page.evaluate(() => KB.store.syncNow());
  const stars = await tab.page.evaluate(() => KB.store.starsOf('c1'));
  await tab.page.evaluate(() => KB.store.syncNow());
  await tab.page.evaluate(() => KB.store.syncNow());
  expect(await tab.page.evaluate(() => KB.store.starsOf('c1')), '몇 번을 더 돌려도 그대로').toBe(stars);
  await tab.ctx.close();
});
