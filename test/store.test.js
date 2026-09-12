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
