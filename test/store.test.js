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

// ------------------------------------------------------------
// [16]/[17] fix round 1 — 실제 화면을 보고 나서 바뀐 규칙.
// "오래된 순으로 4개" 였던 원래 규칙은, 밀린 게 많으면 오늘 숙제가
// 아예 안 보이는 사고를 냈다. 오늘 것부터 채우고 남는 자리만
// 밀린 것(가장 오래된 것부터)에게 준다. homeworkDue 는 그대로 둔다 —
// 부모 화면은 밀린 총량을 봐야 해서 상한이 없는 전체·오래된순이 맞다.
// ------------------------------------------------------------
function daysAgo(key, n) {
  return S.dateKey(new Date(new Date(key + 'T00:00:00').getTime() - n * 86400000));
}

console.log('[16] homeworkForKid — 오늘 것을 먼저 채우고 남는 자리에 밀린 것');

// today 2 + overdue 9 -> 2 today + 2 overdue(가장 오래된 것부터)
S.factoryReset();
{
  const K = '2026-11-15';
  S.addHomework({ childId: 'c1', emoji: '📕', label: '오늘 수학', date: K });
  S.addHomework({ childId: 'c1', emoji: '📗', label: '오늘 받아쓰기', date: K });
  for (let i = 1; i <= 9; i++) {
    S.addHomework({ childId: 'c1', emoji: '📙', label: '밀린것' + i, date: daysAgo(K, i) });
  }
  const picked = S.homeworkForKid('c1', K, 4);
  const labels = picked.map(w => w.label);
  assert(picked.length === 4, 'today 2 + overdue 9 -> 4개');
  assert(labels.includes('오늘 수학') && labels.includes('오늘 받아쓰기'), '오늘 것 2개는 반드시 보인다');
  assert(labels.includes('밀린것9') && labels.includes('밀린것8'), '남는 2자리는 가장 오래 밀린 것부터');
  assert(!labels.includes('밀린것1'), '1일 전처럼 자리를 못 받은 밀린 것은 안 보인다');
}

// today 4 + overdue 9 -> 오늘 것만 4개, 밀린 건 전부 대기
// 이게 바로 캡처된 사고 그 자체다: 예전 규칙이면 여기서 오늘 것이
// 하나도 안 보이고 9일 전 것만 보였을 상황이다.
S.factoryReset();
{
  const K = '2026-11-15';
  for (let i = 0; i < 4; i++) S.addHomework({ childId: 'c1', emoji: '📕', label: '오늘' + i, date: K });
  for (let i = 1; i <= 9; i++) S.addHomework({ childId: 'c1', emoji: '📙', label: '밀린것' + i, date: daysAgo(K, i) });
  const picked = S.homeworkForKid('c1', K, 4);
  const labels = picked.map(w => w.label);
  assert(picked.length === 4, 'today 4 + overdue 9 -> 4개');
  assert(picked.every(w => w.date === K), '오늘 것 4개로 자리가 차면 밀린 건 전부 대기');
  assert(labels.includes('오늘0'), '오늘 것은 반드시 보인다');
  assert(!labels.includes('밀린것9'), '9일 전처럼 아주 오래 밀린 것도 이번엔 자리를 못 받는다');
}

// today 0 + overdue 9 -> 가장 오래 밀린 4개
S.factoryReset();
{
  const K = '2026-11-15';
  for (let i = 1; i <= 9; i++) S.addHomework({ childId: 'c1', emoji: '📙', label: '밀린것' + i, date: daysAgo(K, i) });
  const picked = S.homeworkForKid('c1', K, 4);
  const labels = picked.map(w => w.label);
  assert(picked.length === 4, 'today 0 + overdue 9 -> 4개');
  assert(picked.every(w => w.date < K), '오늘 것이 없으면 전부 밀린 것');
  ['밀린것9', '밀린것8', '밀린것7', '밀린것6'].forEach(l =>
    assert(labels.includes(l), '가장 오래 밀린 4개(6~9일 전)가 온다: ' + l));
}

// today 6 + overdue 0 -> 오늘 것 중 4개(상한은 그대로)
S.factoryReset();
{
  const K = '2026-11-15';
  for (let i = 0; i < 6; i++) S.addHomework({ childId: 'c1', emoji: '📕', label: '오늘' + i, date: K });
  const picked = S.homeworkForKid('c1', K, 4);
  assert(picked.length === 4, 'today 6 + overdue 0 -> 상한 4는 그대로');
  assert(picked.every(w => w.date === K), '전부 오늘 것 중에서 고른다');
}

console.log('[17] homeworkDue 는 그대로 — 상한 없이 전부, 오래된 순 (부모 화면용)');
S.factoryReset();
{
  const K = '2026-11-15';
  S.addHomework({ childId: 'c1', emoji: '📕', label: '오늘', date: K });
  S.addHomework({ childId: 'c1', emoji: '📙', label: '밀림', date: daysAgo(K, 3) });
  const list = S.homeworkDue('c1', K);
  assert(list.length === 2, 'homeworkDue 는 상한 없이 전부');
  assert(list[0].label === '밀림', 'homeworkDue 는 여전히 오래된 순으로 정렬한다 (안 바뀜)');
}

console.log('[18] 아이 정보를 고쳐도 별 필드가 되살아나지 않는다');
S.factoryReset();
{
  const before = S.getChild('c1');
  assert(!('stars' in before), '수정 전에는 별 필드가 없다');

  // 부모 화면 childForm 의 저장 버튼이 store.upsert('children', ...) 에 넘기는
  // 객체 모양을 그대로 흉내낸다 (id, name, emoji, color, canRead 만 — 별은 없다).
  // admin.js 저장 핸들러가 'stars: c.stars || 0' 를 다시 끼워 넣으면
  // 이 자리에서 곧바로 실패해 회귀를 잡아낸다.
  S.upsert('children', {
    id: before.id,
    name: before.name,
    emoji: before.emoji,
    color: before.color,
    canRead: before.canRead
  }, 'c');

  const after = S.getChild('c1');
  assert(!('stars' in after), '수정해도 별 필드가 생기면 안 된다 (getChild)');

  const persisted = JSON.parse(mem['kidboard.v2']).children.find(c => c.id === before.id);
  assert(!('stars' in persisted), '저장소(kidboard.v2)에도 별 필드가 남으면 안 된다');

  assert(S.starsOf('c1') === 0, '수정 후에도 별은 여전히 기록에서 계산된다');
}

console.log('[19] 보너스 차감은 있는 만큼만 — 화면에 안 보이는 빚을 만들지 않는다');
S.factoryReset();
{
  // 별 2개를 만들어 둔다 (계산값이 정확히 2가 되게)
  S.addBonus('c1', 2, '테스트 시드');
  assert(S.starsOf('c1') === 2, '시드: 별 2개');

  // 5개를 깎으려 하면 실제로는 2개만 깎였어야 한다
  const rec = S.addBonus('c1', -5, '부모 차감');
  assert(S.starsOf('c1') === 0, '있는 것보다 많이 깎아도 0 밑으로는 안 내려간다');
  assert(rec && rec.amount === -2, '기록된 양은 요청한 -5 가 아니라 실제로 깎인 -2 여야 한다');

  console.log('  [19-a] 숨은 빚이 없어야 한다: 과다 차감 뒤에 번 별은 즉시 화면에 보인다');
  S.addBonus('c1', 3, '할머니 도와드림');
  assert(S.starsOf('c1') === 3, '과다 차감이 빚으로 남아있으면 3 이 아니라 0 이나 그 아래로 나온다');

  console.log('  [19-b] 0개에서 더 깎으면 기록 자체를 만들지 않는다');
  S.factoryReset();
  const before = S.all().bonuses.length;
  const zeroRec = S.addBonus('c1', -1, '부모 차감');
  assert(zeroRec === null, '0개에서 깎으면 아무것도 적용되지 않았다는 뜻으로 null 을 돌려준다');
  assert(S.all().bonuses.length === before, '기록 개수가 늘면 안 된다');
  assert(S.starsOf('c1') === 0, '여전히 0');

  console.log('  [19-c] 예산 안에서의 정상 차감은 그대로 동작하고 메모도 남는다');
  S.factoryReset();
  S.addBonus('c1', 5, '테스트 시드');
  const normal = S.addBonus('c1', -2, '부모 차감');
  assert(S.starsOf('c1') === 3, '정상 범위 안 차감은 그대로 반영된다');
  assert(normal.amount === -2, '요청한 만큼 그대로 기록된다 (클램프가 필요 없던 경우)');
  assert(normal.memo === '부모 차감', '메모도 그대로 남는다');
}

console.log('[20] getHabit — id로 습관 하나 찾기 (getChild와 같은 모양)');
S.factoryReset();
{
  const h = S.habits('c1')[0];
  assert(S.getHabit(h.id) && S.getHabit(h.id).id === h.id, '있는 id면 그 습관을 돌려준다');
  assert(S.getHabit('no-such-id') === null, '없는 id면 null');
}

console.log('[21] resetToday — 오늘 체크와 오늘 끝낸 숙제만 되돌린다');
S.factoryReset();
{
  const today = S.dateKey();
  const yday = daysAgo(today, 1);

  // 오늘 습관 체크 + 오늘 끝낸 숙제 + 다른 날 숙제 + 보너스/교환 기록까지 섞어 둔다
  const h = S.habits('c1')[0];
  S.toggleHabit('c1', h.id, today);
  const hwToday = S.addHomework({ childId: 'c1', label: '오늘 숙제', date: today });
  S.setHomeworkDone(hwToday.id, today);
  const hwYday = S.addHomework({ childId: 'c1', label: '어제 숙제', date: yday });
  S.setHomeworkDone(hwYday.id, yday);
  const hwPending = S.addHomework({ childId: 'c1', label: '안 한 숙제', date: today });
  S.addBonus('c1', 3, '테스트 보너스');
  S.redeem('c1', S.rewards()[0].id);

  const starsBefore = S.starsOf('c1');
  const bonusesBefore = S.all().bonuses.length;
  const redemptionsBefore = S.all().redemptions.length;

  S.resetToday('c1');

  assert(S.doneIds('c1', today).length === 0, '오늘 습관 체크가 지워진다');
  assert(S.homeworkOf('c1').find(w => w.id === hwToday.id).doneOn === null, '오늘 끝낸 숙제는 다시 미완료');
  assert(S.homeworkOf('c1').find(w => w.id === hwYday.id).doneOn === yday, '어제 끝낸 숙제는 그대로 남는다');
  assert(S.homeworkOf('c1').find(w => w.id === hwPending.id).doneOn === null, '원래 안 한 숙제는 그대로');
  assert(S.all().bonuses.length === bonusesBefore, '보너스 기록은 건드리지 않는다');
  assert(S.all().redemptions.length === redemptionsBefore, '교환 기록도 건드리지 않는다');
  assert(S.starsOf('c1') < starsBefore, '되돌린 만큼 계산되는 별 총합이 줄어든다');

  const persisted = JSON.parse(mem['kidboard.v2']);
  assert(!(persisted.progress.c1 && persisted.progress.c1[today] && persisted.progress.c1[today].length),
         '저장소에도 오늘 체크가 남아있으면 안 된다');
}

console.log('[22] templateBlanks — 템플릿 글에서 빈칸 이름을 순서대로 뽑는다');
S.factoryReset();
{
  const t = { text: '수학리더 개념 1-2 {시작}~{끝}페이지' };
  assert(JSON.stringify(S.templateBlanks(t)) === JSON.stringify(['시작', '끝']), '시작, 끝 순서대로');
  assert(S.templateBlanks({ text: '받아쓰기 10문제' }).length === 0, '빈칸이 없으면 빈 배열');
}

console.log('[23] buildHomeworkLabel — 만들지 않고 미리보기 글만 만든다');
S.factoryReset();
{
  const t = { emoji: '📕', text: '수학리더 개념 1-2 {시작}~{끝}페이지' };
  assert(S.buildHomeworkLabel(t, { 시작: '50', 끝: '55' }) === '수학리더 개념 1-2 50~55페이지', '둘 다 있으면 범위');
  assert(S.buildHomeworkLabel(t, { 시작: '50', 끝: '' }) === '수학리더 개념 1-2 50페이지', '끝이 비면 ~{끝} 이 통째로 사라진다 (50~50 아님)');
  assert(S.homeworkOf('c1').length === 0, '미리보기는 숙제를 만들지 않는다');
}

console.log('[24] createHomeworkFromTemplate — 정상 범위로 생성하면 nextStart 가 (끝+1) 로 넘어간다');
S.factoryReset();
{
  const before = S.homeworkOf('c1').length;
  const res = S.createHomeworkFromTemplate('c1', 'tpl1', { 시작: '1', 끝: '6' }, '2026-09-14');
  assert(res.ok === true, '정상 입력은 성공');
  assert(res.item.label === '수학리더 개념 1-2 1~6페이지', '라벨이 정확히 만들어진다');
  assert(res.item.emoji === '📕', '템플릿의 이모지를 그대로 쓴다');
  assert(res.item.stars === 1, 'addHomework 를 거쳐 별은 1개 고정');
  assert(S.homeworkOf('c1').length === before + 1, '숙제가 실제로 추가된다');
  const tpl = S.templates().find(x => x.id === 'tpl1');
  assert(tpl.nextStart === 7, 'nextStart 는 끝(6)+1 = 7');
}

console.log('[25] createHomeworkFromTemplate — 끝을 비우면 한 페이지짜리 숙제, nextStart 는 시작+1');
S.factoryReset();
{
  const res = S.createHomeworkFromTemplate('c1', 'tpl1', { 시작: '10', 끝: '' }, '2026-09-14');
  assert(res.ok === true, '끝이 비어도 성공');
  assert(res.item.label === '수학리더 개념 1-2 10페이지', '10~10페이지가 아니라 10페이지');
  const tpl = S.templates().find(x => x.id === 'tpl1');
  assert(tpl.nextStart === 11, 'nextStart 는 시작(10)+1 = 11');
}

console.log('[26] createHomeworkFromTemplate — 시작을 덮어써서 복습해도 규칙은 하나뿐이다');
S.factoryReset();
{
  S.createHomeworkFromTemplate('c1', 'tpl1', { 시작: '40', 끝: '45' }, '2026-09-14');
  assert(S.templates().find(x => x.id === 'tpl1').nextStart === 46, '진행이 46으로 감');

  // 부모가 복습하려고 시작을 20으로 덮어씀 — 별도의 "복습 모드"가 아니라
  // 그냥 그 값이 그대로 쓰이고 nextStart 도 거기서 다시 이어진다
  const res = S.createHomeworkFromTemplate('c1', 'tpl1', { 시작: '20', 끝: '25' }, '2026-09-15');
  assert(res.ok === true, '복습 입력도 정상 성공');
  assert(res.item.label === '수학리더 개념 1-2 20~25페이지', '덮어쓴 값 그대로 라벨이 된다');
  assert(S.templates().find(x => x.id === 'tpl1').nextStart === 26, 'nextStart 는 46이 아니라 26으로 재조정된다');
}

console.log('[27] createHomeworkFromTemplate — 앞으로 건너뛰기도 같은 규칙으로 동작한다');
S.factoryReset();
{
  S.createHomeworkFromTemplate('c1', 'tpl1', { 시작: '1', 끝: '5' }, '2026-09-14');
  assert(S.templates().find(x => x.id === 'tpl1').nextStart === 6, '진행이 6으로 감');

  const res = S.createHomeworkFromTemplate('c1', 'tpl1', { 시작: '100', 끝: '105' }, '2026-09-15');
  assert(res.ok === true, '건너뛰기도 성공');
  assert(S.templates().find(x => x.id === 'tpl1').nextStart === 106, 'nextStart 는 건너뛴 값 기준으로 이어진다');
}

console.log('[28] createHomeworkFromTemplate — 템플릿마다 진행이 독립적이다');
S.factoryReset();
{
  S.createHomeworkFromTemplate('c1', 'tpl1', { 시작: '1', 끝: '6' }, '2026-09-14');
  const tpl1 = S.templates().find(x => x.id === 'tpl1');
  const tpl4 = S.templates().find(x => x.id === 'tpl4');
  assert(tpl1.nextStart === 7, '개념(tpl1)은 진행됨');
  assert(!tpl4.nextStart, '백전백승(tpl4)은 건드리지 않아 여전히 진행 기록이 없다');
}

console.log('[29] createHomeworkFromTemplate — 검증 오류 세 가지는 만들지 않고 메시지만 돌려준다');
S.factoryReset();
{
  const before = S.homeworkOf('c1').length;

  const noStart = S.createHomeworkFromTemplate('c1', 'tpl1', { 끝: '5' }, '2026-09-14');
  assert(noStart.ok === false && typeof noStart.msg === 'string' && noStart.msg.length > 0, '시작이 없으면 오류');

  const badStart = S.createHomeworkFromTemplate('c1', 'tpl1', { 시작: '-3', 끝: '5' }, '2026-09-14');
  assert(badStart.ok === false, '시작이 양의 정수가 아니면 오류');

  const badEnd = S.createHomeworkFromTemplate('c1', 'tpl1', { 시작: '1', 끝: '0' }, '2026-09-14');
  assert(badEnd.ok === false, '끝이 양의 정수가 아니면 오류');

  const endBeforeStart = S.createHomeworkFromTemplate('c1', 'tpl1', { 시작: '10', 끝: '5' }, '2026-09-14');
  assert(endBeforeStart.ok === false, '끝이 시작보다 빠르면 오류');

  assert(S.homeworkOf('c1').length === before, '오류가 나면 숙제가 하나도 안 만들어진다');
  assert(!S.templates().find(x => x.id === 'tpl1').nextStart, '오류가 나면 nextStart 도 안 바뀐다');
}

console.log('[30] load() — 예전 기본 템플릿 2개는 새 4개로 마이그레이션된다 (별은 안 건드린다)');
{
  const oldInstall = {
    version: 2, pin: '1234', sound: true,
    children: [{ id: 'c1', name: '첫째', emoji: '🐯', color: '#3D7EA6', canRead: true }],
    habits: [{ id: 'h1', childId: 'c1', emoji: '🪥', label: '이 닦기', stars: 1, days: [0,1,2,3,4,5,6] }],
    homework: [{ id: 'hw1', childId: 'c1', emoji: '📕', label: '수학 1~5쪽', date: '2026-09-01', stars: 1, doneOn: '2026-09-01' }],
    templates: [
      { id: 'tpl1', emoji: '📕', text: '수학 문제집 {}~{}쪽' },
      { id: 'tpl2', emoji: '✏️', text: '받아쓰기 {}문제' }
    ],
    rewards: [{ id: 'r1', emoji: '🍦', label: '아이스크림', cost: 10 }],
    progress: { c1: { '2026-09-01': ['h1'] } },
    bonuses: [{ id: 'b1', childId: 'c1', amount: 2, memo: '옛 보너스', at: '2026-09-01T00:00:00.000Z' }],
    redemptions: []
  };
  mem['kidboard.v2'] = JSON.stringify(oldInstall);

  const starsBefore = (function () {
    // 마이그레이션 전 값을 별도 계산 없이, 로드 후와 비교하기 위해 로드부터 한다
    return null;
  })();

  S.load();

  const tpls = S.templates();
  assert(tpls.length === 4, '템플릿이 옛 2개에서 새 4개로 바뀐다');
  assert(tpls.map(t => t.id).join(',') === 'tpl1,tpl2,tpl3,tpl4', 'id 순서도 새 기본값과 같다');
  assert(tpls[0].text === '수학리더 개념 1-2 {시작}~{끝}페이지', '새 tpl1 문구');
  assert(tpls[3].text === '수학리더 백전백승 book2 1-2 {시작}~{끝}페이지', '새 tpl4 문구');

  assert(S.children().length === 1 && S.getChild('c1').name === '첫째', '아이 정보는 그대로');
  assert(S.homeworkOf('c1').length === 1 && S.homeworkOf('c1')[0].id === 'hw1', '숙제 기록은 그대로');
  assert(S.doneIds('c1', '2026-09-01').indexOf('h1') !== -1, '습관 진행 기록도 그대로');
  assert(S.all().bonuses.length === 1 && S.all().bonuses[0].id === 'b1', '보너스 기록도 그대로');
  assert(S.starsOf('c1') === 1 /*숙제*/ + 1 /*습관*/ + 2 /*보너스*/, '별 계산도 예전 그대로 — 마이그레이션이 별에 영향을 주지 않는다');

  const persisted = JSON.parse(mem['kidboard.v2']);
  assert(persisted.templates.length === 4, '마이그레이션 결과가 저장소에도 곧바로 반영된다');
}

console.log('[31] load() — 이미 새 템플릿이거나 부모가 손댄 템플릿은 건드리지 않는다');
{
  const customInstall = {
    version: 2, pin: '1234', sound: true,
    children: [{ id: 'c1', name: '첫째', emoji: '🐯', color: '#3D7EA6', canRead: true }],
    habits: [],
    homework: [],
    templates: [
      { id: 'tpl1', emoji: '📕', text: '수학 문제집 {}~{}쪽' }   // 하나뿐 — 옛 기본 2종 세트와 다름
    ],
    rewards: [],
    progress: {}, bonuses: [], redemptions: []
  };
  mem['kidboard.v2'] = JSON.stringify(customInstall);
  S.load();
  assert(S.templates().length === 1 && S.templates()[0].text === '수학 문제집 {}~{}쪽',
         '옛 기본 2종 세트와 정확히 일치하지 않으면(=이미 손댄 것으로 보고) 그대로 둔다');
}

S.factoryReset();
console.log('테스트 끝, 되돌려 둠');

console.log('[동기화] 설정 전에는 아무 일도 하지 않는다');
S.factoryReset();
assert(S.syncConfig() === null, '기본은 미설정');
assert(S.outbox().length === 0, '큐도 비어 있다');
S.addHomework({ childId: 'c1', emoji: '📕', label: '설정 전 숙제', date: S.dateKey() });
assert(S.outbox().length === 0, '미설정이면 op 를 쌓지 않는다 — 네트워크 호출이 아예 없어야 한다');

console.log('[동기화] 설정하면 그 뒤 변경부터 큐에 쌓인다');
S.setSyncConfig({ url: 'https://example.test:8443', token: 't' });
assert(S.syncConfig().url === 'https://example.test:8443', '설정이 저장된다');
const q0 = S.outbox().length;
const hwQ = S.addHomework({ childId: 'c1', emoji: '📗', label: '설정 후 숙제', date: S.dateKey() });
assert(S.outbox().length === q0 + 1, '숙제 추가가 큐에 쌓인다');
S.setHomeworkDone(hwQ.id, S.dateKey());
assert(S.outbox().length === q0 + 2, '완료도 쌓인다');
const ops = S.outbox();
assert(ops.every(o => o.opId && o.type && o.payload), 'op 는 opId·type·payload 를 갖는다');
assert(new Set(ops.map(o => o.opId)).size === ops.length, 'opId 는 서로 다르다');

console.log('[동기화] 큐는 새로고침을 넘겨 살아남는다');
const before = S.outbox().length;
S.load();
assert(S.outbox().length === before, '큐가 localStorage 에 저장된다 — 안 그러면 오프라인 체크가 날아간다');

console.log('[동기화] 설정을 지우면 큐도 비운다');
S.setSyncConfig(null);
assert(S.syncConfig() === null, '설정이 지워진다');
assert(S.outbox().length === 0, '보낼 곳이 없는 큐를 들고 있을 이유가 없다');
