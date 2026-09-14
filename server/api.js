/* api.js — 집 안에서만 도는 작은 동기화 서버.
   의존성을 하나도 쓰지 않는다. 가족 한 집이 쓰는 서버에 공급망을 늘릴 이유가 없다. */
const https = require('https');
const fs = require('fs');
const { createStore } = require('./state');

function arg(name, fallback) {
  var i = process.argv.indexOf('--' + name);
  return i !== -1 ? process.argv[i + 1] : fallback;
}

const PORT = Number(arg('port', 8443));
const ORIGIN = arg('origin', '');
const TOKEN = arg('token', '');
const store = createStore(arg('state', '/data/state.json'));
const opts = {
  key: fs.readFileSync(arg('key')),
  cert: fs.readFileSync(arg('cert'))
};

function cors() {
  return {
    'Access-Control-Allow-Origin': ORIGIN,
    'Access-Control-Allow-Methods': 'GET,POST,OPTIONS',
    'Access-Control-Allow-Headers': 'content-type,authorization',
    'Cache-Control': 'no-store'
  };
}

function send(res, code, body) {
  res.writeHead(code, Object.assign({ 'content-type': 'application/json; charset=utf-8' }, cors()));
  res.end(JSON.stringify(body));
}

function authed(req) {
  var h = req.headers.authorization || '';
  return TOKEN && h === 'Bearer ' + TOKEN;
}

function readBody(req) {
  return new Promise(function (resolve) {
    var buf = '';
    req.on('data', function (d) { buf += d; if (buf.length > 5e6) req.destroy(); });
    req.on('end', function () {
      try { resolve(JSON.parse(buf || '{}')); } catch (e) { resolve(null); }
    });
  });
}

https.createServer(opts, async function (req, res) {
  if (req.method === 'OPTIONS') { res.writeHead(204, cors()); return res.end(); }

  var url = req.url.split('?')[0];

  if (url === '/api/ping') return send(res, 200, { ok: true, seq: store.read().seq });

  if (!authed(req)) return send(res, 401, { ok: false, msg: '인증이 필요합니다.' });

  var body = await readBody(req);
  if (!body) return send(res, 400, { ok: false, msg: '본문을 읽지 못했습니다.' });

  if (url === '/api/seed') {
    return send(res, 200, store.seed(body.state));
  }

  if (url === '/api/sync') {
    if (store.isEmpty()) {
      // 아직 시딩 전이면 클라이언트가 무엇을 기준으로 삼을지 알 수 없다.
      // 조용히 빈 상태를 돌려주면 아이 별이 사라진 것처럼 보이므로 분명히 알린다.
      return send(res, 409, { ok: false, msg: '서버가 아직 초기화되지 않았습니다.', empty: true });
    }
    var r = store.applyOps(body.ops);
    return send(res, 200, { seq: r.seq, accepted: r.accepted, state: store.read().state });
  }

  send(res, 404, { ok: false, msg: '없는 주소입니다.' });
}).listen(PORT, '0.0.0.0', function () {
  console.log('동기화 서버 대기 중 :' + PORT + ' (출처 허용: ' + ORIGIN + ')');
});
