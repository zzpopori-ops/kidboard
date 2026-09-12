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
  // 1) 아이 선택 화면
  // ------------------------------------------------------------
  function renderHome() {
    var kids = store.children();
    var now = new Date();
    var dateLine = (now.getMonth() + 1) + '월 ' + now.getDate() + '일 ' + WD[now.getDay()] + '요일';

    var cards = kids.map(function (c) {
      var p = store.progressOf(c.id);
      var allDone = p.total > 0 && p.done >= p.total;
      return '' +
        '<button class="pick" data-act="open-kid" data-id="' + esc(c.id) + '" style="--accent:' + esc(c.color) + '">' +
          '<span class="pick__face">' + esc(c.emoji) + '</span>' +
          '<span class="pick__name">' + esc(c.name) + '</span>' +
          '<span class="pick__jar">' + ui.jarSVG(p.ratio, c.color) + '</span>' +
          '<span class="pick__meta">' +
            (p.total === 0 ? '오늘은 할 일이 없어요'
              : allDone ? '오늘 다 했어요!'
              : p.done + ' / ' + p.total + ' 했어요') +
          '</span>' +
          '<span class="pick__stars">⭐ ' + c.stars + '</span>' +
        '</button>';
    }).join('');

    screen().innerHTML = '' +
      '<header class="top">' +
        '<h1 class="brand" id="brandHold">오늘의 할 일</h1>' +
        '<p class="top__date">' + esc(dateLine) + '</p>' +
      '</header>' +
      '<section class="picks">' + (cards || '<p class="empty">부모 설정에서 아이를 추가하세요. 제목을 1.5초간 누르면 설정으로 들어갑니다.</p>') + '</section>' +
      '<footer class="hint">제목을 1.5초간 누르면 부모 설정</footer>';

    ui.longPress($('#brandHold'), 1500, function () {
      ui.askPin('부모 설정').then(function (ok) {
        if (ok) global.KB.app.go('admin');
      });
    });
  }

  // ------------------------------------------------------------
  // 2) 오늘의 할 일 화면
  // ------------------------------------------------------------
  function renderKid(childId) {
    var c = store.getChild(childId);
    if (!c) return renderHome();

    var tasks = store.tasksFor(c.id);
    var done = store.doneIds(c.id);
    var p = store.progressOf(c.id);
    var streak = store.streakOf(c.id);
    var allDone = p.total > 0 && p.done >= p.total;

    // 글을 읽는 아이는 글자 중심, 아직 못 읽는 아이는 그림 중심
    var mode = c.canRead ? 'read' : 'pic';

    var tiles = tasks.map(function (t) {
      var isDone = done.indexOf(t.id) !== -1;
      return '' +
        '<button class="tile' + (isDone ? ' is-done' : '') + '" data-act="toggle" data-id="' + esc(t.id) + '" aria-pressed="' + isDone + '">' +
          '<span class="tile__emoji">' + esc(t.emoji) + '</span>' +
          '<span class="tile__label">' + esc(t.label) + '</span>' +
          '<span class="tile__stars">' + new Array(t.stars + 1).join('⭐') + '</span>' +
          '<span class="tile__stamp">했다!</span>' +
        '</button>';
    }).join('');

    screen().innerHTML = '' +
      '<header class="kidtop" style="--accent:' + esc(c.color) + '">' +
        '<button class="iconbtn" data-act="home" aria-label="처음으로">←</button>' +
        '<span class="kidtop__face">' + esc(c.emoji) + '</span>' +
        '<span class="kidtop__name">' + esc(c.name) + '</span>' +
        '<span class="kidtop__jar" id="jarTarget">' + ui.jarSVG(p.ratio, c.color) + '</span>' +
        '<button class="starbtn" data-act="shop"><span class="starbtn__n">⭐ ' + c.stars + '</span><span class="starbtn__t">상점</span></button>' +
      '</header>' +

      (streak > 1 ? '<p class="streak">🔥 ' + streak + '일 연속!</p>' : '') +

      (p.total === 0
        ? '<p class="empty">오늘은 할 일이 없어요. 푹 쉬세요!</p>'
        : '<section class="tiles tiles--' + mode + '">' + tiles + '</section>') +

      (allDone ? '<p class="cheer">오늘 할 일 전부 끝! 🎉</p>' : '');

    if (allDone) ui.beep('reward');
  }

  // ------------------------------------------------------------
  // 3) 별 상점
  // ------------------------------------------------------------
  function renderShop(childId) {
    var c = store.getChild(childId);
    if (!c) return renderHome();

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
  function onToggle(taskId, tileEl) {
    var childId = global.KB.app.current().id;
    var res = store.toggleTask(childId, taskId);
    if (!res) return;

    if (res.done) {
      ui.beep('done');
      ui.flyStar(tileEl, $('#jarTarget'));
      // 별이 날아간 뒤에 다시 그린다. 연출과 갱신이 겹치지 않게
      setTimeout(function () { renderKid(childId); }, ui.reduceMotion ? 0 : 480);
    } else {
      ui.beep('undo');
      renderKid(childId);
    }
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
    renderHome: renderHome,
    renderKid: renderKid,
    renderShop: renderShop,
    onToggle: onToggle,
    onRedeem: onRedeem
  };
})(window);
