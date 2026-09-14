// 서버 상태 층 단위 테스트 (HTTP 없이)
const fs = require('fs');
const os = require('os');
const path = require('path');
const { createStore } = require('../server/state');

let pass = 0, fail = 0;
function assert(cond, msg) {
  if (cond) { console.log('  ok -', msg); pass++; }
  else { console.error('FAIL:', msg); fail++; process.exitCode = 1; }
}
function tmpFile() {
  return path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'kb-srv-')), 'state.json');
}

console.log('[1] 빈 서버');
{
  const s = createStore(tmpFile());
  assert(s.isEmpty() === true, '처음엔 비어 있다');
  assert(s.read().seq === 0, 'seq 는 0 에서 시작');
}

console.log('[2] 시딩');
{
  const s = createStore(tmpFile());
  const r = s.seed({ version: 2, children: [{ id: 'c1', name: '첫째' }], homework: [] });
  assert(r.ok === true, '빈 서버는 시딩을 받는다');
  assert(s.isEmpty() === false, '시딩 후에는 비어 있지 않다');
  assert(s.read().state.children[0].name === '첫째', '시딩한 내용이 들어간다');
  const again = s.seed({ version: 2, children: [], homework: [] });
  assert(again.ok === false, '두 번째 시딩은 거부한다 — 실수로 덮어쓰면 별이 사라진다');
  assert(s.read().state.children.length === 1, '거부됐으면 상태가 그대로다');
}

console.log('[3] op 적용');
{
  const s = createStore(tmpFile());
  s.seed({ version: 2, children: [{ id: 'c1', name: '첫째' }], homework: [] });
  const r = s.applyOps([
    { opId: 'op-1', type: 'homework.add',
      payload: { id: 'hw1', childId: 'c1', emoji: '📕', label: '수학 1~5쪽', date: '2026-09-14', stars: 1, doneOn: null } }
  ]);
  assert(r.accepted.length === 1, '한 건 받았다');
  assert(s.read().state.homework.length === 1, '숙제가 생겼다');
  assert(s.read().seq === 2, 'seq 가 올라간다');
}

console.log('[4] 멱등성 — 이 Phase 의 핵심');
{
  const s = createStore(tmpFile());
  s.seed({ version: 2, children: [{ id: 'c1', name: '첫째' }], homework: [] });
  const op = { opId: 'op-dup', type: 'homework.add',
    payload: { id: 'hw1', childId: 'c1', emoji: '📕', label: '수학', date: '2026-09-14', stars: 1, doneOn: null } };

  s.applyOps([op]);
  const seqAfterFirst = s.read().seq;
  const second = s.applyOps([op]);          // 와이파이가 끊겼다 붙어 재전송된 상황
  assert(second.accepted.indexOf('op-dup') !== -1, '재전송도 accepted 로 응답한다 — 안 그러면 큐에서 안 지워진다');
  assert(s.read().state.homework.length === 1, '숙제가 두 번 생기지 않는다');
  assert(s.read().seq === seqAfterFirst, '두 번째는 seq 를 올리지 않는다');
}

console.log('[5] 별이 두 배가 되지 않는다');
{
  const s = createStore(tmpFile());
  s.seed({ version: 2, children: [{ id: 'c1', name: '첫째' }],
           homework: [{ id: 'hw1', childId: 'c1', label: '수학', date: '2026-09-14', stars: 1, doneOn: null }],
           bonuses: [] });
  const done = { opId: 'op-done', type: 'homework.setDone', payload: { id: 'hw1', doneOn: '2026-09-14' } };
  s.applyOps([done]);
  s.applyOps([done]);
  s.applyOps([done]);
  const hw = s.read().state.homework.filter(function (w) { return w.id === 'hw1'; });
  assert(hw.length === 1 && hw[0].doneOn === '2026-09-14', '세 번 보내도 한 번 끝낸 것과 같다');
  const bonus = { opId: 'op-bonus', type: 'bonus.add',
    payload: { id: 'b1', childId: 'c1', amount: 5, memo: '할머니', at: '2026-09-14T00:00:00Z' } };
  s.applyOps([bonus]);
  s.applyOps([bonus]);
  assert(s.read().state.bonuses.length === 1, '보너스도 한 번만 쌓인다');
}

console.log('[6] 여러 작업 종류');
{
  const s = createStore(tmpFile());
  s.seed({ version: 2, children: [{ id: 'c1', name: '첫째' }], homework: [],
           habits: [], templates: [], rewards: [], progress: {}, bonuses: [], redemptions: [] });
  s.applyOps([
    { opId: 'a', type: 'homework.add', payload: { id: 'h1', childId: 'c1', label: '수학', date: '2026-09-14', stars: 1, doneOn: null } },
    { opId: 'b', type: 'homework.move', payload: { id: 'h1', date: '2026-09-15' } },
    { opId: 'c', type: 'habit.toggle', payload: { childId: 'c1', habitId: 'hb1', date: '2026-09-14', done: true } },
    { opId: 'd', type: 'homework.remove', payload: { id: 'h1' } }
  ]);
  const st = s.read().state;
  assert(st.homework.length === 0, 'remove 가 먹었다');
  assert(st.progress.c1['2026-09-14'].indexOf('hb1') !== -1, 'habit.toggle 이 기록됐다');
}

console.log('[7] 모르는 작업은 무시하되 accepted 로 응답한다');
{
  const s = createStore(tmpFile());
  s.seed({ version: 2, children: [], homework: [] });
  const r = s.applyOps([{ opId: 'x', type: 'nope.whatever', payload: {} }]);
  assert(r.accepted.indexOf('x') !== -1, '클라이언트 큐가 영원히 안 비는 일을 막는다');
}

console.log('[8] 재시작해도 남는다');
{
  const f = tmpFile();
  const s1 = createStore(f);
  s1.seed({ version: 2, children: [{ id: 'c1', name: '첫째' }], homework: [] });
  s1.applyOps([{ opId: 'p1', type: 'homework.add',
    payload: { id: 'h9', childId: 'c1', label: '남아야 함', date: '2026-09-14', stars: 1, doneOn: null } }]);
  const s2 = createStore(f);                 // 컨테이너 재시작을 흉내
  assert(s2.read().state.homework.length === 1, '파일에서 다시 읽어온다');
  const again = s2.applyOps([{ opId: 'p1', type: 'homework.add',
    payload: { id: 'h9', childId: 'c1', label: '남아야 함', date: '2026-09-14', stars: 1, doneOn: null } }]);
  assert(s2.read().state.homework.length === 1, '재시작 뒤에도 opId 를 기억한다');
}

console.log(`\n합계: ok ${pass} / FAIL ${fail}`);
