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
  await page.evaluate(() => localStorage.removeItem('kidboard.v1'));
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
    const card = document.querySelector('[data-act="open-kid"]');
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
test('[1] 홈 — 아이 2명, 별 0, 빈 병', async () => {
  await expect(page.locator('[data-act="open-kid"]')).toHaveCount(2);

  const txt = await page.locator('#screen').innerText();
  expect(txt, '시작 시 별이 0이어야 한다').not.toMatch(/⭐\s*[1-9]/);

  const fill = await page.evaluate(() => {
    const r = document.querySelector('.jar rect[fill="#F6BD3B"]');
    return r ? r.getAttribute('height') : null;
  });
  expect(fill, '별 병 채움 높이').toBe('0');
});

test('[2] 할 일 화면 — 요일 필터가 걸린다', async () => {
  await page.locator('[data-act="open-kid"]').first().click();
  await page.waitForSelector('.tile');

  const labels = await page.locator('.tile__label').allInnerTexts();
  const wd = await page.evaluate(() => new Date().getDay());
  const weekend = wd === 0 || wd === 6;

  expect(labels, `요일 ${wd} 기준 타일 수`).toHaveLength(weekend ? 3 : 4);
  // "가방 챙기기"는 days:[1..5] 라 주말에는 빠져야 한다
  expect(labels.includes('가방 챙기기'), `요일 ${wd}: 가방 챙기기 노출 여부`).toBe(!weekend);
});

test('[3~4] 체크하면 도장이 찍히고 별이 는다', async () => {
  const tile = () => page.locator('.tile', { hasText: '책 10분 읽기' });
  await tile().click();
  await page.waitForTimeout(AFTER_TOGGLE);

  await expect(tile()).toHaveClass(/is-done/);
  await expect(tile()).toHaveAttribute('aria-pressed', 'true');

  const stars = await page.evaluate(() => KB.store.getChild('c1').stars);
  expect(stars, '책 10분 읽기는 별 2개').toBe(2);

  const fill = await page.evaluate(() => {
    const r = document.querySelector('.jar rect[fill="#F6BD3B"]');
    return r ? +r.getAttribute('height') : -1;
  });
  expect(fill, '병 수위가 올라야 한다').toBeGreaterThan(0);
});

test('[5] 해제하면 별을 회수한다 — 반복 체크로 못 쌓는다', async () => {
  const tile = () => page.locator('.tile', { hasText: '책 10분 읽기' });

  await tile().click();
  await page.waitForTimeout(AFTER_TOGGLE);
  expect(await page.evaluate(() => KB.store.getChild('c1').stars)).toBe(0);

  // 아이들이 30초 안에 찾아내는 구멍이다. 5번 흔들어 본다.
  for (let i = 0; i < 5; i++) {
    await tile().click();
    await page.waitForTimeout(550);
  }
  const stars = await page.evaluate(() => KB.store.getChild('c1').stars);
  expect(stars, '5회 토글 후에도 별 2 고정(누적 아님)').toBe(2);
});

test('[6] 전부 체크하면 축하 문구가 뜬다', async () => {
  const ids = await page.evaluate(() => KB.store.tasksFor('c1').map(t => t.id));
  for (const id of ids) {
    const t = page.locator(`.tile[data-id="${id}"]`);
    if (!/is-done/.test(await t.getAttribute('class'))) {
      await t.click();
      await page.waitForTimeout(550);
    }
  }
  await expect(page.locator('#screen')).toContainText('오늘 할 일 전부 끝!');
});

test('[7] 상점 — 모자라면 "별 N개 더"와 진행 막대', async () => {
  await page.locator('[data-act="shop"]').click();
  await page.waitForSelector('.shopitem');

  const needs = await page.locator('.shopitem__need').allInnerTexts();
  expect(needs.length, '부족한 항목이 하나는 있어야 한다').toBeGreaterThan(0);
  for (const n of needs) expect(n).toMatch(/별 \d+개 더/);

  const widths = await page.evaluate(
    () => [...document.querySelectorAll('.shopitem__bar i')].map(i => i.style.width));
  expect(widths.every(w => /^\d+%$/.test(w)), `막대 너비: ${widths.join(', ')}`).toBe(true);
});

test('[8] 교환은 PIN을 통과해야만 된다', async () => {
  await page.evaluate(() => { KB.store.adjustStars('c1', 100); KB.app.render(); });
  await page.waitForTimeout(200);

  const before = await page.evaluate(() => KB.store.getChild('c1').stars);
  const go = page.locator('[data-act="redeem"]').first();
  expect(await go.count(), '별이 충분하면 "바꾸기"가 나와야 한다').toBeGreaterThan(0);

  const rid = await go.getAttribute('data-id');
  const cost = await page.evaluate(id => KB.store.all().rewards.find(r => r.id === id).cost, rid);

  await go.click();
  await page.waitForSelector('.keypad');

  // 틀린 PIN 은 막혀야 한다
  for (const k of ['9', '9', '9', '9']) await page.locator(`.key[data-k="${k}"]`).click();
  await page.waitForTimeout(400);
  expect(await page.locator('.keypad').count(), '틀린 PIN 이면 모달이 남아야 한다').toBeGreaterThan(0);
  expect(await page.evaluate(() => KB.store.getChild('c1').stars),
    '틀린 PIN 으로 별이 깎이면 안 된다').toBe(before);

  // 맞는 PIN
  for (const k of ['1', '2', '3', '4']) await page.locator(`.key[data-k="${k}"]`).click();
  await page.waitForTimeout(600);
  expect(await page.evaluate(() => KB.store.getChild('c1').stars), '가격만큼 차감').toBe(before - cost);
  expect(await page.evaluate(() => KB.store.all().redemptions.length), '교환 기록').toBe(1);
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

test('[10] 부모가 추가한 할 일이 새로고침 없이 반영된다', async () => {
  await page.evaluate(() => KB.store.upsert('tasks', {
    childId: 'c1', emoji: '🌱', label: '자동화 테스트 항목', stars: 3, days: [0, 1, 2, 3, 4, 5, 6]
  }, 't'));
  await page.evaluate(() => KB.app.go('kid', 'c1'));
  await page.waitForTimeout(400);

  const labels = await page.locator('.tile__label').allInnerTexts();
  expect(labels, '추가 항목이 보여야 한다').toContain('자동화 테스트 항목');

  // 글 못 읽는 아이를 위해 숫자가 아니라 별 그림으로
  const stars = await page.locator('.tile', { hasText: '자동화 테스트 항목' })
    .locator('.tile__stars').innerText();
  expect(stars).toBe('⭐⭐⭐');
});

test('[11~12] 새로고침해도 살아남는다', async () => {
  const before = await page.evaluate(() => ({
    raw: localStorage.getItem('kidboard.v1'),
    stars: KB.store.getChild('c1').stars,
    done: KB.store.doneIds('c1').slice().sort()
  }));
  expect(before.raw, 'kidboard.v1 키').not.toBeNull();

  await page.reload();

  const after = await page.evaluate(() => ({
    stars: KB.store.getChild('c1').stars,
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

test('[15] 자정이 지나면 체크만 비워지고 별은 남는다', async () => {
  const r = await page.evaluate(() => {
    const S = KB.store;
    const tomorrow = S.dateKey(new Date(Date.now() + 86400000));
    return {
      stars: S.getChild('c1').stars,
      tomorrowDone: S.progressOf('c1', tomorrow).done
    };
  });
  expect(r.tomorrowDone, '날짜 키가 바뀌면 체크는 0').toBe(0);
  expect(r.stars, '누적 별은 살아남아야 한다').toBeGreaterThan(0);
});

test('[16] streak — 오늘이 미완성이어도 어제를 지운다고 끊지 않는다', async () => {
  const r = await page.evaluate(() => {
    const S = KB.store, c = 'c1';
    const ratio = S.progressOf(c).ratio;
    const full = S.streakOf(c);
    const done = S.doneIds(c);
    done.forEach(id => S.toggleTask(c, id));      // 오늘 0% 로
    const emptied = S.streakOf(c);
    done.forEach(id => S.toggleTask(c, id));      // 원복
    return { ratio, full, emptied, restored: S.streakOf(c) };
  });

  // 오늘 100% 면 최소 1일, 미완료가 남아 있으면 0 이 정상이다
  expect(r.ratio === 1 ? r.full >= 1 : r.full === 0,
    `ratio=${r.ratio} streak=${r.full}`).toBe(true);
  expect(r.restored, '토글을 원복하면 streak 도 돌아와야 한다').toBe(r.full);
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
