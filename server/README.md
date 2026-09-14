# 동기화 서버 운영 가이드

`server/api.js` (Node 내장 `https`, 의존성 0) 를 Docker로 띄우는 작은 서버다.
`compose.yaml` 의 `sync` 서비스가 `server/certs/`, `server/data/`, `.env` 를
볼륨/환경변수로 물려서 실행한다. 이 세 가지는 전부 `.gitignore` 에 있고
**절대 커밋해서는 안 된다** — 이 저장소는 공개(public) 저장소다.

## 인증서 발급 (최초 1회, 이미 완료됨)

맥북의 `.local` 호스트명과 LAN IP, localhost/127.0.0.1 을 모두 커버하는
리프 인증서를 mkcert CA로 발급한다.

```bash
mkdir -p server/certs server/data
HOST="$(scutil --get LocalHostName).local"
IP=$(ipconfig getifaddr en0 || ipconfig getifaddr en1)
mkcert -cert-file server/certs/cert.pem -key-file server/certs/key.pem "$HOST" "$IP" localhost 127.0.0.1
```

`mkcert -install` 은 다시 실행하지 않는다 — CA는 이미 태블릿에 설치되어 있고,
재설치하면 태블릿에서 수동으로 다시 신뢰해줘야 한다.

## 인증서 갱신 (만료 전, 또는 IP/호스트명이 바뀌었을 때)

현재 발급된 인증서는 2028-12 에 만료된다. 맥북의 LAN IP가 바뀌거나(공유기
재설정 등) `.local` 호스트명이 바뀌면 그 시점에 바로 재발급해야 한다.

```bash
HOST="$(scutil --get LocalHostName).local"
IP=$(ipconfig getifaddr en0 || ipconfig getifaddr en1)
mkcert -cert-file server/certs/cert.pem -key-file server/certs/key.pem "$HOST" "$IP" localhost 127.0.0.1
docker compose restart sync
```

SAN 목록 확인:

```bash
openssl x509 -in server/certs/cert.pem -noout -text | grep -A1 "Subject Alternative Name"
```

## 토큰 로테이션

`.env` 의 `KB_TOKEN` 은 클라이언트(부모 화면)가 서버를 인증하는 데 쓰는 비밀 값이다.
유출이 의심되거나 주기적으로 바꾸고 싶을 때:

```bash
printf 'KB_TOKEN=%s\n' "$(openssl rand -hex 32)" > .env
chmod 600 .env
docker compose up -d sync   # 새 토큰으로 재시작
```

토큰을 바꾸면 부모 화면(데이터 탭)의 동기화 설정에도 새 토큰을 입력해야 한다.

## `server/data/state.json` 백업

이 파일이 서버가 기억하는 전체 상태(적용된 op, seq 등)다. 정기적으로
복사해두면 컨테이너/디스크 문제가 생겨도 복구할 수 있다.

```bash
cp server/data/state.json ~/backups/kidboard-state-$(date +%Y%m%d).json
```

## mkcert CAROOT 백업

`mkcert -CAROOT` 가 가리키는 디렉터리(`rootCA.pem`, `rootCA-key.pem`)를
반드시 별도로 백업해둔다.

```bash
mkcert -CAROOT
cp -r "$(mkcert -CAROOT)" ~/backups/mkcert-caroot-$(date +%Y%m%d)
```

**`rootCA-key.pem` 을 잃어버리면**, 새 CA를 만들어야 하고 태블릿에서
그 새 CA를 수동으로 다시 신뢰(설치)해줘야 한다. 이 디렉터리는
`mkcert -install` 이 스스로 건드리지 않는 한 그대로 남아 있으니,
이 태스크에서는 절대 삭제하거나 재생성하지 않는다.

## 빠른 확인

```bash
docker compose up -d sync
curl -sk https://127.0.0.1:8443/api/ping   # {"ok":true,"seq":N}
docker compose ps sync
```
