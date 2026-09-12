/* ============================================================
   e2e.spec.js — 브라우저에서만 드러나는 것을 잡는다

   store.test.js 가 데이터 로직을 보고, 이 파일이 화면을 본다.
   둘의 역할이 겹치지 않는다: 여기서는 "실제로 눌리는가",
   "눌렀을 때 보이는가"만 확인한다.

   한 아이의 하루를 순서대로 따라가므로 상태가 이어진다.
   그래서 serial 모드이고, 페이지를 하나만 쓴다.
   ============================================================ */
const { test, expect } = require('@playwright/test');

test.describe.configure({ mode: 'serial' });

let page;
const consoleErrors = [];

test.beforeAll(async ({ browser }) => {
  page = await browser.newPage();
  page.on('pageerror', e => consoleErrors.push('pageerror: ' + e.message));
  page.on('console', m => { if (m.type() === 'error') consoleErrors.push('console.error: ' + m.text()); });

  await page.goto('/');
  // 이전 실행이 남긴 데이터가 판정을 오염시키지 않도록
  await page.evaluate(() => localStorage.removeItem('kidboard.v2'));
  await page.reload();
});

test.afterAll(async () => { await page.close(); });

/** 체크 후 재렌더가 480ms 지연되므로(views.js) 그보다 넉넉히 기다린다 */
const AFTER_TOGGLE = 700;

// ------------------------------------------------------------
// [0] 회귀 방지 — 2026-09 에 실제로 있었던 버그
//
// .modal 이 display:grid 인데 숨김을 hidden 속성에만 맡기면,
// author 스타일이 UA 스타일을 이겨서 hidden 이 무력화된다.
// 그러면 투명한 모달이 화면 전체를 덮어 앱이 통째로 먹통이 된다.
// 눈으로는 옅은 막 하나라 놓치기 쉽다. 그래서 맨 앞에서 못을 박는다.
// ------------------------------------------------------------
test('[0] 회귀: 닫힌 모달이 화면을 막지 않는다', async () => {
  const diag = await page.evaluate(() => {
    const m = document.getElementById('modal');
    const card = document.querySelector('[data-act="shop"]');
    const r = card.getBoundingClientRect();
    const hit = document.elementFromPoint(r.x + r.width / 2, r.y + r.height / 2);
    return {
      display: getComputedStyle(m).display,
      cardReachable: hit === card || card.contains(hit),
      blocker: hit ? (hit.id || hit.className) : null
    };
  });

  // 원인 쪽: hidden 이 실제로 먹었는가
  expect(diag.display, '#modal[hidden] 의 computed display').toBe('none');
  // 증상 쪽: 아이 카드에 손가락이 닿는가
  expect(diag.cardReachable, `카드를 가로막는 요소: ${diag.blocker}`).toBe(true);
});

// ------------------------------------------------------------
test('[1] 앱을 켜면 아이 선택 없이 바로 할 일 화면', async () => {
  // 아이가 1명이면 고르게 할 이유가 없다. 탭 한 번을 아낀다.
  expect(await page.locator('[data-act="open-kid"]').count(),
    '아이 선택 카드가 없어야 한다').toBe(0);
  await expect(page.locator('.kidtop__name')).toHaveText('첫째');
});

test('[2] 습관은 칩으로 보이고 요일 필터가 걸린다', async () => {
  const labels = await page.locator('.habit__label').allInnerTexts();
  const wd = await page.evaluate(() => new Date().getDay());
  const weekend = wd === 0 || wd === 6;
  // "가방 챙기기" 는 days:[1..5] 라 주말에는 빠진다
  expect(labels.includes('가방 챙기기'), `요일 ${wd}`).toBe(!weekend);
  expect(labels.length, '습관 칩이 하나 이상').toBeGreaterThan(0);
});

test('[3] 습관을 누르면 별이 오르고 다시 누르면 회수된다', async () => {
  const chip = () => page.locator('.habit', { hasText: '이 닦기' });
  const stars = () => page.evaluate(() => KB.store.starsOf('c1'));

  expect(await stars()).toBe(0);
  await chip().click();
  await page.waitForTimeout(700);
  await expect(chip()).toHaveClass(/is-done/);
  expect(await stars(), '이 닦기는 별 1개').toBe(1);

  await chip().click();
  await page.waitForTimeout(700);
  expect(await stars(), '해제하면 회수').toBe(0);

  // 아이들이 30초 안에 찾아내는 구멍이다. 5번 흔들어 본다.
  for (let i = 0; i < 5; i++) { await chip().click(); await page.waitForTimeout(550); }
  expect(await stars(), '5회 토글 후에도 1 고정').toBe(1);
});

test('[4] 숙제는 큰 카드로 보이고 밀린 것엔 표시가 붙는다', async () => {
  // fix round 1 이전에는 "밀린 것이 맨 앞" 이었다. 오늘 것을 먼저 채우는
  // 규칙으로 바뀌면서 화면 순서도 오늘 것이 먼저다 — 실제 화면에서
  // 밀린 게 많으면 오늘 숙제가 아예 안 보이던 사고를 고친 결과다.
  await page.evaluate(() => {
    const S = KB.store;
    const today = S.dateKey();
    const past = S.dateKey(new Date(Date.now() - 3 * 86400000));
    S.addHomework({ childId: 'c1', emoji: '📕', label: '오늘치 수학', date: today });
    S.addHomework({ childId: 'c1', emoji: '🎨', label: '사흘 전 그림일기', date: past });
    KB.app.render();
  });
  await page.waitForSelector('.hw');
  const labels = await page.locator('.hw__label').allInnerTexts();
  expect(labels[0], '오늘 것이 맨 앞').toBe('오늘치 수학');
  await expect(page.locator('.hw', { hasText: '사흘 전 그림일기' }).locator('.hw__overdue'))
    .toHaveCount(1);
});

test('[5] 아이 화면에는 숙제가 4개까지만, 나머지는 개수도 안 보인다', async () => {
  await page.evaluate(() => {
    const S = KB.store, today = S.dateKey();
    for (let i = 0; i < 6; i++) {
      S.addHomework({ childId: 'c1', emoji: '📗', label: '추가 숙제 ' + i, date: today });
    }
    KB.app.render();
  });
  await page.waitForSelector('.hw');
  expect(await page.locator('.hw').count(), '화면에는 4개까지만').toBe(4);

  const total = await page.evaluate(() => KB.store.homeworkDue('c1').length);
  expect(total, '데이터에는 8개가 남아 있다').toBe(8);

  // "대기 4개" 같은 표시조차 두지 않는다 — 끝이 보이게 하려는 의도를 스스로 깨기 때문
  const text = await page.locator('#screen').innerText();
  expect(/대기|남은|더 있|\+\d/.test(text), `화면 문구: ${text.slice(0, 120)}`).toBe(false);
});

test('[6] 숙제를 누르면 별이 1개 오르고 목록에서 빠진다', async () => {
  const before = await page.evaluate(() => KB.store.starsOf('c1'));
  const first = page.locator('.hw').first();
  const label = await first.locator('.hw__label').innerText();
  await first.click();
  await page.waitForTimeout(700);

  const after = await page.evaluate(() => KB.store.starsOf('c1'));
  expect(after, '숙제 1개 = 별 1개').toBe(before + 1);

  const labels = await page.locator('.hw__label').allInnerTexts();
  expect(labels.includes(label), '끝낸 숙제는 화면에서 빠진다').toBe(false);
});

test('[7] 날짜가 바뀌어도 숙제는 사라지지 않고 이월된다', async () => {
  const r = await page.evaluate(() => {
    const S = KB.store;
    const tomorrow = S.dateKey(new Date(Date.now() + 86400000));
    return {
      today: S.homeworkDue('c1').length,
      tomorrow: S.homeworkDue('c1', tomorrow).length,
      stars: S.starsOf('c1')
    };
  });
  expect(r.tomorrow, '내일도 그대로 남는다 (습관과 다른 점)').toBe(r.today);
  expect(r.stars, '모은 별은 유지된다').toBeGreaterThan(0);
});

test('[7b] fix1: 밀린 게 많아도 오늘 숙제는 반드시 보인다', async () => {
  // 실제 화면 캡처로 발견된 사고: 밀린 게 많으면(9개) 오늘 것(2개)이
  // 4개 상한 안에 아예 못 들어가고 밀려났었다. 오늘 것부터 채우는지 확인한다.
  await page.evaluate(() => {
    const S = KB.store;
    S.factoryReset();
    const today = S.dateKey();
    S.addHomework({ childId: 'c1', emoji: '📕', label: '오늘 숙제 A', date: today });
    S.addHomework({ childId: 'c1', emoji: '📗', label: '오늘 숙제 B', date: today });
    for (let i = 5; i <= 13; i++) {
      const d = S.dateKey(new Date(Date.now() - i * 86400000));
      S.addHomework({ childId: 'c1', emoji: '📙', label: '밀린 숙제 ' + i, date: d });
    }
    KB.app.render();
  });
  await page.waitForSelector('.hw');
  expect(await page.locator('.hw').count(), '화면에는 4개까지만').toBe(4);
  const labels = await page.locator('.hw__label').allInnerTexts();
  expect(labels.includes('오늘 숙제 A'), '오늘 숙제 A가 보여야 한다').toBe(true);
  expect(labels.includes('오늘 숙제 B'), '오늘 숙제 B가 보여야 한다').toBe(true);
});

test('[9] 제목 1.5초 롱프레스 → PIN → 부모 설정', async () => {
  await page.evaluate(() => KB.app.go('home'));
  await page.waitForSelector('#brandHold');

  const box = await page.locator('#brandHold').boundingBox();
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);

  // 짧게 누르면 열리면 안 된다 (아이가 실수로 들어가면 안 되므로)
  await page.mouse.down();
  await page.waitForTimeout(400);
  await page.mouse.up();
  await page.waitForTimeout(300);
  expect(await page.locator('.keypad').count(), '0.4초로는 안 열려야 한다').toBe(0);

  await page.mouse.down();
  await page.waitForTimeout(1800);
  await page.mouse.up();
  await page.waitForTimeout(400);
  expect(await page.locator('.keypad').count(), '1.5초 넘기면 PIN 창').toBeGreaterThan(0);

  for (const k of ['1', '2', '3', '4']) await page.locator(`.key[data-k="${k}"]`).click();
  await page.waitForTimeout(700);
  expect(await page.evaluate(() => KB.app.current().view)).toBe('admin');
});

test('[11~12] 새로고침해도 살아남는다', async () => {
  const before = await page.evaluate(() => ({
    raw: localStorage.getItem('kidboard.v2'),
    stars: KB.store.starsOf('c1'),
    done: KB.store.doneIds('c1').slice().sort()
  }));
  expect(before.raw, 'kidboard.v2 키').not.toBeNull();

  await page.reload();

  const after = await page.evaluate(() => ({
    stars: KB.store.starsOf('c1'),
    done: KB.store.doneIds('c1').slice().sort()
  }));
  expect(after.stars, '별 유지').toBe(before.stars);
  expect(after.done, '체크 상태 유지').toEqual(before.done);
});

test('[13] 서비스워커가 활성화된다', async () => {
  await expect.poll(
    () => page.evaluate(async () => {
      const rs = await navigator.serviceWorker.getRegistrations();
      return rs.map(r => (r.active && r.active.state) || 'pending');
    }),
    { timeout: 10000, message: 'SW 활성화 대기' }
  ).toContain('activated');
});

test('[X] 아이 이름에 태그를 넣어도 실행되지 않는다', async () => {
  const imgs = await page.evaluate(() => {
    KB.store.upsert('children', { id: 'c1', name: '<img src=x onerror=alert(1)>' });
    KB.app.go('home');
    return document.querySelectorAll('#screen img').length;
  });
  expect(imgs, 'esc() 를 통과하면 태그가 아니라 글자로 남는다').toBe(0);
});

test('[E] 콘솔 에러가 하나도 없다', async () => {
  expect(consoleErrors, consoleErrors.join(' | ')).toEqual([]);
});
