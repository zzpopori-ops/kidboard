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
        { id: 'tpl1', emoji: '📕', text: '수학리더 개념 1-2 {시작}~{끝}페이지' },
        { id: 'tpl2', emoji: '📗', text: '수학리더 개념 평가책 book2 1-2 {시작}~{끝}페이지' },
        { id: 'tpl3', emoji: '📘', text: '수학리더 기본 지피지기 book1 1-2 {시작}~{끝}페이지' },
        { id: 'tpl4', emoji: '📙', text: '수학리더 백전백승 book2 1-2 {시작}~{끝}페이지' }
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

  // 예전(v2 초기) 기본 템플릿 2종 — 템플릿 편집기가 아직 없어서, 저장된 값이
  // 이 모양 그대로라면 부모가 손댄 적이 없다는 뜻이다. load() 에서 한 번만
  // 새 4종 기본값으로 갈아끼운다. children/homework/progress 등은 이 판단과
  // 무관하게 절대 건드리지 않는다 — 별 계산에 쓰이는 값들이라서다.
  function isUntouchedOldTemplates(list) {
    var old = [
      { id: 'tpl1', emoji: '📕', text: '수학 문제집 {}~{}쪽' },
      { id: 'tpl2', emoji: '✏️', text: '받아쓰기 {}문제' }
    ];
    if (!Array.isArray(list) || list.length !== old.length) return false;
    return old.every(function (o, i) {
      var t = list[i];
      return t && t.id === o.id && t.emoji === o.emoji && t.text === o.text;
    });
  }

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
        var migrated = isUntouchedOldTemplates(base.templates);
        if (migrated) base.templates = defaults().templates;
        data = base;
        if (migrated) save();
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

  /** getChild 와 같은 모양 — id로 습관 하나. 없으면 null */
  function getHabit(id) {
    for (var i = 0; i < data.habits.length; i++) {
      if (data.habits[i].id === id) return data.habits[i];
    }
    return null;
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

  /**
   * 아이 화면에 보여줄 숙제 선택 (fix round 1).
   * 오늘 것부터 채우고, 남는 자리에만 밀린 것을 오래된 순으로 채운다.
   * "오래된 순으로 4개" 였던 원래 규칙은 밀린 게 쌓이면 오늘 숙제가
   * 상한 안에 아예 못 들어가는 사고를 냈다 — 화면을 실제로 그려보고서야
   * 드러났다. homeworkDue 는 부모 화면(상한 없음)이 그대로 써야 하므로
   * 손대지 않고, 이 함수를 따로 둔다.
   */
  function homeworkForKid(childId, key, limit) {
    var k = key || dateKey();
    var list = homeworkOf(childId).filter(function (w) { return !w.doneOn && w.date <= k; });
    var today = list.filter(function (w) { return w.date === k; });
    var overdue = list
      .filter(function (w) { return w.date < k; })
      .sort(function (a, b) { return a.date < b.date ? -1 : a.date > b.date ? 1 : 0; });
    var ordered = today.concat(overdue);
    return limit ? ordered.slice(0, limit) : ordered;
  }

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

  /**
   * "오늘 초기화" — 오늘 체크한 습관과 오늘 끝낸 숙제만 되돌린다.
   * 별은 저장하지 않고 매번 계산하므로(starsOf) 따로 손대지 않아도
   * 이 두 기록을 지우는 순간 저절로 줄어든다. 보너스/교환은 "오늘의
   * 체크"가 아니라 별도 장부라서 여기서 건드리지 않는다.
   */
  function resetToday(childId) {
    var k = dateKey();
    if (data.progress[childId]) delete data.progress[childId][k];
    data.homework.forEach(function (w) {
      if (w.childId === childId && w.doneOn === k) w.doneOn = null;
    });
    save();
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

  /** 템플릿 글에서 {이름} 빈칸의 이름만 등장 순서대로 뽑는다 — 화면이 이 이름을 입력칸 라벨로 쓴다 */
  function templateBlanks(t) {
    var text = (t && t.text) || '';
    var names = [];
    var re = /\{([^{}]+)\}/g, m;
    while ((m = re.exec(text))) names.push(m[1]);
    return names;
  }

  /**
   * 만들지 않고 라벨만 미리 계산한다 — 부모가 타이핑하는 동안 화면이 그대로 보여준다.
   * {시작}~{끝} 은 끝이 비어 있으면 통째로 사라지고 시작 값 하나만 남는다.
   * ('50~50페이지'가 아니라 '50페이지' — 한 쪽짜리 숙제이기 때문)
   */
  function buildHomeworkLabel(t, values) {
    var text = (t && t.text) || '';
    values = values || {};
    var start = values['시작'];
    var end = values['끝'];
    if (/\{시작\}~\{끝\}/.test(text) && (end === undefined || end === null || end === '')) {
      text = text.replace(/\{시작\}~\{끝\}/g, (start === undefined || start === null) ? '' : String(start));
    }
    return text.replace(/\{([^{}]+)\}/g, function (_, name) {
      var v = values[name];
      return (v === undefined || v === null) ? '' : String(v);
    });
  }

  function isPositiveInt(v) {
    var n = Number(v);
    return Number.isInteger(n) && n > 0;
  }

  /** 시작/끝 값이 숙제로 만들 수 있는 값인지 — 문제가 있으면 토스트에 바로 쓸 한국어 메시지를 돌려준다 */
  function validateTemplateValues(values) {
    values = values || {};
    var startRaw = values['시작'];
    if (startRaw === undefined || startRaw === null || startRaw === '' || !isPositiveInt(startRaw)) {
      return '시작 쪽수를 올바르게 입력해 주세요.';
    }
    var endRaw = values['끝'];
    if (endRaw !== undefined && endRaw !== null && endRaw !== '') {
      if (!isPositiveInt(endRaw)) return '끝 쪽수를 올바르게 입력해 주세요.';
      if (Number(endRaw) < Number(startRaw)) return '끝 쪽수가 시작 쪽수보다 빠를 수 없어요.';
    }
    return null;
  }

  /**
   * 템플릿 + 입력값으로 숙제를 실제로 만든다.
   * 검증에 실패하면 아무것도 만들지 않고 { ok:false, msg } 만 돌려준다 (throw 안 함).
   * 성공하면 그 템플릿의 nextStart 를 (끝 ?? 시작) + 1 로 옮겨 다음에 이어 쓸 수 있게 한다.
   * 부모가 시작을 덮어써서 복습/건너뛰기를 해도 규칙은 이거 하나뿐 — 별도 모드 없음.
   */
  function createHomeworkFromTemplate(childId, templateId, values, date) {
    var t = data.templates.filter(function (x) { return x.id === templateId; })[0];
    if (!t) return { ok: false, msg: '템플릿을 찾을 수 없습니다.' };
    var err = validateTemplateValues(values);
    if (err) return { ok: false, msg: err };

    var label = buildHomeworkLabel(t, values);
    var item = addHomework({ childId: childId, emoji: t.emoji, label: label, date: date });

    var start = Number(values['시작']);
    var endRaw = values['끝'];
    var end = (endRaw !== undefined && endRaw !== null && endRaw !== '') ? Number(endRaw) : null;
    t.nextStart = (end !== null ? end : start) + 1;
    save();

    return { ok: true, item: item, nextStart: t.nextStart };
  }

  function addBonus(childId, amount, memo) {
    var applied = amount;
    if (amount < 0) {
      // 있는 것보다 많이 깎지 않는다. 초과분을 그냥 기록해 버리면 합계만 0으로
      // 가려질 뿐 빚(음수 기록)은 그대로 남아, 나중에 별을 벌어도 그 빚부터
      // 갚느라 화면에 안 보이는 채로 사라진다 — 그게 이 클램프의 이유다.
      var have = starsOf(childId);
      applied = Math.max(amount, -have);
      if (applied === 0) return null; // 이미 0이면 적용할 것이 없다 — 기록도 만들지 않는다
    }
    var item = {
      id: uid('b'), childId: childId, amount: applied,
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
    habits: habits, habitsFor: habitsFor, getHabit: getHabit, isHabitDone: isHabitDone,
    doneIds: doneIds, progressOf: progressOf, toggleHabit: toggleHabit, resetToday: resetToday,
    homeworkOf: homeworkOf, homeworkDue: homeworkDue, homeworkForKid: homeworkForKid, isOverdue: isOverdue,
    addHomework: addHomework, setHomeworkDone: setHomeworkDone,
    moveHomework: moveHomework, removeHomework: removeHomework,
    addTemplate: addTemplate, removeTemplate: removeTemplate,
    templateBlanks: templateBlanks, buildHomeworkLabel: buildHomeworkLabel,
    validateTemplateValues: validateTemplateValues, createHomeworkFromTemplate: createHomeworkFromTemplate,
    starsOf: starsOf, addBonus: addBonus, redeem: redeem,
    upsert: upsert, remove: remove,
    setPin: setPin, checkPin: checkPin, setSound: setSound,
    exportJSON: exportJSON, importJSON: importJSON, factoryReset: factoryReset
  };
})(window);
