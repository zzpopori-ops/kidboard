/* ============================================================
   store.js — 데이터 한 곳에서만 바뀌게 만드는 층
   화면 코드는 이 파일의 함수만 부른다. localStorage를 직접 만지지 않는다.
   ============================================================ */
(function (global) {
  'use strict';

  var KEY = 'kidboard.v1';   // 저장 키. 구조를 바꿀 땐 v2로 올린다
  var DAY = 86400000;        // 1일(ms)
  var KEEP_DAYS = 120;       // 진행 기록 보관 일수 (용량 상한)

  // ---------- 작은 도구 ----------
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

  /** 'YYYY-MM-DD' -> 요일 숫자(0=일 ... 6=토) */
  function weekdayOf(key) {
    return new Date(key + 'T00:00:00').getDay();
  }

  // ---------- 초기값 ----------
  function defaults() {
    return {
      version: 1,
      pin: '1234',
      sound: true,
      children: [
        { id: 'c1', name: '첫째', emoji: '🐯', color: '#3D7EA6', canRead: true,  stars: 0 },
        { id: 'c2', name: '둘째', emoji: '🐰', color: '#4C9F70', canRead: false, stars: 0 }
      ],
      tasks: [
        { id: 't1', childId: 'c1', emoji: '🪥', label: '이 닦기',        stars: 1, days: [0,1,2,3,4,5,6] },
        { id: 't2', childId: 'c1', emoji: '📚', label: '책 10분 읽기',   stars: 2, days: [0,1,2,3,4,5,6] },
        { id: 't3', childId: 'c1', emoji: '🎒', label: '가방 챙기기',    stars: 1, days: [1,2,3,4,5] },
        { id: 't4', childId: 'c1', emoji: '🧺', label: '빨래통에 넣기',  stars: 1, days: [0,1,2,3,4,5,6] },
        { id: 't5', childId: 'c2', emoji: '🪥', label: '이 닦기',        stars: 1, days: [0,1,2,3,4,5,6] },
        { id: 't6', childId: 'c2', emoji: '🧸', label: '장난감 정리',    stars: 2, days: [0,1,2,3,4,5,6] },
        { id: 't7', childId: 'c2', emoji: '🧼', label: '손 씻기',        stars: 1, days: [0,1,2,3,4,5,6] },
        { id: 't8', childId: 'c2', emoji: '🥛', label: '우유 다 먹기',   stars: 1, days: [0,1,2,3,4,5,6] }
      ],
      rewards: [
        { id: 'r1', emoji: '🍦', label: '아이스크림',   cost: 10 },
        { id: 'r2', emoji: '📺', label: '만화 30분',    cost: 15 },
        { id: 'r3', emoji: '🎠', label: '키즈카페',     cost: 50 }
      ],
      progress: {},      // { childId: { 'YYYY-MM-DD': [taskId, ...] } }
      redemptions: []    // 보상 교환 기록
    };
  }

  var data = defaults();

  // ---------- 저장 / 불러오기 ----------
  function load() {
    try {
      var raw = global.localStorage.getItem(KEY);
      if (raw) {
        var parsed = JSON.parse(raw);
        var base = defaults();
        // 새 버전에서 추가된 키가 없어도 앱이 죽지 않도록 기본값 위에 덮는다
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

  /** 오래된 진행 기록을 잘라 용량을 묶어둔다 */
  function prune() {
    var limit = dateKey(new Date(Date.now() - KEEP_DAYS * DAY));
    Object.keys(data.progress).forEach(function (cid) {
      var byDate = data.progress[cid];
      Object.keys(byDate).forEach(function (k) {
        if (k < limit) delete byDate[k];   // 'YYYY-MM-DD'는 문자열 비교로 날짜 비교가 된다
      });
    });
  }

  // ---------- 읽기 ----------
  function all() { return data; }
  function children() { return data.children.slice(); }
  function rewards() { return data.rewards.slice(); }
  function getChild(id) {
    for (var i = 0; i < data.children.length; i++) {
      if (data.children[i].id === id) return data.children[i];
    }
    return null;
  }
  function getTask(id) {
    for (var i = 0; i < data.tasks.length; i++) {
      if (data.tasks[i].id === id) return data.tasks[i];
    }
    return null;
  }

  /** 특정 아이의 특정 날짜 할 일 목록 (요일 필터 적용) */
  function tasksFor(childId, key) {
    var k = key || dateKey();
    var wd = weekdayOf(k);
    return data.tasks.filter(function (t) {
      return t.childId === childId && (t.days || []).indexOf(wd) !== -1;
    });
  }

  /** 아이 전체 할 일 (부모 설정 화면용 — 요일 무관) */
  function tasksOf(childId) {
    return data.tasks.filter(function (t) { return t.childId === childId; });
  }

  function doneIds(childId, key) {
    var k = key || dateKey();
    var byDate = data.progress[childId];
    return (byDate && byDate[k]) ? byDate[k].slice() : [];
  }

  function isDone(childId, taskId, key) {
    return doneIds(childId, key).indexOf(taskId) !== -1;
  }

  /** 오늘 진행률 { done, total, ratio } */
  function progressOf(childId, key) {
    var total = tasksFor(childId, key).length;
    var ids = doneIds(childId, key);
    var done = tasksFor(childId, key).filter(function (t) {
      return ids.indexOf(t.id) !== -1;
    }).length;
    return { done: done, total: total, ratio: total ? done / total : 0 };
  }

  /**
   * 연속 달성일. 오늘이 아직 미완성이면 끊지 않고 어제부터 센다.
   * 할 일이 0개인 날(예: 평일 항목만 있는 주말)은 건너뛴다.
   */
  function streakOf(childId) {
    var n = 0;
    var now = Date.now();
    for (var i = 0; i < 400; i++) {
      var key = dateKey(new Date(now - i * DAY));
      var p = progressOf(childId, key);
      if (p.total === 0) continue;
      if (p.done >= p.total) { n++; continue; }
      if (i === 0) continue;   // 오늘은 진행 중일 수 있으므로 관용
      break;
    }
    return n;
  }

  // ---------- 쓰기 ----------
  /** 체크 토글. 체크 해제하면 별도 회수한다(반복 체크로 별 쌓기 방지) */
  function toggleTask(childId, taskId) {
    var child = getChild(childId);
    var task = getTask(taskId);
    if (!child || !task) return null;

    var key = dateKey();
    if (!data.progress[childId]) data.progress[childId] = {};
    if (!data.progress[childId][key]) data.progress[childId][key] = [];

    var list = data.progress[childId][key];
    var at = list.indexOf(taskId);
    var done;

    if (at === -1) {
      list.push(taskId);
      child.stars += task.stars;
      done = true;
    } else {
      list.splice(at, 1);
      child.stars = Math.max(0, child.stars - task.stars);
      done = false;
    }

    prune();
    save();
    return { done: done, stars: task.stars, total: child.stars };
  }

  function redeem(childId, rewardId) {
    var child = getChild(childId);
    var reward = null;
    for (var i = 0; i < data.rewards.length; i++) {
      if (data.rewards[i].id === rewardId) reward = data.rewards[i];
    }
    if (!child || !reward) return { ok: false, msg: '보상을 찾을 수 없습니다.' };
    if (child.stars < reward.cost) {
      return { ok: false, msg: '별이 ' + (reward.cost - child.stars) + '개 더 필요합니다.' };
    }

    child.stars -= reward.cost;
    data.redemptions.unshift({
      id: uid('x'),
      childId: childId,
      label: reward.label,
      emoji: reward.emoji,
      cost: reward.cost,
      at: new Date().toISOString()
    });
    data.redemptions = data.redemptions.slice(0, 200);
    save();
    return { ok: true, left: child.stars };
  }

  function adjustStars(childId, delta) {
    var child = getChild(childId);
    if (!child) return 0;
    child.stars = Math.max(0, child.stars + delta);
    save();
    return child.stars;
  }

  function resetToday(childId) {
    var key = dateKey();
    var ids = doneIds(childId, key);
    var child = getChild(childId);
    if (child) {
      ids.forEach(function (tid) {
        var t = getTask(tid);
        if (t) child.stars = Math.max(0, child.stars - t.stars);
      });
    }
    if (data.progress[childId]) delete data.progress[childId][key];
    save();
  }

  // ---------- 부모 설정용 CRUD ----------
  function upsert(listName, obj, prefix) {
    var list = data[listName];
    if (obj.id) {
      for (var i = 0; i < list.length; i++) {
        if (list[i].id === obj.id) {
          Object.assign(list[i], obj);
          save();
          return list[i];
        }
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
      data.tasks = data.tasks.filter(function (t) { return t.childId !== id; });
      delete data.progress[id];
    }
    save();
  }

  function setPin(pin) { data.pin = String(pin); save(); }
  function checkPin(pin) { return String(pin) === String(data.pin); }
  function setSound(on) { data.sound = !!on; save(); }

  // ---------- 백업 / 복원 ----------
  function exportJSON() { return JSON.stringify(data, null, 2); }

  function importJSON(text) {
    var parsed = JSON.parse(text);
    if (!parsed || !Array.isArray(parsed.children) || !Array.isArray(parsed.tasks)) {
      throw new Error('백업 파일 형식이 맞지 않습니다.');
    }
    data = parsed;
    if (!data.progress) data.progress = {};
    if (!data.redemptions) data.redemptions = [];
    save();
  }

  function factoryReset() { data = defaults(); save(); }

  // ---------- 밖으로 내보내는 것만 ----------
  global.KB = global.KB || {};
  global.KB.store = {
    load: load, save: save,
    dateKey: dateKey, uid: uid,
    all: all, children: children, rewards: rewards,
    getChild: getChild, getTask: getTask,
    tasksFor: tasksFor, tasksOf: tasksOf,
    doneIds: doneIds, isDone: isDone,
    progressOf: progressOf, streakOf: streakOf,
    toggleTask: toggleTask, redeem: redeem,
    adjustStars: adjustStars, resetToday: resetToday,
    upsert: upsert, remove: remove,
    setPin: setPin, checkPin: checkPin, setSound: setSound,
    exportJSON: exportJSON, importJSON: importJSON, factoryReset: factoryReset
  };
})(window);
