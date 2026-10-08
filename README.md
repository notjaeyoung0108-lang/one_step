# 오늘 한 걸음

한국어로 할 일과 기간을 적으면 기존 일정 사이에 계획을 배치하는 개인용 모바일 PWA.

## 구성

- `public/`: GitHub Pages에 공개하는 화면. 제목은 **Juache(주아체)**, 본문은 **IsYun(이서윤체)**.
- `server/`: Cloudflare Worker + D1. 모든 일정 조회·수정·AI 요청은 전용 Bearer 토큰으로 보호.
- `server/core.js`: 서울 시간 계산, 입력 검증, 충돌 검사, 빈 시간 배치 알고리즘.
- OpenAI Responses API의 Structured Outputs로 목표·분량·기간을 추출. 기본 모델 `gpt-4.1-mini`, `store: false`.
- AI가 문장을 해석하고 서버가 실제 시간을 계산한다. 과거 시간, 중복 일정, 요일, 일일 한도, 휴식 간격을 확인한다.
- 미리보기는 저장하지 않는다. 적용 시 30분 만료와 데이터 버전을 검사하며, 같은 계획을 두 번 적용할 수 없다.
- 여러 기기의 동시 수정은 revision 비교 후 갱신한다. 충돌 시 새로고침 안내.
- 단일 사용자 앱이다. 같은 토큰을 쓰는 기기는 같은 일정을 본다.

## 사용

1. 전용 접근 토큰으로 입장한다. GitHub PAT나 OpenAI API 키를 입력하는 곳이 아니다.
2. 설정에서 가능한 시간·요일, 하루 자동 배치 분량, 일정 사이 휴식을 정한다.
3. 고정 약속·점심·출근 시간을 먼저 직접 추가한다.
4. 예: `이번 주 일요일까지 전공 공부 6시간을 한 번에 1시간씩 빈 시간에 나눠 넣어 줘.`
5. 날짜와 시간을 미리 보고 적용한다. 부족한 분량은 별도로 표시한다.
6. 일정 제목을 누르면 수정·삭제, 원형 체크를 누르면 완료·취소한다.
7. 휴대폰 브라우저에서 홈 화면에 추가한다.

인식이 모호하면 추가 질문한다. 기본 범위는 앞으로 31일, 한 번에 30개 목표다. 반복 일정은 종료일을 지정해야 한다. 기존 일정의 자동 이동·삭제와 외부 캘린더 연동, 백그라운드 푸시 알림은 현재 포함하지 않는다. 집중 타이머는 현재 열린 화면에서만 유지된다. 기록의 시간은 완료한 일정의 예정 시간 합계다.

## 인증과 저장

정적 HTML/CSS/JS와 로그인 화면은 공개된다. 개인 일정은 D1에만 저장되며 토큰 없이는 서버가 반환하지 않는다. 브라우저 캐시에는 공개 앱 파일만 저장한다. 일정 내용을 localStorage나 Service Worker 캐시에 넣지 않는다.

접근 토큰은 무작위 256비트 값이며 서버에는 SHA-256 해시만 둔다. 기본은 탭 세션 저장, 사용자가 ‘이 기기에 토큰 기억하기’를 선택한 경우에만 localStorage에 보관한다. 잠그기를 누르면 브라우저의 토큰과 메모리의 일정·배치안·타이머를 지운다. 분실 토큰은 Worker의 `ACCESS_TOKEN_HASH`를 교체하여 무효화한다.

`OPENAI_API_KEY`와 접근 토큰은 공개 저장소에 포함하지 않는다. `.dev.vars`, `private/`, `.env*`, `.wrangler/`는 gitignore 대상이다. AI에 전송되는 정보는 입력 문장, 가능 시간 설정, 앞으로 31일 이내 일정의 제목·시간이다. AI 사용량은 기본 하루 30회로 제한한다. 사용 요금은 연결된 API 계정에 청구된다.

## 개발

Node 24 이상 권장.

```sh
npm ci
# .dev.vars에 ACCESS_TOKEN_HASH와 OPENAI_API_KEY 설정
npx wrangler d1 execute one-step-planner --local --file server/schema.sql
npm run dev
# 별도 터미널
npm run preview
npm test
npm run test:browser
```

브라우저 검증은 기본 설치된 Edge를 사용한다. 다른 브라우저는 `BROWSER_CHANNEL=chrome` 등으로 바꿀 수 있다. 검증은 로컬 D1을 대상으로만 하며, 자연어 배치는 실제 API를 사용한다. `scripts/setup-local.mjs`는 이 워크스페이스의 공통 `.env`를 읽어 비공개 개발 파일을 준비하는 도구다. 그 외 환경에서는 `.dev.vars`를 직접 만든다.

## 배포

1. Cloudflare 계정의 이메일을 인증하고 `npx wrangler login`으로 연결한다.
2. D1을 생성하고 `wrangler.jsonc`의 `database_id`를 설정한다.
3. `npx wrangler d1 execute one-step-planner --remote --file server/schema.sql`
4. `npx wrangler deploy --secrets-file private/deploy-secrets.json`
5. Worker URL을 `public/config.js`의 `apiBase`에 설정한다.
6. GitHub Pages 소스를 GitHub Actions로 설정한다. `pages.yml`은 **public 폴더만** 공개한다.

토큰 교체: 새 무작위 토큰의 SHA-256 해시를 `wrangler secret put ACCESS_TOKEN_HASH`로 설정한다. 새 원문 토큰은 개인 기기에 전달한다. API 키는 서버 비밀값에만 넣는다. DB 전체 삭제나 재생성 없이 앱을 갱신할 수 있다.

## 검증

- `npm test`: 인증, CORS, 캐시 금지, 충돌, 동시 수정, 배치안 중복·만료, API 실패, 사용량 상한, 날짜 경계, 분량 보존, 요일/휴식/일일 한도.
- `npm run test:browser`: 휴대폰 390px와 데스크톱, 토큰 입력, 직접 일정 생성, 완료/취소, 설정, 탭, 실제 AI 6시간 배치·적용, 로그아웃.
- 캡처는 `test-results/`에 저장하며 공개하지 않는다.

공식 문서: [Structured Outputs](https://developers.openai.com/api/docs/guides/structured-outputs), [D1 prepared statements](https://developers.cloudflare.com/d1/worker-api/prepared-statements/), [Worker secrets](https://developers.cloudflare.com/workers/configuration/secrets/).
