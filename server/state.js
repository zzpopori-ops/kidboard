/* state.js — 서버가 가진 단 하나의 진실.
   파일 하나에 상태와 "이미 적용한 opId" 를 같이 둔다.
   opId 를 기억하지 않으면, 응답을 못 받아 재전송될 때마다 별이 늘어난다. */
const fs = require('fs');
const path = require('path');

function createStore(filePath) {
  var db = load();

  function load() {
    try {
      return JSON.parse(fs.readFileSync(filePath, 'utf8'));
    } catch (e) {
      return { seq: 0, seeded: false, state: null, applied: [] };
    }
  }

  function save() {
    fs.mkdirSync(path.dirname(filePath), { recursive: true });
    // 같은 디렉터리에 임시로 쓰고 rename 한다. 쓰는 도중 전원이 나가도
    // 반쯤 쓰인 파일이 남지 않는다.
    var tmp = filePath + '.tmp';
    fs.writeFileSync(tmp, JSON.stringify(db));
    fs.renameSync(tmp, filePath);
  }

  function isEmpty() { return !db.seeded; }
  function read() { return { seq: db.seq, state: db.state }; }

  function seed(state) {
    if (db.seeded) return { ok: false, msg: '이미 초기화된 서버입니다.' };
    db.state = state;
    db.seeded = true;
    db.seq = 1;
    save();
    return { ok: true, seq: db.seq };
  }

  function applyOps(ops) {
    var accepted = [];
    (ops || []).forEach(function (op) {
      if (!op || !op.opId) return;
      accepted.push(op.opId);
      if (db.applied.indexOf(op.opId) !== -1) return;   // 이미 본 것
      apply(op);
      db.applied.push(op.opId);
      if (db.applied.length > 5000) db.applied = db.applied.slice(-5000);
      db.seq += 1;
    });
    save();
    return { seq: db.seq, accepted: accepted };
  }

  function apply(op) {
    var s = db.state;
    if (!s) return;
    var p = op.payload || {};
    if (op.type === 'homework.add') { s.homework.push(p); return; }
    if (op.type === 'homework.setDone') {
      s.homework.forEach(function (w) { if (w.id === p.id) w.doneOn = p.doneOn || null; });
      return;
    }
    if (op.type === 'homework.move') {
      s.homework.forEach(function (w) { if (w.id === p.id) w.date = p.date; });
      return;
    }
    if (op.type === 'homework.remove') {
      s.homework = s.homework.filter(function (w) { return w.id !== p.id; });
      return;
    }
    if (op.type === 'habit.toggle') {
      if (!s.progress[p.childId]) s.progress[p.childId] = {};
      if (!s.progress[p.childId][p.date]) s.progress[p.childId][p.date] = [];
      var list = s.progress[p.childId][p.date];
      var at = list.indexOf(p.habitId);
      if (p.done && at === -1) list.push(p.habitId);
      if (!p.done && at !== -1) list.splice(at, 1);
      return;
    }
    if (op.type === 'bonus.add') { s.bonuses.push(p); return; }
    if (op.type === 'redemption.add') { s.redemptions.push(p); return; }
    ['habit', 'template', 'reward', 'child'].forEach(function (kind) {
      var list = kind === 'child' ? 'children' : kind + 's';
      if (op.type === kind + '.upsert') {
        var found = false;
        s[list] = (s[list] || []).map(function (x) {
          if (x.id === p.id) { found = true; return Object.assign({}, x, p); }
          return x;
        });
        if (!found) s[list].push(p);
      }
      if (op.type === kind + '.remove') {
        s[list] = (s[list] || []).filter(function (x) { return x.id !== p.id; });
      }
    });
    // 모르는 종류는 조용히 무시한다. accepted 에는 이미 넣었으므로
    // 클라이언트 큐가 그 op 때문에 영원히 안 비는 일은 없다.
  }

  return { read: read, applyOps: applyOps, seed: seed, isEmpty: isEmpty };
}

module.exports = { createStore };
