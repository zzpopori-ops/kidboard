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

// ---------- HTTP 구간 ----------
const https = require('https');
const { spawn } = require('child_process');

function request(opts, body) {
  return new Promise(function (resolve, reject) {
    var req = https.request(Object.assign({
      host: '127.0.0.1', port: 8477, rejectUnauthorized: false
    }, opts), function (res) {
      var buf = '';
      res.on('data', function (d) { buf += d; });
      res.on('end', function () {
        var json = null;
        try { json = JSON.parse(buf); } catch (e) {}
        resolve({ status: res.statusCode, body: json, headers: res.headers });
      });
    });
    req.on('error', reject);
    if (body) req.write(JSON.stringify(body));
    req.end();
  });
}

async function httpTests() {
  const stateFile = tmpFile();
  const certDir = process.env.KB_CERT_DIR;       // Task 2 Step 3 에서 만든다
  const srv = spawn('node', [
    path.join(__dirname, '..', 'server', 'api.js'),
    '--port', '8477',
    '--cert', path.join(certDir, 'cert.pem'),
    '--key', path.join(certDir, 'key.pem'),
    '--state', stateFile,
    '--token', 'test-token',
    '--origin', 'https://example.test'
  ], { stdio: 'ignore' });

  // 뜰 때까지 기다린다
  for (let i = 0; i < 50; i++) {
    try { await request({ path: '/api/ping', method: 'GET' }); break; }
    catch (e) { await new Promise(r => setTimeout(r, 100)); }
  }

  console.log('[9] ping');
  {
    const r = await request({ path: '/api/ping', method: 'GET' });
    assert(r.status === 200 && r.body.ok === true, 'ping 은 인증 없이 200');
  }

  console.log('[10] 인증');
  {
    const r = await request({ path: '/api/sync', method: 'POST',
      headers: { 'content-type': 'application/json' } }, { deviceId: 'd1', ops: [] });
    assert(r.status === 401, '토큰 없으면 401');
    const r2 = await request({ path: '/api/sync', method: 'POST',
      // 헤더 값은 Latin1 만 허용된다 (Node 의 http 계층 제약) — 한글 토큰 대신 ASCII 오타로 대체
      headers: { 'content-type': 'application/json', authorization: 'Bearer wrong-token' } },
      { deviceId: 'd1', ops: [] });
    assert(r2.status === 401, '틀린 토큰도 401');
  }

  const auth = { 'content-type': 'application/json', authorization: 'Bearer test-token' };

  console.log('[11] 시딩과 동기화');
  {
    const seeded = await request({ path: '/api/seed', method: 'POST', headers: auth },
      { state: { version: 2, children: [{ id: 'c1', name: '첫째' }], homework: [],
                 habits: [], templates: [], rewards: [], progress: {}, bonuses: [], redemptions: [] } });
    assert(seeded.status === 200 && seeded.body.ok === true, '빈 서버는 시딩을 받는다');

    const r = await request({ path: '/api/sync', method: 'POST', headers: auth }, {
      deviceId: 'tab', ops: [{ opId: 'h-1', type: 'homework.add',
        payload: { id: 'hw1', childId: 'c1', emoji: '📕', label: '수학 1~5쪽', date: '2026-09-14', stars: 1, doneOn: null } }]
    });
    assert(r.status === 200, '동기화 200');
    assert(r.body.accepted.indexOf('h-1') !== -1, 'accepted 에 들어온다');
    assert(r.body.state.homework.length === 1, '응답에 전체 상태가 온다');
  }

  console.log('[12] 재전송해도 안 늘어난다 (HTTP 경유)');
  {
    const op = { opId: 'h-dup', type: 'homework.add',
      payload: { id: 'hw2', childId: 'c1', emoji: '📗', label: '받아쓰기', date: '2026-09-14', stars: 1, doneOn: null } };
    await request({ path: '/api/sync', method: 'POST', headers: auth }, { deviceId: 'tab', ops: [op] });
    const second = await request({ path: '/api/sync', method: 'POST', headers: auth }, { deviceId: 'tab', ops: [op] });
    const count = second.body.state.homework.filter(function (w) { return w.id === 'hw2'; }).length;
    assert(count === 1, '같은 opId 는 한 번만 적용된다');
  }

  console.log('[13] CORS 프리플라이트');
  {
    const r = await request({ path: '/api/sync', method: 'OPTIONS',
      headers: { origin: 'https://example.test' } });
    assert(r.status === 204, 'OPTIONS 는 204');
    assert(r.headers['access-control-allow-origin'] === 'https://example.test', '허용 출처를 돌려준다');
  }

  console.log('[14] 두 번째 시딩은 거부');
  {
    const r = await request({ path: '/api/seed', method: 'POST', headers: auth },
      { state: { version: 2, children: [], homework: [] } });
    assert(r.body.ok === false, '이미 시딩된 서버는 거부한다 — 실수로 덮어쓰면 별이 사라진다');
  }

  srv.kill('SIGKILL');
  console.log(`\n합계: ok ${pass} / FAIL ${fail}`);
}

httpTests();
