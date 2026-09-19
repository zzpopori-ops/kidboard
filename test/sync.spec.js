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

/* ============================================================
   여기부터: Defect 1~4 회귀 테스트.

   기존 5개 테스트는 전부 KB.store 로만 확인한다(0개 DOM 셀렉터).
   그게 정확히 Defect 1이 뚫린 이유다 — 데이터가 맞아도 화면이
   그걸 반영하는지는 전혀 보지 않았다. 아래 A~C는 반드시 .hw__label
   같은 실제 DOM 을 읽어서 확인한다.
   ============================================================ */

/** 격리된 서버 하나를 띄우고 fn 을 실행한 뒤 반드시 죽인다 — Defect 2~4 테스트는
 *  위 공용 서버/상태 파일의 누적된 이야기와 무관하게 독립적으로 깨끗한 상태에서 돈다. */
async function withIsolatedServer(port, fn) {
  var sf = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'kb-sync-iso-')), 'state.json');
  var srv = spawn('node', [
    path.join(ROOT, 'server', 'api.js'),
    '--port', String(port),
    '--cert', path.join(ROOT, 'test', 'fixtures', 'tls', 'cert.pem'),
    '--key', path.join(ROOT, 'test', 'fixtures', 'tls', 'key.pem'),
    '--state', sf, '--token', TOKEN, '--origin', 'http://127.0.0.1:8000'
  ], { stdio: 'ignore' });
  try {
    expect(await waitPort(port), `격리 서버가 ${port} 에 떠야 한다`).toBe(true);
    await fn(`https://127.0.0.1:${port}`, sf);
  } finally {
    if (!srv.killed) srv.kill('SIGKILL');
  }
}

// ------------------------------------------------------------
// A) Defect 1 — 동기화로 받은 새 숙제가 새로고침만으로 화면에 저절로 뜬다
// ------------------------------------------------------------
test('[Defect1-A] 동기화로 받은 새 숙제가 새로고침 후 화면(.hw__label)에 저절로 나타난다', async ({ browser }) => {
  const tab = await device(browser, '태블릿');
  await tab.page.evaluate(() => KB.store.seedServer());

  const pc = await device(browser, 'PC');
  await pc.page.evaluate(() => KB.store.syncNow());
  await pc.page.evaluate(() => {
    KB.store.addHomework({ childId: 'c1', emoji: '📗', label: 'DOM 회귀 숙제', date: KB.store.dateKey() });
  });
  await pc.page.evaluate(() => KB.store.syncNow());

  // 태블릿은 동기화 버튼을 누르지 않는다 — 새로고침(=앱 재시작)만 한다
  await tab.page.reload();
  await tab.page.waitForSelector('.hw, .empty');

  // KB.store 가 아니라 실제 화면에 보이는지가 이 회귀의 핵심이다
  await expect(tab.page.locator('.hw__label', { hasText: 'DOM 회귀 숙제' })).toBeVisible({ timeout: 5000 });

  await tab.ctx.close(); await pc.ctx.close();
});

// ------------------------------------------------------------
// B) Defect 1 — 바뀐 게 없는 동기화는 다시 그리지 않는다
// ------------------------------------------------------------
test('[Defect1-B] 바뀐 게 없는 동기화는 화면을 다시 그리지 않는다 (DOM 마커로 확인)', async ({ browser }) => {
  const tab = await device(browser, '태블릿');
  await tab.page.evaluate(() => KB.store.seedServer());
  await tab.page.evaluate(() => KB.store.syncNow());
  await tab.page.reload();
  await tab.page.waitForSelector('.hw, .empty');

  // 다시 그려지면(=innerHTML 통째 교체) 사라질 마커를 화면에 심는다
  await tab.page.evaluate(() => document.querySelector('#screen').setAttribute('data-marker', 'untouched'));

  // watchSync 가 실제로 다시 도는 시점(화면 복귀)을 흉내낸다 — 서버엔 새로운 게 없다
  const before = await tab.page.evaluate(() => KB.store.starsOf('c1'));
  await tab.page.evaluate(() => document.dispatchEvent(new Event('visibilitychange')));
  await tab.page.waitForTimeout(600);
  const after = await tab.page.evaluate(() => KB.store.starsOf('c1'));
  expect(after, '데이터도 실제로 바뀌지 않았어야 한다').toBe(before);

  const marker = await tab.page.evaluate(function () {
    var el = document.querySelector('#screen');
    return el && el.getAttribute('data-marker');
  });
  expect(marker, '바뀐 게 없는데 다시 그려져 마커가 사라졌다').toBe('untouched');

  await tab.ctx.close();
});

// ------------------------------------------------------------
// C) Defect 1 — 탭 도중 동기화가 끼어들어도 탭이 씹히지 않는다
// ------------------------------------------------------------
test('[Defect1-C] 탭과 동시에 동기화가 끝나도 별은 오르고 카드는 목록에서 빠진다', async ({ browser }) => {
  const tab = await device(browser, '태블릿');
  await tab.page.evaluate(() => {
    KB.store.addHomework({ childId: 'c1', emoji: '📕', label: '탭 도중 숙제', date: KB.store.dateKey() });
  });
  await tab.page.evaluate(() => KB.store.seedServer());
  await tab.page.reload();
  await tab.page.waitForSelector('.hw');

  // 다른 기기가 서버에 변화를 만들어 둔다 — 태블릿이 다음 동기화 때 받아올 변화
  const pc = await device(browser, 'PC');
  await pc.page.evaluate(() => KB.store.syncNow());
  await pc.page.evaluate(() => {
    KB.store.addHomework({ childId: 'c1', emoji: '📗', label: '동시에 온 숙제', date: KB.store.dateKey() });
  });
  await pc.page.evaluate(() => KB.store.syncNow());

  const before = await tab.page.evaluate(() => KB.store.starsOf('c1'));
  const target = tab.page.locator('.hw', { hasText: '탭 도중 숙제' });

  // 탭(클릭)과 동기화(visibilitychange 로 촉발되는 watchSync)가 거의 동시에 일어나게 한다
  await Promise.all([
    target.click(),
    tab.page.evaluate(() => document.dispatchEvent(new Event('visibilitychange')))
  ]);

  await tab.page.waitForTimeout(900); // 480ms 지연 렌더 + 동기화 재시도 여유

  const after = await tab.page.evaluate(() => KB.store.starsOf('c1'));
  expect(after, '탭한 숙제의 별이 반영돼야 한다').toBe(before + 1);

  const stillThere = await tab.page.locator('.hw', { hasText: '탭 도중 숙제' }).count();
  expect(stillThere, '완료한 숙제 카드는 목록에서 빠져야 한다').toBe(0);

  await tab.ctx.close(); await pc.ctx.close();
});

// ------------------------------------------------------------
// D) Defect 2 — 저장을 누르지 않고 지금 동기화를 눌러도 동작한다
// ------------------------------------------------------------
test('[Defect2] 저장 없이 지금 동기화를 눌러도 방금 입력한 주소/토큰으로 동작한다', async ({ browser }) => {
  await withIsolatedServer(8481, async (url) => {
    const ctx = await browser.newContext({ ignoreHTTPSErrors: true });
    const page = await ctx.newPage();
    await page.goto('/');
    await page.evaluate(() => localStorage.removeItem('kidboard.v2'));
    await page.reload();

    await page.evaluate(() => KB.app.go('admin'));
    await page.locator('[data-act="tab"][data-id="data"]').click();
    await page.waitForSelector('#sync-url');
    await page.fill('#sync-url', url);
    await page.fill('#sync-token', TOKEN);
    // 저장 버튼을 누르지 않는다 — 바로 지금 동기화를 누른다
    await page.locator('[data-act="sync-now"]').click();
    await page.waitForTimeout(500);

    const toastText = await page.locator('#toast').innerText();
    expect(toastText, '설정 미완료 메시지가 뜨면 안 된다').not.toMatch(/설정되지 않았습니다/);

    const cfg = await page.evaluate(() => KB.store.syncConfig());
    expect(cfg && cfg.url, '누르는 순간 화면의 값이 저장됐어야 한다').toBe(url);

    await ctx.close();
  });
});

// ------------------------------------------------------------
// E) Defect 3 — 끝에 /api/ping 이 붙은 주소도 저장 시 정규화된다
// ------------------------------------------------------------
test('[Defect3] URL 끝의 슬래시·/api/ping 은 저장할 때 정리된다', async ({ browser }) => {
  const ctx = await browser.newContext({ ignoreHTTPSErrors: true });
  const page = await ctx.newPage();
  await page.goto('/');
  await page.evaluate(() => localStorage.removeItem('kidboard.v2'));
  await page.reload();

  const cases = [
    ['https://host:8443/', 'https://host:8443'],
    ['https://host:8443/api', 'https://host:8443'],
    ['https://host:8443/api/ping', 'https://host:8443'],
    ['https://host:8443', 'https://host:8443']
  ];
  for (const [input, expected] of cases) {
    await page.evaluate(cfg => KB.store.setSyncConfig(cfg), { url: input, token: 't' });
    const saved = await page.evaluate(() => KB.store.syncConfig().url);
    expect(saved, `${input} 은 ${expected} 로 정리돼야 한다`).toBe(expected);
  }
  await ctx.close();
});

// ------------------------------------------------------------
// F/G/H) Defect 4 — 실패 이유를 상황별로 다르게 말해준다
// ------------------------------------------------------------
test('[Defect4] 토큰이 틀리면 401 이라고 알려주지 않고 "토큰"을 언급한다', async ({ browser }) => {
  await withIsolatedServer(8482, async (url) => {
    const ctx = await browser.newContext({ ignoreHTTPSErrors: true });
    const page = await ctx.newPage();
    await page.goto('/');
    await page.evaluate(() => localStorage.removeItem('kidboard.v2'));
    await page.reload();
    // fetch() 의 Authorization 헤더 값은 ISO-8859-1 이어야 한다 — 한글 토큰을 쓰면
    // "틀린 토큰"이 아니라 fetch 자체가 던지는 별개의 에러가 난다. 그래서 틀린
    // 토큰도 ASCII 로 만든다(실제 토큰도 보통 이 형태다).
    await page.evaluate(cfg => KB.store.setSyncConfig(cfg), { url, token: 'wrong-token' });
    const r = await page.evaluate(() => KB.store.syncNow());
    expect(r.ok).toBe(false);
    expect(r.reason, r.reason).toMatch(/토큰/);
    await ctx.close();
  });
});

test('[Defect4] 주소가 틀리면 404 라고 하지 않고 "주소"를 언급한다', async ({ browser }) => {
  await withIsolatedServer(8483, async (url) => {
    const ctx = await browser.newContext({ ignoreHTTPSErrors: true });
    const page = await ctx.newPage();
    await page.goto('/');
    await page.evaluate(() => localStorage.removeItem('kidboard.v2'));
    await page.reload();
    // /api 붙이는 실수와 다른, 그냥 잘못된 경로 — 정규화로도 못 고치는 진짜 오타
    await page.evaluate(cfg => KB.store.setSyncConfig(cfg), { url: url + '/오타', token: TOKEN });
    const r = await page.evaluate(() => KB.store.syncNow());
    expect(r.ok).toBe(false);
    expect(r.reason, r.reason).toMatch(/주소/);
    // 서버 기본 404 메시지("없는 주소입니다")를 그대로 흘려보내는 것만으로는
    // 부족하다 — /api/ping 을 붙여넣는 실수를 콕 짚어줘야 한다
    expect(r.reason, r.reason).toMatch(/ping/);
    await ctx.close();
  });
});

test('[Defect4] 서버가 초기화 전이면 "서버 채우기" 를 안내한다', async ({ browser }) => {
  await withIsolatedServer(8484, async (url) => {
    const ctx = await browser.newContext({ ignoreHTTPSErrors: true });
    const page = await ctx.newPage();
    await page.goto('/');
    await page.evaluate(() => localStorage.removeItem('kidboard.v2'));
    await page.reload();
    await page.evaluate(cfg => KB.store.setSyncConfig(cfg), { url, token: TOKEN });
    const r = await page.evaluate(() => KB.store.syncNow());
    expect(r.ok).toBe(false);
    expect(r.reason, r.reason).toMatch(/서버 채우기/);
    await ctx.close();
  });
});

test('[Defect4] 서버에 아예 닿지 못하면 세 가지 가능성을 모두 안내한다', async ({ browser }) => {
  // 이 포트엔 아무 서버도 띄우지 않는다 — fetch 가 그대로 reject 되는,
  // "맥북이 꺼져 있다"를 흉내내는 가장 확실한 방법이다 (offline.spec.js 와 같은 근거).
  const deadUrl = 'https://127.0.0.1:8485';
  const ctx = await browser.newContext({ ignoreHTTPSErrors: true });
  const page = await ctx.newPage();
  await page.goto('/');
  await page.evaluate(() => localStorage.removeItem('kidboard.v2'));
  await page.reload();
  await page.evaluate(cfg => KB.store.setSyncConfig(cfg), { url: deadUrl, token: TOKEN });
  const r = await page.evaluate(() => KB.store.syncNow());
  expect(r.ok).toBe(false);
  expect(r.reason, r.reason).toMatch(/맥북/);
  expect(r.reason, r.reason).toMatch(/인증서/);
  expect(r.reason, r.reason).toMatch(/네트워크/);
  await ctx.close();
});
