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
assert(S.children().length === 2, '아이 2명');
assert(S.getChild('c1').stars === 0, '별 0개로 시작');

console.log('[2] 요일 필터');
const today = S.dateKey();
const wd = new Date(today + 'T00:00:00').getDay();
const t1 = S.tasksFor('c1');
const expect1 = wd === 0 || wd === 6 ? 3 : 4;   // 가방 챙기기는 평일만
assert(t1.length === expect1, `오늘(요일 ${wd}) c1 할 일 ${t1.length}개 = 기대 ${expect1}개`);

console.log('[3] 체크 / 해제 시 별 증감');
const r = S.toggleTask('c1', 't2');             // 책 10분 읽기 = 별 2
assert(r.done === true && S.getChild('c1').stars === 2, '체크하면 별 +2');
const p = S.progressOf('c1');
assert(p.done === 1 && p.total === expect1, `진행률 1/${expect1}`);
const r2 = S.toggleTask('c1', 't2');
assert(r2.done === false && S.getChild('c1').stars === 0, '해제하면 별 회수(무한 적립 방지)');

console.log('[4] 전부 체크하면 연속 1일');
S.tasksFor('c1').forEach(t => S.toggleTask('c1', t.id));
assert(S.progressOf('c1').ratio === 1, '오늘 100%');
assert(S.streakOf('c1') === 1, '연속 1일');

console.log('[5] 보상 교환');
const before = S.getChild('c1').stars;
const bad = S.redeem('c1', 'r3');               // 키즈카페 50
assert(bad.ok === false && /더 필요/.test(bad.msg), '별 부족하면 거절 + 부족분 안내');
S.adjustStars('c1', 100);
const good = S.redeem('c1', 'r3');
assert(good.ok === true && good.left === before + 100 - 50, '교환 시 별 차감');
assert(S.all().redemptions.length === 1, '교환 기록 1건');

console.log('[6] 오늘 초기화');
S.resetToday('c1');
assert(S.progressOf('c1').done === 0, '체크 전부 해제');

console.log('[7] 아이 삭제 시 할 일도 함께 정리');
S.remove('children', 'c2');
assert(S.tasksOf('c2').length === 0, 'c2 할 일 동반 삭제');

console.log('[8] 백업 / 복원');
const dump = S.exportJSON();
S.factoryReset();
assert(S.children().length === 2, '초기화 후 아이 2명');
S.importJSON(dump);
assert(S.children().length === 1, '복원 후 아이 1명');
let threw = false;
try { S.importJSON('{"nope":1}'); } catch (e) { threw = true; }
assert(threw, '형식이 틀린 백업은 거부');

console.log('[9] 영속성');
assert(JSON.parse(mem['kidboard.v1']).children.length === 1, 'localStorage에 저장됨');
