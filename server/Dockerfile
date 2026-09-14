# 의존성이 없으므로 노드 알파인 하나면 끝난다.
FROM node:22-alpine
WORKDIR /app
COPY state.js api.js ./
# 상태 파일과 인증서는 볼륨으로 들어온다
CMD ["node", "api.js"]
