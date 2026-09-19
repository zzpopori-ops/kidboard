/* ============================================================
   views.js — 아이가 보는 화면. 편집 버튼은 여기에 하나도 없다.
   ============================================================ */
(function (global) {
  'use strict';

  var store = global.KB.store;
  var ui = global.KB.ui;
  var esc = ui.esc, $ = ui.$, $$ = ui.$$;

  var WD = ['일', '월', '화', '수', '목', '금', '토'];

  function screen() { return $('#screen'); }

  // 습관 토글, 자정 감시(app.js 의 setInterval/visibilitychange) 등으로
  // renderKid 가 같은 날 여러 번 다시 그려진다. 소리는 하루 한 번만 —
  // 마지막으로 축하음을 울린 "아이|날짜" 를 기억해 중복을 막는다.
  var lastCheeredFor = null;

  // ------------------------------------------------------------
  // 탭 도중 "바쁨" 표시.
  // 숙제 카드/습관 칩을 누르면 별이 날아가는 연출 + 480ms 뒤 재렌더가 예약된다.
  // 그 사이에 동기화가 화면을 다시 그려버리면(innerHTML 통째 교체) DOM 이
  // 바뀌어 있던 자리에 다음 탭이 떨어져 아무 일도 안 일어난 것처럼 보인다
  // (아이 입장에선 "눌렀는데 씹혔다"). 그래서 탭이 시작되는 순간부터
  // 그 탭의 재렌더가 끝날 때까지를 "바쁨"으로 표시하고, app.js 는 바쁜 동안
  // 동기화로 인한 재렌더를 미룬다.
  // ------------------------------------------------------------
  var busy = false;
  function isBusy() { return busy; }

  // ------------------------------------------------------------
  // 1) 아이 화면 (숙제는 Task 3, 지금은 습관만 보인다)
  // ------------------------------------------------------------
  function renderKid(childId) {
    var c = store.getChild(childId);
    if (!c) { screen().innerHTML = '<p class="empty">부모 설정에서 아이를 추가하세요.</p>'; return; }

    var key = store.dateKey();
    var habits = store.habitsFor(c.id, key);
    var doneIds = store.doneIds(c.id, key);

    var chips = habits.map(function (h) {
      var done = doneIds.indexOf(h.id) !== -1;
      return '' +
        '<button class="habit' + (done ? ' is-done' : '') + '" data-act="habit" data-id="' + esc(h.id) + '"' +
                ' aria-pressed="' + done + '">' +
          '<span class="habit__emoji">' + esc(h.emoji) + '</span>' +
          '<span class="habit__label">' + esc(h.label) + '</span>' +
        '</button>';
    }).join('');

    // 오래 밀린 것부터 최대 4개까지만 보여준다. 나머지는 개수도 안 보인다 —
    // "대기 3개" 를 띄우면 끝이 보이게 하려던 의도를 스스로 깨기 때문이다.
    var due = store.homeworkForKid(c.id, key, store.VISIBLE);
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

    var p = store.progressOf(c.id, key);
    // 할 일이 아예 없던 날(습관도 숙제도 0개)까지 "전부 끝"으로 치면
    // 아무것도 안 했는데 축하를 받는 꼴이라, 오늘 뭔가 했다는 증거를 요구한다.
    var didSomethingToday = p.total > 0 ||
      store.homeworkOf(c.id).some(function (w) { return w.doneOn === key; });
    var allDone = didSomethingToday && (due.length === 0) && (p.total === 0 || p.done >= p.total);

    // 병은 "오늘 얼마나 했나" 가 아니라 "다음 보상까지 얼마나 왔나" 를 보여준다.
    // 글을 못 읽어도 이해되는 지표라서 상점 가격 기준이 맞다.
    var stars = store.starsOf(c.id);
    var cheapest = store.rewards().reduce(function (m, r) {
      return (m === null || r.cost < m) ? r.cost : m;
    }, null);
    var ratio = cheapest ? Math.min(1, stars / cheapest) : 0;

    screen().innerHTML = '' +
      '<header class="kidtop" style="--accent:' + esc(c.color) + '">' +
        '<h1 class="brand" id="brandHold">오늘의 할 일</h1>' +
        '<span class="kidtop__face">' + esc(c.emoji) + '</span>' +
        '<span class="kidtop__name">' + esc(c.name) + '</span>' +
        '<span class="kidtop__jar" id="jarTarget">' + ui.jarSVG(ratio, c.color) + '</span>' +
        '<button class="starbtn" data-act="shop">' +
          '<span class="starbtn__n">⭐ ' + store.starsOf(c.id) + '</span>' +
          '<span class="starbtn__t">상점</span></button>' +
      '</header>' +
      hwSection +
      (habits.length
        ? '<section class="habits"><h2 class="sect">매일 하는 것</h2>' + chips + '</section>'
        : '')
      + (allDone ? '<p class="cheer">오늘 할 일 전부 끝! 🎉</p>' : '');

    if (allDone) {
      var cheerKey = c.id + '|' + key;
      if (lastCheeredFor !== cheerKey) { ui.beep('reward'); lastCheeredFor = cheerKey; }
    }

    ui.longPress($('#brandHold'), 1500, function () {
      ui.askPin('부모 설정').then(function (ok) {
        if (ok) global.KB.app.go('admin');
      });
    });
  }

  // ------------------------------------------------------------
  // 3) 별 상점
  // ------------------------------------------------------------
  function renderShop(childId) {
    var c = store.getChild(childId);
    if (!c) { screen().innerHTML = '<p class="empty">부모 설정에서 아이를 추가하세요.</p>'; return; }

    // 별은 저장된 값이 아니라 계산값이므로, 목록을 순회하기 전에 딱 한 번만 구한다
    var stars = store.starsOf(c.id);

    var items = store.rewards().map(function (r) {
      var can = stars >= r.cost;
      var need = r.cost - stars;
      return '' +
        '<div class="shopitem' + (can ? ' is-ready' : '') + '">' +
          '<span class="shopitem__emoji">' + esc(r.emoji) + '</span>' +
          '<span class="shopitem__label">' + esc(r.label) + '</span>' +
          '<span class="shopitem__cost">⭐ ' + r.cost + '</span>' +
          (can
            ? '<button class="btn btn--go" data-act="redeem" data-id="' + esc(r.id) + '">바꾸기</button>'
            : '<span class="shopitem__need">별 ' + need + '개 더</span>') +
          '<span class="shopitem__bar"><i style="width:' + Math.min(100, Math.round(stars / r.cost * 100)) + '%"></i></span>' +
        '</div>';
    }).join('');

    screen().innerHTML = '' +
      '<header class="kidtop" style="--accent:' + esc(c.color) + '">' +
        '<button class="iconbtn" data-act="open-kid" data-id="' + esc(c.id) + '" aria-label="할 일로">←</button>' +
        '<span class="kidtop__face">' + esc(c.emoji) + '</span>' +
        '<span class="kidtop__name">' + esc(c.name) + '의 별 상점</span>' +
        '<span class="kidtop__total">⭐ ' + stars + '</span>' +
      '</header>' +
      '<section class="shop">' + (items || '<p class="empty">부모 설정에서 보상을 추가하세요.</p>') + '</section>';
  }

  // ------------------------------------------------------------
  // 동작 처리 (클릭 위임)
  // ------------------------------------------------------------
  function onToggleHabit(habitId, el) {
    // 지금 그려진 아이를 기준으로 삼는다. 둘째가 생겨 선택 화면이 돌아와도
    // 엉뚱한 아이(children()[0])의 습관이 토글되는 일이 없게 하려는 것이다.
    var c = store.getChild(global.KB.app.current().id);
    if (!c) return;
    busy = true; // 탭 시작 — 이 함수의 재렌더가 끝나기 전까지 동기화 재렌더를 막는다
    var res = store.toggleHabit(c.id, habitId);
    if (res.done) { ui.beep('check'); ui.flyStar(el, $('#jarTarget')); }
    var wait = ui.reduceMotion ? 0 : 480; // reduceMotion 은 함수가 아니라 값이다 — 괄호를 붙이면 안 된다
    setTimeout(function () { global.KB.app.render(); busy = false; }, wait);
  }

  /** '어제' / '3일 전' — 아이가 읽고 순서를 납득하게 */
  function overdueText(date, key) {
    var a = new Date(date + 'T00:00:00'), b = new Date(key + 'T00:00:00');
    var n = Math.round((b - a) / 86400000);
    return n === 1 ? '어제' : n + '일 전';
  }

  function onToggleHomework(id, el) {
    busy = true; // 탭 시작 — 이 함수의 재렌더가 끝나기 전까지 동기화 재렌더를 막는다
    store.setHomeworkDone(id, store.dateKey());
    ui.beep('check');
    ui.flyStar(el, $('#jarTarget'));
    var wait = ui.reduceMotion ? 0 : 480; // reduceMotion 은 함수가 아니라 값이다 — 괄호를 붙이면 안 된다
    setTimeout(function () { global.KB.app.render(); busy = false; }, wait);
  }

  function onRedeem(rewardId) {
    var childId = global.KB.app.current().id;
    var reward = null;
    store.rewards().forEach(function (r) { if (r.id === rewardId) reward = r; });
    if (!reward) return;

    ui.askPin('보상 교환 — 부모 확인').then(function (ok) {
      if (!ok) return;
      var res = store.redeem(childId, rewardId);
      if (!res.ok) { ui.toast(res.msg); return; }
      ui.beep('reward');
      ui.toast(reward.emoji + ' ' + reward.label + ' 교환 완료! 남은 별 ' + res.left + '개');
      renderShop(childId);
    });
  }

  global.KB.views = {
    renderKid: renderKid,
    renderShop: renderShop,
    onToggleHabit: onToggleHabit,
    onToggleHomework: onToggleHomework,
    onRedeem: onRedeem,
    isBusy: isBusy
  };
})(window);
