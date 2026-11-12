# RSVP 리더 (코드명 rsvp)

글을 붙여넣으면 RSVP(고속 순차 시각 제시)로 한 단어씩 한 자리에 보여 주는 한 화면 사이트. 개인 프로젝트, 2026-11-12 시작.

- GitHub: https://github.com/jonghdch/RSVP.git
- 스택: 빌드 없는 정적 HTML·CSS·JS (ES 모듈). 의존성 없음
- 실행: `npm start` → http://localhost:4700 (python3 http.server)
- 테스트: `npm test` (node:test, `test/*.test.js`)
- 구조: `src/rsvp.js` = 순수 계산(단어 나누기·고정 글자·표시 시간), `src/app.js` = 화면 동작, `src/style.css` = 토큰·스타일
- 화면설계서: `docs/screens/` — UI 를 고치기 전에 읽고, 동작·문구·상태가 바뀌면 같은 커밋에서 갱신
- 진행 상황: `PHASES.md`
- 글은 저장하지 않고 서버로 보내지 않는다 (공통 정책)
