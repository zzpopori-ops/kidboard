// @ts-check
const { defineConfig, devices } = require('@playwright/test');

const PORT = process.env.PORT || 8000;
const BASE = `http://127.0.0.1:${PORT}`;

module.exports = defineConfig({
  testDir: './test',

  // store.test.js 는 노드로 직접 돌리는 로직 테스트다.
  // 기본 testMatch 가 *.test.js 까지 집어가므로 spec 만 명시한다.
  testMatch: '**/*.spec.js',

  // 한 아이의 하루를 순서대로 따라가는 구조라 병렬로 쪼갤 수 없다
  fullyParallel: false,
  workers: 1,
  forbidOnly: !!process.env.CI,
  retries: 0,

  reporter: process.env.CI ? [['list'], ['html', { open: 'never' }]] : [['list']],

  use: {
    baseURL: BASE,
    // 실패한 실행만 흔적을 남긴다. 통과한 실행까지 남기면 용량만 먹는다
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    video: 'off'
  },

  projects: [
    { name: 'chromium', use: { ...devices['Desktop Chrome'] } }
  ],

  // file:// 로는 서비스워커가 등록되지 않으므로 반드시 http 로 띄운다.
  //
  // 로컬에 설치된 http-server 를 경로로 직접 부른다.
  //   - npx 는 안 쓴다: 없으면 즉석에서 받아오므로 버전이 고정되지 않는다
  //   - python3 도 안 쓴다: 컨테이너 이미지에 있으리란 보장이 없다
  // 호스트와 컨테이너가 같은 바이너리로 뜬다.
  //
  // -c-1 은 캐시 끄기. 안 끄면 수정한 파일이 아니라 캐시된 파일을 검증하게 된다.
  webServer: {
    command: `./node_modules/.bin/http-server . -p ${PORT} -a 127.0.0.1 -c-1 --silent`,
    url: BASE,
    reuseExistingServer: !process.env.CI,
    timeout: 30000
  }
});
