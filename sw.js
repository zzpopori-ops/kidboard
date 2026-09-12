/* sw.js — 오프라인 캐시.
   앱 코드는 네트워크를 먼저 보고, 아이콘은 캐시를 먼저 본다.
   왜 그렇게 나눴는지는 아래 fetch 핸들러의 주석 참고. */

// 배포할 때 GitHub Actions 가 이 줄의 'dev' 를 커밋 해시로 바꾼다.
// 사람이 손으로 올리지 않는다 — 한 번 잊으면 태블릿이 조용히 낡은 캐시에 갇힌다.
var BUILD = 'dev';
var CACHE = 'kidboard-' + BUILD;

// 네트워크를 이만큼만 기다려보고 안 되면 캐시로 간다.
// 와이파이가 느릴 때 아이를 흰 화면 앞에 세워두지 않기 위한 상한이다.
var NET_TIMEOUT = 3000;

var ASSETS = [
  './',
  './index.html',
  './css/style.css',
  './js/store.js',
  './js/ui.js',
  './js/views.js',
  './js/admin.js',
  './js/app.js',
  './manifest.webmanifest',
  './icons/icon-192.png',
  './icons/icon-512.png'
];

self.addEventListener('install', function (e) {
  e.waitUntil(caches.open(CACHE).then(function (c) { return c.addAll(ASSETS); }));
  self.skipWaiting();
});

self.addEventListener('activate', function (e) {
  e.waitUntil(
    caches.keys().then(function (keys) {
      return Promise.all(keys.map(function (k) {
        if (k !== CACHE) return caches.delete(k);
      }));
    }).then(function () { return self.clients.claim(); })
  );
});

/** 이번 버전 캐시에서만 찾는다.
    caches.match 는 옛 캐시까지 뒤지기 때문에, 지운 줄 알았던 파일이 되살아난다. */
function fromCache(req) {
  return caches.open(CACHE).then(function (c) { return c.match(req); });
}

function putInCache(req, res) {
  if (!res || !res.ok) return;          // 404·오류 응답을 캐시에 넣지 않는다
  var copy = res.clone();
  caches.open(CACHE).then(function (c) { c.put(req, copy); });
}

/** 캐시에도 없으면 앱 셸로 되돌린다. 주소를 잘못 열어도 빈 화면 대신 앱이 뜬다. */
function fallback(req) {
  return fromCache(req).then(function (hit) {
    return hit || fromCache('./index.html');
  });
}

/** 네트워크 우선, 실패하거나 느리면 캐시.
    이래야 코드를 고쳐 배포했을 때 다음에 앱을 열면 바로 반영된다. */
function networkFirst(req) {
  return new Promise(function (resolve) {
    var settled = false;
    function finish(res) {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      resolve(res);
    }
    var timer = setTimeout(function () {
      if (!settled) fallback(req).then(finish);
    }, NET_TIMEOUT);

    fetch(req).then(function (res) {
      putInCache(req, res);
      finish(res);
    }).catch(function () {
      fallback(req).then(finish);
    });
  });
}

/** 캐시 우선, 없을 때만 네트워크. */
function cacheFirst(req) {
  return fromCache(req).then(function (hit) {
    if (hit) return hit;
    return fetch(req).then(function (res) {
      putInCache(req, res);
      return res;
    }).catch(function () { return fallback(req); });
  });
}

self.addEventListener('fetch', function (e) {
  if (e.request.method !== 'GET') return;

  // 아이콘은 거의 바뀌지 않고 크다. 매번 네트워크를 보면 느려지기만 한다.
  // 나머지(HTML·JS·CSS)는 고치면 곧바로 아이 화면에 닿아야 하므로 네트워크 우선.
  var isIcon = new URL(e.request.url).pathname.indexOf('/icons/') !== -1;

  e.respondWith(isIcon ? cacheFirst(e.request) : networkFirst(e.request));
});
