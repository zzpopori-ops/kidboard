# Phase 1 — 숙제 보드 (로컬 전용) 구현 계획

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 부모가 날짜마다 숙제를 넣고 아이가 체크해 별을 모으는 앱을, 서버 없이 한 기기에서 완전히 동작하게 만든다.

**Architecture:** 기존 `window.KB.*` 전역 네임스페이스와 `store.js` 단일 저장 계층 구조를 그대로 유지한다. `store.js` 를 v2 로 교체하고(습관·숙제·템플릿·보너스), 별은 저장하지 않고 기록에서 계산한다. 화면은 아이 화면(숙제 큰 카드 + 습관 작은 칩)과 부모 화면(숙제 탭 추가)을 고친다. 서버·동기화 코드는 **한 줄도 쓰지 않는다.**

**Tech Stack:** 바닐라 JS (ES 모듈 아님, IIFE + 전역 네임스페이스), localStorage, Playwright 1.56.1, Node 테스트 러너 없음(순수 노드 스크립트)

**Spec:** `docs/superpowers/specs/2026-09-12-homework-sync-design.md`

## Global Constraints

- ES 모듈(`import`/`export`)을 쓰지 않는다. 기존과 같이 IIFE + `window.KB.*` 네임스페이스
- `localStorage` 를 만지는 코드는 `js/store.js` 에만 둔다. 화면 코드는 store 함수만 부른다
- 저장 키는 `kidboard.v2`. 옛 키 `kidboard.v1` 은 읽지도 지우지도 않고 무시한다
- 별은 어디에도 저장하지 않는다. 항상 기록에서 계산한다
- 아이 화면 숙제 노출 상한은 4개. 5번째부터는 개수조차 표시하지 않는다
- 숙제 1개당 별 1개 고정. 습관은 기존대로 1~3
- 날짜 문자열은 항상 `YYYY-MM-DD` 로컬 시간 기준. `toISOString()` 을 날짜 키로 쓰지 않는다
- 사용자 입력을 `innerHTML` 에 넣을 때는 예외 없이 `ui.esc()` 를 통과시킨다
- Phase 2(서버·동기화)에서 쓸 코드는 지금 만들지 않는다. 자리만 비워둔다(아래 참조)

## Phase 2 를 위해 지금 지킬 것 (코드는 안 쓴다)

나중에 구조를 갈아엎지 않으려고 **규율만** 정한다. 새 파일도, 안 쓰는 함수도 만들지 않는다.

1. **상태를 바꾸는 함수를 스펙의 작업(op) 종류와 1:1 로 맞춘다.** `addHomework`, `setHomeworkDone`, `moveHomework`, `removeHomework`, `toggleHabit`, `addBonus`, `redeem` … Phase 2 는 이 함수들 안에서 큐에 적재만 추가하면 된다. 지금 큐 코드는 쓰지 않는다
2. **데이터 모양을 스펙과 정확히 같게 만든다.** 서버가 나중에 그대로 받아먹을 수 있어야 한다
3. **별을 계산값으로 둔다.** 이것이 Phase 2 의 멱등성을 가능하게 하는 전제다
4. **모든 항목에 안정적인 `id` 를 준다.** 배열 인덱스에 의존하지 않는다

---

## File Structure

| 파일 | 책임 | 이 Phase 에서 |
|---|---|---|
| `js/store.js` | 데이터. localStorage 를 만지는 유일한 파일 | **전면 교체** (316줄 → 약 330줄) |
| `js/views.js` | 아이 화면 (할 일 / 상점) | **대폭 수정** |
| `js/admin.js` | 부모 화면 | **숙제 탭 추가, 별 조정 → 보너스로 교체** |
| `js/app.js` | 진입점, 화면 전환, 클릭 위임 | **소폭 수정** (아이 1명이면 바로 진입) |
| `js/ui.js` | 공통 도구 | **거의 그대로** (날짜 선택 헬퍼만 추가) |
| `css/style.css` | 스타일 | 숙제 카드·칩·뱃지 클래스 추가 |
| `test/store.test.js` | 데이터 규칙 | **전면 교체** |
| `test/e2e.spec.js` | 화면·조작 | **태스크마다 해당 부분 교체** |
| `test/offline.spec.js` | 오프라인 | 캐시 이름 단정 외 그대로 |
| `test/update.spec.js` | 갱신 | 그대로 |

## 기존 테스트 처리 원칙

**건너뛰기(skip)를 쓰지 않는다.** 건너뛴 테스트는 CI 에서 초록으로 보이지만 아무것도 지키지 않는다 — 이 저장소는 "일부만 돌고 초록불" 을 막으려고 수집 검사까지 넣어둔 곳이다.

대신 **각 태스크가 무효화하는 테스트를 그 태스크 안에서 지우고, 같은 자리를 덮는 새 테스트를 쓴다.** 매 커밋에서 스위트가 의미를 유지한다.

| 기존 테스트 | 처리 | 언제 |
|---|---|---|
| `[0]` 모달 회귀 | 그대로 | — |
| `[X]` XSS | 그대로 (숙제 문구도 같은 경로를 탄다) | — |
| `[E]` 콘솔 에러 | 그대로 | — |
| `[13]` SW, `[11~12]` 영속성 | 그대로 | — |
| `[9]` 롱프레스 → PIN → admin | 그대로 | — |
| `offline.spec.js`, `update.spec.js` | 그대로 | — |
| `[1]` 홈(아이 2명 카드) | **삭제 → 신규 "아이 1명이면 바로 할 일 화면"** | Task 2 |
| `[2]` 요일 필터 | **개작 → 습관에만 적용** | Task 2 |
| `[3~4]` 체크/도장/별 | **개작 → 습관 체크 기준** | Task 2 |
| `[5]` 별 회수 | **개작 → 계산식 기준** | Task 2 |
| `[6]` 전부 끝 문구 | **개작** | Task 4 |
| `[7][8]` 상점·PIN·교환 | **개작 → 별 계산식 기준** | Task 7 |
| `[10]` 즉시 반영 | **개작 → 숙제 추가 기준** | Task 5 |
| `[15]` 자정 | **개작 → 숙제는 이월** | Task 3 |
| `[16]` streak | **삭제** (보류 결정) | Task 2 |

---

## Task 1: store v2 — 데이터 골격과 별 계산

서버 없이 돌아가는 새 데이터 층을 만든다. 화면은 아직 건드리지 않는다. 이 태스크가 끝나면 **앱은 깨진 상태**이고(화면이 옛 API 를 부른다) `npm run test:unit` 만 녹색이다. Task 2 에서 화면을 붙여 복구한다.

**Files:**
- Modify: `js/store.js` (전면 교체)
- Test: `test/store.test.js` (전면 교체)

**Interfaces:**
- Produces: `window.KB.store` 에 다음을 노출한다
  - `load()`, `save()`, `all()`, `dateKey(d?) -> 'YYYY-MM-DD'`, `uid(prefix) -> string`
  - `children() -> Child[]`, `getChild(id) -> Child|null`
  - `habits(childId) -> Habit[]`, `habitsFor(childId, key?) -> Habit[]`
  - `homeworkOf(childId) -> Homework[]`, `homeworkDue(childId, key?) -> Homework[]`
  - `starsOf(childId) -> number`
  - `templates() -> Template[]`, `rewards() -> Reward[]`
  - 타입: `Child {id,name,emoji,color,canRead}` · `Habit {id,childId,emoji,label,stars,days}` · `Homework {id,childId,emoji,label,date,stars,doneOn}` · `Template {id,emoji,text}`

- [ ] **Step 1: 새 단위 테스트를 쓴다 (전체 교체)**

`test/store.test.js` 의 내용을 아래로 **통째로 바꾼다**.

```javascript
// store.js 로직만 노드에서 검증 (브라우저 없이)
const fs = require('fs');
const mem = {};
global.window = {
  localStorage: {
    getItem: k => (k in mem ? mem[k] : null),
    setItem: (k, v) => { mem[k] = String(v); },
    removeItem: k => { delete mem[k]; }
  }
};
eval(fs.readFileSync(__dirname + '/../js/store.js', 'utf8'));
const S = window.KB.store;

function assert(cond, msg) {
  if (!cond) { console.error('FAIL:', msg); process.exitCode = 1; }
  else console.log('  ok -', msg);
}

S.load();

console.log('[1] 초기 상태');
assert(S.children().length === 1, '아이 1명으로 시작');
assert(S.getChild('c1').name === '첫째', '첫째');
assert(S.starsOf('c1') === 0, '별 0개로 시작');
assert(S.homeworkOf('c1').length === 0, '숙제는 비어서 시작');
assert(S.habits('c1').length > 0, '습관 기본값은 있다');
assert(S.templates().length > 0, '템플릿 기본값은 있다');

console.log('[2] 저장 키는 v2');
assert(mem['kidboard.v2'] !== undefined, 'kidboard.v2 에 저장된다');
assert(mem['kidboard.v1'] === undefined, 'v1 은 만들지 않는다');

console.log('[3] 날짜 키는 로컬 시간 기준');
const d = new Date(2026, 8, 14, 0, 30);   // 9월 14일 00:30 (KST)
assert(S.dateKey(d) === '2026-09-14', 'toISOString 을 쓰면 하루 밀린다');

console.log('[4] 습관은 요일 필터가 걸린다');
const mon = '2026-09-14';   // 월
const sat = '2026-09-12';   // 토
const weekdayOnly = S.habits('c1').filter(h => h.days.length < 7);
assert(weekdayOnly.length > 0, '평일만 하는 습관이 기본값에 있다');
assert(S.habitsFor('c1', mon).length > S.habitsFor('c1', sat).length,
       '월요일이 토요일보다 습관이 많다');

console.log('[5] 숙제는 날짜에 묶이고 미완료면 이월된다');
const hw1 = S.addHomework({ childId: 'c1', emoji: '📕', label: '수학 1~5쪽', date: '2026-09-14' });
const hw2 = S.addHomework({ childId: 'c1', emoji: '✏️', label: '받아쓰기 10문제', date: '2026-09-15' });
assert(hw1.id && hw1.stars === 1, '숙제 별은 고정 1개');
assert(hw1.doneOn === null, '만들 때는 미완료');
assert(S.homeworkDue('c1', '2026-09-14').length === 1, '14일에는 1개');
assert(S.homeworkDue('c1', '2026-09-15').length === 2, '15일에는 밀린 것까지 2개');
assert(S.homeworkDue('c1', '2026-09-13').length === 0, '아직 안 온 숙제는 안 보인다');

console.log('[6] 오래 밀린 것이 먼저 온다');
const due = S.homeworkDue('c1', '2026-09-15');
assert(due[0].id === hw1.id, '14일 것이 15일 것보다 앞');

console.log('[7] 완료하면 목록에서 빠지고 별이 오른다');
S.setHomeworkDone(hw1.id, '2026-09-15');
assert(S.homeworkDue('c1', '2026-09-15').length === 1, '끝낸 숙제는 사라진다');
assert(S.starsOf('c1') === 1, '숙제 1개 = 별 1개');
S.setHomeworkDone(hw1.id, null);
assert(S.starsOf('c1') === 0, '취소하면 별도 회수된다');
assert(S.homeworkDue('c1', '2026-09-15').length === 2, '취소하면 다시 보인다');

console.log('[8] 아이 화면 상한은 4개');
for (let i = 0; i < 6; i++) {
  S.addHomework({ childId: 'c1', emoji: '📗', label: '더미' + i, date: '2026-09-10' });
}
const visible = S.homeworkDue('c1', '2026-09-15', 4);
assert(visible.length === 4, '상한을 주면 4개까지만');
assert(S.homeworkDue('c1', '2026-09-15').length === 8, '상한이 없으면 전부 (부모용)');

console.log('[9] 습관 체크와 별');
const h = S.habitsFor('c1', mon)[0];
S.toggleHabit('c1', h.id, mon);
assert(S.starsOf('c1') === h.stars, '습관 별이 그대로 더해진다');
S.toggleHabit('c1', h.id, mon);
assert(S.starsOf('c1') === 0, '해제하면 회수된다');

console.log('[10] 보너스와 교환');
S.addBonus('c1', 5, '할머니 도와드림');
assert(S.starsOf('c1') === 5, '보너스가 더해진다');
assert(S.all().bonuses[0].memo === '할머니 도와드림', '메모가 남는다');
const cheap = S.rewards()[0];
const bad = S.redeem('c1', cheap.id);
assert(bad.ok === false && /더 필요/.test(bad.msg), '별이 모자라면 거절');
S.addBonus('c1', 100, '테스트');
const good = S.redeem('c1', cheap.id);
assert(good.ok === true, '충분하면 교환');
assert(S.starsOf('c1') === 105 - cheap.cost, '교환하면 별이 빠진다');

console.log('[11] 별은 저장되지 않는다');
assert(S.getChild('c1').stars === undefined, 'child 에 stars 필드가 없다');
const dump = JSON.parse(mem['kidboard.v2']);
assert(dump.children[0].stars === undefined, '저장된 데이터에도 없다');

console.log('[12] 템플릿');
const t = S.addTemplate({ emoji: '📐', text: '수학 익힘책 {}~{}쪽' });
assert(S.templates().some(x => x.id === t.id), '템플릿이 추가된다');
S.removeTemplate(t.id);
assert(!S.templates().some(x => x.id === t.id), '템플릿이 지워진다');

console.log('[13] 숙제 날짜 옮기기 / 지우기');
S.moveHomework(hw2.id, '2026-09-20');
assert(S.homeworkOf('c1').find(x => x.id === hw2.id).date === '2026-09-20', '날짜가 바뀐다');
S.removeHomework(hw2.id);
assert(!S.homeworkOf('c1').some(x => x.id === hw2.id), '숙제가 지워진다');

console.log('[14] 백업 / 복원');
const backup = S.exportJSON();
S.factoryReset();
assert(S.homeworkOf('c1').length === 0, '초기화하면 숙제가 비워진다');
S.importJSON(backup);
assert(S.homeworkOf('c1').length > 0, '복원하면 숙제가 돌아온다');
let threw = false;
try { S.importJSON('{"nope":1}'); } catch (e) { threw = true; }
assert(threw, '형식이 틀린 백업은 거부');

console.log('[15] 영속성');
assert(JSON.parse(mem['kidboard.v2']).version === 2, 'version 2 로 저장된다');
```

- [ ] **Step 2: 실패를 확인한다**

```bash
npm run test:unit
```

기대: `S.homeworkOf is not a function` 같은 오류로 실패. 아직 새 함수가 없기 때문이다.

- [ ] **Step 3: `js/store.js` 를 교체한다**

전체를 아래로 바꾼다.

```javascript
/* ============================================================
   store.js — 데이터 한 곳에서만 바뀌게 만드는 층
   화면 코드는 이 파일의 함수만 부른다. localStorage를 직접 만지지 않는다.

   별은 저장하지 않는다. 기록에서 계산한다 — 더하다 틀어지는 일을 없애려고.
   ============================================================ */
(function (global) {
  'use strict';

  var KEY = 'kidboard.v2';   // 구조를 바꿀 땐 v3으로 올린다
  var DAY = 86400000;
  var KEEP_DAYS = 120;       // 습관 진행 기록 보관 일수
  var VISIBLE = 4;           // 아이 화면에 보여줄 숙제 최대 개수

  function uid(prefix) {
    return prefix + Math.random().toString(36).slice(2, 7) + Date.now().toString(36).slice(-3);
  }

  /** Date -> 'YYYY-MM-DD' (로컬 시간 기준. toISOString은 UTC라 쓰면 안 된다) */
  function dateKey(d) {
    var t = d || new Date();
    var m = String(t.getMonth() + 1).padStart(2, '0');
    var dd = String(t.getDate()).padStart(2, '0');
    return t.getFullYear() + '-' + m + '-' + dd;
  }

  function weekdayOf(key) { return new Date(key + 'T00:00:00').getDay(); }

  function defaults() {
    return {
      version: 2,
      pin: '1234',
      sound: true,
      children: [
        { id: 'c1', name: '첫째', emoji: '🐯', color: '#3D7EA6', canRead: true }
      ],
      habits: [
        { id: 'h1', childId: 'c1', emoji: '🪥', label: '이 닦기',       stars: 1, days: [0,1,2,3,4,5,6] },
        { id: 'h2', childId: 'c1', emoji: '🎒', label: '가방 챙기기',   stars: 1, days: [1,2,3,4,5] },
        { id: 'h3', childId: 'c1', emoji: '🧺', label: '빨래통에 넣기', stars: 1, days: [0,1,2,3,4,5,6] }
      ],
      homework: [],
      templates: [
        { id: 'tpl1', emoji: '📕', text: '수학 문제집 {}~{}쪽' },
        { id: 'tpl2', emoji: '✏️', text: '받아쓰기 {}문제' }
      ],
      rewards: [
        { id: 'r1', emoji: '🍦', label: '아이스크림', cost: 10 },
        { id: 'r2', emoji: '📺', label: '만화 30분',  cost: 15 },
        { id: 'r3', emoji: '🎠', label: '키즈카페',   cost: 50 }
      ],
      progress: {},      // 습관 전용 { childId: { 'YYYY-MM-DD': [habitId,...] } }
      bonuses: [],       // { id, childId, amount, memo, at }
      redemptions: []    // { id, childId, rewardId, label, emoji, cost, at }
    };
  }

  var data = defaults();

  function load() {
    try {
      var raw = global.localStorage.getItem(KEY);
      if (raw) {
        var parsed = JSON.parse(raw);
        var base = defaults();
        Object.keys(base).forEach(function (k) {
          if (parsed[k] !== undefined) base[k] = parsed[k];
        });
        base.version = defaults().version;
        data = base;
      } else {
        data = defaults();
        save();
      }
    } catch (e) {
      console.warn('저장된 데이터를 읽지 못해 초기값으로 시작합니다.', e);
      data = defaults();
    }
    return data;
  }

  function save() {
    try {
      global.localStorage.setItem(KEY, JSON.stringify(data));
      return true;
    } catch (e) {
      console.error('저장에 실패했습니다.', e);
      return false;
    }
  }

  /** 오래된 습관 기록을 잘라 용량을 묶어둔다 */
  function prune() {
    var limit = dateKey(new Date(Date.now() - KEEP_DAYS * DAY));
    Object.keys(data.progress).forEach(function (cid) {
      var byDate = data.progress[cid];
      Object.keys(byDate).forEach(function (k) {
        if (k < limit) delete byDate[k];
      });
    });
  }

  // ---------- 읽기 ----------
  function all() { return data; }
  function children() { return data.children.slice(); }
  function rewards() { return data.rewards.slice(); }
  function templates() { return data.templates.slice(); }

  function getChild(id) {
    for (var i = 0; i < data.children.length; i++) {
      if (data.children[i].id === id) return data.children[i];
    }
    return null;
  }

  function habits(childId) {
    return data.habits.filter(function (h) { return h.childId === childId; });
  }

  /** 그 날 요일에 해당하는 습관만 */
  function habitsFor(childId, key) {
    var wd = weekdayOf(key || dateKey());
    return habits(childId).filter(function (h) {
      return (h.days || []).indexOf(wd) !== -1;
    });
  }

  function homeworkOf(childId) {
    return data.homework.filter(function (w) { return w.childId === childId; });
  }

  /**
   * 그 날 해야 할 숙제.
   *   날짜가 그 날 이하  AND  아직 안 끝난 것
   * 오래 밀린 것이 먼저 온다. limit 을 주면 앞에서 그만큼만.
   * limit 을 안 주면 전부 — 부모 화면에서 밀린 총량을 보려고.
   */
  function homeworkDue(childId, key, limit) {
    var k = key || dateKey();
    var list = homeworkOf(childId)
      .filter(function (w) { return !w.doneOn && w.date <= k; })
      .sort(function (a, b) { return a.date < b.date ? -1 : a.date > b.date ? 1 : 0; });
    return limit ? list.slice(0, limit) : list;
  }

  function isOverdue(w, key) { return w.date < (key || dateKey()); }

  function doneIds(childId, key) {
    var byDate = data.progress[childId];
    var k = key || dateKey();
    return (byDate && byDate[k]) ? byDate[k].slice() : [];
  }

  function isHabitDone(childId, habitId, key) {
    return doneIds(childId, key).indexOf(habitId) !== -1;
  }

  /** 습관 진행률 { done, total, ratio } */
  function progressOf(childId, key) {
    var total = habitsFor(childId, key).length;
    var ids = doneIds(childId, key);
    var done = habitsFor(childId, key).filter(function (h) {
      return ids.indexOf(h.id) !== -1;
    }).length;
    return { done: done, total: total, ratio: total ? done / total : 0 };
  }

  /**
   * 별은 저장하지 않고 매번 계산한다.
   * 이러면 재시도나 중복 기록으로 별이 부풀 수 없다.
   */
  function starsOf(childId) {
    var n = 0;
    homeworkOf(childId).forEach(function (w) { if (w.doneOn) n += (w.stars || 1); });
    var byDate = data.progress[childId] || {};
    Object.keys(byDate).forEach(function (k) {
      byDate[k].forEach(function (hid) {
        var h = data.habits.filter(function (x) { return x.id === hid; })[0];
        if (h) n += (h.stars || 1);
      });
    });
    data.bonuses.forEach(function (b) { if (b.childId === childId) n += b.amount; });
    data.redemptions.forEach(function (r) { if (r.childId === childId) n -= r.cost; });
    return Math.max(0, n);
  }

  // ---------- 쓰기 ----------
  // 함수 하나가 스펙의 작업(op) 하나에 대응한다. Phase 2 에서 이 안에 큐 적재만 붙인다.

  function addHomework(w) {
    var item = {
      id: w.id || uid('hw'),
      childId: w.childId,
      emoji: w.emoji || '📘',
      label: w.label,
      date: w.date || dateKey(),
      stars: 1,
      doneOn: null
    };
    data.homework.push(item);
    save();
    return item;
  }

  function setHomeworkDone(id, doneOn) {
    var w = data.homework.filter(function (x) { return x.id === id; })[0];
    if (!w) return null;
    w.doneOn = doneOn || null;
    save();
    return w;
  }

  function moveHomework(id, date) {
    var w = data.homework.filter(function (x) { return x.id === id; })[0];
    if (!w) return null;
    w.date = date;
    save();
    return w;
  }

  function removeHomework(id) {
    data.homework = data.homework.filter(function (x) { return x.id !== id; });
    save();
  }

  function toggleHabit(childId, habitId, key) {
    var k = key || dateKey();
    if (!data.progress[childId]) data.progress[childId] = {};
    if (!data.progress[childId][k]) data.progress[childId][k] = [];
    var list = data.progress[childId][k];
    var at = list.indexOf(habitId);
    var done;
    if (at === -1) { list.push(habitId); done = true; }
    else { list.splice(at, 1); done = false; }
    prune();
    save();
    return { done: done };
  }

  function addTemplate(t) {
    var item = { id: t.id || uid('tpl'), emoji: t.emoji || '📘', text: t.text };
    data.templates.push(item);
    save();
    return item;
  }

  function removeTemplate(id) {
    data.templates = data.templates.filter(function (x) { return x.id !== id; });
    save();
  }

  function addBonus(childId, amount, memo) {
    var item = {
      id: uid('b'), childId: childId, amount: amount,
      memo: memo || '', at: new Date().toISOString()
    };
    data.bonuses.unshift(item);
    data.bonuses = data.bonuses.slice(0, 200);
    save();
    return item;
  }

  function redeem(childId, rewardId) {
    var reward = data.rewards.filter(function (r) { return r.id === rewardId; })[0];
    if (!getChild(childId) || !reward) return { ok: false, msg: '보상을 찾을 수 없습니다.' };
    var have = starsOf(childId);
    if (have < reward.cost) {
      return { ok: false, msg: '별이 ' + (reward.cost - have) + '개 더 필요합니다.' };
    }
    data.redemptions.unshift({
      id: uid('x'), childId: childId, rewardId: reward.id,
      label: reward.label, emoji: reward.emoji, cost: reward.cost,
      at: new Date().toISOString()
    });
    data.redemptions = data.redemptions.slice(0, 200);
    save();
    return { ok: true, left: starsOf(childId) };
  }

  // ---------- 부모 설정용 CRUD ----------
  function upsert(listName, obj, prefix) {
    var list = data[listName];
    if (obj.id) {
      for (var i = 0; i < list.length; i++) {
        if (list[i].id === obj.id) { Object.assign(list[i], obj); save(); return list[i]; }
      }
    }
    obj.id = obj.id || uid(prefix);
    list.push(obj);
    save();
    return obj;
  }

  function remove(listName, id) {
    data[listName] = data[listName].filter(function (x) { return x.id !== id; });
    if (listName === 'children') {
      data.habits = data.habits.filter(function (h) { return h.childId !== id; });
      data.homework = data.homework.filter(function (w) { return w.childId !== id; });
      delete data.progress[id];
    }
    save();
  }

  function setPin(pin) { data.pin = String(pin); save(); }
  function checkPin(pin) { return String(pin) === String(data.pin); }
  function setSound(on) { data.sound = !!on; save(); }

  function exportJSON() { return JSON.stringify(data, null, 2); }

  function importJSON(text) {
    var parsed = JSON.parse(text);
    if (!parsed || !Array.isArray(parsed.children) || !Array.isArray(parsed.homework)) {
      throw new Error('백업 파일 형식이 맞지 않습니다.');
    }
    data = parsed;
    if (!data.progress) data.progress = {};
    if (!data.bonuses) data.bonuses = [];
    if (!data.redemptions) data.redemptions = [];
    if (!data.templates) data.templates = [];
    save();
  }

  function factoryReset() { data = defaults(); save(); }

  global.KB = global.KB || {};
  global.KB.store = {
    VISIBLE: VISIBLE,
    load: load, save: save, dateKey: dateKey, uid: uid,
    all: all, children: children, getChild: getChild,
    rewards: rewards, templates: templates,
    habits: habits, habitsFor: habitsFor, isHabitDone: isHabitDone,
    doneIds: doneIds, progressOf: progressOf, toggleHabit: toggleHabit,
    homeworkOf: homeworkOf, homeworkDue: homeworkDue, isOverdue: isOverdue,
    addHomework: addHomework, setHomeworkDone: setHomeworkDone,
    moveHomework: moveHomework, removeHomework: removeHomework,
    addTemplate: addTemplate, removeTemplate: removeTemplate,
    starsOf: starsOf, addBonus: addBonus, redeem: redeem,
    upsert: upsert, remove: remove,
    setPin: setPin, checkPin: checkPin, setSound: setSound,
    exportJSON: exportJSON, importJSON: importJSON, factoryReset: factoryReset
  };
})(window);
```

- [ ] **Step 4: 단위 테스트가 통과하는지 확인한다**

```bash
npm run test:unit
```

기대: `ok -` 만 나오고 `FAIL` 없음, 종료코드 0.

- [ ] **Step 5: 커밋**

```bash
git add js/store.js test/store.test.js
git commit -m "store: 숙제·습관·템플릿 모델로 교체하고 별을 계산값으로 바꾼다

숙제 완료를 항목의 doneOn 에 기록해 이월을 공짜로 얻는다.
별은 저장하지 않고 숙제·습관·보너스·교환 기록에서 매번 계산한다.
동기화가 들어와도 중복 기록으로 별이 부풀 수 없게 하려는 것이다.

이 커밋 시점에는 화면이 아직 옛 API 를 부르므로 앱이 뜨지 않는다.
다음 커밋에서 화면을 붙인다."
```

---

## Task 2: 아이 화면 — 바로 진입 + 습관 칩

앱을 다시 뜨게 만든다. 숙제는 아직 없고 습관만 보인다.

**Files:**
- Modify: `js/views.js` (`renderHome` 제거, `renderKid` 교체)
- Modify: `js/app.js:16-28` (아이 1명이면 바로 진입)
- Modify: `css/style.css` (습관 칩 클래스 추가)
- Test: `test/e2e.spec.js` (`[1] [2] [3~4] [5] [16]` 삭제 후 신규 작성)

**Interfaces:**
- Consumes: Task 1 의 `store.habitsFor`, `store.toggleHabit`, `store.starsOf`, `store.progressOf`
- Produces: `KB.views.renderKid(childId)`, `KB.views.onToggleHabit(habitId, el)`; DOM 규약 `.chip[data-act="habit"][data-id]`, `.chip.is-done`

- [ ] **Step 1: 기존 테스트에서 무효화된 것을 지운다**

`test/e2e.spec.js` 에서 아래 5개 `test(...)` 블록을 **통째로 삭제**한다.

- `'[1] 홈 — 아이 2명, 별 0, 빈 병'`
- `'[2] 할 일 화면 — 요일 필터가 걸린다'`
- `'[3~4] 체크하면 도장이 찍히고 별이 는다'`
- `'[5] 해제하면 별을 회수한다 — 반복 체크로 못 쌓는다'`
- `'[16] streak — 오늘이 미완성이어도 어제를 지운다고 끊지 않는다'`

`beforeAll` 의 `localStorage.removeItem('kidboard.v1')` 를 `'kidboard.v2'` 로 바꾼다.

- [ ] **Step 2: 새 테스트를 쓴다**

`test/e2e.spec.js` 의 `[0]` 회귀 테스트 **바로 다음**에 아래를 넣는다.

```javascript
test('[1] 앱을 켜면 아이 선택 없이 바로 할 일 화면', async () => {
  // 아이가 1명이면 고르게 할 이유가 없다. 탭 한 번을 아낀다.
  expect(await page.locator('[data-act="open-kid"]').count(),
    '아이 선택 카드가 없어야 한다').toBe(0);
  await expect(page.locator('.kidtop__name')).toHaveText('첫째');
});

test('[2] 습관은 칩으로 보이고 요일 필터가 걸린다', async () => {
  const labels = await page.locator('.chip__label').allInnerTexts();
  const wd = await page.evaluate(() => new Date().getDay());
  const weekend = wd === 0 || wd === 6;
  // "가방 챙기기" 는 days:[1..5] 라 주말에는 빠진다
  expect(labels.includes('가방 챙기기'), `요일 ${wd}`).toBe(!weekend);
  expect(labels.length, '습관 칩이 하나 이상').toBeGreaterThan(0);
});

test('[3] 습관을 누르면 별이 오르고 다시 누르면 회수된다', async () => {
  const chip = () => page.locator('.chip', { hasText: '이 닦기' });
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
```

- [ ] **Step 3: 실패를 확인한다**

```bash
npx playwright test test/e2e.spec.js
```

기대: `[1]` 이 `아이 선택 카드가 없어야 한다` 로 실패하거나, 앱이 뜨지 않아 전부 실패. 화면이 아직 옛 API 를 부르기 때문이다.

- [ ] **Step 4: `js/app.js` 의 진입 로직을 고친다**

`js/app.js` 의 `render()` 를 아래로 바꾼다.

```javascript
  function render() {
    state.day = store.dateKey();
    if (state.view === 'admin') return admin.renderAdmin();
    if (state.view === 'shop') return views.renderShop(state.id || firstChildId());
    return views.renderKid(state.id || firstChildId());
  }

  /** 아이가 1명이면 고르게 할 이유가 없다. 늘어나면 선택 화면이 저절로 돌아온다. */
  function firstChildId() {
    var list = store.children();
    return list.length ? list[0].id : null;
  }
```

그리고 클릭 위임에서 `if (act === 'toggle')` 을 아래로 바꾼다.

```javascript
    if (act === 'habit') return views.onToggleHabit(id, btn);
```

- [ ] **Step 5: `js/views.js` 를 고친다**

`renderHome` 함수를 통째로 삭제하고, `renderKid` 를 아래로 바꾼다. `global.KB.views` 노출 목록에서 `renderHome` 을 빼고 `onToggleHabit` 을 넣는다.

```javascript
  function renderKid(childId) {
    var c = store.getChild(childId);
    if (!c) { screen().innerHTML = '<p class="empty">부모 설정에서 아이를 추가하세요.</p>'; return; }

    var key = store.dateKey();
    var habits = store.habitsFor(c.id, key);
    var doneIds = store.doneIds(c.id, key);

    var chips = habits.map(function (h) {
      var done = doneIds.indexOf(h.id) !== -1;
      return '' +
        '<button class="chip' + (done ? ' is-done' : '') + '" data-act="habit" data-id="' + esc(h.id) + '"' +
                ' aria-pressed="' + done + '">' +
          '<span class="chip__emoji">' + esc(h.emoji) + '</span>' +
          '<span class="chip__label">' + esc(h.label) + '</span>' +
        '</button>';
    }).join('');

    screen().innerHTML = '' +
      '<header class="kidtop" style="--accent:' + esc(c.color) + '">' +
        '<h1 class="brand" id="brandHold">오늘의 할 일</h1>' +
        '<span class="kidtop__face">' + esc(c.emoji) + '</span>' +
        '<span class="kidtop__name">' + esc(c.name) + '</span>' +
        '<span class="kidtop__jar" id="jarTarget">' + ui.jarSVG(0, c.color) + '</span>' +
        '<button class="starbtn" data-act="shop">' +
          '<span class="starbtn__n">⭐ ' + store.starsOf(c.id) + '</span>' +
          '<span class="starbtn__t">상점</span></button>' +
      '</header>' +
      (habits.length
        ? '<section class="habits"><h2 class="sect">매일 하는 것</h2>' + chips + '</section>'
        : '');

    ui.longPress($('#brandHold'), 1500, function () {
      ui.askPin('부모 설정').then(function (ok) {
        if (ok) global.KB.app.go('admin');
      });
    });
  }

  function onToggleHabit(habitId, el) {
    var c = store.children()[0];
    if (!c) return;
    var res = store.toggleHabit(c.id, habitId);
    if (res.done) { ui.beep('check'); ui.flyStar(el, $('#jarTarget')); }
    var wait = ui.reduceMotion() ? 0 : 480;
    setTimeout(function () { global.KB.app.render(); }, wait);
  }
```

- [ ] **Step 6: `css/style.css` 에 칩 스타일을 넣는다**

`/* ---------- 7. 모달 ---------- */` 바로 앞에 붙인다.

```css
/* ---------- 습관 칩 ---------- */
.sect { font-size: 15px; color: var(--ink-soft); margin: 18px 0 8px; font-weight: 800; }
.habits { padding: 0 4px; }
.chip {
  display: inline-flex; align-items: center; gap: 8px;
  padding: 12px 16px; margin: 0 8px 8px 0;
  background: #fff; border: 2px solid var(--ink); border-radius: 999px;
  font: 700 16px system-ui, sans-serif; color: var(--ink);
  box-shadow: 0 3px 0 var(--ink);
}
.chip__emoji { font-size: 22px; }
.chip.is-done { background: #DFF3E6; opacity: .75; box-shadow: none; transform: translateY(3px); }
.chip.is-done .chip__label { text-decoration: line-through; }
```

- [ ] **Step 7: 테스트가 통과하는지 확인한다**

```bash
npm test
```

기대: 단위 `FAIL` 0, E2E 전부 통과.

- [ ] **Step 8: 커밋**

```bash
git add js/views.js js/app.js css/style.css test/e2e.spec.js
git commit -m "화면: 아이 1명이면 바로 할 일 화면으로 들어간다

아이가 1명이면 고르게 할 이유가 없다. children.length 로 판단하므로
둘째를 추가하면 선택 화면이 저절로 돌아온다 — 모드 플래그를 만들지 않는다.

습관은 작은 칩으로 그린다. 곧 들어올 숙제 카드와 위계를 나누기 위해서다."
```

---

## Task 3: 아이 화면 — 숙제 카드와 상한 4개

**Files:**
- Modify: `js/views.js` (`renderKid` 에 숙제 구역 추가, `onToggleHomework` 신규)
- Modify: `js/app.js` (클릭 위임에 `homework` 추가)
- Modify: `css/style.css` (숙제 카드·밀림 뱃지)
- Test: `test/e2e.spec.js` (`[15]` 자정 개작 + 신규)

**Interfaces:**
- Consumes: `store.homeworkDue(childId, key, limit)`, `store.setHomeworkDone(id, doneOn)`, `store.isOverdue(w, key)`, `store.VISIBLE`
- Produces: DOM 규약 `.hw[data-act="homework"][data-id]`, `.hw.is-done`, `.hw__overdue`

- [ ] **Step 1: 기존 `[15]` 테스트를 지운다**

`test/e2e.spec.js` 에서 `'[15] 자정이 지나면 체크만 비워지고 별은 남는다'` 블록을 삭제한다.

- [ ] **Step 2: 새 테스트를 쓴다**

`[3]` 다음에 넣는다.

```javascript
test('[4] 숙제는 큰 카드로 보이고 밀린 것이 먼저 온다', async () => {
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
  expect(labels[0], '오래 밀린 것이 맨 앞').toBe('사흘 전 그림일기');
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
```

- [ ] **Step 3: 실패를 확인한다**

```bash
npx playwright test test/e2e.spec.js
```

기대: `[4]` 가 `.hw` 를 못 찾아 타임아웃으로 실패.

- [ ] **Step 4: `js/views.js` 에 숙제 구역을 넣는다**

`renderKid` 안에서 `chips` 를 만든 **다음**에 아래를 넣고, `screen().innerHTML` 조립에 `hwSection` 을 습관 구역보다 **앞에** 넣는다.

```javascript
    var due = store.homeworkDue(c.id, key, store.VISIBLE);
    var cards = due.map(function (w) {
      return '' +
        '<button class="hw" data-act="homework" data-id="' + esc(w.id) + '">' +
          (store.isOverdue(w, key)
            ? '<span class="hw__overdue">' + esc(overdueText(w.date, key)) + '</span>' : '') +
          '<span class="hw__emoji">' + esc(w.emoji) + '</span>' +
          '<span class="hw__label">' + esc(w.label) + '</span>' +
          '<span class="hw__star">⭐</span>' +
          '<span class="hw__stamp">했다!</span>' +
        '</button>';
    }).join('');

    var hwSection = due.length
      ? '<section class="hws"><h2 class="sect">오늘의 숙제</h2><div class="hws__grid">' + cards + '</div></section>'
      : '<p class="empty">오늘 숙제가 없어요. 푹 쉬세요!</p>';
```

파일 안쪽(다른 헬퍼 옆)에 아래를 추가한다.

```javascript
  /** '어제' / '3일 전' — 아이가 읽고 순서를 납득하게 */
  function overdueText(date, key) {
    var a = new Date(date + 'T00:00:00'), b = new Date(key + 'T00:00:00');
    var n = Math.round((b - a) / 86400000);
    return n === 1 ? '어제' : n + '일 전';
  }

  function onToggleHomework(id, el) {
    store.setHomeworkDone(id, store.dateKey());
    ui.beep('check');
    ui.flyStar(el, $('#jarTarget'));
    var wait = ui.reduceMotion() ? 0 : 480;
    setTimeout(function () { global.KB.app.render(); }, wait);
  }
```

`global.KB.views` 노출 목록에 `onToggleHomework` 를 넣는다.

- [ ] **Step 5: `js/app.js` 클릭 위임에 한 줄 추가**

`if (act === 'habit')` 바로 위에 넣는다.

```javascript
    if (act === 'homework') return views.onToggleHomework(id, btn);
```

- [ ] **Step 6: `css/style.css` 에 숙제 카드 스타일을 넣는다**

습관 칩 블록 앞에 붙인다.

```css
/* ---------- 숙제 카드 ---------- */
.hws { padding: 0 4px; }
.hws__grid { display: grid; grid-template-columns: repeat(2, 1fr); gap: 12px; }
.hw {
  position: relative; display: flex; flex-direction: column; align-items: center;
  gap: 6px; padding: 20px 14px; min-height: 150px;
  background: #fff; border: 3px solid var(--ink); border-radius: 18px;
  box-shadow: 0 5px 0 var(--ink); font: 800 18px system-ui, sans-serif; color: var(--ink);
  text-align: center;
}
.hw__emoji { font-size: 44px; }
.hw__label { font-size: 17px; line-height: 1.4; word-break: keep-all; }
.hw__star { font-size: 18px; }
.hw__overdue {
  position: absolute; top: -10px; right: -6px;
  background: var(--berry); color: #fff; border-radius: 999px;
  padding: 3px 10px; font-size: 13px; font-weight: 800;
}
.hw__stamp { display: none; }
@media (max-width: 420px) { .hws__grid { grid-template-columns: 1fr; } }
```

- [ ] **Step 7: 테스트가 통과하는지 확인한다**

```bash
npm test
```

- [ ] **Step 8: 커밋**

```bash
git add js/views.js js/app.js css/style.css test/e2e.spec.js
git commit -m "화면: 숙제 카드와 상한 4개

오래 밀린 것부터 4개까지만 아이에게 보인다. 5번째는 개수조차
표시하지 않는다 — '대기 3개' 를 띄우면 끝이 보이게 하려던 의도를
스스로 깨기 때문이다. 밀린 총량은 부모 화면에서만 본다.

날짜가 바뀌어도 숙제는 사라지지 않는다. 습관과 다른 점이다."
```

---

## Task 4: 아이 화면 — 별 병과 완료 문구

**Files:**
- Modify: `js/views.js` (`renderKid` 의 병 비율, 완료 문구)
- Test: `test/e2e.spec.js` (`[6] 전부 체크하면 축하 문구` 개작)

**Interfaces:**
- Consumes: `store.homeworkDue`, `store.progressOf`

- [ ] **Step 1: 기존 `[6]` 테스트를 지운다**

`'[6] 전부 체크하면 축하 문구가 뜬다'` 블록을 삭제한다. (Task 3 에서 넣은 `[6] 숙제를 누르면…` 과 이름이 겹치지 않도록, 기존 것만 지운다.)

- [ ] **Step 2: 새 테스트를 쓴다**

```javascript
test('[8] 숙제와 습관을 다 끝내면 축하 문구가 뜬다', async () => {
  await page.evaluate(() => {
    const S = KB.store, today = S.dateKey();
    S.all().homework = [];                       // 밀린 것 정리
    S.addHomework({ childId: 'c1', emoji: '📕', label: '마지막 숙제', date: today });
    KB.app.render();
  });
  await page.waitForSelector('.hw');

  await page.locator('.hw').first().click();
  await page.waitForTimeout(700);
  for (const chip of await page.locator('.chip:not(.is-done)').all()) {
    await chip.click();
    await page.waitForTimeout(550);
  }
  await expect(page.locator('#screen')).toContainText('오늘 할 일 전부 끝!');
});

test('[9] 별 병이 별 개수에 따라 차오른다', async () => {
  const h = await page.evaluate(() => {
    const r = document.querySelector('.jar rect[fill="#F6BD3B"]');
    return r ? +r.getAttribute('height') : -1;
  });
  expect(h, '별을 모았으면 병이 비어 있지 않다').toBeGreaterThan(0);
});
```

- [ ] **Step 3: 실패를 확인한다**

```bash
npx playwright test test/e2e.spec.js
```

기대: `[8]` 이 축하 문구를 못 찾아 실패, `[9]` 는 병 높이가 0 이라 실패.

- [ ] **Step 4: `js/views.js` 를 고친다**

`renderKid` 안에서 `hwSection` 정의 다음에 넣는다.

```javascript
    var p = store.progressOf(c.id, key);
    var allDone = (due.length === 0) && (p.total === 0 || p.done >= p.total);

    // 병은 "오늘 얼마나 했나" 가 아니라 "다음 보상까지 얼마나 왔나" 를 보여준다.
    // 글을 못 읽어도 이해되는 지표라서 상점 가격 기준이 맞다.
    var stars = store.starsOf(c.id);
    var cheapest = store.rewards().reduce(function (m, r) {
      return (m === null || r.cost < m) ? r.cost : m;
    }, null);
    var ratio = cheapest ? Math.min(1, stars / cheapest) : 0;
```

`ui.jarSVG(0, c.color)` 를 `ui.jarSVG(ratio, c.color)` 로 바꾸고, `innerHTML` 조립 맨 끝에 붙인다.

```javascript
      + (allDone ? '<p class="cheer">오늘 할 일 전부 끝! 🎉</p>' : '')
```

`renderKid` 끝의 `ui.longPress(...)` 앞에 넣는다.

```javascript
    if (allDone) ui.beep('reward');
```

- [ ] **Step 5: 테스트가 통과하는지 확인한다**

```bash
npm test
```

- [ ] **Step 6: 커밋**

```bash
git add js/views.js test/e2e.spec.js
git commit -m "화면: 별 병과 완료 문구

병은 다음 보상까지 얼마나 왔는지를 보여준다. 글을 못 읽어도
막대가 얼마나 찼는지는 알기 때문에 가장 싼 보상 기준으로 잡았다."
```

---

## Task 5: 부모 화면 — 숙제 탭

**Files:**
- Modify: `js/admin.js` (탭 목록에 숙제 추가, `homeworkPanel`, `handle` 분기)
- Test: `test/e2e.spec.js` (`[10] 즉시 반영` 개작)

**Interfaces:**
- Consumes: `store.addHomework`, `store.removeHomework`, `store.moveHomework`, `store.homeworkOf`, `store.homeworkDue`, `store.dateKey`
- Produces: DOM 규약 `#hw-date`, `#hw-label`, `[data-act="hw-add"]`, `[data-act="hw-del"]`, `[data-act="hw-today"]`

- [ ] **Step 1: 기존 `[10]` 테스트를 지운다**

`'[10] 부모가 추가한 할 일이 새로고침 없이 반영된다'` 블록을 삭제한다.

- [ ] **Step 2: 새 테스트를 쓴다**

```javascript
test('[10] 부모 화면에서 숙제를 넣으면 아이 화면에 즉시 반영된다', async () => {
  await page.evaluate(() => { KB.store.all().homework = []; KB.app.go('admin'); });
  await page.waitForSelector('[data-act="tab"]');
  await page.locator('[data-act="tab"][data-id="homework"]').click();
  await page.waitForSelector('#hw-label');

  await page.fill('#hw-label', '국어 독후감 1쪽');
  await page.locator('[data-act="hw-add"]').click();
  await page.waitForTimeout(300);
  await expect(page.locator('.hwrow')).toContainText('국어 독후감 1쪽');

  await page.locator('[data-act="home"]').first().click();
  await page.waitForSelector('.hw');
  const labels = await page.locator('.hw__label').allInnerTexts();
  expect(labels, '새로고침 없이 아이 화면에 보인다').toContain('국어 독후감 1쪽');
});

test('[11] 부모 화면에서는 밀린 숙제 전부가 보인다', async () => {
  await page.evaluate(() => {
    const S = KB.store, past = S.dateKey(new Date(Date.now() - 2 * 86400000));
    for (let i = 0; i < 6; i++) {
      S.addHomework({ childId: 'c1', emoji: '📗', label: '밀린 ' + i, date: past });
    }
    KB.app.go('admin');
  });
  await page.locator('[data-act="tab"][data-id="homework"]').click();
  await page.waitForSelector('.hwrow');
  // 아이 화면은 4개까지지만 부모는 전부 봐야 판단할 수 있다
  expect(await page.locator('.hwrow').count()).toBeGreaterThanOrEqual(7);
});
```

- [ ] **Step 3: 실패를 확인한다**

```bash
npx playwright test test/e2e.spec.js
```

기대: `숙제` 탭 버튼이 없어 타임아웃.

- [ ] **Step 4: `js/admin.js` 를 고친다**

파일 상단의 탭 정의를 찾아 `homework` 를 **맨 앞에** 넣는다(부모가 가장 자주 쓰는 탭이므로).

```javascript
  var TABS = [
    { id: 'homework', label: '숙제' },
    { id: 'children', label: '아이' },
    { id: 'tasks',    label: '습관' },
    { id: 'rewards',  label: '보상' },
    { id: 'data',     label: '데이터' }
  ];
  var tab = 'homework';
```

`panelHTML()` 의 분기에 한 줄 추가한다.

```javascript
    if (tab === 'homework') return homeworkPanel();
```

`childrenPanel()` 앞에 아래 함수를 추가한다.

```javascript
  function homeworkPanel() {
    var c = store.children()[0];
    if (!c) return '<p class="empty">아이 탭에서 아이를 먼저 추가하세요.</p>';

    var today = store.dateKey();
    var list = store.homeworkOf(c.id)
      .filter(function (w) { return !w.doneOn; })
      .sort(function (a, b) { return a.date < b.date ? -1 : 1; });

    var rows = list.map(function (w) {
      var late = w.date < today;
      return '' +
        '<div class="hwrow' + (late ? ' is-late' : '') + '">' +
          '<span class="hwrow__date">' + esc(w.date.slice(5)) + '</span>' +
          '<span class="hwrow__emoji">' + esc(w.emoji) + '</span>' +
          '<span class="hwrow__label">' + esc(w.label) + '</span>' +
          (late ? '<button class="mini" data-act="hw-today" data-id="' + esc(w.id) + '">오늘로</button>' : '') +
          '<button class="mini mini--warn" data-act="hw-del" data-id="' + esc(w.id) + '">지움</button>' +
        '</div>';
    }).join('');

    return '' +
      '<div class="row"><label>날짜</label>' +
        '<input type="date" id="hw-date" value="' + esc(today) + '"></div>' +
      '<div class="row"><label>숙제</label>' +
        '<input type="text" id="hw-label" placeholder="예: 수학 문제집 1~5쪽"></div>' +
      '<button class="btn btn--add" data-act="hw-add">추가</button>' +
      '<h3 class="sect">아직 안 한 숙제 (' + list.length + '개)</h3>' +
      (rows || '<p class="empty">없습니다.</p>');
  }
```

`handle(act, id)` 에 분기를 추가한다.

```javascript
    if (act === 'hw-add') {
      var label = ($('#hw-label') || {}).value;
      var date = ($('#hw-date') || {}).value;
      if (!label || !label.trim()) { ui.toast('숙제 내용을 적어주세요.'); return true; }
      store.addHomework({
        childId: store.children()[0].id,
        label: label.trim(),
        date: date || store.dateKey()
      });
      renderAdmin();
      return true;
    }
    if (act === 'hw-del') { store.removeHomework(id); renderAdmin(); return true; }
    if (act === 'hw-today') { store.moveHomework(id, store.dateKey()); renderAdmin(); return true; }
```

- [ ] **Step 5: `css/style.css` 에 목록 스타일을 넣는다**

```css
/* ---------- 부모 화면 숙제 목록 ---------- */
.hwrow {
  display: flex; align-items: center; gap: 8px; flex-wrap: wrap;
  padding: 10px 12px; margin-bottom: 6px;
  background: #fff; border: 2px solid var(--ink); border-radius: 10px;
}
.hwrow.is-late { border-color: var(--berry); }
.hwrow__date { font-size: 13px; color: var(--ink-soft); font-weight: 800; min-width: 44px; }
.hwrow__label { flex: 1; font-weight: 700; word-break: keep-all; }
```

- [ ] **Step 6: 테스트가 통과하는지 확인한다**

```bash
npm test
```

- [ ] **Step 7: 커밋**

```bash
git add js/admin.js css/style.css test/e2e.spec.js
git commit -m "부모 화면: 숙제 탭

부모가 가장 자주 쓰는 탭이라 맨 앞에 두고 기본 탭으로 잡았다.
아이 화면은 4개까지만 보여주지만 부모는 밀린 것 전부를 본다 —
줄일지 다시 낼지는 부모가 판단할 일이다."
```

---

## Task 6: 부모 화면 — 템플릿으로 타이핑 줄이기

**Files:**
- Modify: `js/admin.js` (`homeworkPanel` 에 템플릿 줄 추가, `handle` 분기)
- Test: `test/e2e.spec.js` (신규)

**Interfaces:**
- Consumes: `store.templates()`, `store.addTemplate`, `store.removeTemplate`
- Produces: DOM 규약 `[data-act="tpl-use"][data-id]`

- [ ] **Step 1: 테스트를 쓴다**

```javascript
test('[12] 템플릿을 누르면 입력칸이 채워지고 빈칸만 남는다', async () => {
  await page.evaluate(() => KB.app.go('admin'));
  await page.locator('[data-act="tab"][data-id="homework"]').click();
  await page.waitForSelector('[data-act="tpl-use"]');

  await page.locator('[data-act="tpl-use"]').first().click();
  const v = await page.inputValue('#hw-label');
  expect(v, '템플릿 문구가 입력칸에 들어간다').toContain('수학 문제집');
  expect(v, '빈칸 표시가 남아 있다').toContain('{}');
});
```

- [ ] **Step 2: 실패를 확인한다**

```bash
npx playwright test test/e2e.spec.js -g "템플릿"
```

기대: `[data-act="tpl-use"]` 를 못 찾아 타임아웃.

- [ ] **Step 3: `js/admin.js` 의 `homeworkPanel` 에 템플릿 줄을 넣는다**

`'<div class="row"><label>숙제</label>' ...` **앞에** 넣는다.

```javascript
    var tpls = store.templates().map(function (t) {
      return '<button class="mini" data-act="tpl-use" data-id="' + esc(t.id) + '">' +
               esc(t.emoji) + ' ' + esc(t.text) + '</button>';
    }).join('');
```

그리고 반환 문자열에 아래를 `날짜` 줄 다음에 끼운다.

```javascript
      '<div class="row"><label>템플릿</label><div class="tpls">' + tpls + '</div></div>' +
```

`handle` 에 분기를 추가한다.

```javascript
    if (act === 'tpl-use') {
      var t = store.templates().filter(function (x) { return x.id === id; })[0];
      var input = $('#hw-label');
      if (t && input) {
        input.value = t.text;
        input.focus();
        // 첫 빈칸 앞에 커서를 둔다. 숫자만 바꿔 넣으면 끝나게.
        var at = t.text.indexOf('{}');
        if (at >= 0) input.setSelectionRange(at, at + 2);
      }
      return true;
    }
```

- [ ] **Step 4: 테스트가 통과하는지 확인한다**

```bash
npm test
```

- [ ] **Step 5: 커밋**

```bash
git add js/admin.js test/e2e.spec.js
git commit -m "부모 화면: 숙제 템플릿

'수학 문제집 {}~{}쪽' 을 눌러 숫자만 바꿔 넣는다. 별이 고정 1개라
입력할 것이 문구뿐이므로, 이 한 단계로 매일의 타이핑이 거의 사라진다."
```

---

## Task 7: 보너스 기록과 상점을 계산식으로

**Files:**
- Modify: `js/admin.js` (`star-plus`/`star-minus` → 보너스 기록, 아이 탭에 별 표시)
- Modify: `js/views.js` (`renderShop` 이 `starsOf` 를 쓰도록)
- Test: `test/e2e.spec.js` (`[7][8]` 상점·PIN 개작)

**Interfaces:**
- Consumes: `store.starsOf`, `store.addBonus`, `store.redeem`

- [ ] **Step 1: 기존 상점 테스트 2개를 지운다**

`'[7] 상점 — 모자라면 "별 N개 더"와 진행 막대'` 와 `'[8] 교환은 PIN을 통과해야만 된다'` 를 삭제한다.

- [ ] **Step 2: 새 테스트를 쓴다**

```javascript
test('[13] 상점 — 모자라면 "별 N개 더", 교환은 PIN을 통과해야 한다', async () => {
  await page.evaluate(() => {
    const S = KB.store;
    S.all().bonuses = []; S.all().redemptions = [];
    S.all().homework = []; S.all().progress = {};
    KB.app.go('shop');
  });
  await page.waitForSelector('.shopitem');
  const needs = await page.locator('.shopitem__need').allInnerTexts();
  expect(needs.length, '별 0개면 전부 부족하다').toBeGreaterThan(0);
  for (const n of needs) expect(n).toMatch(/별 \d+개 더/);

  await page.evaluate(() => { KB.store.addBonus('c1', 100, '테스트'); KB.app.render(); });
  const go = page.locator('[data-act="redeem"]').first();
  const rid = await go.getAttribute('data-id');
  const cost = await page.evaluate(
    id => KB.store.all().rewards.find(r => r.id === id).cost, rid);

  await go.click();
  await page.waitForSelector('.keypad');
  for (const k of ['9', '9', '9', '9']) await page.locator(`.key[data-k="${k}"]`).click();
  await page.waitForTimeout(400);
  expect(await page.evaluate(() => KB.store.starsOf('c1')), '틀린 PIN 으로는 안 깎인다').toBe(100);

  for (const k of ['1', '2', '3', '4']) await page.locator(`.key[data-k="${k}"]`).click();
  await page.waitForTimeout(600);
  expect(await page.evaluate(() => KB.store.starsOf('c1'))).toBe(100 - cost);
});

test('[14] 보너스는 기록으로 남고 별 계산에 들어간다', async () => {
  const before = await page.evaluate(() => KB.store.starsOf('c1'));
  await page.evaluate(() => KB.store.addBonus('c1', 3, '할머니 도와드림'));
  const after = await page.evaluate(() => KB.store.starsOf('c1'));
  expect(after).toBe(before + 3);
  const memo = await page.evaluate(() => KB.store.all().bonuses[0].memo);
  expect(memo, '왜 줬는지가 남아야 나중에 설명이 된다').toBe('할머니 도와드림');
});
```

- [ ] **Step 3: 실패를 확인한다**

```bash
npx playwright test test/e2e.spec.js -g "상점|보너스"
```

기대: `renderShop` 이 `c.stars`(없는 필드)를 읽어 `NaN` 이 되거나 단정이 어긋나 실패.

- [ ] **Step 4: `js/views.js` 의 `renderShop` 을 고친다**

`var c = store.getChild(childId);` 다음 줄에 넣고, 아래에서 `c.stars` 를 쓰던 자리를 전부 `stars` 로 바꾼다.

```javascript
    var stars = store.starsOf(c.id);
```

`onRedeem` 에서 교환 성공 후 별을 다시 읽도록, `store.redeem` 결과의 `left` 를 그대로 쓴다(이미 계산값이다).

- [ ] **Step 5: `js/admin.js` 의 별 조정을 보너스로 바꾼다**

`handle` 의 두 줄을 교체한다.

```javascript
    if (act === 'star-plus')  { store.addBonus(id, 1, '부모 보너스');  renderAdmin(); return true; }
    if (act === 'star-minus') { store.addBonus(id, -1, '부모 차감'); renderAdmin(); return true; }
```

`childrenPanel()` 에서 별 개수를 보여주던 자리를 `store.starsOf(c.id)` 로 바꾼다.

- [ ] **Step 6: 테스트가 통과하는지 확인한다**

```bash
npm test
```

- [ ] **Step 7: 커밋**

```bash
git add js/views.js js/admin.js test/e2e.spec.js
git commit -m "별을 계산값으로 일원화한다

상점과 부모 화면이 더 이상 저장된 카운터를 읽지 않는다.
부모의 별 가감도 보너스 기록으로 남아 '왜 줬는지' 가 남는다.
이게 Phase 2 에서 같은 기록이 두 번 도착해도 별이 안 부푸는 전제다."
```

---

## Task 8: 정리와 문서

**Files:**
- Modify: `README.md`
- Modify: `HANDS_ON.md` (저장소 밖, 같이 고쳐 문서↔코드 diff 0 유지)
- Test: 전체 스위트

- [ ] **Step 1: 안 쓰는 코드가 남았는지 확인한다**

```bash
grep -rn "tasksFor\|tasksOf\|adjustStars\|resetToday\|streakOf\|getTask\|renderHome" js/ test/
```

기대: 히트 0. 남아 있으면 지운다.

- [ ] **Step 2: store 노출 API 중 아무도 안 쓰는 것을 찾는다**

```bash
node -e '
const fs=require("fs");
const exp=fs.readFileSync("js/store.js","utf8").split("global.KB.store = {")[1].match(/(\w+):\s*\w+/g).map(s=>s.split(":")[0]);
let used=new Set();
["js/ui.js","js/views.js","js/admin.js","js/app.js","test/store.test.js"].forEach(f=>{
  (fs.readFileSync(f,"utf8").match(/\bS?\.?store\.(\w+)|\bS\.(\w+)/g)||[]).forEach(m=>used.add(m.split(".").pop()));
});
console.log("미사용:", exp.filter(e=>!used.has(e)).join(", ") || "없음");'
```

판단: `save`, `uid` 같은 내부용 노출은 남겨도 된다. 그 외 쓰이지 않는 것은 지운다.

- [ ] **Step 3: `README.md` 를 갱신한다**

"구조" 표의 `js/store.js` 설명을 `데이터. 습관·숙제·템플릿. 별은 저장하지 않고 계산한다` 로 바꾸고, 아래 단락을 "테스트" 절 앞에 넣는다.

```markdown
## 무엇을 하는 앱인가

부모가 **날짜마다 그날의 숙제**를 넣고, 아이는 태블릿에서 확인하고
체크만 한다. 숙제 하나에 별 하나.

- 안 한 숙제는 사라지지 않고 **다음날로 넘어온다**. 오래 밀린 것부터 앞에 온다
- 아이 화면에는 **숙제가 4개까지만** 보인다. 5번째부터는 개수도 보이지 않는다.
  "다 하면 끝" 이 보여야 아이가 시작하기 때문이다. 밀린 총량은 부모 화면에서 본다
- "이 닦기" 처럼 매일 반복하는 것은 **습관** 으로 따로 두고, 작은 칩으로 그린다
- 별은 **어디에도 저장하지 않는다**. 숙제·습관·보너스·교환 기록에서 매번 계산한다.
  더하다 틀어지는 일이 구조적으로 불가능하다
```

- [ ] **Step 4: `HANDS_ON.md` 의 코드 블록을 동기화한다**

`js/store.js`, `js/views.js`, `js/admin.js`, `js/app.js`, `css/style.css`, `test/store.test.js` 블록을 현재 파일 내용으로 교체한다. 아래로 확인한다.

```bash
cd .. && python3 - <<'PY'
doc = open('HANDS_ON.md', encoding='utf-8').readlines()
targets = [('index.html','kidboard/index.html'),('css/style.css','kidboard/css/style.css'),
           ('js/store.js','kidboard/js/store.js'),('js/ui.js','kidboard/js/ui.js'),
           ('js/views.js','kidboard/js/views.js'),('js/admin.js','kidboard/js/admin.js'),
           ('js/app.js','kidboard/js/app.js'),('test/store.test.js','kidboard/test/store.test.js'),
           ('sw.js','kidboard/sw.js')]
ok=True
for label, path in targets:
    ln = next(k for k,l in enumerate(doc) if l.startswith(f'**`{label}`**'))
    i=ln
    while not doc[i].startswith('```'): i+=1
    s=i+1; j=s
    while not doc[j].startswith('```'): j+=1
    same = ''.join(doc[s:j]) == open(path,encoding='utf-8').read()
    ok &= same
    print(('  OK  ' if same else '  DIFF') , label)
print('판정:', '동기화됨' if ok else '틀어짐')
PY
```

- [ ] **Step 5: 전체 검증**

```bash
npm test
docker compose run --rm e2e
```

기대: 둘 다 종료코드 0.

- [ ] **Step 6: 커밋하고 배포한다**

```bash
git add -A
git commit -m "정리: 안 쓰는 API 제거, 문서 갱신

Phase 1 은 여기까지다. 서버 없이 한 기기에서 완전히 동작한다.
태블릿에 올려 며칠 써보고, 숙제 구조가 우리 집에 맞는지 확인한 뒤
Phase 2(서버·동기화)를 짠다."
git push origin main
```

배포 후 확인:

```bash
sleep 90
curl -sS https://zzpopori-ops.github.io/kidboard/js/store.js | grep -c "kidboard.v2"
```

---

## Phase 1 완료 시점

### 동작하는 것

- 앱을 켜면 **아이 선택 없이 바로 할 일 화면**
- 부모가 **날짜를 골라 숙제를 넣는다**. 템플릿을 누르면 문구가 채워지고 숫자만 바꾸면 된다
- 안 한 숙제는 **다음날로 넘어오고**, 아이 화면에는 오래된 것부터 **4개까지만** 보인다
- 숙제를 누르면 도장이 찍히고 **별이 1개** 오른다. 별은 계산값이라 틀어지지 않는다
- 습관(이 닦기 등)은 **작은 칩**으로 따로, 요일 필터가 걸린다
- 별 상점에서 PIN 을 통과해 교환한다
- 부모가 보너스 별을 주면 **메모와 함께 기록**된다
- 오프라인에서 전부 동작하고, 홈 화면에 추가해 전체화면으로 쓴다
- 부모 화면에서 백업을 내보내고 되돌린다

### 아직 안 되는 것 (Phase 2)

- **PC 에서 넣은 숙제가 태블릿에 가지 않는다.** 기기마다 데이터가 따로다
- 서버·동기화·작업 큐가 없다
- 여러 기기의 별이 합쳐지지 않는다

### 며칠 써보며 볼 것

1. 하루 3~4개가 실제로 적당한가, 4개 상한이 너무 빡빡하거나 헐거운가
2. 밀린 숙제가 실제로 쌓이는가 — 쌓인다면 자동 소멸(스펙 12절)을 다시 꺼낸다
3. 템플릿이 실제로 쓰이는가, 아니면 그냥 타이핑하는가
4. 별 1개 고정이 동기로 충분한가
5. 습관과 숙제를 나눈 것이 아이에게 이해되는가

이 다섯 가지의 답이 나와야 Phase 2 를 제대로 짤 수 있다. **서버를 먼저 만들면,
맞지 않는 구조를 서버까지 끌고 가게 된다.**

---

## Self-Review 결과

- **스펙 커버리지**: 4절(모델) → Task 1 · 5절(화면) → Task 2~5 · 11절(테스트 전환) → 각 태스크에 분산 · 10절(마이그레이션 불필요) → Task 1 의 `kidboard.v2` 신규 시작. 6~9절(서버·동기화·실패모드·운영)은 **Phase 2 범위**이므로 이 계획에 없다 — 의도된 것이다
- **자리표시자**: 없음. 모든 코드 단계에 실제 코드가 들어 있다
- **타입 일관성**: `homeworkDue(childId, key, limit)` 의 3번째 인자는 Task 1 정의부터 Task 3 사용처까지 동일. `store.VISIBLE` 은 Task 1 에서 노출하고 Task 3 에서 쓴다. `onToggleHabit`/`onToggleHomework` 이름이 Task 2/3 과 `app.js` 위임에서 일치
