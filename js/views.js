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

  // ------------------------------------------------------------
  // 3) 별 상점
  // ------------------------------------------------------------
  function renderShop(childId) {
    var c = store.getChild(childId);
    if (!c) { screen().innerHTML = '<p class="empty">부모 설정에서 아이를 추가하세요.</p>'; return; }

    var items = store.rewards().map(function (r) {
      var can = c.stars >= r.cost;
      var need = r.cost - c.stars;
      return '' +
        '<div class="shopitem' + (can ? ' is-ready' : '') + '">' +
          '<span class="shopitem__emoji">' + esc(r.emoji) + '</span>' +
          '<span class="shopitem__label">' + esc(r.label) + '</span>' +
          '<span class="shopitem__cost">⭐ ' + r.cost + '</span>' +
          (can
            ? '<button class="btn btn--go" data-act="redeem" data-id="' + esc(r.id) + '">바꾸기</button>'
            : '<span class="shopitem__need">별 ' + need + '개 더</span>') +
          '<span class="shopitem__bar"><i style="width:' + Math.min(100, Math.round(c.stars / r.cost * 100)) + '%"></i></span>' +
        '</div>';
    }).join('');

    screen().innerHTML = '' +
      '<header class="kidtop" style="--accent:' + esc(c.color) + '">' +
        '<button class="iconbtn" data-act="open-kid" data-id="' + esc(c.id) + '" aria-label="할 일로">←</button>' +
        '<span class="kidtop__face">' + esc(c.emoji) + '</span>' +
        '<span class="kidtop__name">' + esc(c.name) + '의 별 상점</span>' +
        '<span class="kidtop__total">⭐ ' + c.stars + '</span>' +
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
    var res = store.toggleHabit(c.id, habitId);
    if (res.done) { ui.beep('check'); ui.flyStar(el, $('#jarTarget')); }
    var wait = ui.reduceMotion ? 0 : 480;
    setTimeout(function () { global.KB.app.render(); }, wait);
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
    onRedeem: onRedeem
  };
})(window);
