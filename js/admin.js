/* ============================================================
   admin.js — 부모만 들어오는 관리 화면 (PIN 통과 후 진입)
   할 일을 정리·관리하는 모든 기능은 이 파일에만 있다.
   ============================================================ */
(function (global) {
  'use strict';

  var store = global.KB.store;
  var ui = global.KB.ui;
  var esc = ui.esc, $ = ui.$, $$ = ui.$$;

  var WD = ['일', '월', '화', '수', '목', '금', '토'];
  var EMOJI_TASK = ['🪥','📚','🎒','🧺','🧸','🧼','🥛','🍚','👟','🛏️','✏️','🎹','🚰','🧹','🐶','🌱'];
  var EMOJI_FACE = ['🐯','🐰','🐻','🐼','🦊','🐶','🐱','🐸','🦄','🐧','🐝','🦁'];
  var EMOJI_GIFT = ['🍦','📺','🎠','🍪','🎁','🧁','🎬','🏊','🚲','🎨','🍕','🧩'];
  var COLORS = ['#3D7EA6','#4C9F70','#D64550','#C1720A','#7A5AA6','#1F8A8C'];

  // 숙제는 부모가 매일 쓰는 탭이라 맨 앞 · 기본 탭으로 둔다
  var tab = 'homework';

  function screen() { return $('#screen'); }

  // ------------------------------------------------------------
  // 전체 렌더
  // ------------------------------------------------------------
  function renderAdmin() {
    var tabs = [['homework','숙제'],['children','아이'],['tasks','할 일'],['rewards','보상'],['data','데이터']];

    screen().innerHTML = '' +
      '<header class="admintop">' +
        '<button class="iconbtn" data-act="home" aria-label="나가기">←</button>' +
        '<h1 class="admintop__title">부모 설정</h1>' +
      '</header>' +
      '<nav class="tabs">' +
        tabs.map(function (t) {
          return '<button class="tab' + (tab === t[0] ? ' is-on' : '') +
                 '" data-act="tab" data-id="' + t[0] + '">' + esc(t[1]) + '</button>';
        }).join('') +
      '</nav>' +
      '<section class="panel">' + panelHTML() + '</section>';

    if (tab === 'data') wireData();
  }

  function panelHTML() {
    if (tab === 'homework') return homeworkPanel();
    if (tab === 'children') return childrenPanel();
    if (tab === 'tasks') return tasksPanel();
    if (tab === 'rewards') return rewardsPanel();
    return dataPanel();
  }

  // ------------------------------------------------------------
  // 숙제 탭 — 부모가 매일 여기서 오늘 숙제를 입력한다
  // ------------------------------------------------------------
  function homeworkPanel() {
    var c = store.children()[0];
    if (!c) return '<p class="empty">아이 탭에서 아이를 먼저 추가하세요.</p>';

    var today = store.dateKey();
    // 완료 여부와 상관없이 전부 가져온 뒤 안 한 것만 골라, 밀린 순서(오래된 것부터)로 보여준다
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

    // 템플릿을 눌러 문구를 채우고 숫자만 바꿔 넣게 한다 — 매일 같은 문구를 다시 치지 않도록
    var tpls = store.templates().map(function (t) {
      return '<button class="mini" data-act="tpl-use" data-id="' + esc(t.id) + '">' +
               esc(t.emoji) + ' ' + esc(t.text) + '</button>';
    }).join('');

    return '' +
      '<div class="row"><label>날짜</label>' +
        '<input type="date" id="hw-date" value="' + esc(today) + '"></div>' +
      '<div class="row"><label>템플릿</label><div class="tpls">' + tpls + '</div></div>' +
      '<div class="row"><label>숙제</label>' +
        '<input type="text" id="hw-label" placeholder="예: 수학 문제집 1~5쪽"></div>' +
      '<button class="btn btn--add" data-act="hw-add">추가</button>' +
      '<h3 class="sect">아직 안 한 숙제 (' + list.length + '개)</h3>' +
      (rows || '<p class="empty">없습니다.</p>');
  }

  // ------------------------------------------------------------
  // 아이 탭
  // ------------------------------------------------------------
  function childrenPanel() {
    var rows = store.children().map(function (c) {
      var p = store.progressOf(c.id);
      return '' +
        '<div class="row" style="--accent:' + esc(c.color) + '">' +
          '<span class="row__emoji">' + esc(c.emoji) + '</span>' +
          '<span class="row__main">' +
            '<b>' + esc(c.name) + '</b>' +
            '<small>' + (c.canRead ? '글자 화면' : '그림 화면') + ' · 오늘 ' + p.done + '/' + p.total + ' · 별 ' + c.stars + '개</small>' +
          '</span>' +
          '<span class="row__nudge">' +
            '<button class="mini" data-act="star-minus" data-id="' + esc(c.id) + '">−</button>' +
            '<button class="mini" data-act="star-plus" data-id="' + esc(c.id) + '">+</button>' +
          '</span>' +
          '<button class="mini" data-act="edit-child" data-id="' + esc(c.id) + '">수정</button>' +
          '<button class="mini mini--warn" data-act="reset-today" data-id="' + esc(c.id) + '">오늘 초기화</button>' +
        '</div>';
    }).join('');

    return rows +
      '<button class="btn btn--add" data-act="new-child">+ 아이 추가</button>' +
      '<p class="note">별 +/− 는 오프라인에서 한 일을 반영할 때 씁니다. 오늘 초기화는 체크와 그날 받은 별을 함께 되돌립니다.</p>';
  }

  function childForm(child) {
    var c = child || { id: '', name: '', emoji: '🐻', color: COLORS[0], canRead: true, stars: 0 };
    var m = ui.openModal(
      '<h2 class="modal__title">' + (child ? '아이 수정' : '아이 추가') + '</h2>' +
      '<label class="fld"><span>이름</span><input id="f-name" type="text" maxlength="10" value="' + esc(c.name) + '" placeholder="예: 하준"></label>' +
      '<div class="fld"><span>캐릭터</span><div class="palette" id="f-emoji">' +
        EMOJI_FACE.map(function (e) {
          return '<button type="button" class="chip' + (e === c.emoji ? ' is-on' : '') + '" data-v="' + e + '">' + e + '</button>';
        }).join('') + '</div></div>' +
      '<div class="fld"><span>색</span><div class="palette" id="f-color">' +
        COLORS.map(function (x) {
          return '<button type="button" class="swatch' + (x === c.color ? ' is-on' : '') + '" data-v="' + x + '" style="background:' + x + '"></button>';
        }).join('') + '</div></div>' +
      '<div class="fld"><span>화면 방식</span><div class="palette" id="f-read">' +
        '<button type="button" class="chip chip--wide' + (c.canRead ? ' is-on' : '') + '" data-v="1">글자를 읽어요</button>' +
        '<button type="button" class="chip chip--wide' + (!c.canRead ? ' is-on' : '') + '" data-v="0">아직 못 읽어요</button>' +
      '</div></div>' +
      '<div class="modal__row">' +
        (child ? '<button class="btn btn--danger" data-del>삭제</button>' : '') +
        '<button class="btn btn--ghost" data-cancel>취소</button>' +
        '<button class="btn btn--go" data-save>저장</button>' +
      '</div>'
    );

    pickerWire(m, '#f-emoji', '.chip');
    pickerWire(m, '#f-color', '.swatch');
    pickerWire(m, '#f-read', '.chip');

    $('[data-cancel]', m).onclick = ui.closeModal;
    if (child) {
      $('[data-del]', m).onclick = function () {
        ui.closeModal();
        ui.confirmBox(c.name + ' 삭제', '이 아이의 할 일과 기록이 함께 지워집니다.', '삭제').then(function (yes) {
          if (yes) { store.remove('children', c.id); renderAdmin(); ui.toast('삭제했습니다.'); }
        });
      };
    }
    $('[data-save]', m).onclick = function () {
      var name = $('#f-name', m).value.trim();
      if (!name) { ui.toast('이름을 입력하세요.'); return; }
      store.upsert('children', {
        id: c.id || undefined,
        name: name,
        emoji: pickerValue(m, '#f-emoji') || '🐻',
        color: pickerValue(m, '#f-color') || COLORS[0],
        canRead: pickerValue(m, '#f-read') === '1',
        stars: c.stars || 0
      }, 'c');
      ui.closeModal(); renderAdmin(); ui.toast('저장했습니다.');
    };
  }

  // ------------------------------------------------------------
  // 할 일 탭
  // ------------------------------------------------------------
  function tasksPanel() {
    var kids = store.children();
    if (!kids.length) return '<p class="empty">먼저 아이를 추가하세요.</p>';

    return kids.map(function (c) {
      var list = store.tasksOf(c.id);
      var rows = list.map(function (t) {
        return '' +
          '<div class="row">' +
            '<span class="row__emoji">' + esc(t.emoji) + '</span>' +
            '<span class="row__main">' +
              '<b>' + esc(t.label) + '</b>' +
              '<small>별 ' + t.stars + '개 · ' + dayText(t.days) + '</small>' +
            '</span>' +
            '<button class="mini" data-act="edit-task" data-id="' + esc(t.id) + '">수정</button>' +
          '</div>';
      }).join('') || '<p class="note">아직 할 일이 없습니다.</p>';

      return '' +
        '<h3 class="group" style="--accent:' + esc(c.color) + '">' + esc(c.emoji) + ' ' + esc(c.name) + '</h3>' +
        rows +
        '<button class="btn btn--add" data-act="new-task" data-id="' + esc(c.id) + '">+ ' + esc(c.name) + ' 할 일 추가</button>';
    }).join('');
  }

  function dayText(days) {
    var d = days || [];
    if (d.length === 7) return '매일';
    if (d.length === 5 && d.indexOf(0) === -1 && d.indexOf(6) === -1) return '평일';
    if (d.length === 2 && d.indexOf(0) !== -1 && d.indexOf(6) !== -1) return '주말';
    if (!d.length) return '요일 없음';
    return d.slice().sort().map(function (i) { return WD[i]; }).join('·');
  }

  function taskForm(task, childId) {
    var t = task || { id: '', childId: childId, emoji: '🪥', label: '', stars: 1, days: [0,1,2,3,4,5,6] };
    var kids = store.children();

    var m = ui.openModal(
      '<h2 class="modal__title">' + (task ? '할 일 수정' : '할 일 추가') + '</h2>' +
      '<label class="fld"><span>누구의 할 일</span><select id="f-child">' +
        kids.map(function (c) {
          return '<option value="' + esc(c.id) + '"' + (c.id === t.childId ? ' selected' : '') + '>' + esc(c.emoji + ' ' + c.name) + '</option>';
        }).join('') + '</select></label>' +
      '<label class="fld"><span>할 일</span><input id="f-label" type="text" maxlength="20" value="' + esc(t.label) + '" placeholder="예: 이 닦기"></label>' +
      '<div class="fld"><span>그림</span><div class="palette" id="f-emoji">' +
        EMOJI_TASK.map(function (e) {
          return '<button type="button" class="chip' + (e === t.emoji ? ' is-on' : '') + '" data-v="' + e + '">' + e + '</button>';
        }).join('') + '</div></div>' +
      '<div class="fld"><span>별</span><div class="palette" id="f-stars">' +
        [1,2,3].map(function (n) {
          return '<button type="button" class="chip chip--wide' + (n === t.stars ? ' is-on' : '') + '" data-v="' + n + '">' + new Array(n + 1).join('⭐') + '</button>';
        }).join('') + '</div></div>' +
      '<div class="fld"><span>요일</span><div class="palette" id="f-days">' +
        WD.map(function (w, i) {
          return '<button type="button" class="chip chip--day' + ((t.days || []).indexOf(i) !== -1 ? ' is-on' : '') + '" data-v="' + i + '">' + w + '</button>';
        }).join('') +
        '<button type="button" class="chip chip--wide" data-preset="all">매일</button>' +
        '<button type="button" class="chip chip--wide" data-preset="week">평일</button>' +
      '</div></div>' +
      '<div class="modal__row">' +
        (task ? '<button class="btn btn--danger" data-del>삭제</button>' : '') +
        '<button class="btn btn--ghost" data-cancel>취소</button>' +
        '<button class="btn btn--go" data-save>저장</button>' +
      '</div>'
    );

    pickerWire(m, '#f-emoji', '.chip');
    pickerWire(m, '#f-stars', '.chip');

    // 요일은 여러 개 선택
    $$('#f-days .chip--day', m).forEach(function (b) {
      b.onclick = function () { b.classList.toggle('is-on'); };
    });
    $$('[data-preset]', m).forEach(function (b) {
      b.onclick = function () {
        var week = b.getAttribute('data-preset') === 'week';
        $$('#f-days .chip--day', m).forEach(function (d) {
          var i = Number(d.getAttribute('data-v'));
          var on = week ? (i >= 1 && i <= 5) : true;
          d.classList.toggle('is-on', on);
        });
      };
    });

    $('[data-cancel]', m).onclick = ui.closeModal;
    if (task) {
      $('[data-del]', m).onclick = function () {
        store.remove('tasks', t.id);
        ui.closeModal(); renderAdmin(); ui.toast('삭제했습니다.');
      };
    }
    $('[data-save]', m).onclick = function () {
      var label = $('#f-label', m).value.trim();
      if (!label) { ui.toast('할 일 이름을 입력하세요.'); return; }
      var days = $$('#f-days .chip--day.is-on', m).map(function (d) { return Number(d.getAttribute('data-v')); });
      if (!days.length) { ui.toast('요일을 하나 이상 고르세요.'); return; }

      store.upsert('tasks', {
        id: t.id || undefined,
        childId: $('#f-child', m).value,
        label: label,
        emoji: pickerValue(m, '#f-emoji') || '✅',
        stars: Number(pickerValue(m, '#f-stars') || 1),
        days: days
      }, 't');
      ui.closeModal(); renderAdmin(); ui.toast('저장했습니다.');
    };
  }

  // ------------------------------------------------------------
  // 보상 탭
  // ------------------------------------------------------------
  function rewardsPanel() {
    var rows = store.rewards().map(function (r) {
      return '' +
        '<div class="row">' +
          '<span class="row__emoji">' + esc(r.emoji) + '</span>' +
          '<span class="row__main"><b>' + esc(r.label) + '</b><small>별 ' + r.cost + '개</small></span>' +
          '<button class="mini" data-act="edit-reward" data-id="' + esc(r.id) + '">수정</button>' +
        '</div>';
    }).join('') || '<p class="note">아직 보상이 없습니다.</p>';

    var log = store.all().redemptions.slice(0, 8).map(function (x) {
      var c = store.getChild(x.childId);
      var d = new Date(x.at);
      return '<li>' + (d.getMonth() + 1) + '/' + d.getDate() + ' · ' +
             esc(c ? c.name : '?') + ' · ' + esc(x.emoji + ' ' + x.label) + ' (별 ' + x.cost + ')</li>';
    }).join('');

    return rows +
      '<button class="btn btn--add" data-act="new-reward">+ 보상 추가</button>' +
      (log ? '<h3 class="group">최근 교환</h3><ul class="log">' + log + '</ul>' : '');
  }

  function rewardForm(reward) {
    var r = reward || { id: '', emoji: '🎁', label: '', cost: 10 };
    var m = ui.openModal(
      '<h2 class="modal__title">' + (reward ? '보상 수정' : '보상 추가') + '</h2>' +
      '<label class="fld"><span>보상</span><input id="f-label" type="text" maxlength="20" value="' + esc(r.label) + '" placeholder="예: 아이스크림"></label>' +
      '<label class="fld"><span>필요한 별</span><input id="f-cost" type="number" min="1" max="999" value="' + Number(r.cost) + '"></label>' +
      '<div class="fld"><span>그림</span><div class="palette" id="f-emoji">' +
        EMOJI_GIFT.map(function (e) {
          return '<button type="button" class="chip' + (e === r.emoji ? ' is-on' : '') + '" data-v="' + e + '">' + e + '</button>';
        }).join('') + '</div></div>' +
      '<div class="modal__row">' +
        (reward ? '<button class="btn btn--danger" data-del>삭제</button>' : '') +
        '<button class="btn btn--ghost" data-cancel>취소</button>' +
        '<button class="btn btn--go" data-save>저장</button>' +
      '</div>'
    );

    pickerWire(m, '#f-emoji', '.chip');
    $('[data-cancel]', m).onclick = ui.closeModal;
    if (reward) {
      $('[data-del]', m).onclick = function () {
        store.remove('rewards', r.id);
        ui.closeModal(); renderAdmin(); ui.toast('삭제했습니다.');
      };
    }
    $('[data-save]', m).onclick = function () {
      var label = $('#f-label', m).value.trim();
      var cost = Number($('#f-cost', m).value);
      if (!label) { ui.toast('보상 이름을 입력하세요.'); return; }
      if (!(cost >= 1)) { ui.toast('필요한 별은 1 이상이어야 합니다.'); return; }
      store.upsert('rewards', {
        id: r.id || undefined,
        label: label,
        cost: Math.round(cost),
        emoji: pickerValue(m, '#f-emoji') || '🎁'
      }, 'r');
      ui.closeModal(); renderAdmin(); ui.toast('저장했습니다.');
    };
  }

  // ------------------------------------------------------------
  // 데이터 탭
  // ------------------------------------------------------------
  function dataPanel() {
    var d = store.all();
    return '' +
      '<div class="row"><span class="row__main"><b>소리</b><small>체크할 때 나는 효과음</small></span>' +
        '<button class="mini" id="btn-sound">' + (d.sound ? '켜짐' : '꺼짐') + '</button></div>' +
      '<div class="row"><span class="row__main"><b>PIN 변경</b><small>현재 ' + esc(d.pin.replace(/./g, '•')) + '</small></span>' +
        '<button class="mini" id="btn-pin">변경</button></div>' +
      '<div class="row"><span class="row__main"><b>백업 내보내기</b><small>JSON 파일로 저장</small></span>' +
        '<button class="mini" id="btn-export">내보내기</button></div>' +
      '<div class="row"><span class="row__main"><b>백업 가져오기</b><small>현재 데이터를 덮어씁니다</small></span>' +
        '<button class="mini" id="btn-import">가져오기</button></div>' +
      '<div class="row"><span class="row__main"><b>전체 초기화</b><small>모든 아이·할 일·별이 지워집니다</small></span>' +
        '<button class="mini mini--warn" id="btn-reset">초기화</button></div>' +
      '<input type="file" id="file-import" accept="application/json,.json" hidden>' +
      '<p class="note">브라우저 데이터를 지우면 기록이 사라집니다. 한 달에 한 번은 내보내기로 백업하세요.</p>';
  }

  function wireData() {
    $('#btn-sound').onclick = function () {
      store.setSound(!store.all().sound);
      renderAdmin();
    };

    $('#btn-pin').onclick = function () {
      var m = ui.openModal(
        '<h2 class="modal__title">새 PIN</h2>' +
        '<label class="fld"><span>숫자 4자리</span><input id="f-pin" type="tel" inputmode="numeric" maxlength="4" placeholder="0000"></label>' +
        '<div class="modal__row"><button class="btn btn--ghost" data-cancel>취소</button>' +
        '<button class="btn btn--go" data-save>저장</button></div>'
      );
      $('[data-cancel]', m).onclick = ui.closeModal;
      $('[data-save]', m).onclick = function () {
        var v = $('#f-pin', m).value.trim();
        if (!/^\d{4}$/.test(v)) { ui.toast('숫자 4자리를 입력하세요.'); return; }
        store.setPin(v);
        ui.closeModal(); renderAdmin(); ui.toast('PIN을 바꿨습니다.');
      };
    };

    $('#btn-export').onclick = function () {
      var blob = new Blob([store.exportJSON()], { type: 'application/json' });
      var a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = 'kidboard-' + store.dateKey() + '.json';
      document.body.appendChild(a);
      a.click();
      setTimeout(function () { URL.revokeObjectURL(a.href); a.remove(); }, 1000);
      ui.toast('백업 파일을 저장했습니다.');
    };

    $('#btn-import').onclick = function () { $('#file-import').click(); };

    $('#file-import').onchange = function (e) {
      var f = e.target.files && e.target.files[0];
      if (!f) return;
      var reader = new FileReader();
      reader.onload = function () {
        try {
          store.importJSON(String(reader.result));
          renderAdmin();
          ui.toast('복원했습니다.');
        } catch (err) {
          ui.toast(err.message || '가져오기에 실패했습니다.');
        }
      };
      reader.readAsText(f);
      e.target.value = '';
    };

    $('#btn-reset').onclick = function () {
      ui.confirmBox('전체 초기화', '모든 아이, 할 일, 별이 처음 상태로 돌아갑니다.', '초기화').then(function (yes) {
        if (!yes) return;
        store.factoryReset();
        renderAdmin();
        ui.toast('초기화했습니다.');
      });
    };
  }

  // ------------------------------------------------------------
  // 선택 팔레트 공통 동작 (하나만 선택)
  // ------------------------------------------------------------
  function pickerWire(root, groupSel, itemSel) {
    $$(groupSel + ' ' + itemSel, root).forEach(function (b) {
      b.onclick = function () {
        $$(groupSel + ' ' + itemSel, root).forEach(function (x) { x.classList.remove('is-on'); });
        b.classList.add('is-on');
      };
    });
  }
  function pickerValue(root, groupSel) {
    var on = $(groupSel + ' .is-on', root);
    return on ? on.getAttribute('data-v') : null;
  }

  // ------------------------------------------------------------
  // 관리 화면 클릭 처리
  // ------------------------------------------------------------
  function handle(act, id) {
    if (act === 'tab') { tab = id; renderAdmin(); return true; }
    if (act === 'hw-add') {
      var label = ($('#hw-label') || {}).value;
      var date = ($('#hw-date') || {}).value;
      if (!label || !label.trim()) { ui.toast('숙제 내용을 적어주세요.'); return true; }
      // 템플릿의 {} 를 안 채우고 그대로 추가하면 아이 화면에 그 문구가 그대로 나가버린다
      if (label.trim().indexOf('{}') >= 0) { ui.toast('빈칸을 채워주세요.'); return true; }
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
    if (act === 'new-child') { childForm(null); return true; }
    if (act === 'edit-child') { childForm(store.getChild(id)); return true; }
    if (act === 'new-task') { taskForm(null, id); return true; }
    if (act === 'edit-task') { taskForm(store.getTask(id)); return true; }
    if (act === 'new-reward') { rewardForm(null); return true; }
    if (act === 'edit-reward') {
      var r = null;
      store.rewards().forEach(function (x) { if (x.id === id) r = x; });
      rewardForm(r);
      return true;
    }
    if (act === 'star-plus') { store.adjustStars(id, 1); renderAdmin(); return true; }
    if (act === 'star-minus') { store.adjustStars(id, -1); renderAdmin(); return true; }
    if (act === 'reset-today') {
      var c = store.getChild(id);
      ui.confirmBox((c ? c.name : '') + ' 오늘 초기화', '오늘 체크와 오늘 받은 별을 되돌립니다.', '초기화').then(function (yes) {
        if (yes) { store.resetToday(id); renderAdmin(); ui.toast('오늘 기록을 초기화했습니다.'); }
      });
      return true;
    }
    return false;
  }

  global.KB.admin = { renderAdmin: renderAdmin, handle: handle, resetTab: function () { tab = 'homework'; } };
})(window);
