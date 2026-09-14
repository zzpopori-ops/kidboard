/* ============================================================
   app.js — 시작점. 어떤 화면을 보여줄지와 클릭을 어디로 보낼지만 담당한다.
   ============================================================ */
(function (global) {
  'use strict';

  var store = global.KB.store;
  var ui = global.KB.ui;
  var views = global.KB.views;
  var admin = global.KB.admin;

  // 지금 보고 있는 화면 상태. URL 대신 메모리로 관리한다(아이가 주소창을 볼 일이 없다)
  var state = { view: 'home', id: null, day: null };

  function go(view, id) {
    state.view = view;
    state.id = id || state.id;
    if (view === 'admin') admin.resetTab();
    render();
  }

  function render() {
    state.day = store.dateKey();
    state.id = state.id || firstChildId();   // current().id 가 항상 실제로 그려진 아이를 가리키게 한다
    if (state.view === 'admin') return admin.renderAdmin();
    if (state.view === 'shop') return views.renderShop(state.id);
    return views.renderKid(state.id);
  }

  /** 아이가 1명이면 고르게 할 이유가 없다. 늘어나면 선택 화면이 저절로 돌아온다. */
  function firstChildId() {
    var list = store.children();
    return list.length ? list[0].id : null;
  }

  // ------------------------------------------------------------
  // 클릭 한 곳에서 받기 (이벤트 위임)
  // 장점: 화면을 다시 그려도 리스너를 새로 붙일 필요가 없다
  // ------------------------------------------------------------
  document.addEventListener('click', function (e) {
    var btn = e.target.closest('[data-act]');
    if (!btn) return;

    var act = btn.getAttribute('data-act');
    var id = btn.getAttribute('data-id');

    // 관리 화면 동작은 admin이 먼저 가져간다
    if (state.view === 'admin' && admin.handle(act, id)) return;

    if (act === 'home') return go('home');
    if (act === 'open-kid') return go('kid', id);
    if (act === 'shop') return go('shop', state.id);
    if (act === 'homework') return views.onToggleHomework(id, btn);
    if (act === 'habit') return views.onToggleHabit(id, btn);
    if (act === 'redeem') return views.onRedeem(id);
  });

  // ------------------------------------------------------------
  // 자정을 넘겼는데 화면이 그대로 켜져 있는 경우를 잡는다.
  // 데이터는 날짜별로 저장하므로 다시 그리기만 하면 체크가 비워진다.
  // ------------------------------------------------------------
  function watchMidnight() {
    setInterval(function () {
      if (state.day && state.day !== store.dateKey()) render();
    }, 30000);

    document.addEventListener('visibilitychange', function () {
      if (!document.hidden && state.day !== store.dateKey()) render();
    });
  }

  // ------------------------------------------------------------
  // 동기화는 설정돼 있을 때만 시도한다. 미설정이면 store.syncNow() 를
  // 아예 부르지 않는다 — 부르면 내부에서 no-op 이라도, "호출 자체가
  // 없어야 한다"는 계약(Task 7)을 지키려면 여기서 먼저 막아야 한다.
  // 실패는 store.syncNow() 가 절대 reject 하지 않으므로 화면에 아무
  // 표시도 남기지 않는다 — 부모 화면(admin.js)만 결과를 보여준다.
  // ------------------------------------------------------------
  function watchSync() {
    function trigger() {
      if (!store.syncConfig()) return;
      store.syncNow();
    }

    trigger(); // 앱을 열자마자 한 번

    setInterval(trigger, 120000); // 켜둔 채로 오래 있어도 주기적으로 받아온다

    document.addEventListener('visibilitychange', function () {
      if (!document.hidden) trigger(); // 다시 켜서 볼 때가 가장 최신 데이터가 필요한 순간이다
    });
  }

  // ------------------------------------------------------------
  // 시작
  // ------------------------------------------------------------
  function boot() {
    store.load();
    render();
    watchMidnight();
    watchSync();

    // 오프라인 동작용. file:// 로 열면 등록되지 않는데, 그건 정상이다
    if ('serviceWorker' in navigator && location.protocol.indexOf('http') === 0) {
      navigator.serviceWorker.register('sw.js').catch(function (e) {
        console.warn('서비스워커 등록 실패(앱 동작에는 영향 없음)', e);
      });
    }
  }

  global.KB.app = { go: go, render: render, current: function () { return { view: state.view, id: state.id }; } };

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot);
  } else {
    boot();
  }
})(window);
